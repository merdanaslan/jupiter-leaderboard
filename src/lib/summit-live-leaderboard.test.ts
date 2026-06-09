import { describe, expect, it } from "vitest";

import {
  createSummitMockLeaderboardPayload,
  toSummitFinalRows,
  toSummitQualifierRows,
} from "./summit-live-leaderboard";
import type { PublicTraderScore } from "./types";

describe("summit live leaderboard mock feed", () => {
  it("emits qualifier snapshots in the backend public payload shape", () => {
    const payload = createSummitMockLeaderboardPayload("qualifier", 0);
    const rows = toSummitQualifierRows(payload.traders);

    expect(payload.state).toMatchObject({
      activeMode: "qualifier",
      status: "live",
      durationSeconds: 3600,
      remainingSeconds: 3600,
      dataSource: "mock",
    });
    expect(payload.traders).toHaveLength(25);
    expect(payload.traders[0]).not.toHaveProperty("walletAddress");
    expect(rows[0]).toMatchObject({
      id: "qualifier-merdan",
      rank: 1,
      handle: "@merdan",
      name: "Merdan",
      initials: "MA",
      pnlUsd: "+$36.80",
      pnlPercent: "+36.8%",
      equity: "$136.80",
      volume: "$5.7K",
      positive: true,
    });
    expect(rows[24]).toMatchObject({
      rank: 25,
      handle: "@lastliquid",
      pnlUsd: "-$12.10",
      pnlPercent: "-12.1%",
      equity: "$87.90",
      volume: "$980",
      positive: false,
    });
  });

  it("keeps qualifier mock updates sorted by PnL and produces rank movement", () => {
    const openingRows = toSummitQualifierRows(
      createSummitMockLeaderboardPayload("qualifier", 0).traders,
    );
    const liveRows = toSummitQualifierRows(
      createSummitMockLeaderboardPayload("qualifier", 2).traders,
    );

    expect(liveRows.map((row) => row.rank)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );
    expect(liveRows.map((row) => row.handle)).not.toEqual(
      openingRows.map((row) => row.handle),
    );

    const liveScores = createSummitMockLeaderboardPayload("qualifier", 2).traders;
    for (let index = 1; index < liveScores.length; index += 1) {
      expect(liveScores[index - 1].pnlUsd).toBeGreaterThanOrEqual(liveScores[index].pnlUsd);
    }
  });

  it("emits final snapshots with four finalists, thirty minutes, and allowed markets only", () => {
    const payload = createSummitMockLeaderboardPayload("final", 0);
    const rows = toSummitFinalRows(payload.traders);

    expect(payload.state).toMatchObject({
      activeMode: "final",
      status: "live",
      durationSeconds: 1800,
      remainingSeconds: 1800,
      dataSource: "mock",
    });
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.accent)).toEqual(["gold", "silver", "bronze", "mint"]);
    expect(rows[0]).toMatchObject({
      id: "final-merdan",
      rank: 1,
      placement: "1st",
      handle: "@merdan",
      pnlUsd: "+$435.00",
      pnlPercent: "+43.5%",
      equity: "$1,435.00",
      volume: "$63.6K",
    });

    const markets = rows.map((row) => row.recent.market);
    expect(markets).toEqual(expect.arrayContaining(["BTC", "ETH", "SOL"]));
    expect(markets).not.toContain("JUP");
  });

  it("lets final mock updates reorder finalists without changing row identities", () => {
    const openingRows = toSummitFinalRows(
      createSummitMockLeaderboardPayload("final", 0).traders,
    );
    const liveRows = toSummitFinalRows(
      createSummitMockLeaderboardPayload("final", 3).traders,
    );

    expect(liveRows).toHaveLength(4);
    expect(new Set(liveRows.map((row) => row.id))).toEqual(
      new Set(openingRows.map((row) => row.id)),
    );
    expect(liveRows.map((row) => row.handle)).not.toEqual(
      openingRows.map((row) => row.handle),
    );
    expect(liveRows.map((row) => row.accent)).toEqual(["gold", "silver", "bronze", "mint"]);
  });

  it("can shorten mock duration for celebration demos", () => {
    const payload = createSummitMockLeaderboardPayload("qualifier", 3, "live", {
      durationSeconds: 6,
    });

    expect(payload.state.durationSeconds).toBe(6);
    expect(payload.state.remainingSeconds).toBe(0);
    expect(payload.state.status).toBe("locked");
  });

  it("preserves avatar URLs for summit qualifier and final rows", () => {
    const trader: PublicTraderScore = {
      avatarUrl: "/avatars/mert.jpg",
      displayName: "Jupiter Wallet",
      equity: 100,
      gapToLeader: 0,
      id: "jupiter-wallet",
      lastUpdated: "2026-06-07T09:00:00.000Z",
      mode: "qualifier",
      pnlPercent: 0,
      pnlUsd: 0,
      rank: 1,
      startingBalance: 100,
      startingEquity: 100,
      status: "active",
      volume: 0,
      xHandle: "@jupiterwallet",
    };

    expect(toSummitQualifierRows([trader])[0].avatarUrl).toBe("/avatars/mert.jpg");
    expect(toSummitFinalRows([{ ...trader, mode: "final", startingBalance: 1000, startingEquity: 1000 }])[0].avatarUrl).toBe("/avatars/mert.jpg");
  });

  it("maps SDK recent activity into the final recent activity display shape", () => {
    const trader: PublicTraderScore = {
      displayName: "SDK Trader",
      equity: 100.4,
      gapToLeader: 0,
      id: "sdk-trader",
      lastUpdated: "2026-06-07T09:00:00.000Z",
      mode: "final",
      pnlPercent: 0.04,
      pnlUsd: 0.4,
      rank: 1,
      startingBalance: 1000,
      startingEquity: 1000,
      status: "active",
      volume: 42,
      xHandle: "@sdk",
      recentActivity: {
        action: "place",
        entirePosition: false,
        market: "SOL",
        orderKind: "TP",
        side: "long",
        sizeUsd: 11.98,
        timestamp: "2026-06-07T09:00:00.000Z",
        triggerPriceUsd: 65,
        type: "order",
      },
    };

    const [row] = toSummitFinalRows([trader]);

    expect(row.recent).toEqual({
      action: "PLACE TP",
      detail: "$11.98 @ $65.00",
      market: "SOL",
      pnl: "--",
      positive: true,
      side: "LONG",
    });
  });

  it("uses USD notional for SDK trade activity details and exact small volume", () => {
    const trader: PublicTraderScore = {
      displayName: "SDK Trader",
      equity: 999.89,
      gapToLeader: 0,
      id: "sdk-trader",
      lastUpdated: "2026-06-07T09:00:00.000Z",
      mode: "final",
      pnlPercent: -0.011,
      pnlUsd: -0.11,
      rank: 1,
      startingBalance: 1000,
      startingEquity: 1000,
      status: "active",
      volume: 30.91,
      xHandle: "@sdk",
      recentActivity: {
        action: "open",
        executionType: "market",
        feeUsd: 0.02,
        market: "SOL",
        notionalUsd: 30.91,
        priceUsd: 66.7,
        realizedPnlUsd: null,
        side: "short",
        sizeToken: 0.4634,
        timestamp: "2026-06-07T09:00:00.000Z",
        type: "trade",
      },
    };

    const [row] = toSummitFinalRows([trader]);

    expect(row.pnlPercent).toBe("-0.01%");
    expect(row.volume).toBe("$30.91");
    expect(row.recent).toMatchObject({
      action: "OPEN",
      detail: "$30.91 @ $66.70",
      market: "SOL",
      pnl: "--",
      side: "SHORT",
    });
  });

  it("labels SDK collateral-only recent activity as deposit or withdraw", () => {
    const baseTrader: PublicTraderScore = {
      displayName: "SDK Trader",
      equity: 999.99,
      gapToLeader: 0,
      id: "sdk-trader",
      lastUpdated: "2026-06-07T09:00:00.000Z",
      mode: "final",
      pnlPercent: -0.001,
      pnlUsd: -0.01,
      rank: 1,
      startingBalance: 1000,
      startingEquity: 1000,
      status: "active",
      volume: 21.27,
      xHandle: "@sdk",
    };
    const depositTrader: PublicTraderScore = {
      ...baseTrader,
      recentActivity: {
        action: "deposit",
        collateralUsdDelta: -1,
        executionType: "market",
        feeUsd: 0,
        market: "SOL",
        notionalUsd: 0,
        priceUsd: 66.79,
        realizedPnlUsd: null,
        side: "short",
        sizeToken: 0,
        timestamp: "2026-06-07T09:00:00.000Z",
        type: "trade",
      },
    };
    const withdrawTrader: PublicTraderScore = {
      ...baseTrader,
      id: "sdk-trader-withdraw",
      recentActivity: {
        action: "withdraw",
        collateralUsdDelta: 0.98,
        executionType: "market",
        feeUsd: 0,
        market: "SOL",
        notionalUsd: 0,
        priceUsd: 66.79,
        realizedPnlUsd: null,
        side: "short",
        sizeToken: 0,
        timestamp: "2026-06-07T09:01:00.000Z",
        type: "trade",
      },
    };

    const [depositRow, withdrawRow] = toSummitFinalRows([depositTrader, withdrawTrader]);

    expect(depositRow.recent).toMatchObject({
      action: "DEPOSIT",
      detail: "-$1.00 collateral",
      market: "SOL",
      pnl: "--",
      side: "SHORT",
    });
    expect(withdrawRow.recent).toMatchObject({
      action: "WITHDRAW",
      detail: "+$0.98 collateral",
      market: "SOL",
      pnl: "--",
      side: "SHORT",
    });
  });

  it("does not display negative zero for tiny PnL percentages", () => {
    const trader: PublicTraderScore = {
      displayName: "SDK Trader",
      equity: 999.99,
      gapToLeader: 0,
      id: "sdk-trader",
      lastUpdated: "2026-06-07T09:00:00.000Z",
      mode: "final",
      pnlPercent: -0.0004,
      pnlUsd: -0.01,
      rank: 1,
      startingBalance: 1000,
      startingEquity: 1000,
      status: "active",
      volume: 1,
      xHandle: "@sdk",
    };

    const [row] = toSummitFinalRows([trader]);

    expect(row.pnlPercent).toBe("+0.00%");
  });

  it("keeps large leaderboard numbers compact enough for the display", () => {
    const trader: PublicTraderScore = {
      displayName: "Large Number Trader",
      equity: 12_345.67,
      gapToLeader: 0,
      id: "large-number-trader",
      lastUpdated: "2026-06-07T09:00:00.000Z",
      mode: "final",
      pnlPercent: 234.567,
      pnlUsd: 2_345.67,
      rank: 1,
      startingBalance: 1000,
      startingEquity: 1000,
      status: "active",
      volume: 1_234_567,
      xHandle: "@large",
    };

    const [row] = toSummitFinalRows([trader]);

    expect(row.pnlUsd).toBe("+$2,345.67");
    expect(row.pnlPercent).toBe("+234.6%");
    expect(row.equity).toBe("$12,345.67");
    expect(row.volume).toBe("$1.2M");
  });

  it("does not synthesize recent activity for configured traders with no trades yet", () => {
    const trader: PublicTraderScore = {
      displayName: "SDK Trader",
      equity: 1000,
      gapToLeader: 0,
      id: "sdk-trader",
      lastUpdated: "2026-06-07T09:00:00.000Z",
      mode: "final",
      pnlPercent: 0,
      pnlUsd: 0,
      rank: 1,
      startingBalance: 1000,
      startingEquity: 1000,
      status: "active",
      volume: 0,
      xHandle: "@sdk",
    };

    const [row] = toSummitFinalRows([trader]);

    expect(row.recent).toBeNull();
  });
});
