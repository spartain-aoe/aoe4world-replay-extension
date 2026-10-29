import { normalizeName } from './dom.ts';
import { playerColor } from './colors.ts';
import { buildSampleLabels, maxAbs, numericArray, SUMMARY_PLUS_PREFIX } from './chart-utils.ts';
import { lastResourceTimestamp } from './chart-resources.ts';
import { isVillagerUnit } from './combat-units.ts';
import type { Chart, ChartSeries, GameSummary, PlayerSummary } from './types.ts';

type NativeColors = Map<string, string>;

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

function villagerDestroyedTimes(player: PlayerSummary): number[] {
  return (player.buildOrder || [])
    .filter(item => isVillagerUnit(item, player))
    .flatMap(item => numericArray(item.destroyed))
    .sort((a, b) => a - b);
}

function cumulativeAtLabels(labels: number[], events: number[]): number[] {
  let eventIndex = 0;
  return labels.map(time => {
    while (eventIndex < events.length && events[eventIndex] <= time) eventIndex++;
    return eventIndex;
  });
}

export function buildVillagerCombatCharts(
  summary: GameSummary,
  nativeColors: NativeColors,
  nativePlayerOrder: string[] = [],
): Chart[] {
  const players = Array.isArray(summary.players) ? summary.players : [];
  if (
    players.length !== 2 ||
    (players[0].team != null && players[1].team != null && players[0].team === players[1].team)
  ) {
    return [];
  }

  const lastResourceTime = lastResourceTimestamp(players);
  const gameDuration = lastResourceTime || summary.duration || 0;
  const labels = buildSampleLabels(gameDuration, 10);
  if (!labels.length) return [];

  const lossEvents = new Map<PlayerSummary, number[]>(
    players.map(player => [player, villagerDestroyedTimes(player)]),
  );
  if (![...lossEvents.values()].some(events => events.length > 0)) return [];

  const series: ChartSeries[] = [];
  for (const player of orderedPlayers(players, nativePlayerOrder)) {
    const playerIndex = players.indexOf(player);
    const opponent = players[playerIndex === 0 ? 1 : 0];
    const killedValues = cumulativeAtLabels(labels, lossEvents.get(opponent) || []);
    const lostRawValues = cumulativeAtLabels(labels, lossEvents.get(player) || []);
    const lostValues = lostRawValues.map(value => value === 0 ? 0 : -value);
    const name = player.name || `Player ${playerIndex + 1}`;
    const color = playerColor(summary, player, playerIndex, nativeColors);
    const keyBase = player.profileId || playerIndex;

    series.push(
      {
        key: `villagers:${keyBase}:killed`,
        label: `${name}: Killed`,
        playerName: name,
        color,
        baseColor: color,
        values: killedValues,
        _rawValues: killedValues,
        sign: 1,
      },
      {
        key: `villagers:${keyBase}:lost`,
        label: `${name}: Lost`,
        playerName: name,
        color,
        baseColor: color,
        values: lostValues,
        _rawValues: lostRawValues,
        sign: -1,
      },
    );
  }
  if (series.every(item => maxAbs(item.values) === 0)) return [];

  return [{
    value: `${SUMMARY_PLUS_PREFIX}villagers-killed-lost`,
    title: 'Villagers Killed / Lost',
    meta: 'Cumulative villager kills and losses from AoE4 World unit destruction timestamps. Per-player kill attribution is exact for 1v1 games.',
    data: { labels, series },
    type: 'lead',
    options: { height: 280 },
  }];
}
