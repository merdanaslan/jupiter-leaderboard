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

  it("clears imported trader config and SDK round state", () => {
    const initial = createInitialRoundState();
    const state = applyOperatorAction(
      {
        ...initial,
        dataSource: "jupiter-sdk",
        liveDataStatus: {
          qualifier: "ok",
          final: "ok",
        },
        liveDataUpdatedAt: {
          qualifier: "2026-06-08T10:00:00.000Z",
          final: "2026-06-08T10:00:00.000Z",
        },
        liveStandings: {
          qualifier: null,
          final: [
            {
              displayName: "Test Trader",
              equity: 1000,
              gapToLeader: 0,
              id: "test-wallet",
              lastUpdated: "2026-06-08T10:00:00.000Z",
              mode: "final",
              pnlPercent: 0,
              pnlUsd: 0,
              rank: 1,
              startingBalance: 1000,
              startingEquity: 1000,
              status: "active",
              volume: 0,
              walletAddress: "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E",
              xHandle: "@testtrader",
            },
          ],
        },
        lockedStandings: {
          qualifier: null,
          final: [],
        },
        remainingSeconds: 120,
        sdkRuntime: {
          lastError: "previous error",
          orderActivitiesByWallet: {
            "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E": [],
          },
          orderSnapshotsByWallet: {
            "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E": {},
          },
        },
        selectedFinalistIds: ["test-wallet"],
        startedAt: "2026-06-08T10:00:00.000Z",
        status: "live",
        traderConfigs: [
          {
            displayName: "Test Trader",
            id: "test-wallet",
            mode: "final",
            startingBalance: 1000,
            startingEquity: 1000,
            status: "active",
            walletAddress: "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E",
            xHandle: "@testtrader",
          },
        ],
      },
      { type: "clearTraderConfig" },
    );

    expect(state.traderConfigs).toEqual([]);
    expect(state.selectedFinalistIds).toEqual([]);
    expect(state.liveStandings).toEqual({ qualifier: null, final: null });
    expect(state.lockedStandings).toEqual({ qualifier: null, final: null });
    expect(state.liveDataStatus).toEqual({ qualifier: "idle", final: "idle" });
    expect(state.liveDataUpdatedAt).toEqual({ qualifier: null, final: null });
    expect(state.sdkRuntime).toEqual({
      lastError: null,
      orderActivitiesByWallet: {},
      orderSnapshotsByWallet: {},
    });
    expect(state.startedAt).toBeNull();
    expect(state.status).toBe("waiting");
    expect(state.remainingSeconds).toBe(state.durationSeconds);
  });
});
