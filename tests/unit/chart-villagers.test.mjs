import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyVillagerEfficiencySoftCap,
  buildVillagerEfficiencyCharts,
} from '../../src/content/chart-villagers.ts';
import {
  villagerProducerMetaMap,
  villagerUnitMetaMap,
} from '../../src/content/pbgid-map.ts';

const VILLAGER_PBGID = 710001;
const MOUNTED_VILLAGER_PBGID = 710002;
const GOLDEN_HORDE_VILLAGER_PBGID = 710003;
const CAPITAL_TC_PBGID = 720001;
const KINGS_PALACE_PBGID = 720002;
const SONG_DYNASTY_PBGID = 158363;
const YUAN_DYNASTY_PBGID = 158364;
const TUGHLAQ_VILLAGER_GOVERNOR_PBGID = 9001363;
const TUGHLAQ_FORT_TIER_2_PBGID = 9003509;
const FLOATING_GATE_PBGID = 2122035;

beforeEach(() => {
  villagerUnitMetaMap.set(VILLAGER_PBGID, {
    k: 'villager',
    t: 20,
    p: ['capital-town-center', 'town-center', 'kings-palace'],
  });
  villagerUnitMetaMap.set(MOUNTED_VILLAGER_PBGID, {
    k: 'mounted-villager',
    t: 35,
    p: ['capital-town-center', 'town-center'],
  });
  villagerUnitMetaMap.set(GOLDEN_HORDE_VILLAGER_PBGID, {
    k: 'villager',
    t: 37,
    p: ['capital-town-center', 'town-center'],
    b: 2,
  });
  villagerProducerMetaMap.set(CAPITAL_TC_PBGID, { k: 'capital-town-center' });
  villagerProducerMetaMap.set(KINGS_PALACE_PBGID, { k: 'kings-palace', r: 1.1 });
});

afterEach(() => {
  villagerUnitMetaMap.clear();
  villagerProducerMetaMap.clear();
});

function player({
  name = 'Alpha',
  profileId = 1,
  civilization = 'english',
  finished = [0, 0, 0, 0, 0, 0],
  destroyed = [],
  buildings = [{ pbgid: CAPITAL_TC_PBGID, constructed: [0] }],
  extraItems = [],
} = {}) {
  return {
    name,
    profileId,
    civilization,
    team: profileId,
    buildOrder: [
      {
        type: 'Unit',
        icon: 'units/villager',
        pbgid: VILLAGER_PBGID,
        finished,
        destroyed,
      },
      ...buildings.map(building => ({
        type: 'Building',
        icon: 'buildings/producer',
        destroyed: [],
        ...building,
      })),
      ...extraItems,
    ],
  };
}

function series(chart, playerName, unitLabel) {
  return chart.data.series.find(item =>
    item.playerName === playerName && item.unitLabel === unitLabel
  );
}

test('buildVillagerEfficiencyCharts separates missed production from villagers killed', () => {
  const summary = {
    duration: 60,
    players: [
      player({
        finished: [0, 0, 0, 0, 0, 0, 20, 50],
        destroyed: [55],
      }),
      player({
        name: 'Bravo',
        profileId: 2,
        finished: [0, 0, 0, 0, 0, 0, 20, 40, 60],
      }),
    ],
  };

  const [chart] = buildVillagerEfficiencyCharts(summary, new Map([
    ['alpha', '#0162FF'],
    ['bravo', '#F60000'],
  ]));

  assert.equal(chart.title, 'Villager Efficiency');
  assert.equal(chart.type, 'villager-efficiency');
  assert.deepEqual(chart.data.labels, [0, 10, 20, 30, 40, 50, 60]);
  assert.deepEqual(series(chart, 'Alpha', 'Actual').values, [6, 6, 7, 7, 7, 8, 7]);
  assert.deepEqual(series(chart, 'Alpha', 'Ideal').values, [6, 6, 7, 7, 8, 8, 9]);
  assert.deepEqual(series(chart, 'Alpha', 'Missed production').values, [0, 0, 0, 0, 1, 1, 1]);
  assert.deepEqual(series(chart, 'Alpha', 'Killed').values, [0, 0, 0, 0, 0, 0, 1]);

  const alphaBands = chart.bands.filter(band => band.playerName === 'Alpha');
  assert.deepEqual(alphaBands.map(band => ({
    label: band.label,
    from: band.fromValues,
    to: band.toValues,
  })), [
    {
      label: 'Killed',
      from: [6, 6, 7, 7, 7, 8, 7],
      to: [6, 6, 7, 7, 7, 8, 8],
    },
    {
      label: 'Missed production',
      from: [6, 6, 7, 7, 7, 8, 8],
      to: [6, 6, 7, 7, 8, 9, 9],
    },
  ]);
});

test('ideal production includes every available producer with its own speed', () => {
  const summary = {
    duration: 140,
    players: [
      player({
        buildings: [
          { pbgid: CAPITAL_TC_PBGID, constructed: [0] },
          { pbgid: KINGS_PALACE_PBGID, constructed: [100] },
        ],
      }),
    ],
  };

  const [chart] = buildVillagerEfficiencyCharts(summary, new Map());
  const ideal = series(chart, 'Alpha', 'Ideal').values;

  assert.equal(ideal.at(-1), 15, '6 initial + 7 capital TC + 2 King’s Palace villagers');
});

test('packed producers do not add ideal production until they are unpacked', () => {
  const summary = {
    duration: 80,
    players: [
      player({
        buildings: [{
          pbgid: CAPITAL_TC_PBGID,
          constructed: [0],
          packed: [25],
          unpacked: [65],
        }],
      }),
    ],
  };

  const [chart] = buildVillagerEfficiencyCharts(summary, new Map());
  const ideal = series(chart, 'Alpha', 'Ideal').values;

  assert.equal(ideal.at(-1), 7, 'only the villager completed before packing should count');
});

test('Golden Horde ideal production counts two villagers per 37-second batch', () => {
  const summary = {
    duration: 74,
    players: [{
      name: 'Golden Horde',
      profileId: 1,
      civilization: 'golden_horde',
      team: 0,
      buildOrder: [
        {
          type: 'Unit',
          icon: 'units/villager',
          pbgid: GOLDEN_HORDE_VILLAGER_PBGID,
          finished: [0, 0, 0, 0, 0],
          destroyed: [],
        },
        {
          type: 'Building',
          icon: 'buildings/town_centre_capitol',
          pbgid: CAPITAL_TC_PBGID,
          constructed: [0],
          destroyed: [],
        },
      ],
    }],
  };

  const [chart] = buildVillagerEfficiencyCharts(summary, new Map());
  const ideal = series(chart, 'Golden Horde', 'Ideal').values;

  assert.equal(ideal.at(-1), 9, '5 initial + two batches of 2 villagers');
});

test('China Song Dynasty speeds up newly queued villagers without changing an active queue', () => {
  const summary = {
    duration: 100,
    players: [
      player({
        civilization: 'chinese',
        extraItems: [{
          type: 'Unknown',
          icon: 'icons/races/chinese/dynasties/song',
          pbgid: SONG_DYNASTY_PBGID,
          finished: [25],
        }],
      }),
    ],
  };

  const [chart] = buildVillagerEfficiencyCharts(summary, new Map());
  const ideal = series(chart, 'Alpha', 'Ideal').values;
  const at = seconds => ideal[chart.data.labels.indexOf(seconds)];

  assert.equal(at(30), 7, 'the villager queued before Song still completes at 40 seconds');
  assert.equal(at(60), 9, 'the next villager completes 15 seconds after the 40-second completion');
  assert.equal(at(100), 12, 'Song sustains a 15-second villager cadence');
});

test('a later Chinese dynasty ends the Song villager production bonus', () => {
  const summary = {
    duration: 100,
    players: [
      player({
        civilization: 'chinese',
        extraItems: [
          {
            type: 'Unknown',
            icon: 'icons/races/chinese/dynasties/song',
            pbgid: SONG_DYNASTY_PBGID,
            finished: [25],
          },
          {
            type: 'Unknown',
            icon: 'icons/races/chinese/dynasties/yuan',
            pbgid: YUAN_DYNASTY_PBGID,
            finished: [65],
          },
        ],
      }),
    ],
  };

  const [chart] = buildVillagerEfficiencyCharts(summary, new Map());
  const ideal = series(chart, 'Alpha', 'Ideal').values;
  const at = seconds => ideal[chart.data.labels.indexOf(seconds)];

  assert.equal(at(70), 10, 'the Song-speed villager queued before Yuan still finishes at 70 seconds');
  assert.equal(at(100), 11, 'new villagers return to a 20-second cadence after Yuan');
});

test('French ideal production applies the Town Center work-rate bonus for the current Age', () => {
  const summary = {
    duration: 50,
    players: [
      {
        ...player({ civilization: 'french' }),
        analysis: {
          landmarks: [{ gameTime: 0, newAge: 3 }],
        },
      },
    ],
  };

  const [chart] = buildVillagerEfficiencyCharts(summary, new Map());

  assert.equal(
    series(chart, 'Alpha', 'Ideal').values.at(-1),
    9,
    'Castle Age French completes three villagers in 50 seconds at +20% work rate',
  );
});

test('Tughlaq villager governor rate follows the governed fort tier for newly queued villagers', () => {
  const summary = {
    duration: 100,
    players: [
      player({
        civilization: 'tughlaq_dynasty',
        extraItems: [
          {
            type: 'Unknown',
            icon: 'icons/races/tughluq/governor_portraits/governor_villager',
            pbgid: TUGHLAQ_VILLAGER_GOVERNOR_PBGID,
            finished: [0],
          },
          {
            type: 'Upgrade',
            icon: 'icons/races/tughluq/upgrades/tughluqabad_fort_tier2',
            pbgid: TUGHLAQ_FORT_TIER_2_PBGID,
            finished: [45],
          },
        ],
      }),
    ],
  };

  const [chart] = buildVillagerEfficiencyCharts(summary, new Map());

  assert.equal(
    series(chart, 'Alpha', 'Ideal').values.at(-1),
    12,
    'tier 1 gives +15% and tier 2 gives +30% without rescheduling an active villager',
  );
});

test('Japanese ideal production infers a Town Center Yorishiro from sustained lone-TC cadence', () => {
  const summary = {
    duration: 150,
    players: [
      {
        ...player({
          civilization: 'japanese',
          finished: [0, 0, 0, 0, 0, 0, 20, 40, 60, 80, 100, 116, 132, 148],
        }),
        analysis: {
          landmarks: [{
            pbgid: FLOATING_GATE_PBGID,
            gameTime: 50,
            newAge: 3,
          }],
        },
      },
    ],
  };

  const [chart] = buildVillagerEfficiencyCharts(summary, new Map());

  assert.equal(
    series(chart, 'Alpha', 'Ideal')._uncappedValues.at(-1),
    14,
    'three consecutive 16-second completions identify the +25% Yorishiro work rate',
  );
});

test('soft cap stops missed debt without flattening uninterrupted ideal production', () => {
  const summary = {
    duration: 3000,
    players: [
      player({ name: 'Capped', profileId: 1 }),
      player({
        name: 'Over Cap',
        profileId: 2,
        finished: new Array(125).fill(0),
      }),
    ],
  };

  const [chart] = buildVillagerEfficiencyCharts(summary, new Map());

  assert.equal(series(chart, 'Capped', 'Ideal').values.at(-1), 156);
  assert.equal(series(chart, 'Over Cap', 'Ideal').values.at(-1), 275);
  assert.equal(series(chart, 'Capped', 'Missed production').values.at(-1), 114);
  assert.equal(
    chart.bands.find(band => band.playerName === 'Capped' && band.label === 'Missed production').toValues.at(-1),
    120,
    'amber missed-production shading stops at the soft cap',
  );

  applyVillagerEfficiencySoftCap(chart, 140);
  assert.equal(series(chart, 'Capped', 'Ideal').values.at(-1), 156);
  assert.equal(series(chart, 'Over Cap', 'Ideal').values.at(-1), 275);
  assert.equal(series(chart, 'Capped', 'Missed production').values.at(-1), 134);

  applyVillagerEfficiencySoftCap(chart, 100);
  assert.equal(series(chart, 'Capped', 'Ideal').values.at(-1), 156);
  assert.equal(series(chart, 'Capped', 'Missed production').values.at(-1), 94);
  assert.equal(series(chart, 'Over Cap', 'Ideal').values.at(-1), 275);
});

test('missed production never decreases and stops accumulating after the soft cap', () => {
  const summary = {
    duration: 80,
    players: [
      player({
        finished: [0, 0, 0, 0, 0, 0, 40, 60, 80],
      }),
    ],
  };

  const [chart] = buildVillagerEfficiencyCharts(summary, new Map());
  applyVillagerEfficiencySoftCap(chart, 8);

  const missed = series(chart, 'Alpha', 'Missed production').values;
  const ideal = series(chart, 'Alpha', 'Ideal').values;

  assert.deepEqual(missed, [0, 0, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(ideal[chart.data.labels.indexOf(40)], 8, 'uninterrupted production reaches the cap');
  assert.equal(ideal.at(-1), 10, 'uninterrupted ideal keeps rising after missed debt freezes');
});

test('Jin ideal production uses mounted villagers up to 20/23/26 caps, then regular villagers', () => {
  const summary = {
    duration: 1000,
    players: [{
      name: 'Jin',
      profileId: 1,
      civilization: 'jin_dynasty',
      team: 0,
      buildOrder: [
        {
          type: 'Unit',
          icon: 'units/mounted_villager',
          pbgid: MOUNTED_VILLAGER_PBGID,
          finished: [0, 0, 0],
          destroyed: [],
        },
        {
          type: 'Unit',
          icon: 'units/villager',
          pbgid: VILLAGER_PBGID,
          finished: [],
          destroyed: [],
        },
        {
          type: 'Building',
          icon: 'buildings/town_centre_capitol',
          pbgid: CAPITAL_TC_PBGID,
          constructed: [0],
          destroyed: [],
        },
        {
          type: 'Unknown',
          icon: 'abilities/mengan_mouke_global',
          pbgid: 9005189,
          finished: [700, 900],
        },
      ],
    }],
  };

  const [chart] = buildVillagerEfficiencyCharts(summary, new Map());
  const ideal = series(chart, 'Jin', 'Ideal').values;
  const at = seconds => ideal[chart.data.labels.indexOf(seconds)];

  assert.equal(at(600), 20);
  assert.equal(at(700), 25);
  assert.equal(at(830), 29);
  assert.equal(at(1000), 35);
});

test('villager efficiency is available in team games without killer attribution', () => {
  const summary = {
    duration: 40,
    players: [
      player({ name: 'A1', profileId: 1 }),
      player({ name: 'A2', profileId: 2 }),
      player({ name: 'B1', profileId: 3 }),
      player({ name: 'B2', profileId: 4 }),
    ],
  };

  assert.equal(buildVillagerEfficiencyCharts(summary, new Map()).length, 1);
});

test('buildVillagerEfficiencyCharts omits summaries without villager events', () => {
  const summary = {
    duration: 30,
    players: [{
      name: 'Alpha',
      buildOrder: [{ type: 'Unit', icon: 'units/scout', finished: [0], destroyed: [] }],
    }],
  };

  assert.deepEqual(buildVillagerEfficiencyCharts(summary, new Map()), []);
});
