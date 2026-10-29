import { resolveUnitByPbgid } from './pbgid-map.ts';
import { lookupUnitDataByPbgid, lookupUnitDataForIcon } from './unit-data-cache.ts';
import type { BuildOrderItem, PlayerSummary } from './types.ts';

export function isVillagerUnit(item: BuildOrderItem, player: PlayerSummary): boolean {
  if (item.type !== 'Unit') return false;
  const mapped = resolveUnitByPbgid(item.pbgid);
  const data = lookupUnitDataByPbgid(item.pbgid, player) || lookupUnitDataForIcon(item.icon, player);
  return [item.icon, mapped?.k, mapped?.n, data?.id, data?.name, data?.displayName]
    .some(value => /\b(?:villager|worker)\b/i.test(String(value || '').replace(/[-_/\\]+/g, ' ')));
}
