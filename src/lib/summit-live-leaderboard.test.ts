import { describe, expect, it } from "vitest";

import {
  createSummitMockLeaderboardPayload,
  toSummitFinalRows,
  toSummitQualifierRows,
} from "./summit-live-leaderboard";

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
});
