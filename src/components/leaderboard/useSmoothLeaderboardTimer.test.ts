import { describe, expect, it } from "vitest";
import { getNextLeaderboardTimerDelayMs } from "./useSmoothLeaderboardTimer";

describe("getNextLeaderboardTimerDelayMs", () => {
  it("aligns ticks to the next round-clock second boundary", () => {
    const startedAtMs = Date.parse("2026-06-07T20:00:00.000Z");

    expect(getNextLeaderboardTimerDelayMs(startedAtMs, startedAtMs)).toBe(1_000);
    expect(getNextLeaderboardTimerDelayMs(startedAtMs + 250, startedAtMs)).toBe(750);
    expect(getNextLeaderboardTimerDelayMs(startedAtMs + 999, startedAtMs)).toBe(1);
    expect(getNextLeaderboardTimerDelayMs(startedAtMs + 1_500, startedAtMs)).toBe(500);
  });
});
