import { getGameIdFromUrl, normalizeName } from './dom.ts';
import type { GameSummary } from './types.ts';

export interface DetailsPlayerMetrics {
  name: string;
  profileId: string;
  idleTcSeconds: number | null;
}

interface StatsPlayerMetric {
  playerId?: number;
  profileId?: number;
  name?: string;
  townCenterIdleSeconds?: number;
}

type StatsMetricsResponse = {
  success?: boolean;
  players?: StatsPlayerMetric[];
  error?: string;
  rateLimited?: boolean;
  disabled?: boolean;
};

const DETAILS_METRIC_ATTR = 'data-aoe4-details-metric';
const DETAILS_EXTRA_COLUMNS_ATTR = 'data-aoe4-details-extra-columns';
const IDLE_TC_METRIC = 'idle-tc';
const IDLE_TC_TITLE = 'Idle TC time from the official stats telemetry file. Includes overlapping idle time across TC-like producers.';

let detailsInstallToken = 0;

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
  if (!table || tableBodyRows(table).length === 0) return false;
  const apmIndex = ensureDetailsHeaders(table);
  if (apmIndex == null) return false;

  const metrics = calculateDetailsPlayerMetrics(summary, statsMetrics);
  const byProfileId = new Map(metrics.filter(item => item.profileId).map(item => [item.profileId, item]));
  const byName = new Map(metrics.map(item => [normalizeName(item.name), item]));

  for (const row of tableBodyRows(table)) {
    installMetricCells(row, apmIndex);
    const rowMetrics = byProfileId.get(playerProfileIdFromRow(row)) || byName.get(normalizeName(playerNameFromRow(row)));
    if (!rowMetrics) continue;
    updateMetricCell(row, IDLE_TC_METRIC, formatIdleTcTime(rowMetrics.idleTcSeconds), IDLE_TC_TITLE);
  }
  table.dataset.aoe4DetailsMetrics = 'true';
  return true;
}

export function scheduleDetailsTableMetrics(summary: GameSummary, gameId?: string): void {
  const token = ++detailsInstallToken;
  const delays = [0, 500, 1500, 4000];
  for (const delay of delays) {
    setTimeout(() => {
      if (token !== detailsInstallToken) return;
      if (gameId && getGameIdFromUrl(window.location.href) !== gameId) return;
      installDetailsTableMetrics(summary);
    }, delay);
  }
  requestStatsMetrics(summary, gameId, token);
}

function requestStatsMetrics(summary: GameSummary, gameId: string | undefined, token: number): void {
  if (!gameId || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  chrome.runtime.sendMessage({ type: 'getStatsMetrics', matchId: gameId }, (response: StatsMetricsResponse | undefined) => {
    if (token !== detailsInstallToken) return;
    if (getGameIdFromUrl(window.location.href) !== gameId) return;
    if (!response?.success || !Array.isArray(response.players)) return;
    const delays = [0, 500, 1500];
    for (const delay of delays) {
      setTimeout(() => {
        if (token !== detailsInstallToken) return;
        if (getGameIdFromUrl(window.location.href) !== gameId) return;
        installDetailsTableMetrics(summary, response.players);
      }, delay);
    }
  });
}
