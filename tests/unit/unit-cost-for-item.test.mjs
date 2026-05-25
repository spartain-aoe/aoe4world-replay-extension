import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { unitCostForItem } from '../../src/content/unit-mapping.ts';
import { buildUnitDataIndexForCiv, unitDataIndex } from '../../src/content/unit-data-cache.ts';
import { pbgidUnitsMap, pbgidUnitCostByKey } from '../../src/content/pbgid-map.ts';
import { pbgidUnitOverridesMap } from '../../src/content/pbgid-overrides.ts';


describe('unitCostForItem fallback chain', () => {
  const TEST_PBGID = 990001;
  let prevEnglish;
  let prevPbgid;

  beforeEach(() => {
    prevEnglish = unitDataIndex.get('english');
    prevPbgid = pbgidUnitsMap.get(TEST_PBGID);
    unitDataIndex.delete('english');
    pbgidUnitsMap.delete(TEST_PBGID);
  });

  afterEach(() => {
    if (prevEnglish) unitDataIndex.set('english', prevEnglish);
    else unitDataIndex.delete('english');
    if (prevPbgid) pbgidUnitsMap.set(TEST_PBGID, prevPbgid);
    else pbgidUnitsMap.delete(TEST_PBGID);
  });

  test('uses unit-data cache when populated (takes precedence over bundled cost)', () => {
    buildUnitDataIndexForCiv('english', [{
      id: 'spearman', baseId: 'spearman', name: 'Spearman', icon: 'units/spearman', pbgid: TEST_PBGID,
      age: 1, classes: ['infantry'], costs: { food: 50, wood: 10, total: 60 },
    }]);
    pbgidUnitsMap.set(TEST_PBGID, { n: 'Spearman', k: 'spearman', c: 999 });
    const item = { type: 'Unit', icon: 'units/spearman', pbgid: TEST_PBGID, finished: [10], destroyed: [] };
    const player = { civilization: 'english' };

    assert.equal(unitCostForItem(item, player), 60, 'cache wins when present');
  });

  test('falls back to bundled pbgid-map cost when unit-data cache is empty', () => {
    pbgidUnitsMap.set(TEST_PBGID, { n: 'Knight', k: 'knight', c: 240 });
    const item = { type: 'Unit', icon: 'units/knight', pbgid: TEST_PBGID, finished: [10], destroyed: [] };
    const player = { civilization: 'english' };

    assert.equal(unitCostForItem(item, player), 240, 'bundled fallback used');
  });

  test('returns 0 when neither cache nor pbgid-map has data', () => {
    const item = { type: 'Unit', icon: 'units/unknown', pbgid: TEST_PBGID, finished: [10], destroyed: [] };
    const player = { civilization: 'english' };

    assert.equal(unitCostForItem(item, player), 0);
  });

  test('returns 0 for item with no pbgid and no icon match', () => {
    const item = { type: 'Unit', icon: 'units/unknown', finished: [10], destroyed: [] };
    const player = { civilization: 'english' };

    assert.equal(unitCostForItem(item, player), 0);
  });

  test('ignores bundled cost of 0 or missing', () => {
    pbgidUnitsMap.set(TEST_PBGID, { n: 'Khan', k: 'khan' });
    const item = { type: 'Unit', icon: 'units/khan', pbgid: TEST_PBGID, finished: [10], destroyed: [] };
    const player = { civilization: 'mongols' };

    assert.equal(unitCostForItem(item, player), 0);
  });

  test('resolves cost via merge-key when pbgid only matches an override (no c on override)', () => {
    // Real-world case: Jin Iron Pagoda pbgid 9004731 resolves via
    // pbgid-overrides.ts (which sets k='iron-pagoda' but no c). We expect the
    // cost-by-key index to rescue this using the canonical 9004191 entry
    // (n=Iron Pagoda c=240).
    const OVERRIDE_PBGID = 9004731;
    const overrideEntry = pbgidUnitOverridesMap.get(OVERRIDE_PBGID);
    assert.ok(overrideEntry, 'expected override entry present (sanity check)');
    assert.equal(overrideEntry.k, 'iron-pagoda', 'override key shape unchanged');
    assert.equal(overrideEntry.c, undefined, 'override carries no cost (sanity check)');

    // Seed the merge-key index directly (in production it's filled by
    // ensurePbgidMap from canonical entries).
    const prevKeyCost = pbgidUnitCostByKey.get('iron-pagoda');
    pbgidUnitCostByKey.set('iron-pagoda', 240);
    try {
      const item = { type: 'Unit', icon: 'units/iron_pagoda_2', pbgid: OVERRIDE_PBGID, finished: [10], destroyed: [] };
      const player = { civilization: 'jin_dynasty' };
      assert.equal(unitCostForItem(item, player), 240, 'cost resolved via merge-key fallback');
    } finally {
      if (typeof prevKeyCost === 'number') pbgidUnitCostByKey.set('iron-pagoda', prevKeyCost);
      else pbgidUnitCostByKey.delete('iron-pagoda');
    }
  });

  test('merge-key fallback normalizes snake_case from icon to kebab-case index', () => {
    // Item with pbgid unknown to both pbgidUnitsMap and overrides — falls
    // back to unitMergeKey from icon, which produces snake_case
    // ('iron_pagoda'). The index uses kebab-case ('iron-pagoda').
    const UNKNOWN_PBGID = 999999999;
    const prev = pbgidUnitCostByKey.get('iron-pagoda');
    pbgidUnitCostByKey.set('iron-pagoda', 240);
    try {
      const item = { type: 'Unit', icon: 'units/iron_pagoda_2', pbgid: UNKNOWN_PBGID, finished: [10], destroyed: [] };
      const player = { civilization: 'jin_dynasty' };
      assert.equal(unitCostForItem(item, player), 240, 'snake→kebab normalization works');
    } finally {
      if (typeof prev === 'number') pbgidUnitCostByKey.set('iron-pagoda', prev);
      else pbgidUnitCostByKey.delete('iron-pagoda');
    }
  });
});
