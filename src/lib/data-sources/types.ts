import type { CompetitionMode, RoundState, TraderConfig, TraderScore } from "../types";

export interface LeaderboardDataSource {
  readonly id: "mock" | "jupiter-perps";
  getInitialState(): Promise<RoundState> | RoundState;
  getTraders(mode: CompetitionMode, state: RoundState): Promise<TraderScore[]> | TraderScore[];
  loadTraderConfig?(input: string): Promise<TraderConfig[]> | TraderConfig[];
}
