import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicLeaderboard } from "./runtime";
import { setRoundStateStoreForTests, type RoundStateStore } from "./state-store";
import { createInitialRoundState } from "./data-sources/mock";
import { buildSdkLeaderboardSnapshot } from "./data-sources/jupiter-perps-sdk-reconstruct";
import type { RoundState, TraderScore } from "./types";

vi.mock("./data-sources/jupiter-perps-sdk-reconstruct", () => ({
  buildSdkLeaderboardSnapshot: vi.fn(),
}));

class MemoryRoundStateStore implements RoundStateStore {
  constructor(private state: RoundState) {}

  async get(): Promise<RoundState> {
    return this.state;
  }

  async set(state: RoundState): Promise<void> {
    this.state = state;
  }

  async update(updater: (state: RoundState) => RoundState | Promise<RoundState>): Promise<RoundState> {
    this.state = await updater(this.state);
    return this.state;
  }
}

afterEach(() => {
  vi.mocked(buildSdkLeaderboardSnapshot).mockReset();
  setRoundStateStoreForTests(null);
});

describe("runtime leaderboard integration", () => {
  it("falls back to the last SDK live snapshot if the final expiry refresh fails", async () => {
    vi.mocked(buildSdkLeaderboardSnapshot).mockRejectedValue(new Error("SDK unavailable"));

    const trader: TraderScore = {
      displayName: "SDK Trader",
      equity: 112,
      gapToLeader: 0,
      id: "sdk-trader",
      lastUpdated: "2026-06-07T09:00:00.000Z",
      mode: "final",
      pnlPercent: 1.2,
      pnlUsd: 12,
      rank: 1,
      startingBalance: 1000,
      startingEquity: 1000,
      status: "active",
      volume: 1500,
      walletAddress: "wallet-internal-only",
      xHandle: "@sdk",
    };
    const state: RoundState = {
      ...createInitialRoundState(),
      activeMode: "final",
      dataSource: "jupiter-sdk",
      durationSeconds: 30,
      liveStandings: {
        final: [trader],
        qualifier: null,
      },
      remainingSeconds: 1,
      startedAt: "2026-06-07T08:59:00.000Z",
      status: "live",
    };
    setRoundStateStoreForTests(new MemoryRoundStateStore(state));

    const payload = await getPublicLeaderboard("final");

    expect(payload.state.status).toBe("locked");
    expect(payload.state.remainingSeconds).toBe(0);
    expect(payload.traders).toHaveLength(1);
    expect(payload.traders[0]).not.toHaveProperty("walletAddress");
    expect(payload.traders[0]).toMatchObject({
      id: "sdk-trader",
      pnlUsd: 12,
      rank: 1,
    });
  });

  it("refreshes SDK standings once before locking when the timer expires", async () => {
    const trader: TraderScore = {
      displayName: "Fresh SDK Trader",
      equity: 999.98,
      gapToLeader: 0,
      id: "fresh-sdk-trader",
      lastUpdated: "2026-06-07T09:00:30.000Z",
      mode: "final",
      pnlPercent: -0.002,
      pnlUsd: -0.02,
      rank: 1,
      startingBalance: 1000,
      startingEquity: 1000,
      status: "active",
      volume: 19.96,
      walletAddress: "wallet-internal-only",
      xHandle: "@fresh",
    };
    vi.mocked(buildSdkLeaderboardSnapshot).mockResolvedValue({
      dataStatus: "ok",
      errors: [],
      latencyMs: 50,
      orderActivitiesByWallet: {},
      orderSnapshotsByWallet: {},
      rows: [],
      traders: [trader],
      updatedAt: "2026-06-07T09:00:30.000Z",
    });
    const state: RoundState = {
      ...createInitialRoundState(),
      activeMode: "final",
      dataSource: "jupiter-sdk",
      durationSeconds: 30,
      liveStandings: {
        final: null,
        qualifier: null,
      },
      remainingSeconds: 1,
      startedAt: "2026-06-07T08:59:00.000Z",
      status: "live",
    };
    setRoundStateStoreForTests(new MemoryRoundStateStore(state));

    const payload = await getPublicLeaderboard("final");

    expect(buildSdkLeaderboardSnapshot).toHaveBeenCalledOnce();
    expect(payload.state.status).toBe("locked");
    expect(payload.state.remainingSeconds).toBe(0);
    expect(payload.traders).toHaveLength(1);
    expect(payload.traders[0]).not.toHaveProperty("walletAddress");
    expect(payload.traders[0]).toMatchObject({
      id: "fresh-sdk-trader",
      pnlUsd: -0.02,
      rank: 1,
    });
  });
});
