import { drawTimelineCanvasChart } from './canvas-render.ts';
import { recomputeVisibleGeometry } from './interactions.ts';
import type { Chart, ChartSeries, TimelineElements } from './types.ts';

export type ArmyMode = 'count' | 'value';

const STORAGE_KEY = 'aoe4plus.armyMode';

function safeGetStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function getActiveArmyMode(): ArmyMode {
  const storage = safeGetStorage();
  const raw = storage?.getItem(STORAGE_KEY);
  return raw === 'value' ? 'value' : 'count';
}

export function setActiveArmyMode(mode: ArmyMode): void {
  const storage = safeGetStorage();
  try {
    storage?.setItem(STORAGE_KEY, mode);
  } catch {
    // ignored
  }
}

// Swap each series' active `values` to the count- or value-mode array, then
// recompute stacking, geometry, and tooltip-row caches so the chart redraws
// correctly under the new mode.
export function applyArmyModeToChart(chart: Chart, mode: ArmyMode): void {
  if (chart.type !== 'army') return;
  chart.options = { ...(chart.options || {}), armyMode: mode };
  for (const series of chart.data.series as ChartSeries[]) {
    if (mode === 'value' && Array.isArray(series._valueValues)) {
      series.values = series._valueValues;
    } else if (Array.isArray(series._countValues)) {
      series.values = series._countValues;
    }
  }
  delete chart._cachedPlotH;
  delete chart._cachedMarginTop;
  delete chart._cachedYMin;
  delete chart._cachedYMax;
  delete chart._renderedY;
  recomputeVisibleGeometry(chart);
}

// True only when at least one series has non-zero value-mode data. Toggle stays
// disabled (but visible) when unit-cost data hasn't loaded yet so users see the
// feature without it doing nothing on click.
export function chartHasValueData(chart: Chart): boolean {
  if (chart.type !== 'army') return false;
  for (const series of chart.data.series as ChartSeries[]) {
    const arr = series._valueValues;
    if (!Array.isArray(arr)) continue;
    for (const value of arr) if (Math.abs(value) > 0) return true;
  }
  return false;
}

const TOGGLE_CLASS = 'aoe4-army-mode-toggle';

export function detachArmyModeToggle(timeline: TimelineElements): void {
  const existing = timeline.__aoe4ArmyModeToggle;
  if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
  timeline.__aoe4ArmyModeToggle = null;
  // Also nuke any orphans that may have been left behind across re-renders.
  const orphans = timeline.chartBox?.querySelectorAll(`.${TOGGLE_CLASS}`);
  if (orphans) {
    for (const node of orphans) node.parentElement?.removeChild(node);
  }
}

export function renderArmyModeToggle(timeline: TimelineElements, chart: Chart): void {
  detachArmyModeToggle(timeline);
  if (chart.type !== 'army') return;
  const chartBox = timeline.chartBox;
  if (!chartBox) return;

  const initialMode = (chart.options?.armyMode === 'value' || chart.options?.armyMode === 'count')
    ? chart.options.armyMode as ArmyMode
    : getActiveArmyMode();
  applyArmyModeToChart(chart, initialMode);

  const container = document.createElement('div');
  container.className = TOGGLE_CLASS;
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Army composition mode');
  container.dataset.mode = initialMode;

  const computedPos = (chartBox.style.position || '').trim();
  if (!computedPos || computedPos === 'static') chartBox.style.position = 'relative';

  const makeButton = (mode: ArmyMode, label: string, title: string): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${TOGGLE_CLASS}-btn`;
    btn.dataset.mode = mode;
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute('aria-pressed', String(mode === initialMode));
    return btn;
  };

  const countBtn = makeButton('count', 'Count', 'Show active unit counts');
  const valueBtn = makeButton('value', 'Value', 'Show active resource value (food+wood+gold+stone)');
  container.append(countBtn, valueBtn);

  const setMode = (mode: ArmyMode): void => {
    container.dataset.mode = mode;
    countBtn.setAttribute('aria-pressed', String(mode === 'count'));
    valueBtn.setAttribute('aria-pressed', String(mode === 'value'));
    setActiveArmyMode(mode);
    applyArmyModeToChart(chart, mode);
    drawTimelineCanvasChart(timeline.canvas, chart);
  };

  countBtn.addEventListener('click', (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMode('count');
  });
  valueBtn.addEventListener('click', (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMode('value');
  });

  chartBox.appendChild(container);
  timeline.__aoe4ArmyModeToggle = container;
}
