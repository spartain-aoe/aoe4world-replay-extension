import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeChromeMock } from '../helpers/chrome-mock.mjs';

globalThis.localStorage ??= { setItem() {}, getItem() { return null; }, removeItem() {} };
globalThis.document ??= { getElementById() { return null; } };
globalThis.window ??= {
  postMessage() {},
  addEventListener() {},
};

describe('player-colors', () => {
  it('passes the page profile id to uncached color requests', async () => {
    const messages = [];
    const { chrome } = makeChromeMock({
      initial: { settings: { parseGameData: true, recolorSwatches: true, injectCharts: true } },
      sendMessageImpl: (msg) => {
        messages.push(msg);
        return {
          success: true,
          players: [{ name: 'Spartain', color: 1 }],
          cached: false,
        };
      },
    });
    globalThis.chrome = chrome;

    const settings = await import('../../src/content/settings.ts');
    const mod = await import('../../src/content/player-colors.ts');
    await settings.settingsReady;

    const result = await mod.getReplayPlayers('233034826', { profileId: '24574510' });
    assert.equal(result.ok, true);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], {
      type: 'getPlayerColors',
      matchId: '233034826',
      profileId: '24574510',
    });
  });
});
