import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import {
  calculateDetailsPlayerMetrics,
  clearDetailsTableMetrics,
  formatKdCostRatio,
  installDetailsTableMetrics,
} from '../../src/content/details-metrics.ts';
import { pbgidUnitsMap, resolveUnitByPbgid } from '../../src/content/pbgid-map.ts';

const SPEARMAN_PBGID = 990101;
const KNIGHT_PBGID = 990102;
const UNKNOWN_PBGID = 990103;
const FREE_MILITIA_PBGID = 9005329;
const PAID_JAPANESE_SHINOBI_PBGID = 2121981;
const FREE_SHINOBI_PBGID = 2151449;

let previousEntries;

beforeEach(() => {
  previousEntries = new Map([
    [SPEARMAN_PBGID, pbgidUnitsMap.get(SPEARMAN_PBGID)],
    [KNIGHT_PBGID, pbgidUnitsMap.get(KNIGHT_PBGID)],
    [UNKNOWN_PBGID, pbgidUnitsMap.get(UNKNOWN_PBGID)],
    [PAID_JAPANESE_SHINOBI_PBGID, pbgidUnitsMap.get(PAID_JAPANESE_SHINOBI_PBGID)],
    [FREE_SHINOBI_PBGID, pbgidUnitsMap.get(FREE_SHINOBI_PBGID)],
  ]);
  pbgidUnitsMap.set(SPEARMAN_PBGID, { n: 'Spearman', k: 'spearman', c: 50 });
  pbgidUnitsMap.set(KNIGHT_PBGID, { n: 'Knight', k: 'knight', c: 200 });
  pbgidUnitsMap.set(FREE_SHINOBI_PBGID, { n: 'Shinobi', k: 'shinobi', c: 0 });
  pbgidUnitsMap.delete(UNKNOWN_PBGID);
  pbgidUnitsMap.delete(PAID_JAPANESE_SHINOBI_PBGID);
});

afterEach(() => {
  for (const [pbgid, entry] of previousEntries) {
    if (entry) pbgidUnitsMap.set(pbgid, entry);
    else pbgidUnitsMap.delete(pbgid);
  }
  clearDetailsTableMetrics();
  delete globalThis.document;
  delete globalThis.window;
});

function oneVsOneSummary() {
  return {
    players: [
      {
        profileId: 1,
        name: 'Alpha',
        team: 0,
        _stats: { elitekill: 1, edeaths: 2 },
        buildOrder: [{
          type: 'Unit',
          icon: 'units/spearman',
          pbgid: SPEARMAN_PBGID,
          destroyed: [10, 20],
        }, {
          type: 'Unit',
          icon: 'units/villager',
          destroyed: [12],
        }],
      },
      {
        profileId: 2,
        name: 'Bravo',
        team: 1,
        _stats: { elitekill: 2, edeaths: 1 },
        buildOrder: [{
          type: 'Unit',
          icon: 'units/knight',
          pbgid: KNIGHT_PBGID,
          destroyed: [15],
        }, {
          type: 'Unit',
          icon: 'units/villager',
          destroyed: [18],
        }],
      },
    ],
  };
}

test('calculateDetailsPlayerMetrics computes exact 1v1 killed/lost unit value', () => {
  const metrics = calculateDetailsPlayerMetrics(oneVsOneSummary());

  assert.deepEqual(metrics.map(metric => ({
    name: metric.name,
    killedUnitCost: metric.killedUnitCost,
    lostUnitCost: metric.lostUnitCost,
    unavailable: metric.kdCostUnavailableReason,
  })), [
    {
      name: 'Alpha',
      killedUnitCost: 200,
      lostUnitCost: 100,
      unavailable: null,
    },
    {
      name: 'Bravo',
      killedUnitCost: 100,
      lostUnitCost: 200,
      unavailable: null,
    },
  ]);
});

test('K/D Cost formatting matches the native K/D zero-loss conventions', () => {
  assert.equal(formatKdCostRatio(199, 100), '1.99');
  assert.equal(formatKdCostRatio(0, 100), '0');
  assert.equal(formatKdCostRatio(100, 0), '∞');
  assert.equal(formatKdCostRatio(0, 0), '');
  assert.equal(formatKdCostRatio(null, 100), '—');
});

test('count mismatches produce an explicit proportional estimate instead of hiding the ratio', () => {
  const summary = oneVsOneSummary();
  summary.players[1].buildOrder.push({
    type: 'Unit',
    icon: 'units/spearman',
    pbgid: SPEARMAN_PBGID,
    destroyed: [25],
  });

  const [alpha, bravo] = calculateDetailsPlayerMetrics(summary);
  assert.equal(alpha.killedUnitCost, 125);
  assert.equal(alpha.lostUnitCost, 100);
  assert.equal(alpha.kdCostUnavailableReason, null);
  assert.match(alpha.kdCostApproximateReason, /2 recorded.*1 native/i);
  assert.equal(formatKdCostRatio(alpha.killedUnitCost, alpha.lostUnitCost, true), '≈1.25');

  assert.equal(bravo.killedUnitCost, 100);
  assert.equal(bravo.lostUnitCost, 125);
  assert.equal(bravo.kdCostUnavailableReason, null);
  assert.match(bravo.kdCostApproximateReason, /2 recorded.*1 native/i);
});

test('missing unit costs make the ratio explicitly unavailable', () => {
  const summary = oneVsOneSummary();
  summary.players[1].buildOrder = [{
    type: 'Unit',
    icon: 'units/unknown',
    pbgid: UNKNOWN_PBGID,
    destroyed: [15],
  }];

  const [alpha] = calculateDetailsPlayerMetrics(summary);
  assert.equal(alpha.killedUnitCost, null);
  assert.match(alpha.kdCostUnavailableReason, /missing unit cost/i);
});

test('authoritative zero-cost units remain valid K/D Cost events', () => {
  const summary = oneVsOneSummary();
  summary.players[1].buildOrder = [{
    type: 'Unit',
    icon: 'icons/races/rus/units/militia_handcannoneer',
    pbgid: FREE_MILITIA_PBGID,
    destroyed: [15],
  }];

  const [alpha] = calculateDetailsPlayerMetrics(summary);
  assert.equal(alpha.killedUnitCost, 0);
  assert.equal(alpha.lostUnitCost, 100);
  assert.equal(alpha.kdCostUnavailableReason, null);
});

test('paid Japanese Shinobi destructions use 50 food plus 50 gold', () => {
  const summary = oneVsOneSummary();
  summary.players[0]._stats.elitekill = 8;
  summary.players[1]._stats.edeaths = 8;
  summary.players[1].buildOrder = [{
    type: 'Unit',
    icon: 'icons/races/japanese/units/shinobi',
    pbgid: PAID_JAPANESE_SHINOBI_PBGID,
    destroyed: [15, 16, 17, 18, 19, 20, 21, 22],
  }];

  const [alpha] = calculateDetailsPlayerMetrics(summary);
  assert.equal(resolveUnitByPbgid(PAID_JAPANESE_SHINOBI_PBGID)?.c, 100);
  assert.equal(resolveUnitByPbgid(FREE_SHINOBI_PBGID)?.c, 0);
  assert.equal(alpha.killedUnitCost, 800);
  assert.equal(alpha.kdCostUnavailableReason, null);
  assert.equal(alpha.kdCostApproximateReason, null);
});

test('team games do not invent per-player kill attribution', () => {
  const summary = oneVsOneSummary();
  summary.players.push(
    { profileId: 3, name: 'Charlie', team: 0, buildOrder: [] },
    { profileId: 4, name: 'Delta', team: 1, buildOrder: [] },
  );

  const metrics = calculateDetailsPlayerMetrics(summary);
  assert.ok(metrics.every(metric => metric.killedUnitCost === null));
  assert.ok(metrics.every(metric => /team games/i.test(metric.kdCostUnavailableReason)));
});

test('installDetailsTableMetrics places K/D Cost after K/D and updates Military colspan', () => {
  const { document, window } = parseHTML(`
    <table>
      <thead>
        <tr><th></th><th colspan="1">Score</th><th colspan="1">Resources Spent</th><th colspan="1">Max. Workers</th><th colspan="4">Military</th><th colspan="1">Misc</th></tr>
        <tr><th></th><th>Total</th><th>Food</th><th>Villagers</th><th>Prod.</th><th>Kills</th><th>Deaths</th><th>K/D</th><th>APM</th></tr>
      </thead>
      <tbody>
        <tr><td><a href="/players/1">Alpha</a></td><td>100</td><td>50</td><td>10</td><td>3</td><td>1</td><td>2</td><td>0.5</td><td>55</td></tr>
        <tr><td><a href="/players/2">Bravo</a></td><td>90</td><td>40</td><td>9</td><td>2</td><td>2</td><td>1</td><td>2</td><td>50</td></tr>
      </tbody>
    </table>
  `);
  globalThis.document = document;
  globalThis.window = window;

  assert.equal(installDetailsTableMetrics(oneVsOneSummary()), true);
  assert.deepEqual(
    [...document.querySelectorAll('thead tr:nth-child(2) th')].map(th => th.textContent.trim()),
    ['', 'Total', 'Food', 'Villagers', 'Prod.', 'Kills', 'Deaths', 'K/D', 'K/D Cost', 'APM', 'Idle TC'],
  );
  assert.equal(document.querySelector('thead tr:first-child th:nth-child(5)').getAttribute('colspan'), '5');
  assert.equal(document.querySelector('thead tr:first-child th:nth-child(6)').getAttribute('colspan'), '2');
  assert.equal(document.querySelector('tbody tr:first-child td[data-aoe4-details-metric="kd-cost"]').textContent.trim(), '2');
  assert.equal(document.querySelector('tbody tr:nth-child(2) td[data-aoe4-details-metric="kd-cost"]').textContent.trim(), '0.5');

  clearDetailsTableMetrics();
  assert.equal(document.querySelector('thead tr:first-child th:nth-child(5)').getAttribute('colspan'), '4');
  assert.equal(document.querySelector('thead tr:first-child th:nth-child(6)').getAttribute('colspan'), '1');
});
