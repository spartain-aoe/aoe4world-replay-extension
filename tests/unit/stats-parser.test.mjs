import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { parseStatsPlayerMetricsFromBytes } from '../../src/background/stats-parser.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, '..', 'fixtures', 'stats', '234538529.stats.gz');

test('parseStatsPlayerMetricsFromBytes extracts Town Center idle time from STPD v2034', () => {
  const bytes = zlib.gunzipSync(fs.readFileSync(fixturePath));
  const players = parseStatsPlayerMetricsFromBytes(new Uint8Array(bytes));
  assert.deepEqual(players.map(player => ({
    name: player.name,
    profileId: player.profileId,
    townCenterIdleSeconds: player.townCenterIdleSeconds,
  })), [
    { name: 'lwl', profileId: 441199, townCenterIdleSeconds: 12.875 },
    { name: 'trabzonlol', profileId: 8394717, townCenterIdleSeconds: 11.625 },
    { name: 'spartain', profileId: 24574510, townCenterIdleSeconds: 7 },
    { name: 'FerdiFerdi', profileId: 23809218, townCenterIdleSeconds: 103 },
  ]);
});
