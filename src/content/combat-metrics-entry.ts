import { buildVillagerCombatCharts } from './chart-villagers.ts';
import {
  clearDetailsTableMetrics,
  scheduleDetailsTableMetrics,
} from './details-metrics.ts';

const combatMetrics = {
  buildVillagerCombatCharts,
  clearDetailsTableMetrics,
  scheduleDetailsTableMetrics,
};

(globalThis as typeof globalThis & {
  __aoe4CombatMetrics: typeof combatMetrics;
}).__aoe4CombatMetrics = combatMetrics;
