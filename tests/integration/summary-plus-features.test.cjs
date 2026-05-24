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

async function setup() {
  try { fs.rmSync(PROFILE_PATH, { recursive: true, force: true }); } catch (_) {}
  ctx = await chromium.launchPersistentContext(PROFILE_PATH, {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  bg = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  await bg.evaluate(() => new Promise(resolve => {
    const now = Date.now();
    chrome.storage.local.set({
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
    }, resolve);
  }));
  await installReplayApiMock(bg);
  page = ctx.pages()[0] || await ctx.newPage();
  await page.addInitScript(() => {
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
  await installAoe4WorldFixtureRoutes(page);
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
  await setup();
  await navigate();

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
