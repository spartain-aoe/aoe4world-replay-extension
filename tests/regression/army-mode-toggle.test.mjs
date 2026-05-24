// Regression: Army Composition chart count↔value toggle.
// Verifies that:
//  - renderArmyModeToggle mounts a two-button chip into the chart box
//  - clicking the value button swaps `series.values` to the precomputed `_valueValues`
//  - the chart's `options.armyMode` flips
//  - tearing down the toggle removes the button container
//  - chart-controller wires the toggle for army charts and detaches for other types
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import {
  applyArmyModeToChart,
  chartHasValueData,
  detachArmyModeToggle,
  getActiveArmyMode,
  renderArmyModeToggle,
  setActiveArmyMode,
} from '../../src/content/army-mode.ts';

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
  return { window, document };
}

function makeArmyChart() {
  return {
    type: 'army',
    options: { height: 280, armyMode: 'count' },
    data: {
      labels: [0, 30, 60, 90, 120],
      series: [
        {
          key: 'knight',
          label: 'Knight',
          color: '#4dabf7',
          createdTotal: 2,
          values: [0, 1, 2, 2, 1],
          _countValues: [0, 1, 2, 2, 1],
          _valueValues: [0, 200, 400, 400, 200],
          _valueTotal: 400,
          _sign: 1,
        },
        {
          key: 'spearman',
          label: 'Spearman',
          color: '#74c0fc',
          createdTotal: 4,
          values: [0, 2, 4, 4, 4],
          _countValues: [0, 2, 4, 4, 4],
          _valueValues: [0, 120, 240, 240, 240],
          _valueTotal: 240,
          _sign: 1,
        },
      ],
    },
  };
}

function makeTimelineElements(document) {
  const chartBox = document.createElement('div');
  chartBox.style.position = '';
  const canvas = document.createElement('canvas');
  document.body.appendChild(chartBox);
  chartBox.appendChild(canvas);
  return { chartBox, canvas };
}

function attachLegendNodes(document, chart) {
  const knightTotal = document.createElement('span');
  knightTotal.textContent = '2';
  const spearTotal = document.createElement('span');
  spearTotal.textContent = '4';
  chart._legendNodes = new Map([
    ['knight', {
      totalEl: knightTotal,
      deltaTrainedEl: document.createElement('span'),
      deltaLostEl: document.createElement('span'),
      rowEl: document.createElement('div'),
      summaryTotal: 2,
    }],
    ['spearman', {
      totalEl: spearTotal,
      deltaTrainedEl: document.createElement('span'),
      deltaLostEl: document.createElement('span'),
      rowEl: document.createElement('div'),
      summaryTotal: 4,
    }],
  ]);
  return { knightTotal, spearTotal };
}

describe('army-mode toggle UI', () => {
  test('renderArmyModeToggle mounts a two-button chip with correct labels', () => {
    const { document } = makeDomGlobals();
    const chart = makeArmyChart();
    const timeline = makeTimelineElements(document);

    renderArmyModeToggle(timeline, chart);

    const toggle = timeline.chartBox.querySelector('.aoe4-army-mode-toggle');
    assert.ok(toggle, 'toggle container mounted');
    const buttons = toggle.querySelectorAll('.aoe4-army-mode-toggle-btn');
    assert.equal(buttons.length, 2, 'two buttons');
    const labels = Array.from(buttons).map(b => b.textContent.trim());
    assert.ok(labels.includes('Count'), 'has count label');
    assert.ok(labels.includes('Value'), 'has value label');
    assert.equal(toggle.getAttribute('role'), 'group');
    assert.equal(timeline.chartBox.style.position, 'relative', 'chartBox positioned relative for absolute child');
    assert.equal(timeline.__aoe4ArmyModeToggle, toggle, 'stored on timeline');
  });

  test('clicking Value swaps series.values to _valueValues and flips chart.options.armyMode', () => {
    const { document } = makeDomGlobals();
    const chart = makeArmyChart();
    const timeline = makeTimelineElements(document);
    const legend = attachLegendNodes(document, chart);
    renderArmyModeToggle(timeline, chart);

    // sanity: starts in count mode (default)
    assert.equal(chart.options.armyMode, 'count');
    assert.equal(chart.data.series[0].values, chart.data.series[0]._countValues);

    const valueBtn = Array.from(timeline.chartBox.querySelectorAll('.aoe4-army-mode-toggle-btn'))
      .find(b => b.dataset.mode === 'value');
    assert.ok(valueBtn, 'value button found');

    valueBtn.click();

    assert.equal(chart.options.armyMode, 'value', 'mode flipped');
    assert.equal(chart.data.series[0].values, chart.data.series[0]._valueValues, 'series 0 swapped');
    assert.equal(chart.data.series[1].values, chart.data.series[1]._valueValues, 'series 1 swapped');
    assert.equal(valueBtn.getAttribute('aria-pressed'), 'true', 'value button pressed');
    const countBtn = Array.from(timeline.chartBox.querySelectorAll('.aoe4-army-mode-toggle-btn'))
      .find(b => b.dataset.mode === 'count');
    assert.equal(countBtn.getAttribute('aria-pressed'), 'false', 'count button unpressed');
    assert.equal(legend.knightTotal.textContent, '400 res', 'legend total updated to value');
    assert.equal(legend.spearTotal.textContent, '240 res', 'second legend total updated to value');
  });

  test('clicking Count swaps back to _countValues', () => {
    const { document } = makeDomGlobals();
    const chart = makeArmyChart();
    chart.options.armyMode = 'value';
    const timeline = makeTimelineElements(document);
    const legend = attachLegendNodes(document, chart);
    renderArmyModeToggle(timeline, chart);

    // After render, mode should be applied as value (since chart.options had it)
    assert.equal(chart.data.series[0].values, chart.data.series[0]._valueValues);

    const countBtn = Array.from(timeline.chartBox.querySelectorAll('.aoe4-army-mode-toggle-btn'))
      .find(b => b.dataset.mode === 'count');
    countBtn.click();

    assert.equal(chart.options.armyMode, 'count');
    assert.equal(chart.data.series[0].values, chart.data.series[0]._countValues);
    assert.equal(legend.knightTotal.textContent, '2', 'legend total restored to count');
    assert.equal(legend.spearTotal.textContent, '4', 'second legend total restored to count');
  });

  test('detachArmyModeToggle removes the toggle from chartBox', () => {
    const { document } = makeDomGlobals();
    const chart = makeArmyChart();
    const timeline = makeTimelineElements(document);
    renderArmyModeToggle(timeline, chart);
    assert.ok(timeline.chartBox.querySelector('.aoe4-army-mode-toggle'));

    detachArmyModeToggle(timeline);
    assert.equal(timeline.chartBox.querySelector('.aoe4-army-mode-toggle'), null, 'toggle gone');
    assert.equal(timeline.__aoe4ArmyModeToggle, null, 'reference cleared');
  });

  test('re-rendering replaces (not duplicates) the toggle', () => {
    const { document } = makeDomGlobals();
    const chart = makeArmyChart();
    const timeline = makeTimelineElements(document);

    renderArmyModeToggle(timeline, chart);
    renderArmyModeToggle(timeline, chart);
    renderArmyModeToggle(timeline, chart);

    const all = timeline.chartBox.querySelectorAll('.aoe4-army-mode-toggle');
    assert.equal(all.length, 1, 'only one toggle present after multiple renders');
  });

  test('renderArmyModeToggle is a no-op for non-army charts', () => {
    const { document } = makeDomGlobals();
    const chart = makeArmyChart();
    chart.type = 'resources';
    const timeline = makeTimelineElements(document);
    renderArmyModeToggle(timeline, chart);
    assert.equal(timeline.chartBox.querySelector('.aoe4-army-mode-toggle'), null);
    assert.equal(timeline.__aoe4ArmyModeToggle, null);
  });

  test('persisted mode is honored on next render', () => {
    const { document } = makeDomGlobals();
    setActiveArmyMode('value');
    assert.equal(getActiveArmyMode(), 'value');

    const chart = makeArmyChart();
    chart.options = { height: 280 };
    const timeline = makeTimelineElements(document);
    const legend = attachLegendNodes(document, chart);
    renderArmyModeToggle(timeline, chart);

    assert.equal(chart.options.armyMode, 'value', 'restored from storage');
    assert.equal(chart.data.series[0].values, chart.data.series[0]._valueValues);
    assert.equal(legend.knightTotal.textContent, '400 res');

    setActiveArmyMode('count');
  });
});

describe('applyArmyModeToChart', () => {
  test('idempotent: applying same mode twice leaves series references stable', () => {
    makeDomGlobals();
    const chart = makeArmyChart();
    applyArmyModeToChart(chart, 'value');
    const firstRef = chart.data.series[0].values;
    applyArmyModeToChart(chart, 'value');
    assert.equal(chart.data.series[0].values, firstRef);
  });

  test('no-op for non-army chart', () => {
    makeDomGlobals();
    const chart = makeArmyChart();
    chart.type = 'resources';
    const before = chart.data.series[0].values;
    applyArmyModeToChart(chart, 'value');
    assert.equal(chart.data.series[0].values, before);
    assert.equal(chart.options.armyMode, 'count', 'unchanged');
  });
});

describe('chartHasValueData', () => {
  test('true when any series has non-zero _valueValues', () => {
    const chart = makeArmyChart();
    assert.equal(chartHasValueData(chart), true);
  });

  test('false when all _valueValues are zero', () => {
    const chart = makeArmyChart();
    for (const s of chart.data.series) s._valueValues = s._valueValues.map(() => 0);
    assert.equal(chartHasValueData(chart), false);
  });

  test('false for non-army chart', () => {
    const chart = makeArmyChart();
    chart.type = 'resources';
    assert.equal(chartHasValueData(chart), false);
  });
});

describe('army-mode toggle: range-selection interaction', () => {
  test('syncRangeUi hides the toggle while a range is active and restores it when cleared', async () => {
    const { document } = makeDomGlobals();
    const chart = makeArmyChart();
    chart.value = 'army';
    const chartBox = document.createElement('div');
    const canvas = document.createElement('canvas');
    document.body.appendChild(chartBox);
    chartBox.appendChild(canvas);
    const timeline = {
      chartBox,
      canvas,
      select: { __aoe4SummaryActiveValue: 'army', __aoe4SummaryCharts: new Map([['army', chart]]) },
      __aoe4Summary: { players: [] },
    };

    renderArmyModeToggle(timeline, chart);
    const toggle = timeline.__aoe4ArmyModeToggle;
    assert.ok(toggle, 'toggle present after render');
    assert.notEqual(toggle.style.display, 'none', 'toggle visible initially');

    const { syncRangeUi, clearRangeState } = await import('../../src/content/range.ts');

    chartBox.__aoe4ActiveRange = { chartValue: 'army', startIdx: 1, endIdx: 3 };
    syncRangeUi(timeline, chart);
    assert.equal(toggle.style.display, 'none', 'toggle hidden while range active');

    clearRangeState(chartBox);
    syncRangeUi(timeline, chart);
    assert.notEqual(toggle.style.display, 'none', 'toggle visible again after range cleared');
  });

  test('syncRangeUi leaves toggle untouched on non-army charts', async () => {
    const { document } = makeDomGlobals();
    const chart = makeArmyChart();
    chart.value = 'army';
    const otherChart = { type: 'resources', value: 'resources', data: { labels: [], series: [] }, options: {} };
    const chartBox = document.createElement('div');
    const canvas = document.createElement('canvas');
    document.body.appendChild(chartBox);
    chartBox.appendChild(canvas);
    const timeline = {
      chartBox,
      canvas,
      select: { __aoe4SummaryActiveValue: 'resources', __aoe4SummaryCharts: new Map() },
      __aoe4Summary: { players: [] },
    };

    renderArmyModeToggle(timeline, chart);
    const toggle = timeline.__aoe4ArmyModeToggle;
    toggle.style.display = '';

    const { syncRangeUi } = await import('../../src/content/range.ts');
    syncRangeUi(timeline, otherChart);
    assert.notEqual(toggle.style.display, 'none', 'unchanged when active chart is non-army with no range');
  });
});
