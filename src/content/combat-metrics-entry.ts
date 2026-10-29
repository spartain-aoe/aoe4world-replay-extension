import {
  applyVillagerEfficiencyTarget,
  buildVillagerEfficiencyCharts,
} from './chart-villagers.ts';
import {
  clearDetailsTableMetrics,
  scheduleDetailsTableMetrics,
} from './details-metrics.ts';
import { ensurePbgidMap } from './pbgid-map.ts';

const combatMetrics = {
  applyVillagerEfficiencyTarget,
  buildVillagerEfficiencyCharts,
  clearDetailsTableMetrics,
  ensureData: ensurePbgidMap,
  scheduleDetailsTableMetrics,
};

(globalThis as typeof globalThis & {
  __aoe4CombatMetrics: typeof combatMetrics;
}).__aoe4CombatMetrics = combatMetrics;
