export type CompetitionMode = "qualifier" | "final";

export type RoundStatus =
  | "waiting"
  | "connecting"
  | "live"
  | "interrupted"
  | "locked"
  | "final";

export type TraderStatus = "active" | "backup";

export type MockScenario =
  | "steady"
  | "close-race"
  | "top-4-battle"
  | "negative-market"
  | "last-minute-upset"
  | "interruption"
  | "locked";

export type TradeSide = "long" | "short";

export type TradeMarket = "BTC" | "ETH" | "SOL";

export type LeaderboardDataSourceId = "mock" | "jupiter-perps" | "jupiter-sdk";

export interface RecentTrade {
  market: TradeMarket;
  side: TradeSide;
  notionalUsd: number;
  pnlUsd?: number;
  timestamp: string;
  action?: "increase" | "decrease" | "liquidate";
}

export type RecentActivityAction =
  | "open"
  | "increase"
  | "decrease"
  | "close"
  | "liquidation"
  | "deposit"
  | "withdraw"
  | "place"
  | "cancel";

export type RecentOrderKind = "LIMIT" | "SL" | "TP";

export interface RecentTradeActivity {
  type: "trade";
  action: Exclude<RecentActivityAction, "place" | "cancel">;
  market: TradeMarket;
  side: TradeSide;
  executionType: "market" | "trigger" | "liquidation";
  notionalUsd: number;
  sizeToken: number;
  priceUsd: number;
  collateralUsdDelta?: number;
  realizedPnlUsd: number | null;
  netRealizedPnlUsd?: number | null;
  feeUsd: number;
  timestamp: string;
}

export interface RecentOrderActivity {
  type: "order";
  action: Extract<RecentActivityAction, "place" | "cancel">;
  orderKind: RecentOrderKind;
  market: TradeMarket;
  side: TradeSide;
  triggerPriceUsd: number;
  sizeUsd: number;
  entirePosition: boolean;
  timestamp: string;
}

export type RecentActivity = RecentTradeActivity | RecentOrderActivity;

export interface OpenTrade {
  market: TradeMarket;
  side: TradeSide;
  sizeUsd: number;
  entryPrice?: number;
}

export interface TraderConfig {
  id: string;
  xHandle: string;
  displayName: string;
  walletAddress: string;
  status: TraderStatus;
  mode: CompetitionMode;
  startingBalance: number;
  startingEquity: number;
  avatarUrl?: string;
}

export interface TraderScore extends TraderConfig {
  equity: number;
  pnlUsd: number;
  pnlPercent: number;
  volume: number;
  rank: number;
  lastUpdated: string;
  gapToLeader: number;
  recentTrade?: RecentTrade;
  recentActivity?: RecentActivity;
  recentActivities?: RecentActivity[];
  openTrade?: OpenTrade;
}

export type PublicTraderScore = Omit<TraderScore, "walletAddress">;

export interface RoundState {
  activeMode: CompetitionMode;
  status: RoundStatus;
  scenario: MockScenario;
  durationSeconds: number;
  remainingSeconds: number;
  startedAt: string | null;
  updatedAt: string;
  selectedFinalistIds: string[];
  lockedStandings: {
    qualifier: TraderScore[] | null;
    final: TraderScore[] | null;
  };
  liveStandings: {
    qualifier: TraderScore[] | null;
    final: TraderScore[] | null;
  };
  liveDataUpdatedAt: {
    qualifier: string | null;
    final: string | null;
  };
  liveDataStatus: {
    qualifier: "idle" | "ok" | "partial" | "error";
    final: "idle" | "ok" | "partial" | "error";
  };
  mockTraders: TraderScore[];
  traderConfigs: TraderConfig[];
  sdkRuntime: {
    orderSnapshotsByWallet: Record<string, unknown>;
    orderActivitiesByWallet: Record<string, RecentActivity[]>;
    lastError: string | null;
  };
  dataSource: LeaderboardDataSourceId;
}

export type PublicRoundState = Omit<
  RoundState,
  "mockTraders" | "lockedStandings" | "liveStandings" | "traderConfigs" | "sdkRuntime"
> & {
  lockedStandings: {
    qualifier: PublicTraderScore[] | null;
    final: PublicTraderScore[] | null;
  };
};

export interface PublicLeaderboardPayload {
  state: PublicRoundState;
  traders: PublicTraderScore[];
}

export interface TimerInput {
  status: RoundStatus;
  startedAt: string | null;
  durationSeconds: number;
  now?: Date;
}

export interface TimerStatus {
  status: RoundStatus;
  remainingSeconds: number;
}
