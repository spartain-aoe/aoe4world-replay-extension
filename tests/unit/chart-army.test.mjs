import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildArmyValueLeadCharts } from '../../src/content/chart-army.ts';
import { pbgidUnitsMap } from '../../src/content/pbgid-map.ts';

describe('buildArmyValueLeadCharts', () => {
  test('uses active army unit costs instead of military score timeline', () => {
    const previous = pbgidUnitsMap.get(9003967);
    pbgidUnitsMap.set(9003967, {
      n: 'Zhanma Swordsman',
      k: 'zhanma-swordsman',
      c: 200,
      i: 'https://data.aoe4world.com/images/units/zhanma-swordsman-4.png',
    });

    try {
      const summary = {
        duration: 40,
        players: [
          {
            name: 'Alpha',
            civilization: 'jin_dynasty',
            civilizationAttrib: 'jin_dynasty',
            team: 0,
            resources: {
              timestamps: [0, 20, 40],
              military: [0, 5, 5],
            },
            buildOrder: [
              {
                type: 'Unit',
                icon: 'icons/races/jin/units/zhanma_swordsman',
                pbgid: 9003967,
                finished: [10, 11, 12],
                destroyed: [35],
              },
            ],
          },
          {
            name: 'Bravo',
            civilization: 'english',
            team: 1,
            resources: {
              timestamps: [0, 20, 40],
              military: [0, 1, 1],
            },
            buildOrder: [],
          },
        ],
      };

      const [chart] = buildArmyValueLeadCharts(summary, new Map());
      const sampleIndex = chart.data.labels.indexOf(20);

      assert.notEqual(sampleIndex, -1, 'has a 20s sample');
      assert.equal(chart.data.series[0].values[sampleIndex], 600);
      assert.equal(chart.data.series[1].values[sampleIndex], 0);
    } finally {
      if (previous) pbgidUnitsMap.set(9003967, previous);
      else pbgidUnitsMap.delete(9003967);
    }
  });
});
