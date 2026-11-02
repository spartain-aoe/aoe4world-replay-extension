import { normalizeName, TIMELINE_PLAYER_NAME_SELECTOR, TIMELINE_PLAYER_ROW_SELECTOR } from './dom.ts';
import { niceGeometryForChart } from './canvas-geom.ts';
import { precomputeStackedValues } from './army-series.ts';
import { drawTimelineCanvasChart, drawTimelineCanvasChartForHover } from './canvas-render.ts';
import { nativePlayerRowText } from './native-timeline.ts';
import { playerCacheKey } from './canvas-cache.ts';
import type {
  Chart,
  PlayerSummary,
  PlayerToggleHandler,
  TimelineElements,
  TooltipCacheRow,
} from './types.ts';

export function attachTimelineHoverGuard(timeline: TimelineElements, chart: Chart): void {
  detachTimelineHoverGuard(timeline);
  let guardFrame = 0;
  const redraw = (): void => {
    guardFrame = 0;
    if (timeline.root.__aoe4SummaryActiveChart !== chart) return;
    const activeValue = timeline.select.__aoe4SummaryActiveValue;
    if (!activeValue || !activeValue.startsWith('aoe4plus:')) return;
    timeline.heading.textContent = chart.title;
    // If a chart animation is in progress, let it finish — calling
    // drawTimelineCanvasChart() here without preserveAnimation:true would
    // invoke cancelTimelineCanvasAnimation() and kill the RAF loop.
    if (timeline.canvas.__aoe4AnimationToken) return;
    drawTimelineCanvasChart(timeline.canvas, chart);
  };
  const guardHover = (event: Event): void => {
    if (shouldSuppressHover(timeline, event)) return;
    const target = event.target as Element | null;
    if (target === timeline.canvas) return;
    if (timeline.chartBox?.__aoe4HoverActive || timeline.canvas?.__aoe4HoverActive) return;
    if (target?.closest?.('.aoe4-army-unit-legend, .aoe4-inline-legend-summary, .aoe4-inline-legend-chevron, .aoe4-legend-breakdown')) return;
    if (target?.closest?.('[data-aoe4-legend-injected]')) return;
    if (!guardFrame) guardFrame = requestAnimationFrame(redraw);
  };
  for (const type of ['mouseover', 'mouseout']) {
    timeline.root.addEventListener(type, guardHover, true);
  }
  timeline.root.__aoe4SummaryActiveChart = chart;
  timeline.root.__aoe4SummaryHoverGuard = { guardHover };
}

function isRealPointerMove(event: Event | null | undefined): boolean {
  if (!event || !('movementX' in event) || !('movementY' in event)) return false;
  if (event.isTrusted) return true;
  const move = event as MouseEvent;
  return Math.abs(move.movementX || 0) > 0 || Math.abs(move.movementY || 0) > 0;
}

export function clearHoverSuppression(timeline: TimelineElements | null | undefined): void {
  if (!timeline) return;
  timeline.__aoe4SuppressHoverUntilMove = false;
  if (timeline.__aoe4SuppressHoverAbort) {
    timeline.__aoe4SuppressHoverAbort.abort();
    timeline.__aoe4SuppressHoverAbort = null;
  }
}

export function suppressHoverUntilPointerMove(timeline: TimelineElements): void {
  clearHoverSuppression(timeline);
  timeline.__aoe4SuppressHoverUntilMove = true;
  const ctrl = new AbortController();
  timeline.__aoe4SuppressHoverAbort = ctrl;
  const clearOnMove = (event: Event): void => {
    if (isRealPointerMove(event)) clearHoverSuppression(timeline);
  };
  window.addEventListener('mousemove', clearOnMove, { capture: true, signal: ctrl.signal });
  window.addEventListener('pointermove', clearOnMove, { capture: true, signal: ctrl.signal });
}

export function shouldSuppressHover(timeline: TimelineElements | null | undefined, event?: Event | null): boolean {
  if (!timeline?.__aoe4SuppressHoverUntilMove) return false;
  if (isRealPointerMove(event)) {
    clearHoverSuppression(timeline);
    return false;
  }
  return true;
}

export function detachTimelineHoverGuard(timeline: TimelineElements): void {
  const guard = timeline.root.__aoe4SummaryHoverGuard;
  if (!guard) return;
  for (const type of ['mouseover', 'mouseout']) {
    timeline.root.removeEventListener(type, guard.guardHover, true);
  }
  delete timeline.root.__aoe4SummaryActiveChart;
  delete timeline.root.__aoe4SummaryHoverGuard;
}

export function attachPlayerToggle(timeline: TimelineElements, chart: Chart): void {
  detachPlayerToggle(timeline);
  const summary = timeline.__aoe4Summary;
  const players: PlayerSummary[] = Array.isArray(summary?.players) ? summary.players : [];
  const rows = [...timeline.root.querySelectorAll<HTMLElement>(TIMELINE_PLAYER_ROW_SELECTOR)];
  const matchedRows = rows.map(row => {
    const text = normalizeName(nativePlayerRowText(row));
    const player = players.find((candidate: PlayerSummary) => {
      const name = normalizeName(candidate.name);
      return name && text.includes(name);
    });
    return player?.name
      ? {
          row,
          playerName: player.name,
          previousRole: row.getAttribute('role'),
          previousAriaChecked: row.getAttribute('aria-checked'),
        }
      : null;
  }).filter((entry): entry is {
    row: HTMLElement;
    playerName: string;
    previousRole: string | null;
    previousAriaChecked: string | null;
  } => Boolean(entry));
  const handlers: PlayerToggleHandler[] = [];
  const radioMode = chart.type === 'villager-efficiency';
  let selectedPlayerName: string | null = chart._selectedPlayerName || null;

  const syncRow = (row: HTMLElement, playerName: string, hidden: boolean): void => {
    row.style.opacity = hidden ? '0.35' : '';
    if (radioMode) {
      row.setAttribute('role', 'radio');
      row.setAttribute('aria-checked', String(!hidden));
    }
    const wasOpen = row.dataset.aoe4LegendOpen === '1';
    const inlineSummary = row.querySelector<HTMLElement>('.aoe4-inline-legend-summary');
    const chevronEl = row.querySelector<HTMLElement>('.aoe4-inline-legend-chevron');
    const panel = [...(row.parentElement?.querySelectorAll<HTMLElement>('.aoe4-legend-breakdown') || [])]
      .find(node => node.dataset.playerName === playerName);
    if (inlineSummary) inlineSummary.style.display = hidden ? 'none' : (wasOpen ? 'none' : '');
    if (chevronEl) chevronEl.style.display = hidden ? 'none' : '';
    if (panel) panel.style.display = hidden ? 'none' : (wasOpen ? '' : 'none');
  };

  const showOnlyPlayer = (playerName: string): void => {
    for (const series of chart.data.series) {
      if (!series.playerName) continue;
      series._hidden = series.playerName !== playerName;
    }
  };

  const refreshVisibleGeometry = (): void => {
    delete chart._cachedPlotH;
    delete chart._cachedMarginTop;
    delete chart._cachedYMin;
    delete chart._cachedYMax;
    delete chart._renderedY;
    recomputeVisibleGeometry(chart);
  };

  const selectOnlyPlayer = (playerName: string): void => {
    selectedPlayerName = playerName;
    chart._selectedPlayerName = playerName;
    chart.highlightKey = null;
    showOnlyPlayer(playerName);
    for (const entry of matchedRows) {
      syncRow(entry.row, entry.playerName, entry.playerName !== playerName);
    }
  };

  if (radioMode) {
    const chartPlayerNames = [...new Set(
      chart.data.series.map(series => series.playerName).filter((name): name is string => Boolean(name))
    )];
    const visiblePlayerNames = chartPlayerNames.filter(playerName =>
      chart.data.series.some(series => series.playerName === playerName && !series._hidden)
    );
    const persistedPlayerName = chart._selectedPlayerName && chartPlayerNames.includes(chart._selectedPlayerName)
      ? chart._selectedPlayerName
      : null;
    selectedPlayerName = persistedPlayerName || (
      visiblePlayerNames.length === 1
        ? visiblePlayerNames[0]
        : matchedRows[0]?.playerName || chart.nativePlayerOrder?.[0] || chartPlayerNames[0]
    );
    if (selectedPlayerName) {
      selectOnlyPlayer(selectedPlayerName);
      recomputeVisibleGeometry(chart);
    }
  }

  for (const {
    row,
    playerName,
    previousRole,
    previousAriaChecked,
  } of matchedRows) {
    const iconWrapper = row.firstElementChild;
    const nameEl = row.querySelector<HTMLElement>(TIMELINE_PLAYER_NAME_SELECTOR);
    const onClick = (e: MouseEvent): void => {
      const target = e.target as (Element & Node) | null;
      if (target?.closest?.('.aoe4-inline-legend-summary, .aoe4-inline-legend-chevron, .aoe4-legend-breakdown')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const onIcon = !!(iconWrapper && target && iconWrapper.contains(target));
      const onName = !!(nameEl && target && nameEl.contains(target));
      if (!onIcon && !onName) return;
      const seriesForPlayer = chart.data.series.filter(s =>
        s.playerName === playerName || s.label === playerName
      );
      if (radioMode) {
        selectOnlyPlayer(playerName);
      } else {
        const anyVisible = seriesForPlayer.some(s => !s._hidden);
        for (const series of seriesForPlayer) series._hidden = anyVisible;
        syncRow(row, playerName, anyVisible);
      }
      refreshVisibleGeometry();
      drawTimelineCanvasChart(timeline.canvas, chart);
    };
    row.addEventListener('click', onClick, true);
    const highlightKeyForPlayer = chart.type === 'army' || chart.type === 'villager-efficiency'
      ? playerCacheKey(playerName)
      : chart.data.series.find(s => s.playerName === playerName || s.label === playerName)?.key || null;
    if (highlightKeyForPlayer) {
      const onEnter = (event: MouseEvent): void => {
        if (shouldSuppressHover(timeline, event)) return;
        if (radioMode) {
          showOnlyPlayer(playerName);
          refreshVisibleGeometry();
        }
        chart.highlightKey = highlightKeyForPlayer;
        drawTimelineCanvasChartForHover(timeline.canvas, chart);
      };
      const onLeave = (event: MouseEvent): void => {
        if (shouldSuppressHover(timeline, event)) return;
        let shouldRedraw = false;
        if (radioMode && selectedPlayerName) {
          showOnlyPlayer(selectedPlayerName);
          refreshVisibleGeometry();
          shouldRedraw = true;
        }
        if (chart.highlightKey === highlightKeyForPlayer) {
          chart.highlightKey = null;
          shouldRedraw = true;
        }
        if (shouldRedraw) drawTimelineCanvasChartForHover(timeline.canvas, chart);
      };
      row.addEventListener('mouseenter', onEnter);
      row.addEventListener('mouseleave', onLeave);
      handlers.push({
        row,
        onClick,
        onEnter,
        onLeave,
        ...(radioMode ? { previousRole, previousAriaChecked } : {}),
      });
    } else {
      handlers.push({
        row,
        onClick,
        ...(radioMode ? { previousRole, previousAriaChecked } : {}),
      });
    }
  }
  timeline.__aoe4PlayerToggleHandlers = handlers;
  timeline.__aoe4PlayerToggleRestore = radioMode
    ? () => {
        if (!selectedPlayerName) return;
        showOnlyPlayer(selectedPlayerName);
        chart.highlightKey = null;
        refreshVisibleGeometry();
      }
    : null;
}

export function detachPlayerToggle(timeline: TimelineElements): void {
  timeline.__aoe4PlayerToggleRestore?.();
  timeline.__aoe4PlayerToggleRestore = null;
  const handlers = timeline.__aoe4PlayerToggleHandlers;
  if (!handlers) return;
  for (const h of handlers) {
    h.row.removeEventListener('click', h.onClick, true);
    if (h.onEnter) h.row.removeEventListener('mouseenter', h.onEnter);
    if (h.onLeave) h.row.removeEventListener('mouseleave', h.onLeave);
    h.row.style.opacity = '';
    if ('previousRole' in h) {
      if (h.previousRole == null) h.row.removeAttribute('role');
      else h.row.setAttribute('role', h.previousRole);
      if (h.previousAriaChecked == null) h.row.removeAttribute('aria-checked');
      else h.row.setAttribute('aria-checked', h.previousAriaChecked);
    }
  }
  delete timeline.__aoe4PlayerToggleHandlers;
}

export function recomputeVisibleGeometry(chart: Chart): void {
  if (chart.type === 'army') precomputeStackedValues(chart.data.series);
  const allSeries = chart.data.series;
  let yMin = 0;
  let yMax = 1;
  for (const series of allSeries) {
    if (series._hidden || series.render === 'metric') continue;
    const vals = (chart.type === 'army' && series._stackTop) ? series._stackTop : series.values;
    for (const value of vals) {
      if (value < yMin) yMin = value;
      if (value > yMax) yMax = value;
    }
  }
  for (const band of chart.bands || []) {
    if (!allSeries.some(series =>
      series.playerName === band.playerName && !series._hidden
    )) continue;
    for (const value of band.fromValues) if (value < yMin) yMin = value;
  }
  const villagerTarget = chart.type === 'villager-efficiency'
    ? Number(chart.options?.villagerTarget)
    : Number.NaN;
  if (Number.isFinite(villagerTarget) && villagerTarget > 0) {
    if (chart.options?.villagerCropToTarget === true) {
      const geometry = niceGeometryForChart(chart.type, yMin, villagerTarget);
      chart._geometry = { yMin: geometry.yMin, yMax: villagerTarget };
    } else {
      chart._geometry = niceGeometryForChart(chart.type, yMin, Math.max(yMax, villagerTarget));
    }
  } else {
    chart._geometry = niceGeometryForChart(chart.type, yMin, yMax);
  }

  const numSamples = chart.data.labels.length;
  const tooltipRows: TooltipCacheRow[][] = new Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const rows: TooltipCacheRow[] = [];
    for (let s = 0; s < allSeries.length; s++) {
      const item = allSeries[s];
      if (item._hidden) continue;
      const value = item.values[i] || 0;
      const previous = i > 0 ? (item.values[i - 1] || 0) : value;
      const next = i < numSamples - 1 ? (item.values[i + 1] || 0) : value;
      const delta = chart.type === 'army'
        ? Math.abs(value) - Math.abs(previous)
        : 0;
      if (chart.type === 'army' && Math.abs(value) === 0 &&
          Math.abs(previous) === 0 && Math.abs(next) === 0) continue;
      rows.push({ seriesIdx: s, value, previous, next, delta });
    }
    if (chart.type !== 'army' && chart.type !== 'villager-efficiency' && rows.length) {
      const maxValue = rows.reduce((max, row) => Math.max(max, row.value), -Infinity);
      for (const row of rows) row.delta = row.value - maxValue;
    }
    if (chart.type !== 'villager-efficiency') {
      rows.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    }
    tooltipRows[i] = rows;
  }
  chart._tooltipRows = tooltipRows;
}
