// Regression: the native AoE4 World timeline dropdown exposes an "Army Value"
// option (value="army"). When a Summary+ chart is active we must NOT relabel
// that native option with our chart title — doing so produced a duplicate
// "Army Composition" entry in the dropdown list (the native "Army Value" row
// showed "Army Composition").
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

function makeDomGlobals() {
  const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
  globalThis.window = window;
  globalThis.document = document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.getComputedStyle = (el) => ({
    position: (el && el.style && el.style.position) || '',
    getPropertyValue: () => '',
  });
  globalThis.localStorage = {
    _data: new Map(),
    getItem(k) { return this._data.has(k) ? this._data.get(k) : null; },
    setItem(k, v) { this._data.set(k, String(v)); },
    removeItem(k) { this._data.delete(k); },
    clear() { this._data.clear(); },
  };
  globalThis.chrome = {
    storage: {
      local: { get: () => {}, set: () => {} },
      onChanged: { addListener: () => {} },
    },
    runtime: { sendMessage: () => {}, onMessage: { addListener: () => {} } },
  };
  return { window, document };
}

function makeTimeline(document) {
  const select = document.createElement('select');
  const nativeArmy = document.createElement('option');
  nativeArmy.value = 'army';
  nativeArmy.textContent = 'Army Value';
  const workers = document.createElement('option');
  workers.value = 'workers';
  workers.textContent = 'Worker Count';
  select.append(nativeArmy, workers);

  const heading = document.createElement('h3');
  heading.textContent = 'ARMY VALUE';
  document.body.append(select, heading);
  return { select, heading, nativeArmy };
}

describe('native Army Value dropdown option', () => {
  test('applyActiveSummaryHeading does not relabel the native army option', async () => {
    const { document } = makeDomGlobals();
    const { applyActiveSummaryHeading } = await import('../../src/content/chart-controller.ts');
    const timeline = makeTimeline(document);

    applyActiveSummaryHeading(timeline, { title: 'Army Composition' });

    assert.equal(
      timeline.nativeArmy.textContent,
      'Army Value',
      'native army option must keep its "Army Value" label, not the injected chart title',
    );
    assert.equal(timeline.heading.textContent, 'Army Composition', 'heading reflects active chart title');
  });

  test('switching active charts never rewrites the native army option text', async () => {
    const { document } = makeDomGlobals();
    const { applyActiveSummaryHeading } = await import('../../src/content/chart-controller.ts');
    const timeline = makeTimeline(document);

    applyActiveSummaryHeading(timeline, { title: 'Army Composition' });
    applyActiveSummaryHeading(timeline, { title: 'Resources Gathered: Total' });
    applyActiveSummaryHeading(timeline, { title: 'Army Value Lead' });

    assert.equal(timeline.nativeArmy.textContent, 'Army Value');
  });
});
