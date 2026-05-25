import type { ChartSeries } from './types.ts';

export const RESOURCE_KEYS = ['food', 'wood', 'gold', 'stone', 'oliveoil', 'silver'];
export const RESOURCE_LABELS = { food: 'Food', wood: 'Wood', gold: 'Gold', stone: 'Stone', oliveoil: 'Olive Oil', silver: 'Silver' };
export const RESOURCE_SAMPLE_SECONDS = 20;
export const SUMMARY_PLUS_PREFIX = 'aoe4plus:';

export function numericArray(values: unknown): number[] {
  return Array.isArray(values) ? values.map(Number).filter(Number.isFinite) : [];
}

export function maxAbs(values: readonly number[]): number {
  return values.reduce((max, value) => Math.max(max, Math.abs(value || 0)), 0);
}

export function buildSampleLabels(duration: number, step: number): number[] {
  const end = Math.max(0, Math.ceil(duration / step) * step);
  const labels: number[] = [];
  for (let second = 0; second <= end; second += step) labels.push(second);
  return labels;
}

export function activeCountValues(labels: readonly number[], finished: readonly number[], destroyed: readonly number[]): number[] {
  const created = [...finished].sort((a, b) => a - b);
  const lost = [...destroyed].sort((a, b) => a - b);
  return activeCountValuesFromSorted(labels, created, lost);
}

export function activeCountValuesFromSorted(labels: readonly number[], created: readonly number[], lost: readonly number[]): number[] {
  let createdIndex = 0;
  let lostIndex = 0;
  return labels.map(time => {
    while (createdIndex < created.length && created[createdIndex] <= time) createdIndex++;
    while (lostIndex < lost.length && lost[lostIndex] <= time) lostIndex++;
    return Math.max(0, createdIndex - lostIndex);
  });
}

// Cost-weighted active series. finishedCosts/destroyedCosts must be parallel arrays to
// finished/destroyed times (same index = same event). Missing cost entries are treated as 0.
export function activeValueValues(
  labels: readonly number[],
  finished: readonly number[],
  finishedCosts: readonly number[],
  destroyed: readonly number[],
  destroyedCosts: readonly number[]
): number[] {
  const created = finished.map((t, i) => ({ t, c: finishedCosts[i] || 0 })).sort((a, b) => a.t - b.t);
  const lost = destroyed.map((t, i) => ({ t, c: destroyedCosts[i] || 0 })).sort((a, b) => a.t - b.t);
  return activeValueValuesFromSorted(
    labels,
    created.map(event => event.t),
    created.map(event => event.c),
    lost.map(event => event.t),
    lost.map(event => event.c),
  );
}

export function activeValueValuesFromSorted(
  labels: readonly number[],
  finished: readonly number[],
  finishedCosts: readonly number[],
  destroyed: readonly number[],
  destroyedCosts: readonly number[]
): number[] {
  let createdIndex = 0;
  let lostIndex = 0;
  let value = 0;
  return labels.map(time => {
    while (createdIndex < finished.length && finished[createdIndex] <= time) {
      value += finishedCosts[createdIndex] || 0;
      createdIndex++;
    }
    while (lostIndex < destroyed.length && destroyed[lostIndex] <= time) {
      value -= destroyedCosts[lostIndex] || 0;
      lostIndex++;
    }
    return Math.max(0, value);
  });
}

export function collapseChartSeries(series: ChartSeries[], limit: number): ChartSeries[] {
  if (series.length <= limit) return series.sort((a, b) => maxAbs(b.values) - maxAbs(a.values));
  const sorted = [...series].sort((a, b) => maxAbs(b.values) - maxAbs(a.values));
  const keep = sorted.slice(0, limit - 1);
  const rest = sorted.slice(limit - 1);
  const otherFinishedEvents: Array<{ time: number; cost: number }> = [];
  const otherDestroyedEvents: Array<{ time: number; cost: number }> = [];
  for (const item of rest) {
    if (item._finishedTimes) {
      for (let i = 0; i < item._finishedTimes.length; i++) {
        otherFinishedEvents.push({ time: item._finishedTimes[i], cost: item._finishedCosts?.[i] || 0 });
      }
    }
    if (item._destroyedTimes) {
      for (let i = 0; i < item._destroyedTimes.length; i++) {
        otherDestroyedEvents.push({ time: item._destroyedTimes[i], cost: item._destroyedCosts?.[i] || 0 });
      }
    }
  }
  otherFinishedEvents.sort((a, b) => a.time - b.time);
  otherDestroyedEvents.sort((a, b) => a.time - b.time);
  const otherFinished = otherFinishedEvents.map(event => event.time);
  const otherDestroyed = otherDestroyedEvents.map(event => event.time);
  const sampleLen = sorted[0].values.length;
  const sumAtIndex = (key: 'values' | '_countValues' | '_valueValues', index: number): number =>
    rest.reduce((sum, item) => {
      const arr = item[key];
      return sum + (arr ? (arr[index] || 0) : 0);
    }, 0);
  const hasCount = rest.some(item => Array.isArray(item._countValues));
  const hasValue = rest.some(item => Array.isArray(item._valueValues));
  const otherCountValues = hasCount
    ? Array.from({ length: sampleLen }, (_, i) => sumAtIndex('_countValues', i))
    : undefined;
  const otherValueValues = hasValue
    ? Array.from({ length: sampleLen }, (_, i) => sumAtIndex('_valueValues', i))
    : undefined;
  const otherValueTotal = rest.reduce((sum, item) => sum + (item._valueTotal || 0), 0);
  const otherSeries: ChartSeries = {
    label: 'Other',
    unitLabel: 'Other',
    color: '#94a3b8',
    iconCandidates: [],
    createdTotal: rest.reduce((sum, item) => sum + (item.createdTotal || 0), 0),
    values: Array.from({ length: sampleLen }, (_, i) => sumAtIndex('values', i)),
    _finishedTimes: otherFinished,
    _destroyedTimes: otherDestroyed,
    _finishedCosts: otherFinishedEvents.map(event => event.cost),
    _destroyedCosts: otherDestroyedEvents.map(event => event.cost),
  };
  if (otherCountValues) otherSeries._countValues = otherCountValues;
  if (otherValueValues) otherSeries._valueValues = otherValueValues;
  if (otherValueTotal > 0) otherSeries._valueTotal = otherValueTotal;
  keep.push(otherSeries);
  return keep;
}
