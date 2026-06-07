import { describe, expect, it } from "vitest";

import {
  getFinalCelebrationEvent,
  getQualifierCelebrationEvent,
  isCelebrationCooldownReady,
} from "./summit-celebration-events";
import { createSummitMockLeaderboardPayload } from "./summit-live-leaderboard";

describe("summit celebration events", () => {
  it("detects when a trader enters the qualifier top four", () => {
    const previous = createSummitMockLeaderboardPayload("qualifier", 4).traders;
    const next = createSummitMockLeaderboardPayload("qualifier", 5).traders;

    expect(getQualifierCelebrationEvent(previous, next)).toEqual({
      type: "top-four-entry",
      traderIds: ["qualifier-blocksmith"],
    });
  });

  it("detects when the same qualifier top four reorder among themselves", () => {
    const previous = createSummitMockLeaderboardPayload("qualifier", 3).traders;
    const next = createSummitMockLeaderboardPayload("qualifier", 4).traders;

    expect(getQualifierCelebrationEvent(previous, next)).toEqual({
      type: "top-four-reorder",
      traderIds: [
        "qualifier-solape",
        "qualifier-merdan",
        "qualifier-berlinbull",
        "qualifier-juptrader",
      ],
    });
  });

  it("does not emit a qualifier event for unchanged top four order", () => {
    const previous = createSummitMockLeaderboardPayload("qualifier", 0).traders;
    const next = createSummitMockLeaderboardPayload("qualifier", 0).traders;

    expect(getQualifierCelebrationEvent(previous, next)).toBeNull();
  });

  it("detects final placement changes and returns the moved finalists", () => {
    const previous = createSummitMockLeaderboardPayload("final", 4).traders;
    const next = createSummitMockLeaderboardPayload("final", 5).traders;

    expect(getFinalCelebrationEvent(previous, next)).toEqual({
      type: "final-position-change",
      traderIds: ["final-solape", "final-merdan"],
    });
  });

  it("does not emit a final event for unchanged finalist order", () => {
    const previous = createSummitMockLeaderboardPayload("final", 0).traders;
    const next = createSummitMockLeaderboardPayload("final", 0).traders;

    expect(getFinalCelebrationEvent(previous, next)).toBeNull();
  });

  it("enforces a three second celebration cooldown", () => {
    expect(isCelebrationCooldownReady({ lastTriggeredAt: null, now: 1_000, cooldownMs: 3_000 })).toBe(true);
    expect(isCelebrationCooldownReady({ lastTriggeredAt: 1_000, now: 3_999, cooldownMs: 3_000 })).toBe(false);
    expect(isCelebrationCooldownReady({ lastTriggeredAt: 1_000, now: 4_000, cooldownMs: 3_000 })).toBe(true);
  });
});
