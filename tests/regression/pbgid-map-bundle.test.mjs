import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PBGID_MAP_PATH = join(__dirname, '..', '..', 'chrome-extension', 'data', 'pbgid-map.json');


describe('bundled pbgid-map.json: cost data is present', () => {
  let payload;

  before(async () => {
    const raw = await readFile(PBGID_MAP_PATH, 'utf8');
    payload = JSON.parse(raw);
  });

  test('has units, technologies, upgrades sections', () => {
    assert.ok(payload && typeof payload === 'object');
    assert.ok(payload.units && typeof payload.units === 'object', 'units present');
    assert.ok(payload.technologies && typeof payload.technologies === 'object', 'techs present');
    assert.ok(payload.upgrades && typeof payload.upgrades === 'object', 'upgrades present');
  });

  test('at least 900 unit entries carry a numeric `c` (cost total) field', () => {
    const entries = Object.values(payload.units);
    const withCost = entries.filter(e => typeof e.c === 'number' && e.c > 0);
    assert.ok(
      withCost.length >= 900,
      `expected ≥900 unit entries with numeric cost, got ${withCost.length} of ${entries.length}`
    );
  });

  test('Knight (pbgid 166401) has expected cost (240 total)', () => {
    const knight = payload.units['166401'];
    assert.ok(knight, 'knight pbgid 166401 present');
    assert.equal(knight.k, 'knight', 'merge key is knight');
    assert.equal(typeof knight.c, 'number', 'cost is numeric');
    assert.equal(knight.c, 240, 'knight total cost = 240');
  });

  test('Free units (e.g. Khan) are allowed to omit cost', () => {
    const entries = Object.values(payload.units);
    const free = entries.filter(e => !(typeof e.c === 'number' && e.c > 0));
    assert.ok(free.length < entries.length * 0.1, `free-unit count ${free.length} should be small`);
  });

  test('Cost values are sensible (no zeros, no absurdly high)', () => {
    for (const [pbgid, entry] of Object.entries(payload.units)) {
      if (typeof entry.c !== 'number') continue;
      assert.ok(entry.c >= 0, `pbgid ${pbgid} cost not negative`);
      assert.ok(entry.c <= 10000, `pbgid ${pbgid} cost ≤10000 (got ${entry.c})`);
    }
  });

  test('Costs for canonical Jin Iron Pagoda entries are present (rescue base for overrides)', () => {
    // The Jin Iron Pagoda has many civ/age/biome variant pbgids; not all are
    // in the upstream units file (e.g. 9004731 only resolves via
    // pbgid-overrides). The cost-by-key index needs at least one canonical
    // 'iron-pagoda' entry with a cost so the merge-key fallback succeeds.
    const ironPagodaEntries = Object.values(payload.units).filter(e => e.k === 'iron-pagoda' && typeof e.c === 'number' && e.c > 0);
    assert.ok(ironPagodaEntries.length >= 1, `expected ≥1 canonical iron-pagoda entry with cost, got ${ironPagodaEntries.length}`);
  });
});
