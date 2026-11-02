import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

test('K/D Cost loads the combat bundle unit-cost map before rendering', async () => {
  const { document, window } = parseHTML(`
    <table>
      <thead>
        <tr><th></th><th colspan="1">Score</th><th colspan="1">Resources Spent</th><th colspan="1">Max. Workers</th><th colspan="1">Military</th><th colspan="1">Misc</th></tr>
        <tr><th></th><th>Total</th><th>Food</th><th>Villagers</th><th>K/D</th><th>APM</th></tr>
      </thead>
      <tbody>
        <tr><td><a href="/players/1">Alpha</a></td><td>100</td><td>50</td><td>10</td><td>1</td><td>50</td></tr>
        <tr><td><a href="/players/2">Bravo</a></td><td>90</td><td>40</td><td>9</td><td>1</td><td>50</td></tr>
      </tbody>
    </table>
  `);
  Object.defineProperty(window, 'location', {
    value: new URL('https://aoe4world.com/players/1-Alpha/games/257847569'),
    writable: true,
    configurable: true,
  });
  globalThis.document = document;
  globalThis.window = window;

  let fetchCalls = 0;
  globalThis.chrome = {
    runtime: {
      getURL: path => `chrome-extension://test/${path}`,
      sendMessage: (_message, callback) => callback?.(undefined),
    },
  };
  globalThis.fetch = async () => {
    fetchCalls++;
    return {
      ok: true,
      json: async () => ({
        units: {
          7576265: { n: 'Horseman', k: 'horseman', c: 120 },
          2104832: { n: 'King', k: 'king', c: 200 },
        },
      }),
    };
  };

  const {
    clearDetailsTableMetrics,
    scheduleDetailsTableMetrics,
  } = await import(`../../src/content/details-metrics.ts?loading=${Date.now()}`);

  const summary = {
    players: [
      {
        profileId: 1,
        name: 'Alpha',
        team: 0,
        _stats: { elitekill: 1, edeaths: 1 },
        buildOrder: [{
          type: 'Unit',
          icon: 'units/horseman',
          pbgid: 7576265,
          destroyed: [10],
        }],
      },
      {
        profileId: 2,
        name: 'Bravo',
        team: 1,
        _stats: { elitekill: 1, edeaths: 1 },
        buildOrder: [{
          type: 'Unit',
          icon: 'units/crown_king',
          pbgid: 2161903,
          destroyed: [20],
        }],
      },
    ],
  };

  scheduleDetailsTableMetrics(summary, '257847569');
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(fetchCalls, 1);
  assert.deepEqual(
    [...document.querySelectorAll('td[data-aoe4-details-metric="kd-cost"]')]
      .map(cell => cell.textContent.trim()),
    ['1.67', '0.6'],
  );

  clearDetailsTableMetrics();
  delete globalThis.fetch;
  delete globalThis.chrome;
  delete globalThis.document;
  delete globalThis.window;
});
