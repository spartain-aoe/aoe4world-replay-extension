import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArmySeriesForPlayer,
  armyTeamSigns,
  precomputeStackedValues,
} from '../../src/content/army-series.ts';
import { pbgidUnitsMap } from '../../src/content/pbgid-map.ts';
import { buildUnitDataIndexForCiv, unitDataIndex } from '../../src/content/unit-data-cache.ts';


describe('buildArmySeriesForPlayer', () => {
  test('returns empty array for player with no buildOrder', () => {
    const player = { name: 'P1', civilization: 'french' };
    const labels = [0, 20, 40, 60];
    const result = buildArmySeriesForPlayer(player, labels, '#4dabf7');
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  test('returns empty array when buildOrder has only non-army items', () => {
    const player = {
      name: 'P1',
      civilization: 'english',
      buildOrder: [
        { type: 'Unit', icon: 'units/villager', finished: [10], destroyed: [] },
        { type: 'Unit', icon: 'units/scout', finished: [15], destroyed: [] },
      ],
    };
    const labels = [0, 20, 40];
    const result = buildArmySeriesForPlayer(player, labels, '#ff0000');
    assert.equal(result.length, 0);
  });

  test('produces series for a single army unit type', () => {
    const player = {
      name: 'P1',
      civilization: 'english',
      buildOrder: [
        { type: 'Unit', icon: 'units/knight', finished: [10, 30], destroyed: [50] },
      ],
    };
    const labels = [0, 20, 40, 60];
    const result = buildArmySeriesForPlayer(player, labels, '#4dabf7');
    assert.ok(result.length >= 1);
    const knightSeries = result.find(s => s.label.toLowerCase().includes('knight'));
    assert.ok(knightSeries, 'should find a knight series');
    assert.equal(knightSeries.createdTotal, 2);
    assert.equal(knightSeries.values.length, labels.length);
    assert.deepEqual([...knightSeries.values], [0, 1, 2, 1]);
  });

  test('merges same-label groups into one series', () => {
    const player = {
      name: 'P1',
      civilization: 'english',
      buildOrder: [
        { type: 'Unit', icon: 'units/archer_2', finished: [10], destroyed: [] },
        { type: 'Unit', icon: 'units/archer_3', finished: [30], destroyed: [] },
      ],
    };
    const labels = [0, 20, 40];
    const result = buildArmySeriesForPlayer(player, labels, '#4dabf7');
    const archerSeries = result.filter(s => s.mergeKey === 'archer');
    assert.equal(archerSeries.length, 1, 'both age variants should merge');
    assert.equal(archerSeries[0].createdTotal, 2);
  });

  test('merges Jin biome variants (Horse Archer / Mohe Tribesman) into one Mohe Tribesman series', () => {
    const previousAge2 = pbgidUnitsMap.get(9004188);
    const previousAge3 = pbgidUnitsMap.get(9004189);
    const previousHorseArcher = pbgidUnitsMap.get(133493);
    pbgidUnitsMap.set(9004188, {
      n: 'Mohe Tribesman',
      k: 'mohe-tribesman',
      i: 'https://data.aoe4world.com/images/units/mohe-tribesman-2.png',
    });
    pbgidUnitsMap.set(9004189, {
      n: 'Mohe Tribesman',
      k: 'mohe-tribesman',
      i: 'https://data.aoe4world.com/images/units/mohe-tribesman-2.png',
    });
    pbgidUnitsMap.set(133493, {
      n: 'Horse Archer',
      k: 'horse-archer',
      i: 'https://data.aoe4world.com/images/units/horse-archer-3.png',
    });
    try {
      const player = {
        name: 'P1',
        civilization: 'jin_dynasty',
        civilizationAttrib: 'jin_dynasty',
        buildOrder: [
          { id: '11270955', type: 'Unit', icon: 'icons/races/jin/units/horse_archer_2', pbgid: 9003972, finished: [10, 20], destroyed: [] },
          { id: '11270955', type: 'Unit', icon: 'icons/races/jin/units/grassland/horse_archer_grassland_2', pbgid: 9004188, finished: [30], destroyed: [] },
          { id: '11270956', type: 'Unit', icon: 'icons/races/jin/units/horse_archer_3', pbgid: 9003973, finished: [40], destroyed: [70] },
          { id: '11270956', type: 'Unit', icon: 'icons/races/jin/units/grassland/horse_archer_grassland_3', pbgid: 9004189, finished: [50], destroyed: [] },
          { id: 'extra-grassland', type: 'Unit', icon: 'icons/races/jin/units/grassland/horse_archer_grassland_2', pbgid: 9003972, finished: [55], destroyed: [] },
          { id: 'unrelated', type: 'Unit', icon: 'icons/races/rus/units/horse_archer_3', pbgid: 133493, finished: [60], destroyed: [] },
        ],
      };

      const result = buildArmySeriesForPlayer(player, [0, 20, 40, 60, 80], '#4dabf7');
      const mohe = result.find(s => s.mergeKey === 'mohe-tribesman');
      const horseArcher = result.find(s => s.mergeKey === 'horse-archer');

      assert.ok(mohe, 'Mohe Tribesman series should exist');
      assert.ok(horseArcher, 'unrelated Rus Horse Archer entity should remain separate');
      assert.equal(mohe.label, 'Mohe Tribesman');
      // All 5 Jin items (9003972/3 + 9004188/9 + extra-grassland) collapse into Mohe Tribesman:
      assert.equal(mohe.createdTotal, 6);
      assert.deepEqual([...mohe.values], [0, 2, 4, 6, 5]);
      assert.equal(horseArcher.createdTotal, 1);
      assert.equal(mohe.iconCandidates[0], 'https://data.aoe4world.com/images/units/mohe-tribesman-2.png');
    } finally {
      if (previousAge2) pbgidUnitsMap.set(9004188, previousAge2);
      else pbgidUnitsMap.delete(9004188);
      if (previousAge3) pbgidUnitsMap.set(9004189, previousAge3);
      else pbgidUnitsMap.delete(9004189);
      if (previousHorseArcher) pbgidUnitsMap.set(133493, previousHorseArcher);
      else pbgidUnitsMap.delete(133493);
    }
  });

  test('merges plural/singular display-name variants (Wynguard Rangers + Wynguard Ranger) into one series labeled with the singular', () => {
    // Mirrors English game 234739848: the "summon" PBGID resolves to "Wynguard Rangers"
    // and the deployed unit PBGID resolves to "Wynguard Ranger" -- both should collapse
    // onto the singular display label so the chart shows one series.
    const previousPlural = pbgidUnitsMap.get(2075743);
    const previousSingular = pbgidUnitsMap.get(2122538);
    const previousPluralFoot = pbgidUnitsMap.get(2122352);
    const previousSingularFoot = pbgidUnitsMap.get(2122350);
    pbgidUnitsMap.set(2075743, {
      n: 'Wynguard Rangers',
      k: 'wynguard-rangers',
      i: 'https://data.aoe4world.com/images/units/wynguard-rangers-1.png',
    });
    pbgidUnitsMap.set(2122538, {
      n: 'Wynguard Ranger',
      k: 'wynguard-ranger',
      i: 'https://data.aoe4world.com/images/units/wynguard-ranger-4.png',
    });
    pbgidUnitsMap.set(2122352, {
      n: 'Wynguard Footmen',
      k: 'wynguard-footmen',
      i: 'https://data.aoe4world.com/images/units/wynguard-footmen-1.png',
    });
    pbgidUnitsMap.set(2122350, {
      n: 'Wynguard Footman',
      k: 'wynguard-footman',
      i: 'https://data.aoe4world.com/images/units/wynguard-footman-4.png',
    });
    try {
      const player = {
        name: 'P1',
        civilization: 'english',
        buildOrder: [
          { id: 'wr-plural', type: 'Unit', icon: 'icons/races/english/units/wynguard_rangers', pbgid: 2075743, finished: [10, 20], destroyed: [] },
          { id: 'wr-singular', type: 'Unit', icon: 'icons/races/english/units/wynguard_ranger', pbgid: 2122538, finished: [15, 25, 35], destroyed: [] },
          { id: 'wf-plural', type: 'Unit', icon: 'icons/races/english/units/wynguard_footmen', pbgid: 2122352, finished: [40], destroyed: [] },
          { id: 'wf-singular', type: 'Unit', icon: 'icons/races/english/units/wynguard_footman', pbgid: 2122350, finished: [45, 55], destroyed: [] },
        ],
      };
      const result = buildArmySeriesForPlayer(player, [0, 20, 40, 60], '#4dabf7');
      const rangerSeries = result.filter(s => /wynguard ranger/i.test(s.label));
      const footmanSeries = result.filter(s => /wynguard footman/i.test(s.label));
      assert.equal(rangerSeries.length, 1, 'rangers plural+singular collapse into one series');
      assert.equal(footmanSeries.length, 1, 'footmen plural+singular collapse into one series');
      assert.equal(rangerSeries[0].label, 'Wynguard Ranger', 'singular label preferred for display');
      assert.equal(footmanSeries[0].label, 'Wynguard Footman', 'singular label preferred for display');
      assert.equal(rangerSeries[0].createdTotal, 5);
      assert.equal(footmanSeries[0].createdTotal, 3);
    } finally {
      const restore = (id, prev) => prev ? pbgidUnitsMap.set(id, prev) : pbgidUnitsMap.delete(id);
      restore(2075743, previousPlural);
      restore(2122538, previousSingular);
      restore(2122352, previousPluralFoot);
      restore(2122350, previousSingularFoot);
    }
  });

  test('computes parallel _countValues and _valueValues (cost-weighted) per series', () => {
    // Seed unit cost data for two english units: Knight (200 res) and Spearman (60 res).
    const previousEnglish = unitDataIndex.get('english');
    buildUnitDataIndexForCiv('english', [
      { id: 'knight', baseId: 'knight', name: 'Knight', icon: 'units/knight-2', pbgid: 700001, age: 2, classes: ['cavalry'], costs: { food: 140, gold: 60, total: 200 } },
      { id: 'spearman', baseId: 'spearman', name: 'Spearman', icon: 'units/spearman-1', pbgid: 700002, age: 1, classes: ['infantry'], costs: { food: 50, wood: 10, total: 60 } },
    ]);
    try {
      const player = {
        name: 'P1',
        civilization: 'english',
        buildOrder: [
          { id: 'k1', type: 'Unit', icon: 'units/knight', pbgid: 700001, finished: [10, 30], destroyed: [50] },
          { id: 's1', type: 'Unit', icon: 'units/spearman', pbgid: 700002, finished: [5, 25, 45], destroyed: [] },
        ],
      };
      const labels = [0, 20, 40, 60];
      const result = buildArmySeriesForPlayer(player, labels, '#4dabf7');
      const knight = result.find(s => s.mergeKey === 'knight');
      const spear = result.find(s => s.mergeKey === 'spearman');
      assert.ok(knight && spear, 'both series exist');

      assert.deepEqual([...knight._countValues], [0, 1, 2, 1], 'knight count-mode active values');
      assert.deepEqual([...knight._valueValues], [0, 200, 400, 200], 'knight value-mode active values (200 per knight)');
      assert.equal(knight._valueTotal, 400, 'knight _valueTotal = 2 trains * 200 res');
      assert.equal(knight.values, knight._countValues, 'default values reference count array');

      assert.deepEqual([...spear._countValues], [0, 1, 2, 3], 'spearman count-mode');
      assert.deepEqual([...spear._valueValues], [0, 60, 120, 180], 'spearman value-mode (60 per spearman)');
      assert.equal(spear._valueTotal, 180);
    } finally {
      if (previousEnglish) unitDataIndex.set('english', previousEnglish);
      else unitDataIndex.delete('english');
    }
  });

  test('_valueValues falls back to zeros when unit cost data is not loaded', () => {
    const previousEnglish = unitDataIndex.get('english');
    unitDataIndex.delete('english');
    try {
      const player = {
        name: 'P1',
        civilization: 'english',
        buildOrder: [
          { id: 'k1', type: 'Unit', icon: 'units/knight', finished: [10, 30], destroyed: [] },
        ],
      };
      const result = buildArmySeriesForPlayer(player, [0, 20, 40], '#4dabf7');
      const knight = result.find(s => s.mergeKey === 'knight');
      assert.ok(knight);
      assert.deepEqual([...knight._countValues], [0, 1, 2]);
      assert.deepEqual([...knight._valueValues], [0, 0, 0], 'no cost data => zeros');
      assert.equal(knight._valueTotal, 0);
    } finally {
      if (previousEnglish) unitDataIndex.set('english', previousEnglish);
    }
  });

  test('_valueValues populates from bundled pbgidUnitsMap cost when unit-data cache is empty', () => {
    const FALLBACK_PBGID = 991234;
    const previousEnglish = unitDataIndex.get('english');
    const previousPbgid = pbgidUnitsMap.get(FALLBACK_PBGID);
    unitDataIndex.delete('english');
    pbgidUnitsMap.set(FALLBACK_PBGID, { n: 'Knight', k: 'knight', c: 240 });
    try {
      const player = {
        name: 'P1',
        civilization: 'english',
        buildOrder: [
          { id: 'k1', type: 'Unit', icon: 'units/knight', pbgid: FALLBACK_PBGID, finished: [10, 30], destroyed: [50] },
        ],
      };
      const labels = [0, 20, 40, 60];
      const result = buildArmySeriesForPlayer(player, labels, '#4dabf7');
      const knight = result.find(s => s.mergeKey === 'knight');
      assert.ok(knight, 'knight series present');
      assert.deepEqual([...knight._countValues], [0, 1, 2, 1], 'count-mode unchanged');
      assert.deepEqual([...knight._valueValues], [0, 240, 480, 240], 'value-mode uses bundled cost (240/knight)');
      assert.equal(knight._valueTotal, 480, '2 trains * 240 res');
      assert.deepEqual([...knight._finishedTimes], [10, 30], 'finished times sorted for range stats');
      assert.deepEqual([...knight._finishedCosts], [240, 240], 'finished costs align with sorted times');
      assert.deepEqual([...knight._destroyedTimes], [50], 'destroyed times sorted for range stats');
      assert.deepEqual([...knight._destroyedCosts], [240], 'destroyed costs align with sorted times');
    } finally {
      if (previousEnglish) unitDataIndex.set('english', previousEnglish);
      else unitDataIndex.delete('english');
      if (previousPbgid) pbgidUnitsMap.set(FALLBACK_PBGID, previousPbgid);
      else pbgidUnitsMap.delete(FALLBACK_PBGID);
    }
  });

  test('preserves upgrade timestamps sorted ascending', () => {
    const player = {
      name: 'P1',
      civilization: 'english',
      buildOrder: [
        { type: 'Unit', icon: 'units/spearman', finished: [10], destroyed: [] },
        { type: 'Upgrade', icon: 'units/spearman_upgrade', finished: [50, 30], destroyed: [] },
      ],
    };
    const labels = [0, 20, 40, 60];
    const result = buildArmySeriesForPlayer(player, labels, '#4dabf7');
    const spear = result.find(s => s.mergeKey === 'spearman');
    assert.ok(spear, 'should have spearman series');
    if (spear.upgrades.length > 0) {
      for (let i = 1; i < spear.upgrades.length; i++) {
        assert.ok(spear.upgrades[i].time >= spear.upgrades[i - 1].time, 'upgrades sorted by time');
      }
    }
  });

  test('includes baseColor on each series entry', () => {
    const player = {
      name: 'P1',
      civilization: 'english',
      buildOrder: [
        { type: 'Unit', icon: 'units/knight', finished: [10], destroyed: [] },
      ],
    };
    const labels = [0, 20];
    const result = buildArmySeriesForPlayer(player, labels, '#aabbcc');
    assert.ok(result.length >= 1);
    assert.equal(result[0].baseColor, '#aabbcc');
  });

  test('handles transformed timestamps', () => {
    const player = {
      name: 'P1',
      civilization: 'english',
      buildOrder: [
        { type: 'Unit', icon: 'units/horseman', finished: [10], destroyed: [], transformed: [30] },
      ],
    };
    const labels = [0, 20, 40];
    const result = buildArmySeriesForPlayer(player, labels, '#4dabf7');
    const horseman = result.find(s => s.mergeKey === 'horseman');
    assert.ok(horseman);
    assert.equal(horseman.createdTotal, 2);
    assert.deepEqual([...horseman.values], [0, 1, 2]);
  });

  test('sorted _finishedTimes and _destroyedTimes', () => {
    const player = {
      name: 'P1',
      civilization: 'english',
      buildOrder: [
        { type: 'Unit', icon: 'units/knight', finished: [50, 10, 30], destroyed: [60, 20] },
      ],
    };
    const labels = [0, 20, 40, 60];
    const result = buildArmySeriesForPlayer(player, labels, '#4dabf7');
    const knight = result.find(s => s.mergeKey === 'knight');
    assert.ok(knight);
    assert.deepEqual([...knight._finishedTimes], [10, 30, 50]);
    assert.deepEqual([...knight._destroyedTimes], [20, 60]);
  });

  test('collapses to max 10 series via collapseChartSeries', () => {
    const buildOrder = [];
    for (let i = 0; i < 12; i++) {
      buildOrder.push({
        type: 'Unit',
        icon: `units/unittype${i}`,
        finished: [10 * (i + 1)],
        destroyed: [],
      });
    }
    const player = { name: 'P1', civilization: 'english', buildOrder };
    const labels = [0, 20, 40, 60, 80, 100, 120, 140];
    const result = buildArmySeriesForPlayer(player, labels, '#4dabf7');
    assert.ok(result.length <= 10, `should collapse to <=10, got ${result.length}`);
  });

  test('iconCandidates is an array', () => {
    const player = {
      name: 'P1',
      civilization: 'english',
      buildOrder: [
        { type: 'Unit', icon: 'units/knight', finished: [10], destroyed: [] },
      ],
    };
    const labels = [0, 20];
    const result = buildArmySeriesForPlayer(player, labels, '#4dabf7');
    assert.ok(result.length >= 1);
    assert.ok(Array.isArray(result[0].iconCandidates));
  });
});


describe('armyTeamSigns', () => {
  test('returns positive sign for the first native-legend team', () => {
    const players = [
      { name: 'Alice', team: 1 },
      { name: 'Bob', team: 2 },
    ];
    const signs = armyTeamSigns(players, ['Bob']);
    assert.equal(signs.get(2), 1, 'Bob team (2) should be positive');
    assert.equal(signs.get(1), -1, 'Alice team (1) should be negative');
  });

  test('defaults to first sorted team when nativePlayerOrder is empty', () => {
    const players = [
      { name: 'A', team: 3 },
      { name: 'B', team: 1 },
    ];
    const signs = armyTeamSigns(players, []);
    assert.equal(signs.get(1), 1, 'lowest team id should be positive');
    assert.equal(signs.get(3), -1);
  });

  test('handles single team', () => {
    const players = [
      { name: 'A', team: 1 },
      { name: 'B', team: 1 },
    ];
    const signs = armyTeamSigns(players, []);
    assert.equal(signs.get(1), 1);
  });

  test('handles players with undefined team', () => {
    const players = [
      { name: 'A', team: 1 },
      { name: 'B' },
    ];
    const signs = armyTeamSigns(players, []);
    assert.equal(signs.size, 1);
    assert.equal(signs.get(1), 1);
  });

  test('nativePlayerOrder match is case-insensitive', () => {
    const players = [
      { name: 'Alice', team: 1 },
      { name: 'Bob', team: 2 },
    ];
    const signs = armyTeamSigns(players, ['BOB']);
    assert.equal(signs.get(2), 1);
    assert.equal(signs.get(1), -1);
  });
});


describe('precomputeStackedValues', () => {
  test('handles empty series array', () => {
    precomputeStackedValues([]);
  });

  test('stacks positive series bottom-up', () => {
    const s1 = { values: [1, 2, 3], sign: 1, playerName: 'P1' };
    const s2 = { values: [4, 5, 6], sign: 1, playerName: 'P1' };
    precomputeStackedValues([s1, s2]);
    // After reversal for positive side, s2 is processed first, then s1
    // s2 base=0, s2 top=values
    // s1 base=s2 top, s1 top=s1 base + s1 values
    for (let i = 0; i < 3; i++) {
      assert.equal(s1._stackTop[i], s1._stackBase[i] + s1.values[i]);
      assert.equal(s2._stackTop[i], s2._stackBase[i] + s2.values[i]);
    }
    const topSeries = [s1, s2].find(s => Math.max(...s._stackTop) === Math.max(...s1._stackTop, ...s2._stackTop));
    assert.ok(topSeries);
  });

  test('negative series stack in negative direction', () => {
    const s1 = { values: [-3, -6, -9], sign: -1, playerName: 'P2' };
    precomputeStackedValues([s1]);
    assert.equal(s1._stackBase[0], 0);
    assert.equal(s1._stackTop[0], -3);
    assert.equal(s1._stackTop[1], -6);
    assert.equal(s1._stackTop[2], -9);
  });

  test('hidden series get base == top (zero height)', () => {
    const s1 = { values: [5, 10], sign: 1, playerName: 'P1' };
    const s2 = { values: [3, 7], sign: 1, playerName: 'P1', _hidden: true };
    const s3 = { values: [2, 4], sign: 1, playerName: 'P1' };
    precomputeStackedValues([s1, s2, s3]);
    for (let i = 0; i < 2; i++) {
      assert.equal(s2._stackBase[i], s2._stackTop[i], 'hidden series has zero height');
    }
  });

  test('per-player aggregate bands (_playerBase and _playerTop)', () => {
    const s1 = { values: [2, 4], sign: 1, playerName: 'P1' };
    const s2 = { values: [3, 5], sign: 1, playerName: 'P1' };
    const s3 = { values: [1, 2], sign: 1, playerName: 'P2' };
    precomputeStackedValues([s1, s2, s3]);
    assert.ok(s1._playerBase);
    assert.ok(s1._playerTop);
    assert.deepEqual([...s1._playerBase], [...s2._playerBase]);
    assert.deepEqual([...s1._playerTop], [...s2._playerTop]);
    assert.ok(s3._playerBase);
  });

  test('mixed positive and negative series', () => {
    const pos = { values: [5], sign: 1, playerName: 'P1' };
    const neg = { values: [-3], sign: -1, playerName: 'P2' };
    precomputeStackedValues([pos, neg]);
    assert.ok(pos._stackTop[0] > 0, 'positive top > 0');
    assert.ok(neg._stackTop[0] < 0, 'negative top < 0');
  });

  test('monotonic stacking: each successive top includes previous', () => {
    const s1 = { values: [10], sign: 1, playerName: 'P1' };
    const s2 = { values: [20], sign: 1, playerName: 'P1' };
    const s3 = { values: [5], sign: 1, playerName: 'P1' };
    precomputeStackedValues([s1, s2, s3]);
    // After positive-side reversal, order is s3, s2, s1
    // Each series' base should equal the previous series' top
    // Total of all tops should equal 10 + 20 + 5 = 35
    const allTops = [s1._stackTop[0], s2._stackTop[0], s3._stackTop[0]];
    const maxTop = Math.max(...allTops);
    assert.equal(maxTop, 35);
  });

  test('default sign is positive when omitted', () => {
    const s = { values: [7, 14], playerName: 'P1' };
    precomputeStackedValues([s]);
    assert.equal(s._stackBase[0], 0);
    assert.equal(s._stackTop[0], 7);
    assert.equal(s._stackTop[1], 14);
  });
});
