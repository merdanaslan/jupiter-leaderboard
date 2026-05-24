import { describe, expect, it } from "vitest";
import { publicLeaderboardView } from "../leaderboard";
import type { TraderConfig } from "../types";
import { scoreJupiterPerpsSnapshots, startedAtUnixSeconds } from "./jupiter-perps-score";

const traders: TraderConfig[] = [
  {
    id: "q-1",
    xHandle: "@alice",
    displayName: "Alice",
    walletAddress: "11111111111111111111111111111111",
    status: "active",
    mode: "qualifier",
    startingBalance: 100,
    startingEquity: 100,
  },
  {
    id: "q-2",
    xHandle: "@bob",
    displayName: "Bob",
    walletAddress: "22222222222222222222222222222222",
    status: "active",
    mode: "qualifier",
    startingBalance: 100,
    startingEquity: 100,
  },
];

describe("scoreJupiterPerpsSnapshots", () => {
  it("maps IDL-derived snapshots into ranked trader scores without leaking public wallets", () => {
    const scores = scoreJupiterPerpsSnapshots({
      traders,
      now: "2026-05-24T19:00:00.000Z",
      snapshots: [
        {
          walletAddress: "11111111111111111111111111111111",
          positions: [],
          trades: [],
          notionalVolumeUsd: 500,
          realizedPnlUsd: 0,
          unrealizedPnlUsd: 12,
          totalPnlUsd: 12,
          recentTrade: {
            market: "SOL",
            side: "long",
            notionalUsd: 500,
            pnlUsd: 0,
            timestamp: "2026-05-24T18:59:00.000Z",
          },
          openTrade: {
            market: "SOL",
            side: "long",
            sizeUsd: 500,
            entryPrice: 85,
          },
        },
        {
          walletAddress: "22222222222222222222222222222222",
          positions: [],
          trades: [],
          notionalVolumeUsd: 800,
          realizedPnlUsd: 0,
          unrealizedPnlUsd: 12,
          totalPnlUsd: 12,
        },
      ],
    });

    expect(scores.map((score) => [score.id, score.rank])).toEqual([
      ["q-2", 1],
      ["q-1", 2],
    ]);
    expect(scores[0]).toEqual(
      expect.objectContaining({
        equity: 112,
        pnlUsd: 12,
        pnlPercent: 12,
        volume: 800,
        gapToLeader: 0,
      }),
    );
    expect(scores[1].recentTrade?.market).toBe("SOL");
    expect(scores[1].openTrade?.entryPrice).toBe(85);
    expect(publicLeaderboardView(scores)[0]).not.toHaveProperty("walletAddress");
  });

  it("filters scores by competition mode and active status", () => {
    const scores = scoreJupiterPerpsSnapshots({
      mode: "final",
      traders: [
        ...traders,
        {
          id: "f-1",
          xHandle: "@finalist",
          displayName: "Finalist",
          walletAddress: "33333333333333333333333333333333",
          status: "active",
          mode: "final",
          startingBalance: 1000,
          startingEquity: 1000,
        },
        {
          id: "f-backup",
          xHandle: "@backup",
          displayName: "Backup",
          walletAddress: "44444444444444444444444444444444",
          status: "backup",
          mode: "final",
          startingBalance: 1000,
          startingEquity: 1000,
        },
      ],
      snapshots: [],
    });

    expect(scores.map((score) => score.id)).toEqual(["f-1"]);
  });

  it("derives unix round starts from persisted round state timestamps", () => {
    expect(startedAtUnixSeconds("2026-05-24T19:00:00.000Z")).toBe(1779649200);
    expect(startedAtUnixSeconds(null)).toBeUndefined();
    expect(startedAtUnixSeconds("not-a-date")).toBeUndefined();
  });
});
