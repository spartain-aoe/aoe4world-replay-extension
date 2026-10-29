import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildVillagerCombatCharts } from '../../src/content/chart-villagers.ts';

test('buildVillagerCombatCharts creates cumulative killed and lost series per 1v1 player', () => {
  const summary = {
    duration: 30,
    players: [
      {
        profileId: 1,
        name: 'Alpha',
        team: 0,
        buildOrder: [
          { type: 'Unit', icon: 'units/villager', destroyed: [12, 25] },
          { type: 'Unit', icon: 'units/scout', destroyed: [20] },
        ],
      },
      {
        profileId: 2,
        name: 'Bravo',
        team: 1,
        buildOrder: [
          { type: 'Unit', icon: 'units/mounted_villager', destroyed: [8] },
        ],
      },
    ],
  };
  const nativeColors = new Map([
    ['alpha', '#0162FF'],
    ['bravo', '#F60000'],
  ]);

  const [chart] = buildVillagerCombatCharts(summary, nativeColors);

  assert.equal(chart.title, 'Villagers Killed / Lost');
  assert.equal(chart.type, 'lead');
  assert.deepEqual(chart.data.labels, [0, 10, 20, 30]);
  assert.deepEqual(chart.data.series.map(series => ({
    label: series.label,
    playerName: series.playerName,
    values: series.values,
  })), [
    { label: 'Alpha: Killed', playerName: 'Alpha', values: [0, 1, 1, 1] },
    { label: 'Alpha: Lost', playerName: 'Alpha', values: [0, 0, -1, -2] },
    { label: 'Bravo: Killed', playerName: 'Bravo', values: [0, 0, 1, 2] },
    { label: 'Bravo: Lost', playerName: 'Bravo', values: [0, -1, -1, -1] },
  ]);
});

test('buildVillagerCombatCharts omits team games where individual killers are unavailable', () => {
  const summary = {
    duration: 30,
    players: [
      { name: 'A1', team: 0, buildOrder: [{ type: 'Unit', icon: 'units/villager', destroyed: [10] }] },
      { name: 'A2', team: 0, buildOrder: [] },
      { name: 'B1', team: 1, buildOrder: [{ type: 'Unit', icon: 'units/villager', destroyed: [15] }] },
      { name: 'B2', team: 1, buildOrder: [] },
    ],
  };

  assert.deepEqual(buildVillagerCombatCharts(summary, new Map()), []);
});

test('buildVillagerCombatCharts omits empty 1v1 villager data', () => {
  const summary = {
    duration: 30,
    players: [
      { name: 'Alpha', team: 0, buildOrder: [{ type: 'Unit', icon: 'units/scout', destroyed: [10] }] },
      { name: 'Bravo', team: 1, buildOrder: [] },
    ],
  };

  assert.deepEqual(buildVillagerCombatCharts(summary, new Map()), []);
});
