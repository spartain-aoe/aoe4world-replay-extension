import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import * as armyLegendMetrics from '../../src/content/army-legend-metrics.ts';

globalThis.__aoe4CombatMetrics = armyLegendMetrics;

const {
  detachVillagerTargetControl,
  getActiveVillagerCropToTarget,
  getActiveVillagerTarget,
  renderVillagerTargetControl,
  setActiveVillagerTarget,
} = await import('../../src/content/villager-target.ts');

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
    title: 'Villager Production',
    options: { height: 280, villagerTarget: 120 },
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

describe('villager target control', () => {
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

  test('mounts a top-right numeric target editor and applies valid changes', () => {
    const chart = makeChart();
    const timeline = makeTimeline(document);
    const applied = [];

    renderVillagerTargetControl(timeline, chart, (targetChart, target) => {
      targetChart.options.villagerTarget = target;
      applied.push(target);
    });

    const control = timeline.chartBox.querySelector('.aoe4-villager-target-control');
    const input = control?.querySelector('input');
    assert.ok(control);
    assert.equal(control.querySelector('label')?.textContent?.trim(), 'Target');
    assert.equal(input?.value, '120');
    assert.equal(input?.getAttribute('aria-label'), 'Villager production target');
    assert.equal(timeline.chartBox.style.position, 'relative');

    input.value = '140';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    assert.deepEqual(applied, [120, 140]);
    assert.equal(chart.options.villagerTarget, 140);
    assert.equal(getActiveVillagerTarget(), 140);
  });

  test('normalizes invalid persisted and entered values to a positive integer', () => {
    localStorage.setItem('aoe4plus.villagerTarget', 'not-a-number');
    assert.equal(getActiveVillagerTarget(), 120);
    assert.equal(setActiveVillagerTarget(75.6), 76);

    const chart = makeChart();
    const timeline = makeTimeline(document);
    renderVillagerTargetControl(timeline, chart, (targetChart, target) => {
      targetChart.options.villagerTarget = target;
    });
    const input = timeline.chartBox.querySelector('.aoe4-villager-target-control input');
    input.value = '0';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    assert.equal(input.value, '1');
    assert.equal(chart.options.villagerTarget, 1);
  });

  test('migrates legacy soft-cap and crop settings to target keys', () => {
    localStorage.setItem('aoe4plus.villagerSoftCap', '135');
    localStorage.setItem('aoe4plus.villagerCropToSoftCap', 'true');

    assert.equal(getActiveVillagerTarget(), 135);
    assert.equal(getActiveVillagerCropToTarget(), true);
    assert.equal(localStorage.getItem('aoe4plus.villagerTarget'), '135');
    assert.equal(localStorage.getItem('aoe4plus.villagerCropToTarget'), 'true');
    assert.equal(localStorage.getItem('aoe4plus.villagerSoftCap'), null);
    assert.equal(localStorage.getItem('aoe4plus.villagerCropToSoftCap'), null);
  });

  test('uses an icon button to persistently crop the chart at the target', () => {
    const chart = makeChart();
    chart.data.series[0].values = [6, 150];
    const timeline = makeTimeline(document);

    renderVillagerTargetControl(timeline, chart, (targetChart, target) => {
      targetChart.options.villagerTarget = target;
    });

    const cropButton = timeline.chartBox.querySelector('.aoe4-villager-target-control-crop');
    assert.ok(cropButton);
    assert.equal(cropButton.textContent.trim(), '');
    assert.equal(cropButton.getAttribute('aria-label'), 'Crop chart to villager target');
    assert.equal(cropButton.getAttribute('aria-pressed'), 'false');
    assert.ok(chart._geometry.yMax > 120);

    cropButton.click();

    assert.equal(cropButton.getAttribute('aria-pressed'), 'true');
    assert.equal(localStorage.getItem('aoe4plus.villagerCropToTarget'), 'true');
    assert.equal(chart.options.villagerCropToTarget, true);
    assert.equal(chart._geometry.yMax, 120);

    cropButton.click();

    assert.equal(cropButton.getAttribute('aria-pressed'), 'false');
    assert.equal(localStorage.getItem('aoe4plus.villagerCropToTarget'), 'false');
    assert.equal(chart.options.villagerCropToTarget, false);
    assert.ok(chart._geometry.yMax > 120);
  });

  test('uses an icon button to persistently shift ideal with villager deaths', () => {
    const chart = makeChart();
    const timeline = makeTimeline(document);
    const applied = [];

    renderVillagerTargetControl(timeline, chart, (targetChart, target) => {
      targetChart.options.villagerTarget = target;
      applied.push({
        target,
        adjust: targetChart.options.villagerAdjustIdealForDeaths === true,
      });
    });

    const adjustButton = timeline.chartBox.querySelector('.aoe4-villager-target-control-deaths');
    assert.ok(adjustButton);
    assert.equal(adjustButton.textContent.trim(), '');
    assert.equal(adjustButton.getAttribute('aria-label'), 'Shift ideal for villager deaths');
    assert.equal(adjustButton.getAttribute('aria-pressed'), 'false');

    adjustButton.click();

    assert.equal(adjustButton.getAttribute('aria-pressed'), 'true');
    assert.equal(localStorage.getItem('aoe4plus.villagerAdjustIdealForDeaths'), 'true');
    assert.equal(chart.options.villagerAdjustIdealForDeaths, true);
    assert.deepEqual(applied.at(-1), { target: 120, adjust: true });

    adjustButton.click();

    assert.equal(adjustButton.getAttribute('aria-pressed'), 'false');
    assert.equal(localStorage.getItem('aoe4plus.villagerAdjustIdealForDeaths'), 'false');
    assert.equal(chart.options.villagerAdjustIdealForDeaths, false);
  });

  test('re-rendering replaces the control and detach removes it', () => {
    const chart = makeChart();
    const timeline = makeTimeline(document);
    const apply = (targetChart, target) => {
      targetChart.options.villagerTarget = target;
    };

    renderVillagerTargetControl(timeline, chart, apply);
    renderVillagerTargetControl(timeline, chart, apply);
    assert.equal(timeline.chartBox.querySelectorAll('.aoe4-villager-target-control').length, 1);

    detachVillagerTargetControl(timeline);
    assert.equal(timeline.chartBox.querySelector('.aoe4-villager-target-control'), null);
    assert.equal(timeline.__aoe4VillagerTargetControl, null);
  });

  test('does not render for other chart types', () => {
    const chart = makeChart('resources');
    const timeline = makeTimeline(document);
    renderVillagerTargetControl(timeline, chart, () => {});
    assert.equal(timeline.chartBox.querySelector('.aoe4-villager-target-control'), null);
  });
});
