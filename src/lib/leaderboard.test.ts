import { describe, expect, it } from "vitest";
import {
  buildLeaderboard,
  createLockedSnapshot,
  deriveTimerStatus,
  formatTimer,
  publicTraderView,
} from "./leaderboard";
import type { TraderScore } from "./types";

const baseTrader = (overrides: Partial<TraderScore>): TraderScore => ({
  id: "trader",
  xHandle: "@trader",
  displayName: "Trader",
  walletAddress: "11111111111111111111111111111111",
  status: "active",
  mode: "qualifier",
  startingBalance: 100,
  startingEquity: 100,
  equity: 100,
  pnlUsd: 0,
  pnlPercent: 0,
  volume: 0,
  rank: 0,
  lastUpdated: "2026-05-23T12:00:00.000Z",
  gapToLeader: 0,
  ...overrides,
});

describe("buildLeaderboard", () => {
  it("ranks by PnL and uses higher volume as the tie-breaker", () => {
    const leaderboard = buildLeaderboard([
      baseTrader({ id: "a", xHandle: "@a", pnlUsd: 10, volume: 1000 }),
      baseTrader({ id: "b", xHandle: "@b", pnlUsd: 25, volume: 500 }),
      baseTrader({ id: "c", xHandle: "@c", pnlUsd: 25, volume: 2000 }),
    ]);

    expect(leaderboard.map((trader) => [trader.id, trader.rank])).toEqual([
      ["c", 1],
      ["b", 2],
      ["a", 3],
    ]);
  });

  it("computes gap to leader for final standings", () => {
    const leaderboard = buildLeaderboard([
      baseTrader({ id: "a", pnlUsd: 40, mode: "final" }),
      baseTrader({ id: "b", pnlUsd: 10, mode: "final" }),
    ]);

    expect(leaderboard[0].gapToLeader).toBe(0);
    expect(leaderboard[1].gapToLeader).toBe(30);
  });
});

describe("timer helpers", () => {
  it("formats remaining seconds without going negative", () => {
    expect(formatTimer(3600)).toBe("60:00");
    expect(formatTimer(59)).toBe("00:59");
    expect(formatTimer(-10)).toBe("00:00");
  });

  it("freezes live rounds when the timer reaches zero", () => {
    const status = deriveTimerStatus({
      status: "live",
      startedAt: "2026-05-23T12:00:00.000Z",
      durationSeconds: 60,
      now: new Date("2026-05-23T12:01:02.000Z"),
    });

    expect(status.remainingSeconds).toBe(0);
    expect(status.status).toBe("locked");
  });
});

describe("publicTraderView", () => {
  it("does not include wallet addresses in public data", () => {
    const publicView = publicTraderView(
      baseTrader({ walletAddress: "WalletAddressThatMustStayInternal" }),
    );

    expect(Object.keys(publicView)).not.toContain("walletAddress");
    expect(JSON.stringify(publicView)).not.toContain("WalletAddress");
  });
});

describe("createLockedSnapshot", () => {
  it("keeps a frozen copy of standings", () => {
    const live = [baseTrader({ id: "a", pnlUsd: 5 })];
    const locked = createLockedSnapshot(live);

    live[0].pnlUsd = 99;

    expect(locked[0].pnlUsd).toBe(5);
  });
});
