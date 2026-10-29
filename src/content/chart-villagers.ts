import { normalizeName } from './dom.ts';
import { playerColor } from './colors.ts';
import { buildSampleLabels, numericArray, SUMMARY_PLUS_PREFIX } from './chart-utils.ts';
import { lastResourceTimestamp } from './chart-resources.ts';
import {
  isVillagerUnit,
  jinTributaryEstablishedTimes,
  villagerProducerMeta,
  villagerUnitMeta,
} from './combat-units.ts';
import type {
  BuildOrderItem,
  Chart,
  ChartBand,
  ChartSeries,
  GameSummary,
  PlayerSummary,
  VillagerUnitMeta,
} from './types.ts';

type NativeColors = Map<string, string>;

type VillagerRecord = {
  item: BuildOrderItem;
  meta: VillagerUnitMeta | null;
  finished: number[];
  destroyed: number[];
};

type ProducerWindow = {
  family: string;
  rate: number;
  start: number;
  end: number;
};

type ProducerQueue = ProducerWindow & {
  started: boolean;
  active: boolean;
  nextCompletion: number | null;
  queuedMounted: boolean;
  queuedBatch: number;
};

type ProductionRateChange = {
  time: number;
  rate: number;
};

const KILLED_COLOR = '#EF4444';
const MISSED_COLOR = '#F59E0B';
export const DEFAULT_VILLAGER_TARGET = 120;
const VILLAGE_FORTRESSES_PBGID = 200170;
const SONG_DYNASTY_PBGID = 158363;
const LATER_CHINESE_DYNASTY_PBGIDS = new Set([158364, 158365]);
const SONG_VILLAGER_PRODUCTION_RATE = 4 / 3;
const TUGHLAQ_VILLAGER_GOVERNOR_PBGID = 9001363;
const TUGHLAQ_FORT_TIER_2_PBGID = 9003509;
const TUGHLAQ_FORT_TIER_3_PBGID = 9003510;
const FLOATING_GATE_PBGID = 2122035;
const STANDARD_VILLAGER_TRAIN_TIME = 20;
const YORISHIRO_TOWN_CENTER_RATE = 1.25;
const EPSILON = 1e-7;

function orderedPlayers(players: PlayerSummary[], nativePlayerOrder: string[]): PlayerSummary[] {
  const ordered: PlayerSummary[] = [];
  const used = new Set<PlayerSummary>();
  for (const name of nativePlayerOrder) {
    const player = players.find(candidate =>
      normalizeName(candidate.name) === normalizeName(name) && !used.has(candidate)
    );
    if (player) {
      ordered.push(player);
      used.add(player);
    }
  }
  for (const player of players) {
    if (!used.has(player)) ordered.push(player);
  }
  return ordered;
}

function cumulativeAtLabels(labels: number[], events: number[]): number[] {
  let eventIndex = 0;
  return labels.map(time => {
    while (eventIndex < events.length && events[eventIndex] <= time) eventIndex++;
    return eventIndex;
  });
}

function villagerRecords(player: PlayerSummary): VillagerRecord[] {
  return (player.buildOrder || [])
    .filter(item => isVillagerUnit(item, player))
    .map(item => ({
      item,
      meta: villagerUnitMeta(item),
      finished: numericArray(item.finished).sort((a, b) => a - b),
      destroyed: numericArray(item.destroyed).sort((a, b) => a - b),
    }));
}

function itemCompletionTimes(item: BuildOrderItem): number[] {
  const constructed = numericArray(item.constructed);
  return (constructed.length ? constructed : numericArray(item.finished)).sort((a, b) => a - b);
}

function villageFortressesTime(player: PlayerSummary): number | null {
  const times = (player.buildOrder || [])
    .filter(item => Number(item.pbgid) === VILLAGE_FORTRESSES_PBGID)
    .flatMap(item => itemCompletionTimes(item))
    .sort((a, b) => a - b);
  return times[0] ?? null;
}

function producerWindows(
  player: PlayerSummary,
  unitMeta: VillagerUnitMeta[],
  gameDuration: number,
): ProducerWindow[] {
  const supportedFamilies = new Set(unitMeta.flatMap(meta => meta.p));
  const keepAvailableAt = villageFortressesTime(player);
  const windows: ProducerWindow[] = [];

  for (const item of player.buildOrder || []) {
    const meta = villagerProducerMeta(item);
    if (!meta || !supportedFamilies.has(meta.k)) continue;
    if (meta.k === 'keep' && keepAvailableAt == null) continue;

    const events = [
      ...itemCompletionTimes(item).map(time => ({ time, kind: 'open' as const })),
      ...numericArray(item.unpacked).map(time => ({ time, kind: 'open' as const })),
      ...numericArray(item.packed).map(time => ({ time, kind: 'close' as const })),
      ...numericArray(item.destroyed).map(time => ({ time, kind: 'close' as const })),
    ].sort((a, b) => a.time - b.time || (a.kind === 'close' ? -1 : 1));
    const itemWindows: ProducerWindow[] = [];
    for (const event of events) {
      if (event.kind === 'open') {
        itemWindows.push({
          family: meta.k,
          rate: Number.isFinite(meta.r) && Number(meta.r) > 0 ? Number(meta.r) : 1,
          start: meta.k === 'keep' ? Math.max(event.time, keepAvailableAt as number) : event.time,
          end: gameDuration,
        });
        continue;
      }
      const active = itemWindows.find(window => window.end === gameDuration);
      if (active) active.end = Math.min(gameDuration, event.time);
    }
    windows.push(...itemWindows.filter(window => window.start < window.end));
  }

  return windows.sort((a, b) => a.start - b.start);
}

function isMountedVillager(meta: VillagerUnitMeta): boolean {
  return /mounted[-_\s]*villager/i.test(meta.k);
}

function eligibleUnitMeta(unitMeta: VillagerUnitMeta[], family: string): VillagerUnitMeta[] {
  return unitMeta
    .filter(meta => meta.p.includes(family))
    .sort((a, b) => Number(isMountedVillager(a)) - Number(isMountedVillager(b)));
}

function initialMountedVillagers(records: VillagerRecord[]): number {
  return records
    .filter(record => record.meta && isMountedVillager(record.meta))
    .reduce((total, record) => total + record.finished.filter(time => time <= 0).length, 0);
}

function villagerProductionRateChanges(player: PlayerSummary): ProductionRateChange[] {
  const dynastyChanges: ProductionRateChange[] = [];
  const tughlaqEvents: Array<{ time: number; kind: 'governor' | 'tier-2' | 'tier-3' }> = [];
  for (const item of player.buildOrder || []) {
    const pbgid = Number(item.pbgid);
    if (pbgid === SONG_DYNASTY_PBGID || LATER_CHINESE_DYNASTY_PBGIDS.has(pbgid)) {
      const rate = pbgid === SONG_DYNASTY_PBGID ? SONG_VILLAGER_PRODUCTION_RATE : 1;
      for (const time of itemCompletionTimes(item)) dynastyChanges.push({ time, rate });
    }
    const tughlaqKind = pbgid === TUGHLAQ_VILLAGER_GOVERNOR_PBGID
      ? 'governor'
      : pbgid === TUGHLAQ_FORT_TIER_2_PBGID
        ? 'tier-2'
        : pbgid === TUGHLAQ_FORT_TIER_3_PBGID
          ? 'tier-3'
          : null;
    if (tughlaqKind) {
      for (const time of itemCompletionTimes(item)) {
        tughlaqEvents.push({ time, kind: tughlaqKind });
      }
    }
  }

  const tughlaqChanges: ProductionRateChange[] = [];
  let tughlaqGovernorActive = false;
  let tughlaqFortTier = 1;
  for (const event of tughlaqEvents.sort((a, b) => a.time - b.time)) {
    if (event.kind === 'governor') tughlaqGovernorActive = true;
    else if (event.kind === 'tier-2') tughlaqFortTier = Math.max(tughlaqFortTier, 2);
    else tughlaqFortTier = Math.max(tughlaqFortTier, 3);
    const rate = !tughlaqGovernorActive
      ? 1
      : tughlaqFortTier === 1
        ? 1.15
        : tughlaqFortTier === 2
          ? 1.3
          : 1.5;
    tughlaqChanges.push({ time: event.time, rate });
  }

  return dynastyChanges.concat(tughlaqChanges).sort((a, b) => a.time - b.time);
}

function productionRateAt(changes: ProductionRateChange[], time: number): number {
  let rate = 1;
  for (const change of changes) {
    if (change.time > time + EPSILON) break;
    rate = change.rate;
  }
  return rate;
}

function playerAgeAt(player: PlayerSummary, time: number): number {
  let age = 1;
  for (const landmark of player.analysis?.landmarks || []) {
    const nextAge = Number(landmark.newAge);
    if (Number.isFinite(nextAge) && landmark.gameTime <= time + EPSILON) {
      age = Math.max(age, nextAge);
    }
  }
  return age;
}

function frenchVillagerProductionRate(
  player: PlayerSummary,
  time: number,
  trainTime: number,
): number {
  if (String(player.civilization || '').toLowerCase() !== 'french') return 1;
  const age = playerAgeAt(player, time);
  const workRate = age >= 4 ? 1.25 : age >= 3 ? 1.2 : 1.15;
  return trainTime * workRate / STANDARD_VILLAGER_TRAIN_TIME;
}

function floatingGateTime(player: PlayerSummary): number | null {
  const analysisTimes = (player.analysis?.landmarks || [])
    .filter(landmark =>
      Number(landmark.pbgid) === FLOATING_GATE_PBGID ||
      /floating gate/i.test(landmark.name || '')
    )
    .map(landmark => Number(landmark.gameTime))
    .filter(Number.isFinite);
  const buildOrderTimes = (player.buildOrder || [])
    .filter(item => Number(item.pbgid) === FLOATING_GATE_PBGID)
    .flatMap(item => itemCompletionTimes(item));
  const times = analysisTimes.concat(buildOrderTimes).sort((a, b) => a - b);
  return times[0] ?? null;
}

function inferredYorishiroProducer(
  player: PlayerSummary,
  records: VillagerRecord[],
  windows: ProducerWindow[],
): { windowIndex: number; activationTime: number } | null {
  // Summary telemetry omits Yorishiro placement, so only infer it from the
  // distinctive +25% cadence while exactly one Japanese Town Center is active.
  if (String(player.civilization || '').toLowerCase() !== 'japanese') return null;
  const availableAt = floatingGateTime(player);
  if (availableAt == null) return null;
  const completions = records
    .flatMap(record => record.finished)
    .filter(time => time > 0)
    .sort((a, b) => a - b);

  for (let index = 3; index < completions.length; index++) {
    const fastIntervals = [
      completions[index - 2] - completions[index - 3],
      completions[index - 1] - completions[index - 2],
      completions[index] - completions[index - 1],
    ];
    if (!fastIntervals.every(interval => interval >= 14 && interval <= 18)) continue;
    const activationTime = completions[index - 3];
    if (activationTime < availableAt) continue;
    const endTime = completions[index];
    const eligibleWindows = windows
      .map((window, windowIndex) => ({ window, windowIndex }))
      .filter(({ window }) =>
        (window.family === 'capital-town-center' || window.family === 'town-center') &&
        window.start <= activationTime + EPSILON &&
        window.end >= endTime - EPSILON
      );
    if (eligibleWindows.length !== 1) continue;
    const overlappingWindows = windows.filter(window =>
      (window.family === 'capital-town-center' || window.family === 'town-center') &&
      window.start < endTime - EPSILON &&
      window.end > activationTime + EPSILON
    );
    if (overlappingWindows.length !== 1) continue;
    return {
      windowIndex: eligibleWindows[0].windowIndex,
      activationTime,
    };
  }
  return null;
}

function normalizeTarget(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : DEFAULT_VILLAGER_TARGET;
}

function displayedIdealValues(
  rawIdealValues: number[],
  killedValues: number[],
  target: number,
  adjustForDeaths: boolean,
): number[] {
  const normalizedTarget = normalizeTarget(target);
  if (!adjustForDeaths) {
    return rawIdealValues.map(value => Math.min(value, normalizedTarget));
  }

  const values: number[] = [];
  let previousRawIdeal = 0;
  let previousKilled = 0;
  let displayedIdeal = 0;
  for (let index = 0; index < rawIdealValues.length; index++) {
    const rawIdeal = Math.max(previousRawIdeal, rawIdealValues[index] || 0);
    const killed = Math.max(previousKilled, killedValues[index] || 0);
    displayedIdeal = Math.min(
      normalizedTarget,
      displayedIdeal + Math.max(0, rawIdeal - previousRawIdeal),
    );
    displayedIdeal = Math.max(0, displayedIdeal - Math.max(0, killed - previousKilled));
    values.push(displayedIdeal);
    previousRawIdeal = rawIdeal;
    previousKilled = killed;
  }
  return values;
}

function villagerEfficiencyValues(
  rawIdealValues: number[],
  actualValues: number[],
  killedValues: number[],
  target: number,
  adjustIdealForDeaths: boolean,
): {
  idealValues: number[];
  killedUpperValues: number[];
  missedUpperValues: number[];
  missedValues: number[];
} {
  const normalizedTarget = normalizeTarget(target);
  const idealValues = displayedIdealValues(
    rawIdealValues,
    killedValues,
    normalizedTarget,
    adjustIdealForDeaths,
  );
  const killedUpperValues: number[] = [];
  const missedUpperValues: number[] = [];
  const missedValues: number[] = [];
  let cumulativeMissed = 0;
  let maximumObservedShortfall = 0;

  for (let index = 0; index < rawIdealValues.length; index++) {
    const produced = actualValues[index] + killedValues[index];
    const observedShortfall = Math.max(0, rawIdealValues[index] - produced);
    // Ideal and produced completions can land in different samples; only a new
    // shortfall high-water mark represents another missed production slot.
    const newMissedOpportunity = Math.max(0, observedShortfall - maximumObservedShortfall);
    if (newMissedOpportunity > 0 && actualValues[index] < normalizedTarget) {
      cumulativeMissed += newMissedOpportunity;
    }
    maximumObservedShortfall = Math.max(maximumObservedShortfall, observedShortfall);
    const killedUpper = killedValues[index];
    killedUpperValues.push(killedUpper);
    missedUpperValues.push(killedUpper + cumulativeMissed);
    missedValues.push(cumulativeMissed);
  }
  return { idealValues, killedUpperValues, missedUpperValues, missedValues };
}

function villagerEfficiencyMeta(target: number, adjustIdealForDeaths: boolean): string {
  const idealBehavior = adjustIdealForDeaths
    ? 'The dashed ideal plateaus at the target, drops with villager deaths, and recovers with later ideal production opportunities.'
    : 'The dashed ideal plateaus at the target.';
  return `Actual living villagers versus uninterrupted production from every available producer. ${idealBehavior} Missed production accrues for unmatched production opportunities while actual living villagers are below the ${normalizeTarget(target)} target, pauses at or above it, and resumes if losses pull actual below target. Losses reopen accrual but do not count as missed production. Bottom-stacked red shading is villagers killed; amber shading above it is counted missed production.`;
}

function sameTime(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function simulateIdealCompletions(
  player: PlayerSummary,
  records: VillagerRecord[],
  windows: ProducerWindow[],
  gameDuration: number,
): number[] {
  const unitMeta = records
    .map(record => record.meta)
    .filter((meta): meta is VillagerUnitMeta => Boolean(meta));
  if (!unitMeta.length || !windows.length) return [];

  const queues: ProducerQueue[] = windows.map(window => ({
    ...window,
    started: false,
    active: false,
    nextCompletion: null,
    queuedMounted: false,
    queuedBatch: 1,
  }));
  const tributaryTimes = jinTributaryEstablishedTimes(player).filter(time => time <= gameDuration);
  const rateChanges = villagerProductionRateChanges(player);
  const yorishiro = inferredYorishiroProducer(player, records, windows);
  let tributaryIndex = 0;
  let mountedCap = 20;
  let mountedCommitted = initialMountedVillagers(records);
  const completions: number[] = [];

  const scheduleNext = (queue: ProducerQueue, time: number): void => {
    if (!queue.active || queue.nextCompletion != null || time >= queue.end) return;
    const eligible = eligibleUnitMeta(unitMeta, queue.family);
    if (!eligible.length) return;
    const mounted = eligible.find(isMountedVillager);
    const regular = eligible.find(meta => !isMountedVillager(meta));
    const mountedBatch = Math.max(1, Math.floor(mounted?.b || 1));
    const chosen = mounted && mountedCommitted + mountedBatch <= mountedCap ? mounted : regular;
    if (!chosen) return;
    queue.queuedBatch = Math.max(1, Math.floor(chosen.b || 1));
    queue.queuedMounted = chosen === mounted;
    if (queue.queuedMounted) mountedCommitted += queue.queuedBatch;
    const queueIndex = queues.indexOf(queue);
    const yorishiroRate = yorishiro &&
      yorishiro.windowIndex === queueIndex &&
      time >= yorishiro.activationTime - EPSILON
      ? YORISHIRO_TOWN_CENTER_RATE
      : 1;
    const dynamicRate = productionRateAt(rateChanges, time)
      * frenchVillagerProductionRate(player, time, chosen.t)
      * yorishiroRate;
    queue.nextCompletion = time + chosen.t / (queue.rate * dynamicRate);
  };

  while (true) {
    let nextTime = Infinity;
    const nextTributary = tributaryTimes[tributaryIndex];
    if (nextTributary != null) nextTime = Math.min(nextTime, nextTributary);
    for (const queue of queues) {
      if (!queue.started) nextTime = Math.min(nextTime, queue.start);
      else {
        if (queue.active) nextTime = Math.min(nextTime, queue.end);
        if (queue.nextCompletion != null) nextTime = Math.min(nextTime, queue.nextCompletion);
      }
    }
    if (!Number.isFinite(nextTime) || nextTime > gameDuration) break;

    while (tributaryTimes[tributaryIndex] != null && sameTime(tributaryTimes[tributaryIndex], nextTime)) {
      mountedCap = Math.min(26, mountedCap + 3);
      tributaryIndex++;
    }

    for (const queue of queues) {
      if (!queue.started && sameTime(queue.start, nextTime) && queue.start < queue.end) {
        queue.started = true;
        queue.active = true;
      }
    }

    for (const queue of queues) {
      if (!queue.active || queue.nextCompletion == null || !sameTime(queue.nextCompletion, nextTime)) continue;
      for (let count = 0; count < queue.queuedBatch; count++) completions.push(nextTime);
      queue.nextCompletion = null;
      queue.queuedMounted = false;
      queue.queuedBatch = 1;
    }

    for (const queue of queues) {
      if (!queue.active || !sameTime(queue.end, nextTime)) continue;
      if (queue.nextCompletion != null && queue.queuedMounted) mountedCommitted -= queue.queuedBatch;
      queue.nextCompletion = null;
      queue.queuedMounted = false;
      queue.queuedBatch = 1;
      queue.active = false;
    }

    for (const queue of queues) scheduleNext(queue, nextTime);
  }

  return completions.sort((a, b) => a - b);
}

export function applyVillagerEfficiencyTarget(chart: Chart, target: number): void {
  if (chart.type !== 'villager-efficiency') return;
  const normalizedTarget = normalizeTarget(target);
  const adjustIdealForDeaths = chart.options?.villagerAdjustIdealForDeaths === true;
  const playerNames = new Set(
    chart.data.series.map(series => series.playerName).filter((name): name is string => Boolean(name))
  );
  for (const playerName of playerNames) {
    const actual = chart.data.series.find(series =>
      series.playerName === playerName && series.unitLabel === 'Actual'
    );
    const ideal = chart.data.series.find(series =>
      series.playerName === playerName && series.unitLabel === 'Ideal'
    );
    const missed = chart.data.series.find(series =>
      series.playerName === playerName && series.unitLabel === 'Missed production'
    );
    const killed = chart.data.series.find(series =>
      series.playerName === playerName && series.unitLabel === 'Killed'
    );
    if (!actual || !ideal || !missed || !killed || !ideal._rawIdealValues) continue;

    const values = villagerEfficiencyValues(
      ideal._rawIdealValues,
      actual.values,
      killed.values,
      normalizedTarget,
      adjustIdealForDeaths,
    );
    ideal.values = values.idealValues;
    missed.values = values.missedValues;
    const killedBand = chart.bands?.find(band =>
      band.playerName === playerName && band.label === 'Killed'
    );
    if (killedBand) {
      killedBand.fromValues = new Array(killed.values.length).fill(0);
      killedBand.toValues = values.killedUpperValues;
    }
    const missedBand = chart.bands?.find(band =>
      band.playerName === playerName && band.label === 'Missed production'
    );
    if (missedBand) {
      missedBand.fromValues = values.killedUpperValues;
      missedBand.toValues = values.missedUpperValues;
    }
  }
  chart.options = { ...(chart.options || {}), villagerTarget: normalizedTarget };
  chart.meta = villagerEfficiencyMeta(normalizedTarget, adjustIdealForDeaths);
  delete chart._cachedPlotH;
  delete chart._cachedMarginTop;
  delete chart._cachedYMin;
  delete chart._cachedYMax;
  delete chart._renderedY;
}

function lastBuildOrderTimestamp(players: PlayerSummary[]): number {
  let max = 0;
  for (const player of players) {
    for (const item of player.buildOrder || []) {
      for (const values of [
        item.finished,
        item.constructed,
        item.destroyed,
        item.packed,
        item.unpacked,
        item.transformed,
      ]) {
        for (const time of numericArray(values)) max = Math.max(max, time);
      }
    }
  }
  return max;
}

export function buildVillagerEfficiencyCharts(
  summary: GameSummary,
  nativeColors: NativeColors,
  nativePlayerOrder: string[] = [],
): Chart[] {
  const players = Array.isArray(summary.players) ? summary.players : [];
  const recordsByPlayer = new Map(players.map(player => [player, villagerRecords(player)]));
  if (![...recordsByPlayer.values()].some(records => records.length > 0)) return [];

  const gameDuration = Math.max(
    Number(summary.duration) || 0,
    lastResourceTimestamp(players),
    lastBuildOrderTimestamp(players),
  );
  const labels = buildSampleLabels(gameDuration, 10);
  if (!labels.length) return [];

  const series: ChartSeries[] = [];
  const bands: ChartBand[] = [];
  for (const player of orderedPlayers(players, nativePlayerOrder)) {
    const playerIndex = players.indexOf(player);
    const records = recordsByPlayer.get(player) || [];
    if (!records.length) continue;

    const finished = records.flatMap(record => record.finished).sort((a, b) => a - b);
    const destroyed = records.flatMap(record => record.destroyed).sort((a, b) => a - b);
    const producedValues = cumulativeAtLabels(labels, finished);
    const destroyedValues = cumulativeAtLabels(labels, destroyed);
    const actualValues = producedValues.map((produced, index) =>
      Math.max(0, produced - Math.min(produced, destroyedValues[index]))
    );
    const killedValues = producedValues.map((produced, index) =>
      Math.min(produced, destroyedValues[index])
    );

    const unitMeta = records
      .map(record => record.meta)
      .filter((meta): meta is VillagerUnitMeta => Boolean(meta));
    const windows = producerWindows(player, unitMeta, gameDuration);
    const initialVillagers = finished.filter(time => time <= 0).length;
    const idealCompletions = simulateIdealCompletions(player, records, windows, gameDuration);
    const rawIdealValues = cumulativeAtLabels(labels, idealCompletions)
      .map(value => value + initialVillagers);
    const {
      idealValues,
      killedUpperValues,
      missedUpperValues,
      missedValues,
    } = villagerEfficiencyValues(
      rawIdealValues,
      actualValues,
      killedValues,
      DEFAULT_VILLAGER_TARGET,
      false,
    );

    const name = player.name || `Player ${playerIndex + 1}`;
    const color = playerColor(summary, player, playerIndex, nativeColors);
    const keyBase = player.profileId || playerIndex;
    const actualKey = `villager-efficiency:${keyBase}:actual`;
    const idealKey = `villager-efficiency:${keyBase}:ideal`;

    series.push(
      {
        key: actualKey,
        label: `${name}: Actual`,
        unitLabel: 'Actual',
        playerName: name,
        color,
        baseColor: color,
        values: actualValues,
        team: player.team,
      },
      {
        key: idealKey,
        label: `${name}: Ideal`,
        unitLabel: 'Ideal',
        playerName: name,
        color,
        baseColor: color,
        values: idealValues,
        _rawIdealValues: rawIdealValues,
        lineDash: [7, 5],
        team: player.team,
      },
      {
        key: `villager-efficiency:${keyBase}:missed`,
        label: `${name}: Missed production`,
        unitLabel: 'Missed production',
        playerName: name,
        color: MISSED_COLOR,
        baseColor: color,
        values: missedValues,
        render: 'metric',
        team: player.team,
      },
      {
        key: `villager-efficiency:${keyBase}:killed`,
        label: `${name}: Killed`,
        unitLabel: 'Killed',
        playerName: name,
        color: KILLED_COLOR,
        baseColor: color,
        values: killedValues,
        render: 'metric',
        team: player.team,
      },
    );
    bands.push(
      {
        key: `villager-efficiency:${keyBase}:killed-band`,
        label: 'Killed',
        playerName: name,
        color: KILLED_COLOR,
        fromValues: new Array(labels.length).fill(0),
        toValues: killedUpperValues,
        opacity: 0.18,
      },
      {
        key: `villager-efficiency:${keyBase}:missed-band`,
        label: 'Missed production',
        playerName: name,
        color: MISSED_COLOR,
        fromValues: killedUpperValues,
        toValues: missedUpperValues,
        opacity: 0.16,
      },
    );
  }
  if (!series.length) return [];

  return [{
    value: `${SUMMARY_PLUS_PREFIX}villager-efficiency`,
    title: 'Villager Efficiency',
    meta: villagerEfficiencyMeta(DEFAULT_VILLAGER_TARGET, false),
    data: { labels, series },
    bands,
    type: 'villager-efficiency',
    options: {
      height: 280,
      villagerTarget: DEFAULT_VILLAGER_TARGET,
      villagerAdjustIdealForDeaths: false,
    },
    nativePlayerOrder,
  }];
}
