import type { Chart, LegendNodeMeta, LegendSummaryNode, LegendUnitNode } from './types.ts';

type ArmyLegendMetrics = Pick<
  typeof import('./army-legend-metrics.ts'),
  'activeAt' | 'formatArmyMetric' | 'formatArmySummary' | 'rangeStats'
>;

export const {
  activeAt,
  formatArmyMetric,
  formatArmySummary,
  rangeStats,
} = (globalThis as typeof globalThis & {
  __aoe4CombatMetrics: ArmyLegendMetrics;
}).__aoe4CombatMetrics;

export function isSummaryNode(key: string, _meta: LegendNodeMeta): _meta is LegendSummaryNode {
  return key.startsWith('__summary__');
}

export function isUnitNode(key: string, _meta: LegendNodeMeta): _meta is LegendUnitNode {
  return !key.startsWith('__summary__');
}

export function updateLegendLive(chart: Chart, index: number, closestKey: string | null | undefined): void {
  const nodes = chart._legendNodes;
  if (!nodes || !nodes.size) return;
  const valueMode = chart.options?.armyMode === 'value';

  const expandedPlayers = new Set<string>();
  for (const [key, meta] of nodes) {
    if (!isSummaryNode(key, meta)) continue;
    if (meta.panelEl.style.display !== 'none') {
      expandedPlayers.add(key.slice(11));
    }
  }

  const series = chart.data.series;
  const numSamples = chart.data.labels.length;
  for (const item of series) {
    if (!item.key || !item.playerName || !expandedPlayers.has(item.playerName)) continue;
    const node = nodes.get(item.key);
    if (!node || !isUnitNode(item.key, node)) continue;
    const countValues = item._countValues || item.values;
    const valueValues = item._valueValues || item.values;
    const count = activeAt(countValues, index);
    const previousCount = index > 0 ? activeAt(countValues, index - 1) : count;
    const nextCount = index < numSamples - 1 ? activeAt(countValues, index + 1) : count;
    const value = valueMode ? activeAt(valueValues, index) : count;
    const previousValue = index > 0
      ? (valueMode ? activeAt(valueValues, index - 1) : previousCount)
      : value;

    const isTransition = count === 0 && (previousCount !== 0 || nextCount !== 0);
    if (count === 0 && !isTransition) {
      node.rowEl.style.display = 'none';
      continue;
    }
    node.rowEl.style.display = '';

    const text = formatArmyMetric(value, count, valueMode, true);
    if (node.totalEl.textContent !== text) node.totalEl.textContent = text;
    const countDelta = count - previousCount;
    const valueDelta = value - previousValue;
    if (countDelta === 0 && valueDelta === 0) {
      setDeltaCells(node, null, null);
    } else {
      setDeltaCells(
        node,
        Math.max(0, valueDelta),
        Math.max(0, -valueDelta),
        valueMode,
        Math.max(0, countDelta),
        Math.max(0, -countDelta),
      );
    }
    if (closestKey === item.key) node.rowEl.classList.add('is-closest');
    else node.rowEl.classList.remove('is-closest');
  }

  for (const [key, meta] of nodes) {
    if (!isSummaryNode(key, meta)) continue;
    const parts: string[] = [];
    for (const u of meta.units) {
      const count = activeAt(u._countValues || u.values, index);
      if (count > 0) {
        const value = valueMode ? activeAt(u._valueValues || u.values, index) : count;
        parts.push(`${u.unitLabel || u.label}: ${formatArmyMetric(value, count, valueMode)}`);
      }
    }
    const text = parts.join(', ') || '—';
    if (meta.summaryLabelEl.textContent !== text) meta.summaryLabelEl.textContent = text;
  }
}

export function resetLegendSummary(chart: Chart): void {
  const nodes = chart._legendNodes;
  if (!nodes) return;
  const valueMode = chart.options?.armyMode === 'value';

  for (const [key, node] of nodes) {
    if (!isUnitNode(key, node)) continue;
    node.rowEl.style.display = '';
    const count = node.summaryTotal;
    const value = valueMode ? (node.summaryValue || 0) : count;
    const text = formatArmyMetric(value, count, valueMode);
    if (node.totalEl.textContent !== text) node.totalEl.textContent = text;
    setDeltaCells(node, null, null);
    node.rowEl.classList.remove('is-closest');
  }

  for (const [key, meta] of nodes) {
    if (!isSummaryNode(key, meta)) continue;
    const text = formatArmySummary(meta.units, valueMode);
    if (meta.summaryLabelEl.textContent !== text) meta.summaryLabelEl.textContent = text;
  }
}

export function setDeltaCells(
  node: LegendUnitNode | null | undefined,
  trained: number | null,
  lost: number | null,
  valueMode = false,
  trainedCount = trained,
  lostCount = lost,
): void {
  if (!node?.deltaTrainedEl || !node?.deltaLostEl) return;
  if (trained == null && lost == null) {
    if (node.deltaTrainedEl.textContent !== '') node.deltaTrainedEl.textContent = '';
    if (node.deltaLostEl.textContent !== '') node.deltaLostEl.textContent = '';
    node.deltaTrainedEl.classList.remove('is-zero');
    node.deltaLostEl.classList.remove('is-zero');
    return;
  }
  const t = formatArmyMetric(trained || 0, trainedCount || 0, valueMode, true);
  const l = formatArmyMetric(lost || 0, lostCount || 0, valueMode, true);
  if (node.deltaTrainedEl.textContent !== t) node.deltaTrainedEl.textContent = t;
  if (node.deltaLostEl.textContent !== l) node.deltaLostEl.textContent = l;
  node.deltaTrainedEl.classList.remove('is-zero');
  node.deltaLostEl.classList.remove('is-zero');
}
