import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { makeChromeMock } from '../helpers/chrome-mock.mjs';
import { SUMMARY_REPLAY_OVERRIDE_KEY } from '../../src/shared/storage-keys.ts';

const saved = {
  document: globalThis.document,
  window: globalThis.window,
  chrome: globalThis.chrome,
};

afterEach(() => {
  globalThis.document = saved.document;
  globalThis.window = saved.window;
  globalThis.chrome = saved.chrome;
});

function setupPopupDom() {
  const { document, window } = parseHTML(`
    <html><body>
      <button id="settings-toggle" aria-expanded="false"></button>
      <div id="settings" aria-hidden="true"></div>
      <input type="checkbox" id="opt-parse" />
      <input type="checkbox" id="opt-charts" />
      <input type="checkbox" id="opt-recolor" />
      <input type="checkbox" id="opt-debug" />
      <div id="reload-hint"></div>
      <div id="count"></div>
      <div id="list"></div>
    </body></html>
  `);
  globalThis.document = document;
  globalThis.window = window;
  return { document, window };
}

describe('popup settings toggle', () => {
  it('persists the replay override after ten quick settings clicks', async () => {
    const { document, window } = setupPopupDom();
    const mock = makeChromeMock({
      initial: { settings: {} },
      sendMessageImpl: (msg) => {
        if (msg.type === 'getFavorites') return { favorites: {}, count: 0, max: 10 };
        return {};
      },
    });
    globalThis.chrome = mock.chrome;

    await import(`../../src/popup/popup.ts?t=${Math.random()}`);
    const toggle = document.getElementById('settings-toggle');
    for (let i = 0; i < 10; i++) {
      toggle.dispatchEvent(new window.Event('click', { bubbles: true }));
    }

    assert.equal(mock.storageData[SUMMARY_REPLAY_OVERRIDE_KEY], true);
  });
});
