import { numericArray } from './chart-utils.ts';
import {
  resolveUnitByPbgid,
  villagerProducerMetaMap,
  villagerUnitMetaMap,
} from './pbgid-map.ts';
import { lookupUnitDataByPbgid, lookupUnitDataForIcon } from './unit-data-cache.ts';
import type {
  BuildOrderItem,
  PlayerSummary,
  VillagerProducerMeta,
  VillagerUnitMeta,
} from './types.ts';

const JIN_TRIBUTARY_ESTABLISHED_PBGIDS = new Set([9005189]);

export function isVillagerUnit(item: BuildOrderItem, player: PlayerSummary): boolean {
  if (item.type !== 'Unit') return false;
  if (villagerUnitMetaMap.has(Number(item.pbgid))) return true;
  const mapped = resolveUnitByPbgid(item.pbgid);
  const data = lookupUnitDataByPbgid(item.pbgid, player) || lookupUnitDataForIcon(item.icon, player);
  return [item.icon, mapped?.k, mapped?.n, data?.id, data?.name, data?.displayName]
    .some(value => /\b(?:villager|worker)\b/i.test(String(value || '').replace(/[-_/\\]+/g, ' ')));
}

export function villagerUnitMeta(item: BuildOrderItem): VillagerUnitMeta | null {
  return villagerUnitMetaMap.get(Number(item.pbgid)) || null;
}

export function villagerProducerMeta(item: BuildOrderItem): VillagerProducerMeta | null {
  if (item.type !== 'Building') return null;
  return villagerProducerMetaMap.get(Number(item.pbgid)) || null;
}

export function jinTributaryEstablishedTimes(player: PlayerSummary): number[] {
  if (!/jin(?:[_\s-]*dynasty)?/i.test(String(player.civilization || player.civilizationAttrib || ''))) {
    return [];
  }
  return (player.buildOrder || [])
    .filter(item =>
      JIN_TRIBUTARY_ESTABLISHED_PBGIDS.has(Number(item.pbgid)) ||
      /establish[^/\\]*tributar|tributar[^/\\]*establish/i.test(String(item.icon || ''))
    )
    .flatMap(item => numericArray(item.finished))
    .sort((a, b) => a - b)
    .slice(0, 2);
}
