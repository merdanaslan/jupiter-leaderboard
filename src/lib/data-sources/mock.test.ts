import { describe, expect, it } from "vitest";
import {
  advanceMockRound,
  createInitialRoundState,
  getDisplayTraders,
  lockCurrentMode,
  resetRound,
  selectTopFinalists,
} from "./mock";

describe("mock data source", () => {
  it("creates 25 active qualifier traders with internal wallet addresses", () => {
    const state = createInitialRoundState();
    const qualifierTraders = state.mockTraders.filter(
      (trader) => trader.mode === "qualifier" && trader.status === "active",
    );

    expect(qualifierTraders).toHaveLength(25);
    expect(qualifierTraders.every((trader) => trader.xHandle.startsWith("@"))).toBe(true);
    expect(qualifierTraders.every((trader) => trader.walletAddress.length > 20)).toBe(true);
  });

  it("advances live mock data while keeping volume monotonic", () => {
    const state = { ...createInitialRoundState(), status: "live" as const };
    const before = state.mockTraders.find((trader) => trader.id === "q-1");
    const after = advanceMockRound(state, new Date("2026-05-23T12:00:10.000Z"));
    const afterTrader = after.mockTraders.find((trader) => trader.id === "q-1");

    expect(afterTrader?.lastUpdated).toBe("2026-05-23T12:00:10.000Z");
    expect(afterTrader?.volume).toBeGreaterThanOrEqual(before?.volume ?? 0);
  });

  it("selects top four qualifier traders as finalists", () => {
    const state = createInitialRoundState();
    const finalists = selectTopFinalists(state);

    expect(finalists.selectedFinalistIds).toHaveLength(4);
    expect(finalists.mockTraders.filter((trader) => trader.mode === "final")).toHaveLength(4);
  });

  it("keeps qualifier ranks sequential after final traders are created", () => {
    const finalists = selectTopFinalists(createInitialRoundState());
    const qualifierRanks = getDisplayTraders(finalists, "qualifier").map((trader) => trader.rank);

    expect(qualifierRanks.slice(0, 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns locked standings after a round is locked", () => {
    const live = { ...createInitialRoundState(), status: "live" as const };
    const locked = lockCurrentMode(live);
    const advanced = advanceMockRound(locked, new Date("2026-05-23T12:05:00.000Z"));

    expect(getDisplayTraders(advanced, "qualifier")).toEqual(
      locked.lockedStandings.qualifier,
    );
  });

  it("resets mode duration and clears locked standings for that mode", () => {
    const locked = lockCurrentMode({ ...createInitialRoundState(), status: "live" as const });
    const reset = resetRound(locked, "final");

    expect(reset.activeMode).toBe("final");
    expect(reset.durationSeconds).toBe(1800);
    expect(reset.lockedStandings.final).toBeNull();
  });
});
