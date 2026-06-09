import type { PublicTraderScore, RoundStatus, TimerInput, TimerStatus, TraderScore } from "./types";

export function buildLeaderboard(traders: TraderScore[]): TraderScore[] {
  const leaderPnl = traders.reduce(
    (max, trader) => Math.max(max, trader.pnlUsd),
    traders.length ? traders[0].pnlUsd : 0,
  );

  return [...traders]
    .sort((a, b) => {
      if (b.pnlUsd !== a.pnlUsd) return b.pnlUsd - a.pnlUsd;
      if (b.volume !== a.volume) return b.volume - a.volume;
      return a.xHandle.localeCompare(b.xHandle);
    })
    .map((trader, index) => ({
      ...trader,
      rank: index + 1,
      gapToLeader: Math.max(0, leaderPnl - trader.pnlUsd),
      pnlPercent:
        trader.startingEquity > 0
          ? (trader.pnlUsd / trader.startingEquity) * 100
          : 0,
    }));
}

export function publicTraderView(trader: TraderScore): PublicTraderScore {
  const { walletAddress: _walletAddress, ...publicTrader } = trader;
  return publicTrader;
}

export function publicLeaderboardView(traders: TraderScore[]): PublicTraderScore[] {
  return traders.map(publicTraderView);
}

export function createLockedSnapshot(traders: TraderScore[]): TraderScore[] {
  return traders.map((trader) => ({
    ...trader,
    recentTrade: trader.recentTrade ? { ...trader.recentTrade } : undefined,
    recentActivity: trader.recentActivity ? { ...trader.recentActivity } : undefined,
    recentActivities: trader.recentActivities?.map((activity) => ({ ...activity })),
    openTrade: trader.openTrade ? { ...trader.openTrade } : undefined,
  }));
}

export function formatTimer(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function deriveTimerStatus(input: TimerInput): TimerStatus {
  if (input.status !== "live" || !input.startedAt) {
    return {
      status: input.status,
      remainingSeconds: Math.max(0, input.durationSeconds),
    };
  }

  const now = input.now ?? new Date();
  const startedAt = new Date(input.startedAt).getTime();
  const elapsedSeconds = Math.floor((now.getTime() - startedAt) / 1000);
  const remainingSeconds = Math.max(0, input.durationSeconds - elapsedSeconds);
  const status: RoundStatus = remainingSeconds === 0 ? "locked" : input.status;

  return { status, remainingSeconds };
}

export function isUrgencyState(remainingSeconds: number, status: RoundStatus): boolean {
  return status === "live" && remainingSeconds > 0 && remainingSeconds <= 60;
}
