import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import {
  detachVillagerSoftCapControl,
  getActiveVillagerSoftCap,
  renderVillagerSoftCapControl,
  setActiveVillagerSoftCap,
} from '../../src/content/villager-cap.ts';

function makeDomGlobals() {
  const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
  globalThis.window = window;
  globalThis.document = document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.getComputedStyle = element => ({
    position: element?.style?.position || '',
    getPropertyValue: () => '',
  });
  globalThis.localStorage = {
    _data: new Map(),
    getItem(key) { return this._data.has(key) ? this._data.get(key) : null; },
    setItem(key, value) { this._data.set(key, String(value)); },
    removeItem(key) { this._data.delete(key); },
    clear() { this._data.clear(); },
  };
  return { document };
}

function makeChart(type = 'villager-efficiency') {
  return {
    type,
    value: 'aoe4plus:villager-efficiency',
    title: 'Villager Efficiency',
    options: { height: 280, villagerSoftCap: 120 },
    data: {
      labels: [0, 10],
      series: [{
        key: 'actual',
        label: 'Alpha: Actual',
        unitLabel: 'Actual',
        playerName: 'Alpha',
        color: '#fff',
        values: [6, 6],
      }],
    },
  };
}

function makeTimeline(document) {
  const chartBox = document.createElement('div');
  const canvas = document.createElement('canvas');
  chartBox.appendChild(canvas);
  document.body.appendChild(chartBox);
  return { chartBox, canvas };
}

describe('villager soft-cap control', () => {
  beforeEach(() => {
    makeDomGlobals();
  });

  afterEach(() => {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
    delete globalThis.Event;
    delete globalThis.getComputedStyle;
    delete globalThis.localStorage;
  });

  test('mounts a top-right numeric cap editor and applies valid changes', () => {
    const chart = makeChart();
    const timeline = makeTimeline(document);
    const applied = [];

    renderVillagerSoftCapControl(timeline, chart, (target, cap) => {
      target.options.villagerSoftCap = cap;
      applied.push(cap);
    });

    const control = timeline.chartBox.querySelector('.aoe4-villager-cap-control');
    const input = control?.querySelector('input');
    assert.ok(control);
    assert.equal(control.querySelector('label')?.textContent?.trim(), 'Soft cap');
    assert.equal(input?.value, '120');
    assert.equal(timeline.chartBox.style.position, 'relative');

    input.value = '140';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    assert.deepEqual(applied, [120, 140]);
    assert.equal(chart.options.villagerSoftCap, 140);
    assert.equal(getActiveVillagerSoftCap(), 140);
  });

  test('normalizes invalid persisted and entered values to a positive integer', () => {
    localStorage.setItem('aoe4plus.villagerSoftCap', 'not-a-number');
    assert.equal(getActiveVillagerSoftCap(), 120);
    assert.equal(setActiveVillagerSoftCap(75.6), 76);

    const chart = makeChart();
    const timeline = makeTimeline(document);
    renderVillagerSoftCapControl(timeline, chart, (target, cap) => {
      target.options.villagerSoftCap = cap;
    });
    const input = timeline.chartBox.querySelector('.aoe4-villager-cap-control input');
    input.value = '0';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    assert.equal(input.value, '1');
    assert.equal(chart.options.villagerSoftCap, 1);
  });

  test('re-rendering replaces the control and detach removes it', () => {
    const chart = makeChart();
    const timeline = makeTimeline(document);
    const apply = (target, cap) => {
      target.options.villagerSoftCap = cap;
    };

    renderVillagerSoftCapControl(timeline, chart, apply);
    renderVillagerSoftCapControl(timeline, chart, apply);
    assert.equal(timeline.chartBox.querySelectorAll('.aoe4-villager-cap-control').length, 1);

    detachVillagerSoftCapControl(timeline);
    assert.equal(timeline.chartBox.querySelector('.aoe4-villager-cap-control'), null);
    assert.equal(timeline.__aoe4VillagerCapControl, null);
  });

  test('does not render for other chart types', () => {
    const chart = makeChart('resources');
    const timeline = makeTimeline(document);
    renderVillagerSoftCapControl(timeline, chart, () => {});
    assert.equal(timeline.chartBox.querySelector('.aoe4-villager-cap-control'), null);
  });
});
