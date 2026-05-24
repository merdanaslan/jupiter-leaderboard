import { describe, expect, it } from "vitest";
import { createInitialRoundState, lockCurrentMode } from "./data-sources/mock";
import { publicRoundStateForMode } from "./round-view";

describe("publicRoundStateForMode", () => {
  it("uses the requested route duration when that mode is not active", () => {
    const state = createInitialRoundState();

    const finalView = publicRoundStateForMode(state, "final");

    expect(finalView.activeMode).toBe("qualifier");
    expect(finalView.status).toBe("waiting");
    expect(finalView.durationSeconds).toBe(1800);
    expect(finalView.remainingSeconds).toBe(1800);
  });

  it("keeps locked state for a requested mode with locked standings", () => {
    const lockedQualifier = lockCurrentMode(createInitialRoundState());

    const qualifierView = publicRoundStateForMode(
      { ...lockedQualifier, activeMode: "final", durationSeconds: 1800, remainingSeconds: 1800 },
      "qualifier",
    );

    expect(qualifierView.status).toBe("locked");
    expect(qualifierView.remainingSeconds).toBe(0);
    expect(qualifierView.lockedStandings.qualifier).not.toBeNull();
    expect(JSON.stringify(qualifierView.lockedStandings.qualifier)).not.toContain("walletAddress");
  });
});
