import {
  advanceMockRound,
  getDisplayTraders,
  lockCurrentMode,
  rankMockTraders,
  selectTopFinalists,
} from "./data-sources/mock";
import { publicLeaderboardView } from "./leaderboard";
import { applyOperatorAction, type OperatorAction } from "./round-actions";
import { publicRoundStateForMode } from "./round-view";
import { getRoundStateStore } from "./state-store";
import type { CompetitionMode, PublicLeaderboardPayload, RoundState } from "./types";

export async function getPublicLeaderboard(mode: CompetitionMode): Promise<PublicLeaderboardPayload> {
  const store = getRoundStateStore();
  const current = await store.get();
  const previewState = preparePublicState(current, mode);
  const shouldPersist =
    current.status === "live" ||
    previewState.status !== current.status ||
    previewState.mockTraders.length !== current.mockTraders.length;
  const state = shouldPersist
    ? await store.update((latest) => preparePublicState(latest, mode))
    : previewState;
  const traders = getDisplayTraders(state, mode);

  return {
    state: publicRoundStateForMode(state, mode),
    traders: publicLeaderboardView(traders),
  };
}

function preparePublicState(state: RoundState, mode: CompetitionMode): RoundState {
  const updated = updateRuntimeState(state);
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
  const advanced = advanceMockRound(
    {
      ...normalizedState,
      remainingSeconds,
    },
    now,
  );

  if (remainingSeconds === 0) {
    return lockCurrentMode(advanced);
  }

  return {
    ...advanced,
    remainingSeconds,
  };
}
