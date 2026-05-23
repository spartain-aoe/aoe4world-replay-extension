import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  calculateDetailsPlayerMetrics,
  formatIdleTcTime,
  installDetailsTableMetrics,
  scheduleDetailsTableMetrics,
} from '../../src/content/details-metrics.ts';

test('formatters render table values', () => {
  assert.equal(formatIdleTcTime(65), '1:05');
  assert.equal(formatIdleTcTime(3661), '1:01:01');
  assert.equal(formatIdleTcTime(null), '—');
});

test('calculateDetailsPlayerMetrics returns one metric row per summary player', () => {
  const summary = {
    duration: 120,
    players: [{
      profileId: 1,
      name: 'P1',
      buildOrder: [
        { type: 'Building', icon: 'icons/races/common/buildings/town_centre_capitol', constructed: [0] },
        { type: 'Unit', icon: 'icons/races/common/units/villager', finished: [20, 40] },
      ],
    }],
  };

  assert.deepEqual(calculateDetailsPlayerMetrics(summary, [{
    profileId: 1,
    name: 'P1',
    townCenterIdleSeconds: 10,
  }]).map(item => ({
    name: item.name,
    profileId: item.profileId,
    idleTcSeconds: item.idleTcSeconds,
  })), [{
    name: 'P1',
    profileId: '1',
    idleTcSeconds: 10,
  }]);
});

test('installDetailsTableMetrics inserts headers and row cells after APM', () => {
  const { document, window } = parseHTML(`
    <table>
      <thead>
        <tr><th></th><th colspan="1">Score</th><th colspan="1">Resources Spent</th><th colspan="1">Max. Workers</th><th colspan="1">Misc</th><th colspan="1">Sacred Sites</th></tr>
        <tr><th></th><th>Total</th><th>Food</th><th>Villagers</th><th>APM</th><th>Capt.</th></tr>
      </thead>
      <tbody>
        <tr><td><a href="/players/1">P1</a></td><td>100</td><td>50</td><td>10</td><td>55</td><td>0</td></tr>
      </tbody>
    </table>
  `);
  globalThis.document = document;
  globalThis.window = window;

  const installed = installDetailsTableMetrics({
    duration: 120,
    players: [{
      profileId: 1,
      name: 'P1',
      buildOrder: [
        { type: 'Building', icon: 'icons/races/common/buildings/town_centre_capitol', constructed: [0] },
        { type: 'Unit', icon: 'icons/races/common/units/villager', finished: [20, 40] },
      ],
    }],
  }, [{
    profileId: 1,
    name: 'P1',
    townCenterIdleSeconds: 10,
  }]);

  assert.equal(installed, true);
  assert.equal(document.querySelector('thead tr:first-child th:nth-child(5)').getAttribute('colspan'), '2');
  assert.deepEqual(
    [...document.querySelectorAll('thead tr:nth-child(2) th')].map(th => th.textContent.trim()),
    ['', 'Total', 'Food', 'Villagers', 'APM', 'Idle TC', 'Capt.'],
  );
  assert.deepEqual(
    [...document.querySelectorAll('tbody td')].map(td => td.textContent.trim()),
    ['P1', '100', '50', '10', '55', '0:10', '0'],
  );
});

test('scheduleDetailsTableMetrics keeps loaded Idle TC value after later placeholder retries', async () => {
  const { document, window } = parseHTML(`
    <table>
      <thead>
        <tr><th></th><th colspan="1">Score</th><th colspan="1">Resources Spent</th><th colspan="1">Max. Workers</th><th colspan="1">Misc</th><th colspan="1">Sacred Sites</th></tr>
        <tr><th></th><th>Total</th><th>Food</th><th>Villagers</th><th>APM</th><th>Capt.</th></tr>
      </thead>
      <tbody>
        <tr><td><a href="/players/1">P1</a></td><td>100</td><td>50</td><td>10</td><td>55</td><td>0</td></tr>
      </tbody>
    </table>
  `);
  Object.defineProperty(window, 'location', {
    value: new URL('https://aoe4world.com/players/1-P1/games/123'),
    configurable: true,
  });
  globalThis.document = document;
  globalThis.window = window;
  globalThis.chrome = {
    runtime: {
      sendMessage: (message, callback) => {
        if (message.type === 'getStatsMetrics') {
          setTimeout(() => callback({
            success: true,
            players: [{ profileId: 1, name: 'P1', townCenterIdleSeconds: 10 }],
          }), 50);
        }
      },
    },
  };

  scheduleDetailsTableMetrics({
    players: [{ profileId: 1, name: 'P1' }],
  }, '123');

  await new Promise(resolve => setTimeout(resolve, 4300));

  assert.deepEqual(
    [...document.querySelectorAll('tbody td')].map(td => td.textContent.trim()),
    ['P1', '100', '50', '10', '55', '0:10', '0'],
  );
});
