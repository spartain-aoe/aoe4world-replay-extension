export interface StatsPlayerMetric {
  playerId?: number;
  profileId?: number;
  name?: string;
  townCenterIdleSeconds?: number;
}

export interface GetStatsMetricsResponse {
  success?: boolean;
  players?: StatsPlayerMetric[];
  cached?: boolean;
  error?: string;
  rateLimited?: boolean;
  disabled?: boolean;
}
