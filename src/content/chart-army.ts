import { normalizeName } from './dom.ts';
import { AOE4_PLAYER_COLOR_HEX, playerColor } from './colors.ts';
import {
  isArmyUnit,
  unitCostForItem,
} from './unit-mapping.ts';
import {
  civDataSlugForPlayer,
} from './unit-data-cache.ts';
import {
  numericArray,
  buildSampleLabels,
  SUMMARY_PLUS_PREFIX,
  maxAbs,
} from './chart-utils.ts';
import {
  buildArmySeriesForPlayer,
  armyTeamSigns,
  precomputeStackedValues,
} from './army-series.ts';
import {
  lastResourceTimestamp,
} from './chart-resources.ts';
import type { Chart, ChartSeries, GameSummary, PlayerSummary } from './types.ts';

type NativeColors = Map<string, string>;
type DestroyedEvent = { time: number; cost: number };
const getArmyTeamSigns = armyTeamSigns as (players: PlayerSummary[], nativePlayerOrder?: string[]) => Map<number, number>;
const TEAM_POSITIVE_COLOR = AOE4_PLAYER_COLOR_HEX[0];
const TEAM_NEGATIVE_COLOR = AOE4_PLAYER_COLOR_HEX[1];

function orderedArmyPlayers(players: PlayerSummary[], nativePlayerOrder: string[]): PlayerSummary[] {
  const orderedPlayers: PlayerSummary[] = [];
  const used = new Set<PlayerSummary>();
  for (const name of nativePlayerOrder) {
    const player = players.find((p: PlayerSummary) => normalizeName(p.name) === normalizeName(name) && !used.has(p));
    if (player) {
      orderedPlayers.push(player);
      used.add(player);
    }
  }
  for (const player of players) {
    if (!used.has(player)) orderedPlayers.push(player);
  }
  return orderedPlayers;
}

function buildSignedArmySeries(
  summary: GameSummary,
  players: PlayerSummary[],
  labels: number[],
  nativeColors: NativeColors,
  nativePlayerOrder: string[],
  teamSigns: Map<number, number>,
): ChartSeries[] {
  return orderedArmyPlayers(players, nativePlayerOrder).flatMap((player: PlayerSummary) => {
    const originalIndex = players.indexOf(player);
    const playerName = player.name || `Player ${originalIndex + 1}`;
    const baseColor = playerColor(summary, player, originalIndex, nativeColors);
    const sign = player.team == null ? (originalIndex === 0 ? 1 : -1) : (teamSigns.get(player.team) ?? (originalIndex === 0 ? 1 : -1));
    return (buildArmySeriesForPlayer(player, labels, baseColor) as ChartSeries[])
      .map((item: ChartSeries) => {
        const signedCount = (item._countValues || item.values).map((value: number) => value * sign);
        const signedValue = item._valueValues ? item._valueValues.map((value: number) => value * sign) : undefined;
        return {
          ...item,
          playerName,
          team: player.team,
          sign,
          // Labels can collide across civ substitutions.
          key: `army:${player.profileId || originalIndex}:${item.mergeKey || item.label}`,
          label: `${playerName}: ${item.label}`,
          values: signedCount,
          _countValues: signedCount,
          ...(signedValue ? { _valueValues: signedValue } : {}),
        };
      });
  });
}

export function buildArmyCharts(summary: GameSummary, nativeColors: NativeColors, nativePlayerOrder: string[] = []): Chart[] {
  const players: PlayerSummary[] = Array.isArray(summary.players) ? summary.players : [];
  // Avoid flatlining past recorded samples.
  const lastResourceTime = lastResourceTimestamp(players);
  const gameDuration = lastResourceTime || summary.duration || 0;
  const labels = buildSampleLabels(gameDuration, 10);
  const teamSigns = getArmyTeamSigns(players, nativePlayerOrder);
  const series = buildSignedArmySeries(summary, players, labels, nativeColors, nativePlayerOrder, teamSigns);
  if (!labels.length || !series.length) return [];
  precomputeStackedValues(series);
  return [{
    value: `${SUMMARY_PLUS_PREFIX}army-composition`,
    title: 'Army Composition',
    meta: 'Active military units for all players over time from AoE4 World unit build-order finished/destroyed timestamps.',
    data: { labels, series },
    type: 'army',
    options: { height: 280, armyMode: 'count' }
  }];
}

export function buildArmyValueLeadCharts(summary: GameSummary, nativeColors: NativeColors, nativePlayerOrder: string[] = []): Chart[] {
  const players: PlayerSummary[] = Array.isArray(summary.players) ? summary.players : [];
  const lastResourceTime = lastResourceTimestamp(players);
  const gameDuration = lastResourceTime || summary.duration || 0;
  const labels = buildSampleLabels(gameDuration, 10);
  if (!labels.length) return [];

  const teamSigns = getArmyTeamSigns(players, nativePlayerOrder);
  const teams = [...new Set(players.map((player: PlayerSummary) => player.team).filter((team): team is number => team !== undefined && team !== null))];
  if (teams.length !== 2) return [];

  const positiveTeam = [...teamSigns.entries()].find(([, sign]) => sign > 0)?.[0];
  const negativeTeam = [...teamSigns.entries()].find(([, sign]) => sign < 0)?.[0];
  if (positiveTeam === undefined || negativeTeam === undefined) return [];

  const is1v1 = players.length === 2;
  const posPlayers = players.filter((player: PlayerSummary) => player.team === positiveTeam);
  const negPlayers = players.filter((player: PlayerSummary) => player.team === negativeTeam);

  const posValues = labels.map(() => 0);
  const negValues = labels.map(() => 0);
  const armySeries = buildSignedArmySeries(summary, players, labels, nativeColors, nativePlayerOrder, teamSigns);
  for (const item of armySeries) {
    const totals = (item.sign ?? 1) >= 0 ? posValues : negValues;
    const values = item._valueValues || [];
    for (let i = 0; i < labels.length; i++) {
      totals[i] += Math.abs(values[i] || 0);
    }
  }
  if (maxAbs(posValues) === 0 && maxAbs(negValues) === 0) return [];
  const diffValues: number[] = labels.map((_, i) => posValues[i] - negValues[i]);

  const posColor = is1v1 ? playerColor(summary, posPlayers[0], players.indexOf(posPlayers[0]), nativeColors) : TEAM_POSITIVE_COLOR;
  const negColor = is1v1 ? playerColor(summary, negPlayers[0], players.indexOf(negPlayers[0]), nativeColors) : TEAM_NEGATIVE_COLOR;

  const leadPosSeries: ChartSeries = {
    label: is1v1 ? (posPlayers[0]?.name || 'Team 1') : 'Team 1',
    color: posColor,
    values: diffValues.map(v => Math.max(0, v)),
    _rawValues: posValues,
    key: 'lead:positive'
  };
  const leadNegSeries: ChartSeries = {
    label: is1v1 ? (negPlayers[0]?.name || 'Team 2') : 'Team 2',
    color: negColor,
    values: diffValues.map(v => Math.min(0, v)),
    _rawValues: negValues,
    key: 'lead:negative'
  };

  return [{
    value: `${SUMMARY_PLUS_PREFIX}army-value-lead`,
    title: 'Army Value Lead',
    meta: 'Net lead in active army resource value using the same AoE4 World unit build-order finished/destroyed timestamps as Army Composition.',
    data: { labels, series: [leadPosSeries, leadNegSeries] },
    type: 'lead',
    options: { height: 280 }
  }];
}

export function buildDestroyedValueCharts(summary: GameSummary, nativeColors: NativeColors, nativePlayerOrder: string[] = []): Chart[] {
  const players: PlayerSummary[] = Array.isArray(summary.players) ? summary.players : [];
  // Allow rendering even when the per-civ unit-data cache hasn't loaded — the
  // bundled pbgid-map.json now ships costs as a fallback so we still produce
  // useful numbers immediately.
  const slugs = players.map(civDataSlugForPlayer).filter((slug): slug is string => Boolean(slug));
  if (slugs.length === 0) return [];
  const lastResTime = lastResourceTimestamp(players);
  const gameDuration = lastResTime || summary.duration || 0;
  const labels = buildSampleLabels(gameDuration, 10);
  if (!labels.length) return [];

  const teamSigns = getArmyTeamSigns(players, nativePlayerOrder);
  const teams = [...new Set(players.map((player: PlayerSummary) => player.team).filter((team): team is number => team !== undefined && team !== null))];
  if (teams.length !== 2) return [];

  const positiveTeam = [...teamSigns.entries()].find(([, sign]) => sign > 0)?.[0];
  const negativeTeam = [...teamSigns.entries()].find(([, sign]) => sign < 0)?.[0];
  if (positiveTeam === undefined || negativeTeam === undefined) return [];

  const is1v1 = players.length === 2;
  const posDestroyedEvents: DestroyedEvent[] = [];
  const negDestroyedEvents: DestroyedEvent[] = [];

  for (const player of players) {
    const sign = player.team == null ? 1 : (teamSigns.get(player.team) ?? 1);
    for (const item of (player.buildOrder || [])) {
      if (item.type !== 'Unit') continue;
      const cost = unitCostForItem(item, player);
      if (!cost) continue;
      for (const time of numericArray(item.destroyed)) {
        if (sign > 0) negDestroyedEvents.push({ time, cost });
        else posDestroyedEvents.push({ time, cost });
      }
    }
  }

  posDestroyedEvents.sort((a, b) => a.time - b.time);
  negDestroyedEvents.sort((a, b) => a.time - b.time);

  const cumulativeAtLabels = (events: DestroyedEvent[]): number[] => {
    let eventIndex = 0;
    let cumulative = 0;
    return labels.map((time: number) => {
      while (eventIndex < events.length && events[eventIndex].time <= time) {
        cumulative += events[eventIndex].cost;
        eventIndex++;
      }
      return cumulative;
    });
  };

  const posPlayer = players.find((player: PlayerSummary) => player.team === positiveTeam);
  const negPlayer = players.find((player: PlayerSummary) => player.team === negativeTeam);
  const posColor = is1v1 ? playerColor(summary, posPlayer as PlayerSummary, players.indexOf(posPlayer as PlayerSummary), nativeColors) : TEAM_POSITIVE_COLOR;
  const negColor = is1v1 ? playerColor(summary, negPlayer as PlayerSummary, players.indexOf(negPlayer as PlayerSummary), nativeColors) : TEAM_NEGATIVE_COLOR;

  return [{
    value: `${SUMMARY_PLUS_PREFIX}destroyed-value`,
    title: 'Destroyed Value',
    data: {
      labels,
      series: [
        {
          label: is1v1 ? (posPlayer?.name || 'Team 1') : 'Team 1',
          color: posColor,
          values: cumulativeAtLabels(posDestroyedEvents),
          sign: 1,
          key: 'destroyed:positive'
        },
        {
          label: is1v1 ? (negPlayer?.name || 'Team 2') : 'Team 2',
          color: negColor,
          values: cumulativeAtLabels(negDestroyedEvents).map(value => -value),
          sign: -1,
          key: 'destroyed:negative'
        }
      ]
    },
    type: 'lead',
    options: { height: 280 }
  }];
}
