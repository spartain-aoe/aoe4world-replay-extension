/**
 * Integration coverage for the Summary+ features added on this branch:
 * - Idle TC details-table column fed from cached stats telemetry.
 * - Summary+ chart option ordering.
 * - Army Count/Value toggle labels and Value-mode data for override-only PBGIDs.
 * - Range-selection legend deltas in Value mode are resource-weighted, not counts.
 */

'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { installReplayApiMock } = require('./replay-api-mock.cjs');
const { installAoe4WorldFixtureRoutes } = require('./aoe4world-fixtures.cjs');

const EXT_PATH = path.resolve(__dirname, '..', '..', 'chrome-extension');
const PROFILE_PATH = path.join(__dirname, '.pw-profile-summary-plus-features');
const GAME_1V1 = 'https://aoe4world.com/players/24574510-spartain/games/233034826';

let ctx, bg, page;
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

async function setup(options = {}) {
  try { fs.rmSync(PROFILE_PATH, { recursive: true, force: true }); } catch (_) {}
  ctx = await chromium.launchPersistentContext(PROFILE_PATH, {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  bg = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  await bg.evaluate(({ seedColorCache }) => new Promise(resolve => {
    const now = Date.now();
    const items = {
      settings: {
        parseGameData: true,
        injectCharts: true,
        recolorSwatches: true,
        debugLogs: false,
      },
      patchInfo_v2: {
        current: '4.0.0/8719',
        previous: null,
        patches: ['4.0.0/8719'],
        time: now,
      },
      replay_v2_233034826: {
        value: true,
        time: now,
        permanent: true,
        patch: '4.0.0/8719',
      },
      stats_metrics_v1_233034826: {
        savedAt: now,
        players: [
          { profileId: 24574510, name: 'spartain', townCenterIdleSeconds: 123 },
          { profileId: 20653422, name: 'DonationDonation', townCenterIdleSeconds: 45 },
        ],
      },
    };
    if (seedColorCache !== false) {
      items.colors_v6_233034826 = {
        savedAt: now,
        players: [
          { name: 'spartain', civilization: 'jin_dynasty', color: 6, slot: 0, playerId: 24574510 },
          { name: 'DonationDonation', civilization: 'golden_horde', color: 1, slot: 1, playerId: 20653422 },
        ],
      };
    }
    chrome.storage.local.set(items, resolve);
  }), { seedColorCache: options.seedColorCache });
  await installReplayApiMock(bg, options.replayMockOptions || {});
  page = ctx.pages()[0] || await ctx.newPage();
  await page.addInitScript(() => {
    window.__aoe4NativeTimelineVisibilitySamples = [];
    const sampleNativeTimeline = () => {
      const select = document.querySelector('select');
      const canvas = document.querySelector('canvas:not([data-aoe4-summary-canvas]):not(.aoe4-ageup-overlay)');
      const summaryReady = !!document.querySelector('optgroup[data-aoe4-summary-plus], canvas[data-aoe4-summary-canvas]');
      if (select && canvas && !summaryReady) {
        const style = getComputedStyle(canvas);
        const rect = canvas.getBoundingClientRect();
        const visible = style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0.01 &&
          rect.width > 0 &&
          rect.height > 0;
        window.__aoe4NativeTimelineVisibilitySamples.push({
          t: Math.round(performance.now()),
          visible,
          opacity: style.opacity,
          display: style.display,
          visibility: style.visibility,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          colorGate: !!document.getElementById('__aoe4-color-ext-chart-gate'),
          summaryGate: !!document.getElementById('__aoe4-summary-default-gate'),
        });
      }
      if (!summaryReady && performance.now() < 8000) requestAnimationFrame(sampleNativeTimeline);
    };
    requestAnimationFrame(sampleNativeTimeline);

    window.addEventListener('DOMContentLoaded', () => {
      if (document.querySelector('table[data-summary-plus-details-fixture]')) return;
      const host = document.createElement('div');
      host.innerHTML = `
        <table data-summary-plus-details-fixture>
          <thead>
            <tr><th></th><th colspan="1">Score</th><th colspan="1">Resources Spent</th><th colspan="1">Max. Workers</th><th colspan="1">Misc</th><th colspan="1">Sacred Sites</th></tr>
            <tr><th></th><th>Total</th><th>Food</th><th>Villagers</th><th>APM</th><th>Capt.</th></tr>
          </thead>
          <tbody>
            <tr><td><a href="/players/24574510-spartain">spartain</a></td><td>100</td><td>50</td><td>10</td><td>136</td><td>0</td></tr>
            <tr><td><a href="/players/20653422-DonationDonation">DonationDonation</a></td><td>90</td><td>40</td><td>9</td><td>121</td><td>0</td></tr>
          </tbody>
        </table>`;
      document.body.appendChild(host);
    }, { once: true });
  });
  await installAoe4WorldFixtureRoutes(page, { summaryDelayMs: options.summaryDelayMs || 0 });
}

async function teardown() {
  if (ctx) await ctx.close().catch(() => {});
  try { fs.rmSync(PROFILE_PATH, { recursive: true, force: true }); } catch (_) {}
}

async function navigate() {
  await page.goto(GAME_1V1, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => {
    const og = document.querySelector('optgroup[data-aoe4-summary-plus]');
    return og && og.querySelectorAll('option').length >= 8;
  }, null, { timeout: 20000 });
}

async function scrollToTimeline() {
  await page.evaluate(() => {
    const h3 = [...document.querySelectorAll('h3')].find(h => (h.textContent || '').includes('Timeline'));
    if (h3) h3.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
}

async function selectArmyComposition() {
  const selected = await page.evaluate(() => {
    const select = document.querySelector('select');
    const option = [...(select?.querySelectorAll('option') || [])].find(opt => opt.value.includes('army-composition'));
    if (!select || !option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  assert(selected, 'could not select Army Composition');
  await page.waitForSelector('canvas[data-aoe4-summary-canvas]', { timeout: 10000 });
  await page.waitForSelector('.aoe4-army-mode-toggle', { timeout: 10000 });
  await page.waitForTimeout(1000);
}

async function switchToValueMode() {
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('.aoe4-army-mode-toggle-btn')]
      .find(btn => (btn.textContent || '').trim() === 'Value');
    if (!button) return false;
    button.click();
    return true;
  });
  assert(clicked, 'Value toggle button not found');
  await page.waitForTimeout(500);
}

async function dragSelectMostOfChart() {
  const canvas = await page.locator('canvas[data-aoe4-summary-canvas]').first();
  const box = await canvas.boundingBox();
  assert(box && box.width > 100 && box.height > 80, `bad canvas box: ${JSON.stringify(box)}`);
  const y = box.y + Math.max(60, box.height * 0.55);
  await page.mouse.move(box.x + 36, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 24, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(700);
}

(async () => {
  console.log('\n=== Summary+ Feature Integration ===');
  await setup({
    seedColorCache: false,
    replayMockOptions: { replayMetadataDelayMs: 3500 },
  });

  await test('uncached games do not show Summary+ ArmyComp in native colors while replay colors are pending', async () => {
    await page.goto(GAME_1V1, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    const deadline = Date.now() + 10000;
    let replayState = null;
    while (Date.now() < deadline) {
      replayState = await bg.evaluate(() => globalThis.__aoe4ReplayApiMockState);
      if (replayState?.replayMetadataCalls >= 1) break;
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(1000);
    const pendingState = await page.evaluate(() => {
      const canvas = document.querySelector('canvas[data-aoe4-summary-canvas]');
      const style = canvas ? getComputedStyle(canvas) : null;
      const rect = canvas?.getBoundingClientRect?.();
      return {
        hasSummaryCanvas: !!canvas,
        summaryCanvasVisible: !!canvas && style?.display !== 'none' && Number(style?.opacity || '1') > 0.01 && (rect?.width || 0) > 0 && (rect?.height || 0) > 0,
        hasSummaryOptgroup: !!document.querySelector('optgroup[data-aoe4-summary-plus]'),
        summaryGate: !!document.getElementById('__aoe4-summary-default-gate'),
      };
    });
    pendingState.replayState = await bg.evaluate(() => globalThis.__aoe4ReplayApiMockState);
    assert(pendingState.replayState?.replayMetadataCalls >= 1, `replay color request did not start: ${JSON.stringify(pendingState)}`);
    assert(!pendingState.hasSummaryOptgroup, `Summary+ optgroup appeared before replay colors resolved: ${JSON.stringify(pendingState)}`);
    assert(pendingState.summaryGate, `Summary+ gate should remain while uncached colors are pending: ${JSON.stringify(pendingState)}`);
    assert(!pendingState.summaryCanvasVisible, `ArmyComp rendered visibly before uncached replay colors resolved: ${JSON.stringify(pendingState)}`);

    const finalDeadline = Date.now() + 20000;
    while (Date.now() < finalDeadline) {
      const ready = await page.evaluate(async () => ({
        selected: document.querySelector('select')?.value || '',
        hasCanvas: !!document.querySelector('canvas[data-aoe4-summary-canvas]'),
      }));
      const state = await bg.evaluate(() => globalThis.__aoe4ReplayApiMockState);
      if (state?.blobReplayCalls >= 1 && ready.selected.includes('army-composition') && ready.hasCanvas) return;
      await page.waitForTimeout(150);
    }
    throw new Error('ArmyComp did not render after uncached replay colors resolved');
  });

  await teardown();

  await setup({
    summaryDelayMs: 2000,
  });

  await test('native Army Value chart is hidden while default Summary+ chart is pending', async () => {
    await page.goto(GAME_1V1, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() =>
      !!document.querySelector('select') &&
      !!document.querySelector('canvas:not([data-aoe4-summary-canvas]):not(.aoe4-ageup-overlay)') &&
      !document.querySelector('optgroup[data-aoe4-summary-plus]'),
      null,
      { timeout: 10000 },
    );
    await page.waitForFunction(() => !document.getElementById('__aoe4-color-ext-chart-gate'), null, { timeout: 10000 });
    const state = await page.evaluate(() => {
      const canvas = document.querySelector('canvas:not([data-aoe4-summary-canvas]):not(.aoe4-ageup-overlay)');
      const style = canvas ? getComputedStyle(canvas) : null;
      return {
        hasSummaryOptgroup: !!document.querySelector('optgroup[data-aoe4-summary-plus]'),
        colorGate: !!document.getElementById('__aoe4-color-ext-chart-gate'),
        summaryGate: !!document.getElementById('__aoe4-summary-default-gate'),
        nativeCanvasOpacity: style?.opacity || '',
        nativeCanvasDisplay: style?.display || '',
      };
    });
    assert(!state.hasSummaryOptgroup, `Summary+ loaded before pending-state probe: ${JSON.stringify(state)}`);
    assert(!state.colorGate, `probe should run after color gate release: ${JSON.stringify(state)}`);
    assert(state.summaryGate, `Summary+ default gate missing while summary is pending: ${JSON.stringify(state)}`);
    assert(state.nativeCanvasOpacity === '0', `native Army Value canvas visible while Summary+ pending: ${JSON.stringify(state)}`);
  });

  await test('native Army Value chart is never visibly sampled before Summary+ renders', async () => {
    const samples = await page.evaluate(() => window.__aoe4NativeTimelineVisibilitySamples || []);
    const visible = samples.filter(sample => sample.visible);
    assert(samples.length > 0, 'startup visibility probe did not sample native timeline canvas');
    assert(
      visible.length === 0,
      `native Army/Army Value canvas was visible before Summary+ rendered: ${JSON.stringify(visible.slice(0, 8))}`
    );
  });

  await test('startup native Army Value reset does not displace default Army Composition', async () => {
    await page.waitForFunction(() => {
      const select = document.querySelector('select');
      return select?.value?.includes('army-composition') &&
        [...document.querySelectorAll('h3')].some(h => (h.textContent || '').includes('Army Composition'));
    }, null, { timeout: 10000 });
    const dispatched = await page.evaluate(() => {
      const select = document.querySelector('select');
      if (!select || ![...select.options].some(option => option.value === 'army')) return false;
      select.value = 'army';
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    });
    assert(dispatched, 'could not dispatch synthetic native Army Value reset');
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => ({
      selectValue: document.querySelector('select')?.value || '',
      heading: [...document.querySelectorAll('h3')].map(h => (h.textContent || '').trim()).find(text => text.includes('Army')) || '',
      hasSummaryCanvas: !!document.querySelector('canvas[data-aoe4-summary-canvas]'),
    }));
    assert(state.selectValue.includes('army-composition'), `synthetic native reset changed select: ${JSON.stringify(state)}`);
    assert(state.heading.includes('Army Composition'), `synthetic native reset changed heading: ${JSON.stringify(state)}`);
    assert(state.hasSummaryCanvas, `synthetic native reset restored native canvas: ${JSON.stringify(state)}`);
  });

  await test('stale hover events immediately after selecting Army Composition do not highlight or stop animation', async () => {
    const state = await page.evaluate(async () => {
      const select = document.querySelector('select');
      const resourceOption = [...(select?.querySelectorAll('option') || [])]
        .find(option => option.value.includes('resources-gathered-total'));
      if (!select || !resourceOption) return { error: 'missing resource option' };
      select.value = resourceOption.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const armyOption = [...select.querySelectorAll('option')]
        .find(option => option.value.includes('army-composition'));
      if (!armyOption) return { error: 'missing army option' };
      select.value = armyOption.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => requestAnimationFrame(resolve));

      const canvas = document.querySelector('canvas[data-aoe4-summary-canvas]');
      const row = document.querySelector('[data-aoe4-legend-injected="1"], .flex.items-center.cursor-pointer');
      const rect = canvas?.getBoundingClientRect();
      if (canvas && rect) {
        canvas.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }));
      }
      row?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 80));

      return {
        tooltipVisible: [...document.querySelectorAll('.aoe4-summary-html-tooltip')]
          .some(tooltip => getComputedStyle(tooltip).display !== 'none'),
        highlightedRows: document.querySelectorAll('.aoe4-army-unit-row.is-highlighted').length,
        closestRows: document.querySelectorAll('.aoe4-army-unit-row.is-closest').length,
      };
    });
    assert(!state.error, state.error);
    assert(state.tooltipVisible === false, `stale canvas hover showed tooltip: ${JSON.stringify(state)}`);
    assert(state.highlightedRows === 0, `stale row hover highlighted legend rows: ${JSON.stringify(state)}`);
    assert(state.closestRows === 0, `stale hover marked closest rows: ${JSON.stringify(state)}`);
  });

  await test('default Army Composition has no visible native age-up overlay duplicate', async () => {
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => {
      const overlays = [...document.querySelectorAll('.aoe4-ageup-overlay')].map(overlay => {
        const style = getComputedStyle(overlay);
        const rect = overlay.getBoundingClientRect();
        return {
          display: style.display,
          opacity: style.opacity,
          width: rect.width,
          height: rect.height,
        };
      });
      return {
        selected: document.querySelector('select')?.value || '',
        heading: [...document.querySelectorAll('h3')].map(h => (h.textContent || '').trim()).find(text => text.includes('Army Composition')) || '',
        overlays,
        summaryGate: !!document.getElementById('__aoe4-summary-default-gate'),
      };
    });
    assert(state.selected.includes('army-composition'), `expected default Army Composition selected: ${JSON.stringify(state)}`);
    assert(state.heading.includes('Army Composition'), `expected Army Composition heading: ${JSON.stringify(state)}`);
    assert(!state.summaryGate, `default loading gate should be removed after Summary+ render: ${JSON.stringify(state)}`);
    const visibleOverlays = state.overlays.filter(overlay =>
      overlay.display !== 'none' && overlay.opacity !== '0' && overlay.width > 0 && overlay.height > 0
    );
    assert(visibleOverlays.length === 0, `native age-up overlay is visible on Summary+ chart: ${JSON.stringify(state)}`);
  });

  await test('Idle TC details metric is injected from stats telemetry cache', async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('th')]
      .some(th => (th.textContent || '').trim() === 'Idle TC'), null, { timeout: 10000 });
    const state = await page.evaluate(() => {
      const headers = [...document.querySelectorAll('thead tr:nth-child(2) th')]
        .map(th => (th.textContent || '').replace(/\s+/g, ' ').trim());
      const rows = [...document.querySelectorAll('tbody tr')].map(row => ({
        name: (row.querySelector('a[href*="/players/"]')?.textContent || '').trim(),
        cells: [...row.querySelectorAll('td')].map(td => (td.textContent || '').replace(/\s+/g, ' ').trim()),
      }));
      return { headers, rows };
    });
    assert(state.headers.includes('Idle TC'), `Idle TC header missing: ${JSON.stringify(state.headers)}`);
    const spartain = state.rows.find(row => row.name === 'spartain');
    const donation = state.rows.find(row => row.name === 'DonationDonation');
    assert(spartain?.cells.includes('2:03'), `spartain Idle TC not rendered as 2:03: ${JSON.stringify(spartain)}`);
    assert(donation?.cells.includes('0:45'), `DonationDonation Idle TC not rendered as 0:45: ${JSON.stringify(donation)}`);
  });

  await test('Summary+ chart options are first and ordered Army → AVL → DV → resources', async () => {
    await page.waitForFunction(() => {
      const select = document.querySelector('select');
      return select?.value?.includes('army-composition') &&
        [...document.querySelectorAll('h3')].some(h => (h.textContent || '').includes('Army Composition'));
    }, null, { timeout: 10000 });
    const state = await page.evaluate(() => {
      const select = document.querySelector('select');
      const og = document.querySelector('optgroup[data-aoe4-summary-plus]');
      return {
        firstChildIsSummary: select?.firstElementChild === og,
        selectValue: select?.value || '',
        heading: [...document.querySelectorAll('h3')].map(h => (h.textContent || '').trim()).find(text => text.includes('Army Composition')) || '',
        labels: [...(og?.querySelectorAll('option') || [])].map(opt => (opt.textContent || '').trim()),
      };
    });
    const expectedStart = [
      'Army Composition',
      'Army Value Lead',
      'Destroyed Value',
      'Resources Gathered: Total',
      'Resources Gathered: Food',
      'Resources Gathered: Wood',
      'Resources Gathered: Gold',
      'Resources Gathered: Stone',
    ];
    assert(state.firstChildIsSummary, 'Summary+ optgroup should be the first select child so it appears before native charts');
    assert(state.selectValue.includes('army-composition'), `Army Composition should be selected by default, got ${state.selectValue}`);
    assert(state.heading.includes('Army Composition'), `Timeline heading should default to Army Composition, got ${state.heading}`);
    assert(
      expectedStart.every((label, index) => state.labels[index] === label),
      `unexpected Summary+ order:\nexpected ${JSON.stringify(expectedStart)}\nactual   ${JSON.stringify(state.labels.slice(0, expectedStart.length))}`,
    );
  });

  await test('Army Value mode has Count/Value labels and non-zero value data for override-only PBGIDs', async () => {
    await scrollToTimeline();
    await selectArmyComposition();
    await switchToValueMode();
    const state = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('.aoe4-army-mode-toggle-btn')]
        .map(btn => ({
          text: (btn.textContent || '').trim(),
          pressed: btn.getAttribute('aria-pressed'),
        }));
      const rows = [...document.querySelectorAll('.aoe4-legend-breakdown[data-player-name="spartain"] .aoe4-army-unit-row')]
        .map(row => {
          const total = row.querySelector('.aoe4-army-unit-total')?.textContent?.trim() || '';
          const toNumber = value => Number(value.replace(/[^\d.-]/g, '')) || 0;
          return {
            text: (row.textContent || '').replace(/\s+/g, ' ').trim(),
            total,
            totalNumber: toNumber(total),
          };
        });
      const rowFor = label => rows.find(row => row.text.includes(label));
      return {
        labels,
        mohe: rowFor('Mohe Tribesman'),
        iron: rowFor('Iron Pagoda'),
      };
    });
    const toggleTexts = state.labels.map(item => item.text);
    assert(JSON.stringify(toggleTexts) === JSON.stringify(['Count', 'Value']), `unexpected toggle labels: ${JSON.stringify(toggleTexts)}`);
    assert(state.labels.find(item => item.text === 'Value')?.pressed === 'true', `Value button not active: ${JSON.stringify(state.labels)}`);
    assert(state.mohe?.totalNumber > 0 && /res$/.test(state.mohe.total), `Mohe value total missing from legend: ${JSON.stringify(state.mohe)}`);
    assert(state.iron?.totalNumber > 0 && /res$/.test(state.iron.total), `Iron Pagoda value total missing from legend: ${JSON.stringify(state.iron)}`);
  });

  await test('Value-mode range legend shows resource deltas and hides Count/Value toggle', async () => {
    await dragSelectMostOfChart();
    const state = await page.evaluate(() => {
      const activeRangeHosts = [...document.querySelectorAll('*')].filter(el => el.__aoe4ActiveRange);
      const rows = [...document.querySelectorAll('.aoe4-legend-breakdown[data-player-name="spartain"] .aoe4-army-unit-row')]
        .filter(row => getComputedStyle(row).display !== 'none')
        .map(row => {
          const totalEl = row.querySelector('.aoe4-army-unit-total');
          const trainedEl = row.querySelector('.aoe4-army-unit-delta-trained');
          const lostEl = row.querySelector('.aoe4-army-unit-delta-lost');
          const trained = row.querySelector('.aoe4-army-unit-delta-trained')?.textContent?.trim() || '';
          const lost = row.querySelector('.aoe4-army-unit-delta-lost')?.textContent?.trim() || '';
          const toNumber = value => Number(value.replace(/,/g, '')) || 0;
          const rect = el => {
            const r = el?.getBoundingClientRect?.();
            return r ? { left: r.left, right: r.right, width: r.width } : null;
          };
          return {
            text: (row.textContent || '').replace(/\s+/g, ' ').trim(),
            trained,
            lost,
            trainedNumber: toNumber(trained),
            lostNumber: toNumber(lost),
            totalRect: rect(totalEl),
            trainedRect: rect(trainedEl),
            lostRect: rect(lostEl),
          };
        });
      return {
        rangeActive: activeRangeHosts.length > 0,
        toggleDisplay: document.querySelector('.aoe4-army-mode-toggle')?.style.display || '',
        rows,
      };
    });
    assert(state.toggleDisplay === 'none', `Count/Value toggle should hide while range is active: ${JSON.stringify(state)}`);
    const resourceDeltaRows = state.rows.filter(row => row.trainedNumber >= 100 || row.lostNumber >= 100);
    assert(resourceDeltaRows.length > 0, `expected resource-sized deltas in Value mode, got rows: ${JSON.stringify(state.rows)}`);
    assert(
      resourceDeltaRows.some(row => /Mohe Tribesman|Iron Pagoda/.test(row.text)),
      `expected Jin override-unit row to show resource deltas, got: ${JSON.stringify(resourceDeltaRows)}`,
    );
    const overlapping = resourceDeltaRows.filter(row =>
      !row.totalRect || !row.trainedRect || !row.lostRect ||
      row.totalRect.right > row.trainedRect.left ||
      row.trainedRect.right > row.lostRect.left
    );
    assert(overlapping.length === 0, `resource legend numeric columns overlap: ${JSON.stringify(overlapping)}`);
  });

  await teardown();
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(async (error) => {
  console.error('FATAL:', error);
  await teardown();
  process.exit(1);
});
