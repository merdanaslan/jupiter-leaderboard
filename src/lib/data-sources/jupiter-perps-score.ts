import { buildLeaderboard } from "../leaderboard";
import type { CompetitionMode, TraderConfig, TraderScore } from "../types";
import type { JupiterPerpsWalletSnapshot } from "./jupiter-perps-normalize";

export interface ScoreJupiterPerpsSnapshotsInput {
  traders: TraderConfig[];
  snapshots: JupiterPerpsWalletSnapshot[];
  mode?: CompetitionMode;
  now?: string;
}

export function scoreJupiterPerpsSnapshots(input: ScoreJupiterPerpsSnapshotsInput): TraderScore[] {
  const snapshotsByWallet = new Map(
    input.snapshots.map((snapshot) => [snapshot.walletAddress, snapshot]),
  );
  const now = input.now ?? new Date().toISOString();
  const traderConfigs = input.traders.filter(
    (trader) => trader.status === "active" && (!input.mode || trader.mode === input.mode),
  );

  return buildLeaderboard(
    traderConfigs.map((trader) =>
      scoreFromSnapshot({
        trader,
        snapshot: snapshotsByWallet.get(trader.walletAddress),
        now,
      }),
    ),
  );
}

export function startedAtUnixSeconds(startedAt: string | null): number | undefined {
  if (!startedAt) return undefined;
  const timestamp = new Date(startedAt).getTime();
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.floor(timestamp / 1000);
}

function scoreFromSnapshot(input: {
  trader: TraderConfig;
  snapshot?: JupiterPerpsWalletSnapshot;
  now: string;
}): TraderScore {
  const snapshot = input.snapshot;
  const pnlUsd = Number((snapshot?.totalPnlUsd ?? snapshot?.realizedPnlUsd ?? 0).toFixed(2));
  const equity = Number((input.trader.startingEquity + pnlUsd).toFixed(2));

  return {
    ...input.trader,
    equity,
    pnlUsd,
    pnlPercent: input.trader.startingEquity > 0 ? (pnlUsd / input.trader.startingEquity) * 100 : 0,
    volume: Number((snapshot?.notionalVolumeUsd ?? 0).toFixed(2)),
    rank: 0,
    lastUpdated: input.now,
    gapToLeader: 0,
    recentTrade: snapshot?.recentTrade,
    openTrade: snapshot?.openTrade,
  };
}
