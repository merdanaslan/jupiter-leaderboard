import { describe, expect, it } from "vitest";
import { applyOperatorAction } from "./round-actions";
import { createInitialRoundState } from "./data-sources/mock";

describe("applyOperatorAction", () => {
  it("starts the current round", () => {
    const state = applyOperatorAction(createInitialRoundState(), {
      type: "start",
      now: "2026-05-23T12:00:00.000Z",
    });

    expect(state.status).toBe("live");
    expect(state.startedAt).toBe("2026-05-23T12:00:00.000Z");
  });

  it("locks the current mode and stores standings", () => {
    const state = applyOperatorAction(
      { ...createInitialRoundState(), status: "live" },
      { type: "lock" },
    );

    expect(state.status).toBe("locked");
    expect(state.lockedStandings.qualifier).toHaveLength(25);
  });

  it("switches to final mode and prepares finalists", () => {
    const state = applyOperatorAction(createInitialRoundState(), {
      type: "setMode",
      mode: "final",
    });

    expect(state.activeMode).toBe("final");
    expect(state.durationSeconds).toBe(1800);
    expect(state.mockTraders.filter((trader) => trader.mode === "final")).toHaveLength(4);
  });

  it("sets a mock scenario", () => {
    const state = applyOperatorAction(createInitialRoundState(), {
      type: "setScenario",
      scenario: "top-4-battle",
    });

    expect(state.scenario).toBe("top-4-battle");
  });
});
