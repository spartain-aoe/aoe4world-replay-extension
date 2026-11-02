'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { installAoe4WorldFixtureRoutes } = require('./aoe4world-fixtures.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const EXT_PATH = path.join(ROOT, 'chrome-extension');
const PROFILE_PATH = path.join(__dirname, '.pw-profile-army-value-legend');
const SUMMARY_PATH = path.join(ROOT, 'tests', 'fixtures', 'summary-233034826.json');
const GAME_URL = 'https://aoe4world.com/players/24574510-spartain/games/233034826';
const METRIC_RE = /^[\d,]+ \([\d,]+\)$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseMetric(text) {
  const match = /^([\d,]+) \(([\d,]+)\)$/.exec(text);
  return match
    ? { value: Number(match[1].replace(/,/g, '')), count: Number(match[2].replace(/,/g, '')) }
    : null;
}

async function selectChart(page, fragment) {
  const selected = await page.evaluate((valueFragment) => {
    const select = document.querySelector('select');
    const option = [...(select?.querySelectorAll('option') || [])]
      .find(candidate => candidate.value.includes(valueFragment));
    if (!select || !option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, fragment);
  assert(selected, `could not select chart containing ${fragment}`);
}

async function setArmyMode(page, mode) {
  const clicked = await page.evaluate((targetMode) => {
    const button = [...document.querySelectorAll('.aoe4-army-mode-toggle-btn')]
      .find(candidate => candidate.dataset.mode === targetMode);
    if (!button) return false;
    button.click();
    return true;
  }, mode);
  assert(clicked, `${mode} mode button not found`);
  await page.waitForTimeout(250);
}

async function legendState(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.aoe4-legend-breakdown[data-player-name="spartain"]');
    const rows = [...(panel?.querySelectorAll('.aoe4-army-unit-row') || [])].map(row => ({
      name: row.querySelector('.aoe4-army-unit-name')?.textContent?.trim() || '',
      total: row.querySelector('.aoe4-army-unit-total')?.textContent?.trim() || '',
      gained: row.querySelector('.aoe4-army-unit-delta-trained')?.textContent?.trim() || '',
      lost: row.querySelector('.aoe4-army-unit-delta-lost')?.textContent?.trim() || '',
      display: getComputedStyle(row).display,
    }));
    const playerRow = [...document.querySelectorAll('.flex.items-center.cursor-pointer[data-aoe4-legend-injected="1"]')]
      .find(row => (row.textContent || '').includes('spartain'));
    const toggle = document.querySelector('.aoe4-army-mode-toggle');
    return {
      rows,
      summary: playerRow?.querySelector('.aoe4-inline-legend-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      valuePressed: toggle?.querySelector('[data-mode="value"]')?.getAttribute('aria-pressed') || '',
      countPressed: toggle?.querySelector('[data-mode="count"]')?.getAttribute('aria-pressed') || '',
    };
  });
}

function assertValueRows(state, phase) {
  const visible = state.rows.filter(row => row.display !== 'none');
  assert(visible.length > 0, `${phase}: no visible legend rows: ${JSON.stringify(state)}`);
  for (const row of visible) {
    assert(!row.total || METRIC_RE.test(row.total), `${phase}: invalid total for ${row.name}: ${JSON.stringify(row)}`);
    assert(row.total || row.gained || row.lost, `${phase}: empty visible row for ${row.name}: ${JSON.stringify(row)}`);
    assert(!/\bres\b/i.test(`${row.total} ${row.gained} ${row.lost}`), `${phase}: res suffix leaked: ${JSON.stringify(row)}`);
    if (row.gained) assert(METRIC_RE.test(row.gained), `${phase}: invalid gained metric: ${JSON.stringify(row)}`);
    if (row.lost) assert(METRIC_RE.test(row.lost), `${phase}: invalid lost metric: ${JSON.stringify(row)}`);
  }
}

async function toggleSpartainSummary(page) {
  const clicked = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.flex.items-center.cursor-pointer[data-aoe4-legend-injected="1"]')]
      .find(candidate => (candidate.textContent || '').includes('spartain'));
    const chevron = row?.querySelector('.aoe4-inline-legend-chevron');
    if (!chevron) return false;
    chevron.click();
    return true;
  });
  assert(clicked, 'spartain legend chevron not found');
  await page.waitForTimeout(150);
}

async function dragRange(page) {
  const canvas = page.locator('canvas[data-aoe4-summary-canvas]').first();
  const box = await canvas.boundingBox();
  assert(box && box.width > 100 && box.height > 80, `bad canvas box: ${JSON.stringify(box)}`);
  const y = box.y + box.height * 0.55;
  await page.mouse.move(box.x + 36, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 24, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

(async () => {
  let context;
  try {
    fs.rmSync(PROFILE_PATH, { recursive: true, force: true });
    context = await chromium.launchPersistentContext(PROFILE_PATH, {
      headless: false,
      args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
    });
    const background = context.serviceWorkers()[0] ||
      await context.waitForEvent('serviceworker', { timeout: 10000 });
    await background.evaluate(() => new Promise(resolve => {
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
        colors_v6_233034826: {
          savedAt: now,
          players: [
            { name: 'spartain', civilization: 'jin_dynasty', color: 6, slot: 0, playerId: 24574510 },
            { name: 'DonationDonation', civilization: 'golden_horde', color: 1, slot: 1, playerId: 20653422 },
          ],
        },
      }, resolve);
    }));

    const page = context.pages()[0] || await context.newPage();
    await installAoe4WorldFixtureRoutes(page);
    await page.route('https://aoe4world.com/players/24574510-spartain/games/233034826/summary**', async route => {
      const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'));
      summary.players[0].buildOrder.push({
        id: 'legend-zero-cost',
        type: 'Unit',
        icon: 'icons/races/common/units/unknown_guard_2',
        pbgid: 999999991,
        finished: [100, 200, 300],
        destroyed: [250],
      });
      summary.players[0].buildOrder.push({
        id: 'legend-empty-delta',
        type: 'Unit',
        icon: 'icons/races/common/units/empty_cell_guard_2',
        pbgid: 999999992,
        finished: [150],
        destroyed: [],
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(summary),
      });
    });

    await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => {
      const select = document.querySelector('select');
      return select?.value?.includes('army-composition') &&
        !!document.querySelector('.aoe4-army-mode-toggle') &&
        !!document.querySelector('.aoe4-legend-breakdown[data-player-name="spartain"]');
    }, null, { timeout: 20000 });

    await setArmyMode(page, 'count');
    let state = await legendState(page);
    const countIron = state.rows.find(row => row.name === 'Iron Pagoda');
    const countUnknown = state.rows.find(row => row.name === 'Unknown Guard');
    assert(/^[\d,]+$/.test(countIron?.total || ''), `Count mode changed: ${JSON.stringify(countIron)}`);
    assert(countUnknown?.total === '3', `Count mode unknown row changed: ${JSON.stringify(countUnknown)}`);

    await setArmyMode(page, 'value');
    state = await legendState(page);
    assertValueRows(state, 'initial Value');
    let iron = state.rows.find(row => row.name === 'Iron Pagoda');
    let unknown = state.rows.find(row => row.name === 'Unknown Guard');
    assert(parseMetric(iron?.total || '')?.count === Number(countIron.total.replace(/,/g, '')),
      `initial Value count mismatch: ${JSON.stringify({ countIron, iron })}`);
    assert((parseMetric(iron?.total || '')?.value || 0) > 0, `known-cost row has no cost: ${JSON.stringify(iron)}`);
    assert(unknown?.total === '0 (3)', `zero-cost static row missing: ${JSON.stringify(unknown)}`);

    await selectChart(page, 'resources-gathered-total');
    await page.waitForFunction(() => !document.querySelector('.aoe4-army-mode-toggle'), null, { timeout: 10000 });
    await selectChart(page, 'army-composition');
    await page.waitForFunction(() => {
      const toggle = document.querySelector('.aoe4-army-mode-toggle');
      return toggle?.querySelector('[data-mode="value"]')?.getAttribute('aria-pressed') === 'true' &&
        !!document.querySelector('.aoe4-legend-breakdown[data-player-name="spartain"]');
    }, null, { timeout: 10000 });
    await page.waitForTimeout(300);

    state = await legendState(page);
    assert(state.valuePressed === 'true' && state.countPressed === 'false',
      `Value toggle not restored: ${JSON.stringify(state)}`);
    assertValueRows(state, 'Value re-entry');
    unknown = state.rows.find(row => row.name === 'Unknown Guard');
    assert(unknown?.total === '0 (3)', `zero-cost row lost after re-entry: ${JSON.stringify(unknown)}`);

    await toggleSpartainSummary(page);
    state = await legendState(page);
    assert(state.summary.includes('Unknown Guard: 0 (3)') && !/\bres\b/i.test(state.summary),
      `static collapsed summary is inconsistent: ${JSON.stringify(state.summary)}`);

    const canvas = page.locator('canvas[data-aoe4-summary-canvas]').first();
    const box = await canvas.boundingBox();
    assert(box, 'army canvas has no bounding box');
    await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.5);
    await page.waitForFunction(() => {
      const row = [...document.querySelectorAll('.flex.items-center.cursor-pointer[data-aoe4-legend-injected="1"]')]
        .find(candidate => (candidate.textContent || '').includes('spartain'));
      return (row?.querySelector('.aoe4-inline-legend-summary')?.textContent || '').includes('Unknown Guard: 0 (2)');
    }, null, { timeout: 10000 });
    state = await legendState(page);
    assert(state.summary.includes('Unknown Guard: 0 (2)') && !/\bres\b/i.test(state.summary),
      `live collapsed summary is inconsistent: ${JSON.stringify(state.summary)}`);

    await toggleSpartainSummary(page);
    await dragRange(page);
    state = await legendState(page);
    assertValueRows(state, 'Value range');
    unknown = state.rows.find(row => row.name === 'Unknown Guard');
    assert(unknown?.display !== 'none', `zero-cost range row hidden: ${JSON.stringify(unknown)}`);
    assert(unknown.total === '', `true-zero Starting cell should be empty: ${JSON.stringify(unknown)}`);
    assert(unknown.gained === '0 (3)', `zero-cost Gained metric wrong: ${JSON.stringify(unknown)}`);
    assert(unknown.lost === '0 (1)', `zero-cost Lost metric wrong: ${JSON.stringify(unknown)}`);
    const emptyDelta = state.rows.find(row => row.name === 'Empty Cell Guard');
    assert(emptyDelta?.display !== 'none', `empty-delta range row hidden: ${JSON.stringify(emptyDelta)}`);
    assert(emptyDelta.total === '', `true-zero Starting cell should be empty: ${JSON.stringify(emptyDelta)}`);
    assert(emptyDelta.gained === '0 (1)', `zero-cost Gained metric wrong: ${JSON.stringify(emptyDelta)}`);
    assert(emptyDelta.lost === '', `true-zero Lost cell should be empty: ${JSON.stringify(emptyDelta)}`);
    assert(!state.rows.some(row => row.total === '0 (0)' || row.gained === '0 (0)' || row.lost === '0 (0)'),
      `true-zero cells should be blank: ${JSON.stringify(state.rows)}`);

    await toggleSpartainSummary(page);
    state = await legendState(page);
    assert(/Unknown Guard 0 \(3\) 0 \(1\)/.test(state.summary) &&
      !/0 \(0\)/.test(state.summary) &&
      !/\bres\b/i.test(state.summary),
      `range collapsed summary is inconsistent: ${JSON.stringify(state.summary)}`);

    const reset = page.locator('.aoe4-range-reset');
    await reset.click();
    await page.waitForTimeout(250);
    state = await legendState(page);
    assert(state.summary.includes('Unknown Guard: 0 (3)') && !/\bres\b/i.test(state.summary),
      `reset collapsed summary is inconsistent: ${JSON.stringify(state.summary)}`);

    await toggleSpartainSummary(page);
    await setArmyMode(page, 'count');
    state = await legendState(page);
    iron = state.rows.find(row => row.name === 'Iron Pagoda');
    unknown = state.rows.find(row => row.name === 'Unknown Guard');
    assert(/^[\d,]+$/.test(iron?.total || '') && unknown?.total === '3',
      `Count mode output changed after Value flow: ${JSON.stringify({ iron, unknown })}`);

    console.log('  ✓ Army Value legend remains cost (count) across toggle, re-entry, hover, range, reset, and collapse');
  } catch (error) {
    console.error(`  ✗ Army Value legend regression: ${error.stack || error.message}`);
    process.exitCode = 1;
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(PROFILE_PATH, { recursive: true, force: true });
  }
})();
