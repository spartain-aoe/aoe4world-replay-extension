export interface ChunkHeader {
  type: 'FOLD' | 'DATA';
  id: string;
  version: number;
  length: number;
  dataOffset: number;
  endOffset: number;
}

export const CHUNKY_MAGIC = 'Relic Chunky\r\n\x1a\0';

export async function gunzip(arrayBuffer: ArrayBuffer): Promise<Uint8Array> {
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

export function asciiSlice(buf: Uint8Array, start: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(buf[start + i]);
  return s;
}

export function utf8Slice(buf: Uint8Array, start: number, length: number): string {
  return new TextDecoder('utf-8').decode(buf.slice(start, start + length));
}

export function utf16leSlice(buf: Uint8Array, start: number, charCount: number): string {
  let s = '';
  for (let i = 0; i < charCount; i++) {
    s += String.fromCharCode(buf[start + i * 2] | (buf[start + i * 2 + 1] << 8));
  }
  return s;
}

export function readU16LE(buf: Uint8Array, p: number): number {
  return buf[p] | (buf[p + 1] << 8);
}

export function readU32LE(buf: Uint8Array, p: number): number {
  return (buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24)) >>> 0;
}

export function readI32LE(buf: Uint8Array, p: number): number {
  return (buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24)) | 0;
}

export function readChunkHeader(buf: Uint8Array, offset: number, maxNameLength = 1000): ChunkHeader | null {
  if (offset < 0 || offset + 20 > buf.length) return null;
  const type = asciiSlice(buf, offset, 4);
  const id = asciiSlice(buf, offset + 4, 4);
  if (type !== 'FOLD' && type !== 'DATA') return null;
  const version = readU32LE(buf, offset + 8);
  const length = readU32LE(buf, offset + 12);
  const nameLen = readU32LE(buf, offset + 16);
  if (nameLen > maxNameLength) return null;
  const dataOffset = offset + 20 + nameLen;
  const endOffset = dataOffset + length;
  if (endOffset > buf.length) return null;
  return { type, id, version, length, dataOffset, endOffset };
}
