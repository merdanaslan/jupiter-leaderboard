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

export interface RecentTrade {
  market: TradeMarket;
  side: TradeSide;
  notionalUsd: number;
  pnlUsd?: number;
  timestamp: string;
  action?: "increase" | "decrease" | "liquidate";
}

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
  mockTraders: TraderScore[];
  dataSource: "mock" | "jupiter-perps";
}

export type PublicRoundState = Omit<RoundState, "mockTraders" | "lockedStandings"> & {
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
