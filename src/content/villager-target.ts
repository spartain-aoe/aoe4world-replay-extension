import { drawTimelineCanvasChart } from './canvas-render.ts';
import { recomputeVisibleGeometry } from './interactions.ts';
import type { Chart, TimelineElements } from './types.ts';

const CONTROL_CLASS = 'aoe4-villager-target-control';
const STORAGE_KEY = 'aoe4plus.villagerTarget';
const LEGACY_STORAGE_KEY = 'aoe4plus.villagerSoftCap';
const CROP_STORAGE_KEY = 'aoe4plus.villagerCropToTarget';
const LEGACY_CROP_STORAGE_KEY = 'aoe4plus.villagerCropToSoftCap';
const DEFAULT_TARGET = 120;

type ApplyVillagerTarget = (chart: Chart, target: number) => void;

function safeGetStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function normalizeTarget(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : DEFAULT_TARGET;
}

function migratedStorageValue(key: string, legacyKey: string): string | null {
  const storage = safeGetStorage();
  if (!storage) return null;
  const current = storage.getItem(key);
  if (current != null) return current;
  const legacy = storage.getItem(legacyKey);
  if (legacy == null) return null;
  try {
    storage.setItem(key, legacy);
    storage.removeItem(legacyKey);
  } catch {
    // ignored
  }
  return legacy;
}

export function getActiveVillagerTarget(): number {
  const raw = migratedStorageValue(STORAGE_KEY, LEGACY_STORAGE_KEY);
  return normalizeTarget(Number(raw ?? DEFAULT_TARGET));
}

export function setActiveVillagerTarget(value: number): number {
  const target = normalizeTarget(value);
  try {
    safeGetStorage()?.setItem(STORAGE_KEY, String(target));
  } catch {
    // ignored
  }
  return target;
}

export function getActiveVillagerCropToTarget(): boolean {
  return migratedStorageValue(CROP_STORAGE_KEY, LEGACY_CROP_STORAGE_KEY) === 'true';
}

export function setActiveVillagerCropToTarget(value: boolean): boolean {
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

export function detachVillagerTargetControl(timeline: TimelineElements): void {
  const existing = timeline.__aoe4VillagerTargetControl;
  if (existing?.parentElement) existing.parentElement.removeChild(existing);
  timeline.__aoe4VillagerTargetControl = null;
  const orphans = timeline.chartBox?.querySelectorAll(`.${CONTROL_CLASS}`);
  if (orphans) {
    for (const node of orphans) node.parentElement?.removeChild(node);
  }
}

export function renderVillagerTargetControl(
  timeline: TimelineElements,
  chart: Chart,
  applyTarget: ApplyVillagerTarget,
): void {
  detachVillagerTargetControl(timeline);
  if (chart.type !== 'villager-efficiency') return;
  const chartBox = timeline.chartBox;
  if (!chartBox) return;

  const initialTarget = getActiveVillagerTarget();
  const initialCrop = getActiveVillagerCropToTarget();
  chart.options = {
    ...(chart.options || {}),
    villagerCropToTarget: initialCrop,
  };
  applyTarget(chart, initialTarget);
  recomputeVisibleGeometry(chart);

  const container = document.createElement('div');
  container.className = CONTROL_CLASS;

  const label = document.createElement('label');
  label.textContent = 'Target';
  label.title = 'Count missed production while actual plus counted missed villagers is below this target';

  const input = document.createElement('input');
  input.type = 'number';
  input.className = `${CONTROL_CLASS}-input`;
  input.min = '1';
  input.step = '1';
  input.value = String(initialTarget);
  input.setAttribute('aria-label', 'Villager production target');
  label.appendChild(input);
  container.appendChild(label);

  const cropButton = document.createElement('button');
  cropButton.type = 'button';
  cropButton.className = `${CONTROL_CLASS}-crop`;
  cropButton.title = 'Crop chart vertically at the villager target';
  cropButton.setAttribute('aria-label', 'Crop chart to villager target');
  cropButton.setAttribute('aria-pressed', String(initialCrop));
  cropButton.appendChild(cropIcon());
  container.appendChild(cropButton);

  const computedPos = (chartBox.style.position || '').trim();
  if (!computedPos || computedPos === 'static') chartBox.style.position = 'relative';

  const commit = (): void => {
    const target = setActiveVillagerTarget(Number(input.value));
    input.value = String(target);
    applyTarget(chart, target);
    recomputeVisibleGeometry(chart);
    drawTimelineCanvasChart(timeline.canvas, chart);
  };
  const toggleCrop = (): void => {
    const crop = setActiveVillagerCropToTarget(
      chart.options?.villagerCropToTarget !== true,
    );
    chart.options = {
      ...(chart.options || {}),
      villagerCropToTarget: crop,
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
  timeline.__aoe4VillagerTargetControl = container;
}
