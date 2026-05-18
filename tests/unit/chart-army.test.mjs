import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildDestroyedValueCharts } from '../../src/content/chart-army.ts';
import { pbgidUnitsMap } from '../../src/content/pbgid-map.ts';
import {
  unitDataIndex,
  unitDataLoaded,
  unitDataPendingFetches,
} from '../../src/content/unit-data-cache.ts';

function resetUnitState() {
  pbgidUnitsMap.clear();
  unitDataIndex.clear();
  unitDataLoaded.clear();
  unitDataPendingFetches.clear();
}

function player(overrides = {}) {
  return {
    name: 'Player',
    civilization: 'english',
    civilizationAttrib: 'english',
    team: 1,
    resources: { timestamps: [0, 10, 20, 30] },
    buildOrder: [],
    ...overrides,
  };
}

describe('buildDestroyedValueCharts', () => {
  beforeEach(resetUnitState);

  it('uses bundled PBGID costs when per-civ unit data is unavailable', () => {
    pbgidUnitsMap.set(101, { n: 'Archer', k: 'archer', u: 80 });
    pbgidUnitsMap.set(202, { n: 'Knight', k: 'knight', u: 240 });

    const charts = buildDestroyedValueCharts({
      duration: 30,
      players: [
        player({
          name: 'Blue',
          team: 1,
          buildOrder: [
            { type: 'Unit', icon: 'units/archer_2', pbgid: 101, destroyed: [10, 30] },
          ],
        }),
        player({
          name: 'Red',
          team: 2,
          buildOrder: [
            { type: 'Unit', icon: 'units/knight_2', pbgid: 202, destroyed: [20] },
          ],
        }),
      ],
    }, new Map());

    assert.equal(charts.length, 1);
    assert.equal(charts[0].title, 'Destroyed Value');
    assert.deepEqual(charts[0].data.labels, [0, 10, 20, 30]);
    assert.deepEqual(charts[0].data.series[0].values, [0, 0, 240, 240]);
    assert.deepEqual(charts[0].data.series[1].values, [-0, -80, -80, -160]);
  });

  it('waits for a cost source instead of rendering a zero-only chart', () => {
    const charts = buildDestroyedValueCharts({
      duration: 20,
      players: [
        player({
          team: 1,
          buildOrder: [{ type: 'Unit', icon: 'units/archer_2', pbgid: 101, destroyed: [10] }],
        }),
        player({
          team: 2,
          buildOrder: [{ type: 'Unit', icon: 'units/knight_2', pbgid: 202, destroyed: [20] }],
        }),
      ],
    }, new Map());

    assert.deepEqual(charts, []);
  });
});
