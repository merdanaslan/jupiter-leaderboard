import {
  advanceMockRound,
  getDisplayTraders,
  lockCurrentMode,
  rankMockTraders,
  selectTopFinalists,
} from "./data-sources/mock";
import { buildSdkLeaderboardSnapshot } from "./data-sources/jupiter-perps-sdk-reconstruct";
import { buildLeaderboard, createLockedSnapshot, publicLeaderboardView } from "./leaderboard";
import { applyOperatorAction, type OperatorAction } from "./round-actions";
import { publicRoundStateForMode } from "./round-view";
import { getRoundStateStore } from "./state-store";
import type { CompetitionMode, PublicLeaderboardPayload, RoundState, TraderConfig, TraderScore } from "./types";

const SDK_REFRESH_MS: Record<CompetitionMode, number> = {
  qualifier: Number(process.env.QUALIFIER_REFRESH_MS ?? 5_000),
  final: Number(process.env.FINAL_REFRESH_MS ?? 2_000),
};

const SDK_RECENT_LIMIT = Number(process.env.LEADERBOARD_RECENT_LIMIT ?? 8);

export async function getPublicLeaderboard(mode: CompetitionMode): Promise<PublicLeaderboardPayload> {
  const store = getRoundStateStore();
  const now = new Date();
  const current = await store.get();
  const previewState = preparePublicState(current, mode, now);
  const shouldPersist =
    current.status === "live" ||
    previewState.status !== current.status ||
    previewState.remainingSeconds !== current.remainingSeconds ||
    previewState.mockTraders.length !== current.mockTraders.length ||
    shouldFinalizeSdkRound(current, mode, now) ||
    shouldRefreshSdk(previewState, mode);
  const state = shouldPersist
    ? await store.update(async (latest) => {
        if (shouldFinalizeSdkRound(latest, mode, now)) {
          const refreshed = await refreshSdkState(prepareSdkStateAtExpiry(latest, now), mode);
          return lockSdkCurrentMode(refreshed);
        }

        const prepared = preparePublicState(latest, mode, now);
        return shouldRefreshSdk(prepared, mode) ? refreshSdkState(prepared, mode) : prepared;
      })
    : previewState;
  const traders = getDisplayTradersForState(state, mode);

  return {
    state: publicRoundStateForMode(state, mode),
    traders: publicLeaderboardView(traders),
  };
}

function preparePublicState(state: RoundState, mode: CompetitionMode, now = new Date()): RoundState {
  const updated = updateRuntimeState(state, now);
  const needsMockFinalists =
    mode === "final" &&
    updated.dataSource === "mock" &&
    updated.mockTraders.filter((trader) => trader.mode === "final").length === 0;

  return needsMockFinalists ? selectTopFinalists(updated) : updated;
}

export async function getOperatorState(): Promise<RoundState> {
  return getRoundStateStore().update((current) => updateRuntimeState(current));
}

export async function applyOperatorStateAction(action: OperatorAction): Promise<RoundState> {
  return getRoundStateStore().update((current) => applyOperatorAction(updateRuntimeState(current), action));
}

function updateRuntimeState(state: RoundState, now = new Date()): RoundState {
  const normalizedState =
    state.dataSource === "mock" ? { ...state, mockTraders: rankMockTraders(state.mockTraders) } : state;

  if (normalizedState.status !== "live" || !normalizedState.startedAt) {
    return normalizedState;
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(normalizedState.startedAt).getTime()) / 1000),
  );
  const remainingSeconds = Math.max(0, normalizedState.durationSeconds - elapsedSeconds);
  const withTimer = {
    ...normalizedState,
    remainingSeconds,
    updatedAt: now.toISOString(),
  };

  const advanced = withTimer.dataSource === "mock" ? advanceMockRound(withTimer, now) : withTimer;

  if (remainingSeconds === 0) {
    return advanced.dataSource === "mock" ? lockCurrentMode(advanced) : lockSdkCurrentMode(advanced);
  }

  return {
    ...advanced,
    remainingSeconds,
  };
}

function getDisplayTradersForState(state: RoundState, mode: CompetitionMode): TraderScore[] {
  const locked = state.lockedStandings[mode];
  if (locked) return locked;
  if (state.dataSource === "jupiter-sdk") {
    return buildLeaderboard(state.liveStandings[mode] ?? configuredZeroScores(state, mode));
  }
  return getDisplayTraders(state, mode);
}

function lockSdkCurrentMode(state: RoundState): RoundState {
  const standings = getDisplayTradersForState(state, state.activeMode);
  return {
    ...state,
    status: "locked",
    remainingSeconds: 0,
    lockedStandings: {
      ...state.lockedStandings,
      [state.activeMode]: createLockedSnapshot(standings),
    },
  };
}

async function refreshSdkState(state: RoundState, mode: CompetitionMode): Promise<RoundState> {
  if (!state.startedAt) return state;

  const traderConfig = getSdkTraderConfigs(state, mode);
  const startTimestamp = Math.floor(new Date(state.startedAt).getTime() / 1000);

  try {
    const snapshot = await buildSdkLeaderboardSnapshot({
      mode,
      orderActivitiesByWallet: state.sdkRuntime.orderActivitiesByWallet,
      orderSnapshotsByWallet: state.sdkRuntime.orderSnapshotsByWallet,
      options: {
        includeLimitOrders: true,
        recentLimit: SDK_RECENT_LIMIT,
        startTimestamp,
        startingEquity: mode === "final" ? 1_000 : 100,
      },
      traderConfig,
    });

    return {
      ...state,
      liveDataStatus: {
        ...state.liveDataStatus,
        [mode]: snapshot.dataStatus,
      },
      liveDataUpdatedAt: {
        ...state.liveDataUpdatedAt,
        [mode]: snapshot.updatedAt,
      },
      liveStandings: {
        ...state.liveStandings,
        [mode]: snapshot.traders,
      },
      sdkRuntime: {
        lastError: snapshot.errors.length > 0 ? snapshot.errors.join(" | ") : null,
        orderActivitiesByWallet: snapshot.orderActivitiesByWallet,
        orderSnapshotsByWallet: snapshot.orderSnapshotsByWallet,
      },
      updatedAt: snapshot.updatedAt,
    };
  } catch (error) {
    return {
      ...state,
      liveDataStatus: {
        ...state.liveDataStatus,
        [mode]: "error",
      },
      sdkRuntime: {
        ...state.sdkRuntime,
        lastError: error instanceof Error ? error.message : String(error),
      },
      updatedAt: new Date().toISOString(),
    };
  }
}

function shouldRefreshSdk(state: RoundState, mode: CompetitionMode): boolean {
  if (state.dataSource !== "jupiter-sdk") return false;
  if (state.activeMode !== mode || state.status !== "live" || !state.startedAt) return false;

  const updatedAt = state.liveDataUpdatedAt[mode];
  if (!updatedAt) return true;

  return Date.now() - new Date(updatedAt).getTime() >= SDK_REFRESH_MS[mode];
}

function shouldFinalizeSdkRound(state: RoundState, mode: CompetitionMode, now = new Date()): boolean {
  if (state.dataSource !== "jupiter-sdk") return false;
  if (state.activeMode !== mode || state.status !== "live" || !state.startedAt) return false;

  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(state.startedAt).getTime()) / 1000),
  );

  return elapsedSeconds >= state.durationSeconds;
}

function prepareSdkStateAtExpiry(state: RoundState, now = new Date()): RoundState {
  return {
    ...state,
    remainingSeconds: 0,
    updatedAt: now.toISOString(),
  };
}

function getSdkTraderConfigs(state: RoundState, mode: CompetitionMode): TraderConfig[] {
  const activeModeConfigs = state.traderConfigs.filter(
    (trader) => trader.mode === mode && trader.status === "active",
  );
  if (mode !== "final" || activeModeConfigs.length > 0) return activeModeConfigs;

  const selectedIds = new Set(state.selectedFinalistIds);
  return state.traderConfigs
    .filter((trader) => trader.mode === "qualifier" && trader.status === "active" && selectedIds.has(trader.id))
    .slice(0, 4)
    .map((trader) => ({
      ...trader,
      id: `final-${trader.id}`,
      mode: "final" as const,
      startingBalance: 1_000,
      startingEquity: 1_000,
    }));
}

function configuredZeroScores(state: RoundState, mode: CompetitionMode): TraderScore[] {
  const now = new Date().toISOString();
  return getSdkTraderConfigs(state, mode).map((trader, index) => ({
    ...trader,
    equity: trader.startingEquity,
    gapToLeader: 0,
    lastUpdated: now,
    pnlPercent: 0,
    pnlUsd: 0,
    rank: index + 1,
    volume: 0,
  }));
}
