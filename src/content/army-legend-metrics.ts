import type { ChartSeries } from './types.ts';

type RangeItem = {
  _finishedTimes?: number[];
  _destroyedTimes?: number[];
  _finishedCosts?: number[];
  _destroyedCosts?: number[];
};

export function activeAt(values: number[] | undefined, index: number): number {
  return Math.max(0, Math.round(Math.abs(values?.[index] || 0)));
}

export function formatArmyMetric(value: number, count: number, valueMode: boolean): string {
  const formatted = Math.round(Math.abs(value || 0)).toLocaleString();
  return valueMode
    ? `${formatted} (${Math.round(Math.abs(count || 0)).toLocaleString()})`
    : formatted;
}

export function formatArmySummary(units: ChartSeries[], valueMode: boolean): string {
  return units.map(unit => (unit.unitLabel || unit.label || '') + (
    valueMode ? `: ${formatArmyMetric(unit._valueTotal || 0, unit.createdTotal || 0, true)}` : ''
  )).join(', ');
}

function totalInRange(times: number[] | undefined, weights: number[] | undefined, t0: number, t1: number): number {
  let total = 0;
  for (let i = 0; i < (times?.length || 0); i++) {
    const time = times?.[i] || 0;
    if (time <= t0) continue;
    if (time > t1) break;
    total += weights ? (weights[i] || 0) : 1;
  }
  return total;
}

export function rangeStats(
  item: RangeItem,
  values: number[] | undefined,
  startIdx: number,
  endIdx: number,
  t0: number,
  t1: number,
  weighted = false,
): [number, number, number, number] {
  const initial = activeAt(values, startIdx);
  const end = activeAt(values, endIdx);
  const trained = Math.round(totalInRange(
    item._finishedTimes,
    weighted ? item._finishedCosts : undefined,
    t0,
    t1,
  ));
  const rawLost = Math.round(totalInRange(
    item._destroyedTimes,
    weighted ? item._destroyedCosts : undefined,
    t0,
    t1,
  ));
  return [initial, end, trained, Math.min(initial + trained, Math.max(rawLost, initial + trained - end))];
}
