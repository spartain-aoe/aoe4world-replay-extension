import { drawTimelineCanvasChart } from './canvas-render.ts';
import { recomputeVisibleGeometry } from './interactions.ts';
import type { Chart, TimelineElements } from './types.ts';

const CONTROL_CLASS = 'aoe4-villager-target-control';
const STORAGE_KEY = 'aoe4plus.villagerTarget';
const LEGACY_STORAGE_KEY = 'aoe4plus.villagerSoftCap';
const CROP_STORAGE_KEY = 'aoe4plus.villagerCropToTarget';
const LEGACY_CROP_STORAGE_KEY = 'aoe4plus.villagerCropToSoftCap';
const ADJUST_IDEAL_STORAGE_KEY = 'aoe4plus.villagerAdjustIdealForDeaths';
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

function setStoredBoolean(key: string, value: boolean): boolean {
  const active = value === true;
  try {
    safeGetStorage()?.setItem(key, String(active));
  } catch {
    // ignored
  }
  return active;
}

export function getActiveVillagerCropToTarget(): boolean {
  return migratedStorageValue(CROP_STORAGE_KEY, LEGACY_CROP_STORAGE_KEY) === 'true';
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
  const initialAdjustIdealForDeaths =
    safeGetStorage()?.getItem(ADJUST_IDEAL_STORAGE_KEY) === 'true';
  chart.options = {
    ...(chart.options || {}),
    villagerCropToTarget: initialCrop,
    villagerAdjustIdealForDeaths: initialAdjustIdealForDeaths,
  };
  applyTarget(chart, initialTarget);
  recomputeVisibleGeometry(chart);

  const container = document.createElement('div');
  container.className = CONTROL_CLASS;
  container.innerHTML =
    `<label>Target<input type="number" class="${CONTROL_CLASS}-input" min="1" step="1" aria-label="Villager production target"></label>` +
    `<button type="button" class="${CONTROL_CLASS}-crop" title="Crop chart at villager target" aria-label="Crop chart to villager target"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2"/></svg></button>` +
    `<button type="button" class="${CONTROL_CLASS}-deaths" title="Shift Ideal down on villager deaths" aria-label="Shift ideal for villager deaths"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h6v5h6v5h6"/></svg></button>`;
  const input = container.querySelector('input') as HTMLInputElement;
  const cropButton = container.querySelector(`.${CONTROL_CLASS}-crop`) as HTMLButtonElement;
  const deathsButton = container.querySelector(`.${CONTROL_CLASS}-deaths`) as HTMLButtonElement;
  input.value = String(initialTarget);
  cropButton.setAttribute('aria-pressed', String(initialCrop));
  deathsButton.setAttribute('aria-pressed', String(initialAdjustIdealForDeaths));

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
    const crop = setStoredBoolean(
      CROP_STORAGE_KEY,
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
  const toggleDeathAdjustment = (): void => {
    const adjust = setStoredBoolean(
      ADJUST_IDEAL_STORAGE_KEY,
      chart.options?.villagerAdjustIdealForDeaths !== true,
    );
    chart.options = {
      ...(chart.options || {}),
      villagerAdjustIdealForDeaths: adjust,
    };
    deathsButton.setAttribute('aria-pressed', String(adjust));
    applyTarget(chart, Number(input.value));
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
  deathsButton.addEventListener('click', toggleDeathAdjustment);

  chartBox.appendChild(container);
  timeline.__aoe4VillagerTargetControl = container;
}
