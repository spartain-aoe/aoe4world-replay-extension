import type { PbgidEntry } from './types.ts';
import { pbgidUnitOverridesMap } from './pbgid-overrides.ts';

interface PbgidMapResponse {
  units?: Record<string, PbgidEntry>;
  technologies?: Record<string, PbgidEntry>;
  upgrades?: Record<string, PbgidEntry>;
}

export const PBGID_MAP_URL = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
  ? chrome.runtime.getURL('data/pbgid-map.json')
  : '';

export const pbgidUnitsMap: Map<number, PbgidEntry> = new Map();
export const pbgidTechsMap: Map<number, PbgidEntry> = new Map();
export const pbgidUpgradesMap: Map<number, PbgidEntry> = new Map();
// Secondary index: family merge-key → cost total. Built from pbgidUnitsMap
// after load. Used as a fallback in `unitCostForItem` for pbgids that resolve
// only via `pbgid-overrides.ts` (which carry display info but no `c`) or for
// fresh pbgids missing from `units/all-optimized.json` entirely.
export const pbgidUnitCostByKey: Map<string, number> = new Map();
let pbgidMapLoaded = false;
let pbgidMapPromise: Promise<void> | null = null;

export function isPbgidMapLoaded(): boolean { return pbgidMapLoaded; }

function rebuildCostByKeyIndex(): void {
  pbgidUnitCostByKey.clear();
  for (const entry of pbgidUnitsMap.values()) {
    if (!entry || typeof entry.c !== 'number' || entry.c <= 0) continue;
    const key = entry.k;
    if (!key) continue;
    if (!pbgidUnitCostByKey.has(key)) pbgidUnitCostByKey.set(key, entry.c);
  }
}

export function lookupCostByMergeKey(key: string | null | undefined): number {
  if (!key) return 0;
  const direct = pbgidUnitCostByKey.get(key);
  if (typeof direct === 'number' && direct > 0) return direct;
  // pbgid-map keys are kebab-case ('iron-pagoda'); icon-derived keys are
  // snake_case ('iron_pagoda'). Normalize before giving up.
  const normalized = key.replace(/_/g, '-');
  if (normalized !== key) {
    const alt = pbgidUnitCostByKey.get(normalized);
    if (typeof alt === 'number' && alt > 0) return alt;
  }
  return 0;
}

export function ensurePbgidMap(onLoaded?: () => void): Promise<void> {
  if (pbgidMapLoaded) return Promise.resolve();
  if (!pbgidMapPromise) {
    pbgidMapPromise = (PBGID_MAP_URL ? fetch(PBGID_MAP_URL) : Promise.reject(new Error('no_runtime_url')))
      .then(r => r.ok ? r.json() as Promise<PbgidMapResponse> : Promise.reject(new Error('http_' + r.status)))
      .then(json => {
        for (const [pbgid, entry] of Object.entries(json.units || {})) pbgidUnitsMap.set(Number(pbgid), entry);
        for (const [pbgid, entry] of Object.entries(json.technologies || {})) pbgidTechsMap.set(Number(pbgid), entry);
        for (const [pbgid, entry] of Object.entries(json.upgrades || {})) pbgidUpgradesMap.set(Number(pbgid), entry);
        rebuildCostByKeyIndex();
        pbgidMapLoaded = true;
      })
      .catch((err: unknown) => {
        const error = err as { message?: unknown };
        console.warn('[aoe4-charts] pbgid-map load failed; will retry on next call:', error.message || err);
        pbgidMapPromise = null;
      });
  }
  if (typeof onLoaded === 'function') {
    pbgidMapPromise.then(() => { if (pbgidMapLoaded) onLoaded(); });
  }
  return pbgidMapPromise;
}

export function resolveUnitByPbgid(pbgid: number | null | undefined): PbgidEntry | null {
  if (!pbgid) return null;
  const id = Number(pbgid);
  return pbgidUnitsMap.get(id) || pbgidUnitOverridesMap.get(id) || null;
}

export function resolveTechByPbgid(pbgid: number | null | undefined): PbgidEntry | null {
  if (!pbgid) return null;
  return pbgidTechsMap.get(Number(pbgid)) || null;
}

export function resolveUpgradeByPbgid(pbgid: number | null | undefined): PbgidEntry | null {
  if (!pbgid) return null;
  return pbgidUpgradesMap.get(Number(pbgid)) || null;
}
