import { getGameIdFromUrl, normalizeName } from './dom.ts';
import { numericArray } from './chart-utils.ts';
import { isVillagerUnit } from './combat-units.ts';
import { unitCostTotal, unitMergeKey } from './unit-mapping.ts';
import { lookupCostByMergeKey, resolveUnitByPbgid } from './pbgid-map.ts';
import { lookupUnitDataByPbgid, lookupUnitDataForIcon } from './unit-data-cache.ts';
import type { BuildOrderItem, GameSummary, PlayerSummary, UnitDataEntry } from './types.ts';
import type { GetStatsMetricsResponse, StatsPlayerMetric } from '../shared/stats-metrics.ts';

export interface DetailsPlayerMetrics {
  name: string;
  profileId: string;
  idleTcSeconds: number | null;
  killedUnitCost: number | null;
  lostUnitCost: number | null;
  kdCostUnavailableReason: string | null;
}

const DETAILS_METRIC_ATTR = 'data-aoe4-details-metric';
const DETAILS_EXTRA_COLUMNS_ATTR = 'data-aoe4-details-extra-columns';
const DETAILS_FINGERPRINT_ATTR = 'data-aoe4-details-fingerprint';
const IDLE_TC_METRIC = 'idle-tc';
const KD_COST_METRIC = 'kd-cost';
const IDLE_TC_TITLE = 'Idle TC time from the official stats telemetry file. Includes overlapping idle time across TC-like producers.';
const KD_COST_TITLE = 'Resource value of enemy non-villager units killed divided by resource value of own non-villager units lost, matching native K/D categories.';

let detailsInstallToken = 0;
let detailsTimers: ReturnType<typeof setTimeout>[] = [];

// Reactive re-install of the details metrics. The fixed retry timers below only
// cover the first few seconds after the summary loads; on a slow (cold-cache)
// load the comparison table — or an SPA re-render of it — can appear after that
// window, leaving the placeholder "—" stuck until a manual refresh. This
// observer re-applies the latest loaded telemetry whenever the DOM changes, so
// late or re-rendered tables still receive their Idle TC values.
const DETAILS_OBSERVER_LIFETIME_MS = 15000;
const DETAILS_OBSERVER_DEBOUNCE_MS = 150;

let detailsObserver: MutationObserver | null = null;
let detailsObserverDebounce: ReturnType<typeof setTimeout> | null = null;
let detailsObserverLifetime: ReturnType<typeof setTimeout> | null = null;

function scheduleDetailsTimer(callback: () => void, delay: number): void {
  detailsTimers.push(setTimeout(() => {
    detailsTimers = detailsTimers.filter(timer => timer !== handle);
    callback();
  }, delay));
  const handle = detailsTimers[detailsTimers.length - 1];
}

function clearDetailsTimers(): void {
  for (const timer of detailsTimers) clearTimeout(timer);
  detailsTimers = [];
}

function disconnectDetailsObserver(): void {
  if (detailsObserver) {
    detailsObserver.disconnect();
    detailsObserver = null;
  }
  if (detailsObserverDebounce) {
    clearTimeout(detailsObserverDebounce);
    detailsObserverDebounce = null;
  }
  if (detailsObserverLifetime) {
    clearTimeout(detailsObserverLifetime);
    detailsObserverLifetime = null;
  }
}

function observeDetailsTable(token: number, gameId: string | undefined, install: () => void): void {
  disconnectDetailsObserver();
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) return;
  const stillCurrent = (): boolean =>
    token === detailsInstallToken && (!gameId || getGameIdFromUrl(window.location.href) === gameId);
  const observer = new MutationObserver(() => {
    if (!stillCurrent()) {
      disconnectDetailsObserver();
      return;
    }
    if (detailsObserverDebounce) return;
    detailsObserverDebounce = setTimeout(() => {
      detailsObserverDebounce = null;
      if (stillCurrent()) install();
    }, DETAILS_OBSERVER_DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  detailsObserver = observer;
  detailsObserverLifetime = setTimeout(disconnectDetailsObserver, DETAILS_OBSERVER_LIFETIME_MS);
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function playerCombatStat(player: PlayerSummary, keys: string[]): number | null {
  const stats = player._stats;
  if (!stats || typeof stats !== 'object') return null;
  const record = stats as Record<string, unknown>;
  for (const key of keys) {
    const value = finiteNumber(record[key]);
    if (value != null) return Math.max(0, Math.round(value));
  }
  return null;
}

type DestroyedUnitCost = {
  total: number;
  eventCount: number;
  missingCostEvents: number;
};

function hasUnitCostData(unitData: UnitDataEntry | null | undefined): boolean {
  const costs = unitData?.costs;
  if (!costs || typeof costs !== 'object') return false;
  return ['total', 'food', 'wood', 'gold', 'stone', 'vizier', 'oliveOil']
    .some(key => costs[key] != null && Number.isFinite(Number(costs[key])));
}

function resolveUnitCost(item: BuildOrderItem, player: PlayerSummary): { cost: number; known: boolean } {
  const unitData = lookupUnitDataByPbgid(item.pbgid, player) || lookupUnitDataForIcon(item.icon, player);
  if (hasUnitCostData(unitData)) return { cost: unitCostTotal(unitData), known: true };
  const mapped = resolveUnitByPbgid(item.pbgid);
  if (typeof mapped?.c === 'number' && Number.isFinite(mapped.c) && mapped.c >= 0) {
    return { cost: mapped.c, known: true };
  }
  const fallback = lookupCostByMergeKey(mapped?.k || unitMergeKey(item.icon, item.pbgid ?? null));
  return { cost: fallback, known: fallback > 0 };
}

function destroyedUnitCost(player: PlayerSummary): DestroyedUnitCost {
  let total = 0;
  let eventCount = 0;
  let missingCostEvents = 0;
  for (const item of player.buildOrder || []) {
    if (item.type !== 'Unit' || isVillagerUnit(item, player)) continue;
    const destroyedCount = numericArray(item.destroyed).length;
    if (destroyedCount === 0) continue;
    eventCount += destroyedCount;
    const resolution = resolveUnitCost(item, player);
    if (!resolution.known) {
      missingCostEvents += destroyedCount;
      continue;
    }
    total += resolution.cost * destroyedCount;
  }
  return { total, eventCount, missingCostEvents };
}

function incompleteEventReason(label: string, actual: number, expected: number | null): string | null {
  if (expected == null || actual === expected) return null;
  return `${label} unit destruction events are incomplete (${actual} of ${expected}).`;
}

function calculateKdCostMetrics(players: PlayerSummary[]): Array<Pick<
  DetailsPlayerMetrics,
  'killedUnitCost' | 'lostUnitCost' | 'kdCostUnavailableReason'
>> {
  const losses = players.map(destroyedUnitCost);
  const exactOneVsOne = players.length === 2 && (
    players[0].team == null ||
    players[1].team == null ||
    players[0].team !== players[1].team
  );

  return players.map((player, index) => {
    const ownLosses = losses[index];
    const expectedLosses = playerCombatStat(player, ['edeaths', 'eliteDeaths', 'elite_deaths']);
    const lostCountReason = incompleteEventReason('Own', ownLosses.eventCount, expectedLosses);
    const lostCost = ownLosses.missingCostEvents === 0 && !lostCountReason
      ? ownLosses.total
      : null;

    if (!exactOneVsOne) {
      return {
        killedUnitCost: null,
        lostUnitCost: lostCost,
        kdCostUnavailableReason: 'Per-player killed unit value is unavailable for team games and FFAs because the summary records the victim unit type but not the killer.',
      };
    }

    const opponentLosses = losses[index === 0 ? 1 : 0];
    const expectedKills = playerCombatStat(player, ['elitekill', 'eliteKillsTotal', 'elite_kills_total']);
    const killedCountReason = incompleteEventReason('Enemy', opponentLosses.eventCount, expectedKills);
    const reasons = [
      lostCountReason,
      killedCountReason,
      ownLosses.missingCostEvents > 0
        ? `Missing unit cost for ${ownLosses.missingCostEvents} own lost unit event${ownLosses.missingCostEvents === 1 ? '' : 's'}.`
        : null,
      opponentLosses.missingCostEvents > 0
        ? `Missing unit cost for ${opponentLosses.missingCostEvents} enemy destroyed unit event${opponentLosses.missingCostEvents === 1 ? '' : 's'}.`
        : null,
    ].filter((reason): reason is string => Boolean(reason));

    return {
      killedUnitCost: reasons.length === 0 ? opponentLosses.total : null,
      lostUnitCost: reasons.length === 0 ? ownLosses.total : null,
      kdCostUnavailableReason: reasons.length ? reasons.join(' ') : null,
    };
  });
}

function statsMetricByPlayer(summary: GameSummary, statsMetrics: readonly StatsPlayerMetric[] | undefined): Map<string, StatsPlayerMetric> {
  const map = new Map<string, StatsPlayerMetric>();
  if (!Array.isArray(statsMetrics)) return map;
  for (const metric of statsMetrics) {
    if (metric.profileId != null) map.set(`profile:${metric.profileId}`, metric);
    if (metric.name) map.set(`name:${normalizeName(metric.name)}`, metric);
  }
  for (const player of Array.isArray(summary.players) ? summary.players : []) {
    const metric = player.profileId == null ? null : map.get(`profile:${player.profileId}`);
    if (metric && player.name) map.set(`name:${normalizeName(player.name)}`, metric);
  }
  return map;
}

export function calculateDetailsPlayerMetrics(summary: GameSummary, statsMetrics?: readonly StatsPlayerMetric[]): DetailsPlayerMetrics[] {
  const players = Array.isArray(summary.players) ? summary.players : [];
  const telemetry = statsMetricByPlayer(summary, statsMetrics);
  const kdCostMetrics = calculateKdCostMetrics(players);
  return players.map((player, index) => {
    const metric = player.profileId == null
      ? telemetry.get(`name:${normalizeName(player.name)}`)
      : telemetry.get(`profile:${player.profileId}`) || telemetry.get(`name:${normalizeName(player.name)}`);
    const townCenterIdleSeconds = finiteNumber(metric?.townCenterIdleSeconds);
    return {
      name: player.name || `Player ${index + 1}`,
      profileId: String(player.profileId || ''),
      idleTcSeconds: townCenterIdleSeconds,
      ...kdCostMetrics[index],
    };
  });
}

export function formatIdleTcTime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const rounded = Math.max(0, Math.floor(seconds));
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatKdCostRatio(killedCost: number | null, lostCost: number | null): string {
  if (killedCost == null || lostCost == null) return '—';
  if (lostCost > 0) return String(Math.round((killedCost / lostCost) * 100) / 100);
  if (killedCost > 0) return '∞';
  return '';
}

function headerText(cell: Element): string {
  return (cell.textContent || '').replace(/\s+/g, ' ').trim();
}

function findDetailsComparisonTable(): HTMLTableElement | null {
  const tables = [...document.querySelectorAll<HTMLTableElement>('table')];
  return tables.find(table => {
    const headers = [...table.querySelectorAll('th')].map(headerText);
    return headers.some(text => /^Score$/i.test(text)) &&
      headers.some(text => /^Resources Spent$/i.test(text)) &&
      headers.some(text => /^Max\.?\s*Workers$/i.test(text)) &&
      headers.some(text => /^APM$/i.test(text));
  }) || null;
}

function tableSectionRows(section: HTMLTableSectionElement | Element | null | undefined): HTMLTableRowElement[] {
  if (!section) return [];
  return [...section.children].filter((child): child is HTMLTableRowElement => child.tagName === 'TR');
}

function tableHeadRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return tableSectionRows(table.tHead || table.querySelector('thead'));
}

function tableBodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const body = table.tBodies?.[0] || table.querySelector('tbody');
  return tableSectionRows(body);
}

function rowCells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  const cells = row.cells ? [...row.cells] : [...row.children];
  return cells.filter((child): child is HTMLTableCellElement => child.tagName === 'TD' || child.tagName === 'TH');
}

function cellColSpan(cell: HTMLTableCellElement): number {
  return Math.max(1, Number(cell.getAttribute('colspan')) || cell.colSpan || 1);
}

function setCellColSpan(cell: HTMLTableCellElement, value: number): void {
  cell.colSpan = value;
  cell.setAttribute('colspan', String(value));
}

function restoreHeaderColSpans(table: HTMLTableElement): void {
  for (const cell of table.querySelectorAll<HTMLTableCellElement>(`th[${DETAILS_EXTRA_COLUMNS_ATTR}]`)) {
    const previousExtra = Number(cell.getAttribute(DETAILS_EXTRA_COLUMNS_ATTR)) || 0;
    const baseSpan = Math.max(1, cellColSpan(cell) - previousExtra);
    setCellColSpan(cell, baseSpan);
    cell.removeAttribute(DETAILS_EXTRA_COLUMNS_ATTR);
  }
}

function topHeaderForSubHeaderIndex(topRow: HTMLTableRowElement, subHeaderIndex: number): HTMLTableCellElement | null {
  let cursor = 0;
  for (const cell of rowCells(topRow)) {
    const span = cellColSpan(cell);
    if (subHeaderIndex >= cursor && subHeaderIndex < cursor + span) return cell;
    cursor += span;
  }
  return null;
}

function metricHeader(metric: string, text: string, title: string): HTMLTableCellElement {
  const th = document.createElement('th');
  th.setAttribute(DETAILS_METRIC_ATTR, metric);
  th.className = 'text-gray-100 text-sm pr-2 font-normal pb-2';
  th.textContent = text;
  th.title = title;
  return th;
}

type DetailsHeaderPositions = {
  apmIndex: number | null;
  kdIndex: number | null;
};

function ensureDetailsHeaders(table: HTMLTableElement): DetailsHeaderPositions | null {
  const rows = tableHeadRows(table);
  if (rows.length < 2) return null;
  const topRow = rows[0];
  const subRow = rows[1];
  const existingMetricHeaders = [...subRow.querySelectorAll<HTMLTableCellElement>(`th[${DETAILS_METRIC_ATTR}]`)];
  existingMetricHeaders.forEach(cell => cell.remove());
  restoreHeaderColSpans(table);
  const subHeaders = rowCells(subRow);
  const apmIndex = subHeaders.findIndex(cell => /^APM$/i.test(headerText(cell)));
  const kdIndex = subHeaders.findIndex(cell => /^K\s*\/\s*D$/i.test(headerText(cell)));
  if (apmIndex < 0 && kdIndex < 0) return null;

  const extraByGroup = new Map<HTMLTableCellElement, number>();
  for (const index of [apmIndex, kdIndex]) {
    if (index < 0) continue;
    const groupHeader = topHeaderForSubHeaderIndex(topRow, index);
    if (groupHeader) extraByGroup.set(groupHeader, (extraByGroup.get(groupHeader) || 0) + 1);
  }
  for (const [groupHeader, extra] of extraByGroup) {
    setCellColSpan(groupHeader, cellColSpan(groupHeader) + extra);
    groupHeader.setAttribute(DETAILS_EXTRA_COLUMNS_ATTR, String(extra));
  }

  if (kdIndex >= 0) {
    subHeaders[kdIndex].after(
      metricHeader(KD_COST_METRIC, 'K/D Cost', KD_COST_TITLE),
    );
  }
  if (apmIndex >= 0) {
    subHeaders[apmIndex].after(
      metricHeader(IDLE_TC_METRIC, 'Idle TC', IDLE_TC_TITLE),
    );
  }
  return {
    apmIndex: apmIndex >= 0 ? apmIndex : null,
    kdIndex: kdIndex >= 0 ? kdIndex : null,
  };
}

function playerProfileIdFromRow(row: HTMLTableRowElement): string {
  const href = rowCells(row)[0]?.querySelector<HTMLAnchorElement>('a[href*="/players/"]')?.href || '';
  const match = href.match(/\/players\/(\d+)/);
  return match?.[1] || '';
}

function playerNameFromRow(row: HTMLTableRowElement): string {
  return rowCells(row)[0]?.querySelector('a')?.textContent?.trim() || '';
}

function metricCell(metric: string, text: string, title: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.setAttribute(DETAILS_METRIC_ATTR, metric);
  td.className = 'pr-2 relative';
  td.title = title;
  const span = document.createElement('span');
  span.className = 'relative px-1';
  span.textContent = text;
  td.appendChild(span);
  return td;
}

function updateMetricCell(row: HTMLTableRowElement, metric: string, text: string, title: string): void {
  const cell = row.querySelector<HTMLTableCellElement>(`td[${DETAILS_METRIC_ATTR}="${metric}"]`);
  if (!cell) return;
  cell.title = title;
  const span = cell.querySelector('span') || cell;
  span.textContent = text;
}

function installMetricCells(row: HTMLTableRowElement, positions: DetailsHeaderPositions): void {
  row.querySelectorAll<HTMLTableCellElement>(`td[${DETAILS_METRIC_ATTR}]`).forEach(cell => cell.remove());
  const cells = rowCells(row);
  if (positions.kdIndex != null) {
    cells[positions.kdIndex]?.after(
      metricCell(KD_COST_METRIC, '—', KD_COST_TITLE),
    );
  }
  if (positions.apmIndex != null) {
    cells[positions.apmIndex]?.after(
      metricCell(IDLE_TC_METRIC, '—', IDLE_TC_TITLE),
    );
  }
}

function kdCostCellTitle(metric: DetailsPlayerMetrics): string {
  if (metric.kdCostUnavailableReason) {
    return `K/D Cost unavailable: ${metric.kdCostUnavailableReason}`;
  }
  const killed = Math.round(metric.killedUnitCost || 0).toLocaleString();
  const lost = Math.round(metric.lostUnitCost || 0).toLocaleString();
  return `${KD_COST_TITLE} Enemy unit value killed: ${killed}; own unit value lost: ${lost}.`;
}

export function installDetailsTableMetrics(summary: GameSummary, statsMetrics?: readonly StatsPlayerMetric[]): boolean {
  const table = findDetailsComparisonTable();
  if (!table) return false;
  const bodyRows = tableBodyRows(table);
  if (bodyRows.length === 0) return false;
  const metrics = calculateDetailsPlayerMetrics(summary, statsMetrics);
  const fingerprint = JSON.stringify(metrics.map(item => [
    item.profileId,
    item.name,
    item.idleTcSeconds,
    item.killedUnitCost,
    item.lostUnitCost,
    item.kdCostUnavailableReason,
  ]));
  const nativeSubHeaders = tableHeadRows(table)[1]
    ? rowCells(tableHeadRows(table)[1]).filter(cell => !cell.hasAttribute(DETAILS_METRIC_ATTR))
    : [];
  const hasKdColumn = nativeSubHeaders.some(cell => /^K\s*\/\s*D$/i.test(headerText(cell)));
  const expectedMetrics = hasKdColumn ? [IDLE_TC_METRIC, KD_COST_METRIC] : [IDLE_TC_METRIC];
  // Require every body row to actually carry the metric cell, not just the
  // table to have a matching element somewhere: an SPA re-render can wipe the
  // body cells while leaving the injected header (and the table's fingerprint
  // attribute) intact, and we must re-install in that case.
  const allRowsHaveMetricCell = bodyRows.every(row =>
    expectedMetrics.every(metric => row.querySelector(`td[${DETAILS_METRIC_ATTR}="${metric}"]`))
  );
  if (
    table.getAttribute(DETAILS_FINGERPRINT_ATTR) === fingerprint &&
    allRowsHaveMetricCell
  ) {
    return true;
  }
  const positions = ensureDetailsHeaders(table);
  if (positions == null) return false;

  const byProfileId = new Map(metrics.filter(item => item.profileId).map(item => [item.profileId, item]));
  const byName = new Map(metrics.map(item => [normalizeName(item.name), item]));

  for (const row of bodyRows) {
    installMetricCells(row, positions);
    const rowMetrics = byProfileId.get(playerProfileIdFromRow(row)) || byName.get(normalizeName(playerNameFromRow(row)));
    if (!rowMetrics) continue;
    updateMetricCell(row, IDLE_TC_METRIC, formatIdleTcTime(rowMetrics.idleTcSeconds), IDLE_TC_TITLE);
    if (positions.kdIndex != null) {
      updateMetricCell(
        row,
        KD_COST_METRIC,
        formatKdCostRatio(rowMetrics.killedUnitCost, rowMetrics.lostUnitCost),
        kdCostCellTitle(rowMetrics),
      );
    }
  }
  table.dataset.aoe4DetailsMetrics = 'true';
  table.setAttribute(DETAILS_FINGERPRINT_ATTR, fingerprint);
  return true;
}

export function clearDetailsTableMetrics(): void {
  detailsInstallToken++;
  clearDetailsTimers();
  disconnectDetailsObserver();
  if (typeof document === 'undefined') return;

  for (const table of document.querySelectorAll<HTMLTableElement>('table[data-aoe4-details-metrics="true"], table:has([data-aoe4-details-metric])')) {
    table.querySelectorAll<HTMLElement>(`[${DETAILS_METRIC_ATTR}]`).forEach(cell => cell.remove());
    restoreHeaderColSpans(table);
    table.removeAttribute(DETAILS_FINGERPRINT_ATTR);
    delete table.dataset.aoe4DetailsMetrics;
  }
}

export function scheduleDetailsTableMetrics(summary: GameSummary, gameId?: string): void {
  const token = ++detailsInstallToken;
  clearDetailsTimers();
  let currentStatsMetrics: readonly StatsPlayerMetric[] | undefined;
  const installCurrentMetrics = (): void => {
    installDetailsTableMetrics(summary, currentStatsMetrics);
  };
  const delays = [0, 500, 1500, 4000];
  for (const delay of delays) {
    scheduleDetailsTimer(() => {
      if (token !== detailsInstallToken) return;
      if (gameId && getGameIdFromUrl(window.location.href) !== gameId) return;
      installCurrentMetrics();
    }, delay);
  }
  requestStatsMetrics(gameId, token, (players) => {
    currentStatsMetrics = players;
    installCurrentMetrics();
  });
  observeDetailsTable(token, gameId, installCurrentMetrics);
}

function requestStatsMetrics(gameId: string | undefined, token: number, onLoaded: (players: readonly StatsPlayerMetric[]) => void): void {
  if (!gameId || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  chrome.runtime.sendMessage({ type: 'getStatsMetrics', matchId: gameId }, (response: GetStatsMetricsResponse | undefined) => {
    if (token !== detailsInstallToken) return;
    if (getGameIdFromUrl(window.location.href) !== gameId) return;
    if (!response?.success || !Array.isArray(response.players)) return;
    const players = response.players;
    onLoaded(players);
    const delays = [0, 500, 1500];
    for (const delay of delays) {
      scheduleDetailsTimer(() => {
        if (token !== detailsInstallToken) return;
        if (getGameIdFromUrl(window.location.href) !== gameId) return;
        onLoaded(players);
      }, delay);
    }
  });
}
