export interface StatsPlayerMetric {
  playerId: number;
  profileId: number;
  name: string;
  townCenterIdleSeconds: number;
}

interface ChunkHeader {
  type: 'FOLD' | 'DATA';
  id: string;
  version: number;
  dataOffset: number;
  endOffset: number;
}

const CHUNKY_MAGIC = 'Relic Chunky\r\n\x1a\0';
const CHUNKY_PREAMBLE_BYTES = 8;
const MAX_STRING_LENGTH = 1000;
const MAX_ARRAY_LENGTH = 100000;

async function gunzip(arrayBuffer: ArrayBuffer): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream not available');
  }
  const stream = new Response(arrayBuffer).body!.pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = value as Uint8Array;
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return out;
}

function asciiSlice(buf: Uint8Array, start: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(buf[start + i]);
  return s;
}

function utf8Slice(buf: Uint8Array, start: number, length: number): string {
  return new TextDecoder('utf-8').decode(buf.slice(start, start + length));
}

function utf16leSlice(buf: Uint8Array, start: number, charCount: number): string {
  let s = '';
  for (let i = 0; i < charCount; i++) {
    s += String.fromCharCode(buf[start + i * 2] | (buf[start + i * 2 + 1] << 8));
  }
  return s;
}

function readU32LE(buf: Uint8Array, p: number): number {
  return (buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24)) >>> 0;
}

function readChunkHeader(buf: Uint8Array, offset: number): ChunkHeader | null {
  if (offset < 0 || offset + 20 > buf.length) return null;
  const type = asciiSlice(buf, offset, 4);
  const id = asciiSlice(buf, offset + 4, 4);
  if (type !== 'FOLD' && type !== 'DATA') return null;
  const version = readU32LE(buf, offset + 8);
  const length = readU32LE(buf, offset + 12);
  const nameLen = readU32LE(buf, offset + 16);
  if (nameLen > MAX_STRING_LENGTH) return null;
  const dataOffset = offset + 20 + nameLen;
  const endOffset = dataOffset + length;
  if (endOffset > buf.length) return null;
  return { type, id, version, dataOffset, endOffset };
}

function collectStpdChunks(buf: Uint8Array): ChunkHeader[] {
  if (asciiSlice(buf, 0, CHUNKY_MAGIC.length) !== CHUNKY_MAGIC) {
    throw new Error('stats_parse_no_chunky_magic');
  }
  const chunks: ChunkHeader[] = [];
  const walk = (start: number, end: number): void => {
    let p = start;
    while (p < end) {
      const chunk = readChunkHeader(buf, p);
      if (!chunk) throw new Error(`stats_parse_bad_chunk_${p}`);
      if (chunk.type === 'DATA' && chunk.id === 'STPD') chunks.push(chunk);
      if (chunk.type === 'FOLD') walk(chunk.dataOffset, chunk.endOffset);
      p = chunk.endOffset;
    }
  };
  walk(CHUNKY_MAGIC.length + CHUNKY_PREAMBLE_BYTES, buf.length);
  return chunks;
}

class Reader {
  private offset: number;
  private readonly view: DataView;
  private readonly buf: Uint8Array;

  constructor(buf: Uint8Array, start: number) {
    this.buf = buf;
    this.offset = start;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  get position(): number { return this.offset; }

  int32(): number { const value = this.view.getInt32(this.offset, true); this.offset += 4; return value; }
  byte(): number { return this.buf[this.offset++]; }
  int16(): number { const value = this.view.getInt16(this.offset, true); this.offset += 2; return value; }
  float32(): number { const value = this.view.getFloat32(this.offset, true); this.offset += 4; return value; }
  skip(bytes: number): void { this.offset += bytes; }
  peekInt32(): number { return this.view.getInt32(this.offset, true); }

  string(): string {
    const length = this.int32();
    if (length < 0 || length > MAX_STRING_LENGTH) throw new Error(`stats_parse_bad_string_${length}`);
    const value = utf8Slice(this.buf, this.offset, length);
    this.offset += length;
    return value;
  }

  unicodeString(): string {
    const length = this.int32();
    if (length < 0 || length > MAX_STRING_LENGTH) throw new Error(`stats_parse_bad_ustring_${length}`);
    const value = utf16leSlice(this.buf, this.offset, length);
    this.offset += length * 2;
    return value;
  }

  array(readEntry: () => void): number {
    const count = this.int32();
    if (count < 0 || count > MAX_ARRAY_LENGTH) throw new Error(`stats_parse_bad_array_${count}`);
    for (let i = 0; i < count; i++) readEntry();
    return count;
  }
}

function skipResourceDict(reader: Reader): void {
  const count = reader.int32();
  if (count !== 8 && count !== 9) throw new Error(`stats_parse_bad_resource_dict_${count}`);
  for (let i = 0; i < count; i++) {
    reader.string();
    reader.float32();
  }
}

function skipResourceTimelineEntry(reader: Reader, version: number): void {
  reader.int32();
  skipResourceDict(reader);
  skipResourceDict(reader);
  skipResourceDict(reader);
  if ((version === 2033 && reader.peekInt32() >= 9) || version >= 2034) {
    skipResourceDict(reader);
  }
  reader.int32();
}

function skipScoreTimelineEntry(reader: Reader): void {
  reader.int32();
  reader.skip(5 * 4);
}

function skipUnknownEntry1(reader: Reader, version: number): void {
  reader.skip(version >= 2034 ? 4 * 4 : 3 * 4);
}

function skipUnitTimelineEntry(reader: Reader): void {
  const idType = reader.byte();
  if (idType === 1) reader.skip(4);
  else if (idType === 2) reader.skip(20);
  reader.skip(2 + 2 + 4);
  reader.string();
  reader.unicodeString();
  reader.unicodeString();
  skipResourceDict(reader);
  reader.unicodeString();
  reader.int32();
}

function skipUnknownEntry2(reader: Reader): void {
  reader.skip(4 * 4);
}

function parseStpdMetric(buf: Uint8Array, chunk: ChunkHeader): StatsPlayerMetric | null {
  const version = chunk.version;
  if (version !== 2029 && version !== 2030 && version !== 2033 && version !== 2034) {
    throw new Error(`stats_parse_unsupported_stpd_${version}`);
  }
  const reader = new Reader(buf, chunk.dataOffset);
  const playerId = reader.int32();
  const name = reader.unicodeString();
  reader.skip(4 + 4 + 4);
  if (version >= 2033) reader.skip(4);
  reader.skip(2 * 4);
  reader.skip(1 * 4);
  reader.skip(1 * 4);
  reader.skip(2 * 4);
  reader.skip(6 * 4);
  reader.skip(1 * 4);
  reader.skip(9 * 4);
  reader.skip(2 * 4);
  skipResourceDict(reader);
  reader.skip(2 * 4);
  reader.skip(2 * 4);
  reader.skip(6 * 4);
  reader.skip(1 * 4);
  reader.skip(1 * 4);
  skipResourceDict(reader);
  skipResourceDict(reader);
  skipResourceDict(reader);
  skipResourceDict(reader);
  reader.skip(2 * 4);
  reader.skip(2 * 4);
  reader.skip(1 * 4);
  reader.skip(6 * 4);
  skipResourceDict(reader);
  skipResourceDict(reader);
  skipResourceDict(reader);
  skipResourceDict(reader);
  skipResourceDict(reader);
  skipResourceDict(reader);
  reader.skip(6 * 4);
  reader.skip(3 * 4);
  reader.skip(9 * 4);
  skipResourceDict(reader);
  reader.skip(4 * 4);
  reader.byte();
  reader.string();
  reader.skip(2 * 4);
  const profileId = reader.int32();
  reader.skip(4);
  reader.array(() => skipResourceTimelineEntry(reader, version));
  reader.array(() => skipScoreTimelineEntry(reader));
  reader.array(() => skipUnknownEntry1(reader, version));
  reader.skip(4 * 4);
  reader.array(() => skipUnitTimelineEntry(reader));
  reader.array(() => skipUnknownEntry2(reader));
  reader.skip(8 * 4);
  reader.skip(2 * 4);
  reader.skip(6 * 4);
  reader.byte();
  reader.skip(4);
  if (version >= 2034) reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(8 * 4);
  reader.skip(3 * 4);
  reader.skip(2 * 4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  if (version >= 2030) reader.skip(4);
  if (version >= 2033) reader.skip(3 * 4);
  if (version < 2034) return null;

  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  reader.skip(4);
  const townCenterIdleSeconds = reader.float32();
  reader.skip(4);
  reader.skip(4);

  if (!Number.isFinite(townCenterIdleSeconds) || townCenterIdleSeconds < 0) {
    return null;
  }
  return {
    playerId,
    profileId,
    name,
    townCenterIdleSeconds,
  };
}

export function parseStatsPlayerMetricsFromBytes(buf: Uint8Array): StatsPlayerMetric[] {
  const chunks = collectStpdChunks(buf);
  return chunks
    .map(chunk => parseStpdMetric(buf, chunk))
    .filter((item): item is StatsPlayerMetric => Boolean(item));
}

export async function extractStatsPlayerMetrics(arrayBuffer: ArrayBuffer): Promise<StatsPlayerMetric[]> {
  const buf = await gunzip(arrayBuffer);
  return parseStatsPlayerMetricsFromBytes(buf);
}
