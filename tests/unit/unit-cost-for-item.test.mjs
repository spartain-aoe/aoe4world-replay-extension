import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { unitCostForItem } from '../../src/content/unit-mapping.ts';
import { buildUnitDataIndexForCiv, unitDataIndex } from '../../src/content/unit-data-cache.ts';
import { pbgidUnitsMap } from '../../src/content/pbgid-map.ts';


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
});
