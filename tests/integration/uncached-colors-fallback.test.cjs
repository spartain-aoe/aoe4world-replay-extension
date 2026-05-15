/**
 * Integration test: uncached replay colors fall back when WorldsEdge metadata is unavailable.
 *
 * The background service worker first sees a transient getReplayFiles 502, then
 * uses the profile-specific legacy replay endpoint to fetch and parse the replay
 * on the initial uncached color request.
 */

'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { installReplayApiMock } = require('./replay-api-mock.cjs');

const EXT_PATH = path.resolve(__dirname, '..', '..', 'chrome-extension');
const PROFILE_BASE_PATH = path.join(__dirname, '.pw-profile-color-fallback');

let ctx, bg, page;

async function setup(profilePath, replayMockOptions) {
  try { fs.rmSync(profilePath, { recursive: true, force: true }); } catch {}
  ctx = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  bg = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  await bg.evaluate((s) => new Promise(r => chrome.storage.local.set({ settings: s }, r)), {
    parseGameData: true,
    injectCharts: true,
    recolorSwatches: true,
    debugLogs: false,
  });
  await installReplayApiMock(bg, replayMockOptions);
  const extensionId = new URL(bg.url()).host;
  page = await ctx.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
}

async function teardown(profilePath) {
  if (ctx) await ctx.close().catch(() => {});
  try { fs.rmSync(profilePath, { recursive: true, force: true }); } catch {}
  ctx = null;
  bg = null;
  page = null;
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

async function requestColors() {
  return page.evaluate(() => new Promise(resolve => {
    chrome.runtime.sendMessage({
      type: 'getPlayerColors',
      matchId: '233034826',
      profileId: '24574510',
    }, resolve);
  }));
}

async function runFallbackScenario({ profileSuffix, replayMockOptions, verifyState, successMessage }) {
  const profilePath = `${PROFILE_BASE_PATH}-${profileSuffix}`;
  await setup(profilePath, replayMockOptions);
  try {
    const response = await requestColors();

    assert(response?.success === true, `expected fallback success, got ${JSON.stringify(response)}`);
    assert(Array.isArray(response.players) && response.players.some(p => p.name === 'Spartain'),
      `expected parsed replay players, got ${JSON.stringify(response.players)}`);

    const state = await bg.evaluate(() => globalThis.__aoe4ReplayApiMockState);
    verifyState(state);

    const cacheEntry = await bg.evaluate(() => new Promise(resolve => {
      chrome.storage.local.get('colors_v5_233034826', result => resolve(result.colors_v5_233034826));
    }));
    assert(cacheEntry?.players?.length > 0, `expected color cache entry, got ${JSON.stringify(cacheEntry)}`);

    console.log(`  ✓ ${successMessage}`);
  } finally {
    await teardown(profilePath);
  }
}

(async () => {
  console.log('\n=== Uncached Color Fallback ===');
  await runFallbackScenario({
    profileSuffix: 'metadata',
    replayMockOptions: { replayMetadataFails: true },
    verifyState: (state) => {
      assert(state.replayMetadataCalls >= 1, `expected replay metadata call, got ${JSON.stringify(state)}`);
      assert(state.blobReplayCalls === 0, `expected no blob call after metadata failure, got ${JSON.stringify(state)}`);
      assert(state.legacyReplayCalls === 1, `expected one legacy fallback call, got ${JSON.stringify(state)}`);
    },
    successMessage: 'legacy replay fallback supplies uncached colors after replay metadata 502',
  });
  await runFallbackScenario({
    profileSuffix: 'blob',
    replayMockOptions: { replayBlobFails: true },
    verifyState: (state) => {
      assert(state.replayMetadataCalls === 1, `expected one replay metadata call, got ${JSON.stringify(state)}`);
      assert(state.blobReplayCalls === 1, `expected one blob replay call, got ${JSON.stringify(state)}`);
      assert(state.legacyReplayCalls === 1, `expected one legacy fallback call, got ${JSON.stringify(state)}`);
    },
    successMessage: 'legacy replay fallback supplies uncached colors after replay blob 502',
  });
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
