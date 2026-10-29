import { drawTimelineCanvasChart } from './canvas-render.ts';
import { recomputeVisibleGeometry } from './interactions.ts';
import type { Chart, TimelineElements } from './types.ts';

const CONTROL_CLASS = 'aoe4-villager-cap-control';
const STORAGE_KEY = 'aoe4plus.villagerSoftCap';
const DEFAULT_SOFT_CAP = 120;

type ApplyVillagerSoftCap = (chart: Chart, softCap: number) => void;

function safeGetStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function normalizeSoftCap(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : DEFAULT_SOFT_CAP;
}

export function getActiveVillagerSoftCap(): number {
  const raw = safeGetStorage()?.getItem(STORAGE_KEY);
  return normalizeSoftCap(Number(raw ?? DEFAULT_SOFT_CAP));
}

export function setActiveVillagerSoftCap(value: number): number {
  const cap = normalizeSoftCap(value);
  try {
    safeGetStorage()?.setItem(STORAGE_KEY, String(cap));
  } catch {
    // ignored
  }
  return cap;
}

export function detachVillagerSoftCapControl(timeline: TimelineElements): void {
  const existing = timeline.__aoe4VillagerCapControl;
  if (existing?.parentElement) existing.parentElement.removeChild(existing);
  timeline.__aoe4VillagerCapControl = null;
  const orphans = timeline.chartBox?.querySelectorAll(`.${CONTROL_CLASS}`);
  if (orphans) {
    for (const node of orphans) node.parentElement?.removeChild(node);
  }
}

export function renderVillagerSoftCapControl(
  timeline: TimelineElements,
  chart: Chart,
  applySoftCap: ApplyVillagerSoftCap,
): void {
  detachVillagerSoftCapControl(timeline);
  if (chart.type !== 'villager-efficiency') return;
  const chartBox = timeline.chartBox;
  if (!chartBox) return;

  const initialCap = getActiveVillagerSoftCap();
  applySoftCap(chart, initialCap);
  recomputeVisibleGeometry(chart);

  const container = document.createElement('div');
  container.className = CONTROL_CLASS;

  const label = document.createElement('label');
  label.textContent = 'Soft cap';
  label.title = 'Stop counting missed production after the ideal reaches this villager count';

  const input = document.createElement('input');
  input.type = 'number';
  input.className = `${CONTROL_CLASS}-input`;
  input.min = '1';
  input.step = '1';
  input.value = String(initialCap);
  input.setAttribute('aria-label', 'Villager ideal soft cap');
  label.appendChild(input);
  container.appendChild(label);

  const computedPos = (chartBox.style.position || '').trim();
  if (!computedPos || computedPos === 'static') chartBox.style.position = 'relative';

  const commit = (): void => {
    const cap = setActiveVillagerSoftCap(Number(input.value));
    input.value = String(cap);
    applySoftCap(chart, cap);
    recomputeVisibleGeometry(chart);
    drawTimelineCanvasChart(timeline.canvas, chart);
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commit();
    input.blur();
  });

  chartBox.appendChild(container);
  timeline.__aoe4VillagerCapControl = container;
}
