import {
  applyVillagerEfficiencyTarget,
  buildVillagerEfficiencyCharts,
} from './chart-villagers.ts';
import {
  clearDetailsTableMetrics,
  scheduleDetailsTableMetrics,
} from './details-metrics.ts';
import {
  activeAt,
  formatArmyMetric,
  formatArmySummary,
  rangeStats,
} from './army-legend-metrics.ts';
import { ensurePbgidMap } from './pbgid-map.ts';

const combatMetrics = {
  activeAt,
  applyVillagerEfficiencyTarget,
  buildVillagerEfficiencyCharts,
  clearDetailsTableMetrics,
  ensureData: ensurePbgidMap,
  formatArmyMetric,
  formatArmySummary,
  rangeStats,
  scheduleDetailsTableMetrics,
};

(globalThis as typeof globalThis & {
  __aoe4CombatMetrics: typeof combatMetrics;
}).__aoe4CombatMetrics = combatMetrics;
