import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import {
  attachPlayerToggle,
  detachPlayerToggle,
  recomputeVisibleGeometry,
} from '../../src/content/interactions.ts';

function installDom() {
  const { window, document } = parseHTML(`<!doctype html><html><body>
    <div id="timeline">
      <div class="flex items-center cursor-pointer" data-player="Alpha">
        <span class="icon">A</span><span class="font-bold">Alpha</span>
      </div>
      <div class="flex items-center cursor-pointer" data-player="Bravo">
        <span class="icon">B</span><span class="font-bold">Bravo</span>
      </div>
    </div>
  </body></html>`);
  globalThis.window = window;
  globalThis.document = document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.MouseEvent = window.MouseEvent;
  const canvas = document.createElement('canvas');
  canvas.getContext = () => null;
  document.querySelector('#timeline').appendChild(canvas);
  return { document, canvas };
}

function makeChart(type = 'villager-efficiency') {
  const series = [];
  for (const playerName of ['Alpha', 'Bravo']) {
    for (const unitLabel of ['Actual', 'Ideal', 'Missed production', 'Killed']) {
      series.push({
        key: `${playerName}:${unitLabel}`,
        label: `${playerName}: ${unitLabel}`,
        unitLabel,
        playerName,
        color: '#fff',
        values: [6, 7],
        render: unitLabel === 'Actual' || unitLabel === 'Ideal' ? 'line' : 'metric',
      });
    }
  }
  return {
    type,
    value: `aoe4plus:${type}`,
    title: type,
    options: { height: 280 },
    data: { labels: [0, 10], series },
  };
}

function makeTimeline(document, canvas) {
  const root = document.querySelector('#timeline');
  return {
    root,
    canvas,
    chartBox: root,
    heading: document.createElement('h3'),
    select: document.createElement('select'),
    __aoe4Summary: {
      players: [
        { name: 'Alpha', profileId: 1 },
        { name: 'Bravo', profileId: 2 },
      ],
    },
  };
}

function visiblePlayers(chart) {
  return [...new Set(
    chart.data.series
      .filter(series => !series._hidden)
      .map(series => series.playerName),
  )];
}

describe('Villager Efficiency player radios', () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
    delete globalThis.MouseEvent;
  });

  test('defaults to the first player and switches exclusively like radio buttons', () => {
    const canvas = document.querySelector('canvas');
    const timeline = makeTimeline(document, canvas);
    const chart = makeChart();

    attachPlayerToggle(timeline, chart);

    const alphaRow = document.querySelector('[data-player="Alpha"]');
    const bravoRow = document.querySelector('[data-player="Bravo"]');
    assert.deepEqual(visiblePlayers(chart), ['Alpha']);
    assert.equal(alphaRow.getAttribute('role'), 'radio');
    assert.equal(alphaRow.getAttribute('aria-checked'), 'true');
    assert.equal(bravoRow.getAttribute('aria-checked'), 'false');
    assert.equal(bravoRow.style.opacity, '0.35');

    bravoRow.querySelector('.font-bold').click();

    assert.deepEqual(visiblePlayers(chart), ['Bravo']);
    assert.equal(alphaRow.getAttribute('aria-checked'), 'false');
    assert.equal(bravoRow.getAttribute('aria-checked'), 'true');
    assert.equal(alphaRow.style.opacity, '0.35');
    assert.equal(bravoRow.style.opacity, '');

    bravoRow.querySelector('.font-bold').click();
    assert.deepEqual(visiblePlayers(chart), ['Bravo'], 'selected radio cannot be toggled off');
  });

  test('includes bottom-stacked debt bands in the uncropped y-axis', () => {
    const chart = makeChart();
    chart.options.villagerTarget = 8;
    chart.bands = [{
      key: 'Alpha:debt',
      label: 'Missed production',
      playerName: 'Alpha',
      color: '#F59E0B',
      fromValues: [0, 4],
      toValues: [0, 12],
    }];

    recomputeVisibleGeometry(chart);
    assert.ok(chart._geometry.yMax >= 12);

    chart.options.villagerCropToTarget = true;
    recomputeVisibleGeometry(chart);
    assert.equal(chart._geometry.yMax, 8);
  });

  test('previews the hovered player without changing the selected radio', () => {
    const canvas = document.querySelector('canvas');
    const timeline = makeTimeline(document, canvas);
    const chart = makeChart();

    attachPlayerToggle(timeline, chart);

    const alphaRow = document.querySelector('[data-player="Alpha"]');
    const bravoRow = document.querySelector('[data-player="Bravo"]');
    bravoRow.dispatchEvent(new window.Event('mouseenter'));

    assert.deepEqual(visiblePlayers(chart), ['Bravo']);
    assert.equal(alphaRow.getAttribute('aria-checked'), 'true');
    assert.equal(bravoRow.getAttribute('aria-checked'), 'false');

    bravoRow.dispatchEvent(new window.Event('mouseleave'));

    assert.deepEqual(visiblePlayers(chart), ['Alpha']);
    assert.equal(alphaRow.getAttribute('aria-checked'), 'true');
    assert.equal(bravoRow.getAttribute('aria-checked'), 'false');
  });

  test('restores the selected player if the chart detaches during a hover preview', () => {
    const canvas = document.querySelector('canvas');
    const timeline = makeTimeline(document, canvas);
    const chart = makeChart();

    attachPlayerToggle(timeline, chart);
    const bravoRow = document.querySelector('[data-player="Bravo"]');
    bravoRow.dispatchEvent(new window.Event('mouseenter'));
    assert.deepEqual(visiblePlayers(chart), ['Bravo']);

    detachPlayerToggle(timeline);

    assert.deepEqual(visiblePlayers(chart), ['Alpha']);
  });

  test('keeps independent on/off toggles for other chart types', () => {
    const canvas = document.querySelector('canvas');
    const timeline = makeTimeline(document, canvas);
    const chart = makeChart('army');

    attachPlayerToggle(timeline, chart);

    const alphaRow = document.querySelector('[data-player="Alpha"]');
    const bravoRow = document.querySelector('[data-player="Bravo"]');
    assert.deepEqual(visiblePlayers(chart), ['Alpha', 'Bravo']);
    assert.equal(alphaRow.getAttribute('role'), null);
    assert.equal(bravoRow.getAttribute('aria-checked'), null);

    alphaRow.querySelector('.font-bold').click();
    assert.deepEqual(visiblePlayers(chart), ['Bravo']);
    bravoRow.querySelector('.font-bold').click();
    assert.deepEqual(visiblePlayers(chart), []);
  });

  test('detach removes radio semantics and restores row opacity', () => {
    const canvas = document.querySelector('canvas');
    const timeline = makeTimeline(document, canvas);
    const chart = makeChart();
    attachPlayerToggle(timeline, chart);

    detachPlayerToggle(timeline);

    for (const row of document.querySelectorAll('.flex.items-center.cursor-pointer')) {
      assert.equal(row.getAttribute('role'), null);
      assert.equal(row.getAttribute('aria-checked'), null);
      assert.equal(row.style.opacity, '');
    }
  });
});
