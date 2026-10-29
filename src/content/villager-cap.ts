import { drawTimelineCanvasChart } from './canvas-render.ts';
import { recomputeVisibleGeometry } from './interactions.ts';
import type { Chart, TimelineElements } from './types.ts';

const CONTROL_CLASS = 'aoe4-villager-cap-control';
const STORAGE_KEY = 'aoe4plus.villagerSoftCap';
const CROP_STORAGE_KEY = 'aoe4plus.villagerCropToSoftCap';
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

export function getActiveVillagerCropToSoftCap(): boolean {
  return safeGetStorage()?.getItem(CROP_STORAGE_KEY) === 'true';
}

export function setActiveVillagerCropToSoftCap(value: boolean): boolean {
  const crop = value === true;
  try {
    safeGetStorage()?.setItem(CROP_STORAGE_KEY, String(crop));
  } catch {
    // ignored
  }
  return crop;
}

function cropIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2');
  svg.appendChild(path);
  return svg;
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
  const initialCrop = getActiveVillagerCropToSoftCap();
  chart.options = {
    ...(chart.options || {}),
    villagerCropToSoftCap: initialCrop,
  };
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

  const cropButton = document.createElement('button');
  cropButton.type = 'button';
  cropButton.className = `${CONTROL_CLASS}-crop`;
  cropButton.title = 'Crop chart vertically at the villager soft cap';
  cropButton.setAttribute('aria-label', 'Crop chart to villager soft cap');
  cropButton.setAttribute('aria-pressed', String(initialCrop));
  cropButton.appendChild(cropIcon());
  container.appendChild(cropButton);

  const computedPos = (chartBox.style.position || '').trim();
  if (!computedPos || computedPos === 'static') chartBox.style.position = 'relative';

  const commit = (): void => {
    const cap = setActiveVillagerSoftCap(Number(input.value));
    input.value = String(cap);
    applySoftCap(chart, cap);
    recomputeVisibleGeometry(chart);
    drawTimelineCanvasChart(timeline.canvas, chart);
  };
  const toggleCrop = (): void => {
    const crop = setActiveVillagerCropToSoftCap(
      chart.options?.villagerCropToSoftCap !== true,
    );
    chart.options = {
      ...(chart.options || {}),
      villagerCropToSoftCap: crop,
    };
    cropButton.setAttribute('aria-pressed', String(crop));
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
  cropButton.addEventListener('click', toggleCrop);

  chartBox.appendChild(container);
  timeline.__aoe4VillagerCapControl = container;
}
