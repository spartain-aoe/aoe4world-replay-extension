import { getGameIdFromUrl, normalizeName } from './dom.ts';
import type { GameSummary } from './types.ts';
import type { GetStatsMetricsResponse, StatsPlayerMetric } from '../shared/stats-metrics.ts';

export interface DetailsPlayerMetrics {
  name: string;
  profileId: string;
  idleTcSeconds: number | null;
}

const DETAILS_METRIC_ATTR = 'data-aoe4-details-metric';
const DETAILS_EXTRA_COLUMNS_ATTR = 'data-aoe4-details-extra-columns';
const DETAILS_FINGERPRINT_ATTR = 'data-aoe4-details-fingerprint';
const IDLE_TC_METRIC = 'idle-tc';
const IDLE_TC_TITLE = 'Idle TC time from the official stats telemetry file. Includes overlapping idle time across TC-like producers.';

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
  return players.map((player, index) => {
    const metric = player.profileId == null
      ? telemetry.get(`name:${normalizeName(player.name)}`)
      : telemetry.get(`profile:${player.profileId}`) || telemetry.get(`name:${normalizeName(player.name)}`);
    const townCenterIdleSeconds = finiteNumber(metric?.townCenterIdleSeconds);
    return {
      name: player.name || `Player ${index + 1}`,
      profileId: String(player.profileId || ''),
      idleTcSeconds: townCenterIdleSeconds,
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

function ensureDetailsHeaders(table: HTMLTableElement): number | null {
  const rows = tableHeadRows(table);
  if (rows.length < 2) return null;
  const topRow = rows[0];
  const subRow = rows[1];
  const existingMetricHeaders = [...subRow.querySelectorAll<HTMLTableCellElement>(`th[${DETAILS_METRIC_ATTR}]`)];
  existingMetricHeaders.forEach(cell => cell.remove());
  const subHeaders = rowCells(subRow);
  const apmIndex = subHeaders.findIndex(cell => /^APM$/i.test(headerText(cell)));
  if (apmIndex < 0) return null;

  const groupHeader = topHeaderForSubHeaderIndex(topRow, apmIndex);
  if (groupHeader) {
    const previousExtra = Number(groupHeader.getAttribute(DETAILS_EXTRA_COLUMNS_ATTR)) || 0;
    const baseSpan = Math.max(1, cellColSpan(groupHeader) - previousExtra);
    setCellColSpan(groupHeader, baseSpan + 1);
    groupHeader.setAttribute(DETAILS_EXTRA_COLUMNS_ATTR, '1');
  }

  subHeaders[apmIndex].after(
    metricHeader(IDLE_TC_METRIC, 'Idle TC', IDLE_TC_TITLE),
  );
  return apmIndex;
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

function installMetricCells(row: HTMLTableRowElement, apmIndex: number): void {
  row.querySelectorAll<HTMLTableCellElement>(`td[${DETAILS_METRIC_ATTR}]`).forEach(cell => cell.remove());
  const anchor = rowCells(row)[apmIndex];
  if (!anchor) return;
  anchor.after(
    metricCell(IDLE_TC_METRIC, '—', IDLE_TC_TITLE),
  );
}

export function installDetailsTableMetrics(summary: GameSummary, statsMetrics?: readonly StatsPlayerMetric[]): boolean {
  const table = findDetailsComparisonTable();
  if (!table) return false;
  const bodyRows = tableBodyRows(table);
  if (bodyRows.length === 0) return false;
  const metrics = calculateDetailsPlayerMetrics(summary, statsMetrics);
  const fingerprint = JSON.stringify(metrics.map(item => [item.profileId, item.name, item.idleTcSeconds]));
  // Require every body row to actually carry the metric cell, not just the
  // table to have a matching element somewhere: an SPA re-render can wipe the
  // body cells while leaving the injected header (and the table's fingerprint
  // attribute) intact, and we must re-install in that case.
  const allRowsHaveMetricCell = bodyRows.every(row => row.querySelector(`td[${DETAILS_METRIC_ATTR}="${IDLE_TC_METRIC}"]`));
  if (
    table.getAttribute(DETAILS_FINGERPRINT_ATTR) === fingerprint &&
    allRowsHaveMetricCell
  ) {
    return true;
  }
  const apmIndex = ensureDetailsHeaders(table);
  if (apmIndex == null) return false;

  const byProfileId = new Map(metrics.filter(item => item.profileId).map(item => [item.profileId, item]));
  const byName = new Map(metrics.map(item => [normalizeName(item.name), item]));

  for (const row of bodyRows) {
    installMetricCells(row, apmIndex);
    const rowMetrics = byProfileId.get(playerProfileIdFromRow(row)) || byName.get(normalizeName(playerNameFromRow(row)));
    if (!rowMetrics) continue;
    updateMetricCell(row, IDLE_TC_METRIC, formatIdleTcTime(rowMetrics.idleTcSeconds), IDLE_TC_TITLE);
  }
  table.dataset.aoe4DetailsMetrics = 'true';
  table.setAttribute(DETAILS_FINGERPRINT_ATTR, fingerprint);
  return true;
}

export function clearDetailsTableMetrics(): void {
  detailsInstallToken++;
  clearDetailsTimers();
  disconnectDetailsObserver();
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
