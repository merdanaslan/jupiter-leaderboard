import {
  lockCurrentMode,
  resetRound,
  selectTopFinalists,
  setRoundStatus,
  setScenario,
} from "./data-sources/mock";
import { buildLeaderboard, createLockedSnapshot } from "./leaderboard";
import { durationForMode } from "./round-durations";
import { parseTraderConfig } from "./trader-config";
import type { CompetitionMode, LeaderboardDataSourceId, MockScenario, RoundState } from "./types";

export type OperatorAction =
  | { type: "start"; now?: string }
  | { type: "lock" }
  | { type: "reset"; mode?: CompetitionMode }
  | { type: "setMode"; mode: CompetitionMode }
  | { type: "setDataSource"; dataSource: LeaderboardDataSourceId }
  | { type: "importTraderConfig"; contents: string }
  | { type: "clearTraderConfig" }
  | { type: "setScenario"; scenario: MockScenario }
  | { type: "selectFinalists"; finalistIds: string[] };

export function applyOperatorAction(state: RoundState, action: OperatorAction): RoundState {
  switch (action.type) {
    case "start":
      return state.dataSource === "mock"
        ? setRoundStatus(state, "live", action.now ? new Date(action.now) : new Date())
        : startSdkRound(state, action.now ? new Date(action.now) : new Date());
    case "lock":
      return state.dataSource === "mock" ? lockCurrentMode(state) : lockSdkRound(state);
    case "reset":
      return state.dataSource === "mock"
        ? resetRound(state, action.mode ?? state.activeMode)
        : resetSdkRound(state, action.mode ?? state.activeMode);
    case "setMode":
      return state.dataSource === "mock" ? resetRound(state, action.mode) : resetSdkRound(state, action.mode);
    case "setDataSource":
      return setDataSource(state, action.dataSource);
    case "importTraderConfig":
      return importTraderConfig(state, action.contents);
    case "clearTraderConfig":
      return clearTraderConfig(state);
    case "setScenario":
      return setScenario(state, action.scenario);
    case "selectFinalists":
      return state.dataSource === "mock"
        ? selectTopFinalists(state, action.finalistIds)
        : selectSdkFinalists(state, action.finalistIds);
    default:
      return exhaustive(action);
  }
}

function startSdkRound(state: RoundState, now = new Date()): RoundState {
  return {
    ...state,
    lockedStandings: {
      ...state.lockedStandings,
      [state.activeMode]: null,
    },
    liveDataStatus: {
      ...state.liveDataStatus,
      [state.activeMode]: "idle",
    },
    liveDataUpdatedAt: {
      ...state.liveDataUpdatedAt,
      [state.activeMode]: null,
    },
    liveStandings: {
      ...state.liveStandings,
      [state.activeMode]: null,
    },
    remainingSeconds: state.durationSeconds,
    sdkRuntime: {
      lastError: null,
      orderActivitiesByWallet: {},
      orderSnapshotsByWallet: {},
    },
    startedAt: now.toISOString(),
    status: "live",
    updatedAt: now.toISOString(),
  };
}

function lockSdkRound(state: RoundState): RoundState {
  const standings = state.liveStandings[state.activeMode] ?? [];
  return {
    ...state,
    lockedStandings: {
      ...state.lockedStandings,
      [state.activeMode]: createLockedSnapshot(buildLeaderboard(standings)),
    },
    remainingSeconds: 0,
    status: "locked",
    updatedAt: new Date().toISOString(),
  };
}

function resetSdkRound(state: RoundState, mode: CompetitionMode): RoundState {
  return {
    ...state,
    activeMode: mode,
    durationSeconds: durationForMode(mode),
    liveDataStatus: {
      ...state.liveDataStatus,
      [mode]: "idle",
    },
    liveDataUpdatedAt: {
      ...state.liveDataUpdatedAt,
      [mode]: null,
    },
    liveStandings: {
      ...state.liveStandings,
      [mode]: null,
    },
    lockedStandings: {
      ...state.lockedStandings,
      [mode]: null,
    },
    remainingSeconds: durationForMode(mode),
    sdkRuntime: {
      lastError: null,
      orderActivitiesByWallet: {},
      orderSnapshotsByWallet: {},
    },
    startedAt: null,
    status: "waiting",
    updatedAt: new Date().toISOString(),
  };
}

function setDataSource(state: RoundState, dataSource: LeaderboardDataSourceId): RoundState {
  return {
    ...state,
    dataSource,
    status: "waiting",
    startedAt: null,
    remainingSeconds: state.durationSeconds,
    updatedAt: new Date().toISOString(),
  };
}

function importTraderConfig(state: RoundState, contents: string): RoundState {
  const traders = parseTraderConfig(contents);
  const validIds = new Set(traders.map((trader) => trader.id));
  return {
    ...state,
    selectedFinalistIds: state.selectedFinalistIds.filter((id) => validIds.has(id)),
    traderConfigs: traders,
    updatedAt: new Date().toISOString(),
  };
}

function clearTraderConfig(state: RoundState): RoundState {
  const now = new Date().toISOString();
  return {
    ...state,
    liveDataStatus: {
      qualifier: "idle",
      final: "idle",
    },
    liveDataUpdatedAt: {
      qualifier: null,
      final: null,
    },
    liveStandings: {
      qualifier: null,
      final: null,
    },
    lockedStandings: {
      qualifier: null,
      final: null,
    },
    remainingSeconds: durationForMode(state.activeMode),
    sdkRuntime: {
      lastError: null,
      orderActivitiesByWallet: {},
      orderSnapshotsByWallet: {},
    },
    selectedFinalistIds: [],
    startedAt: null,
    status: "waiting",
    traderConfigs: [],
    updatedAt: now,
  };
}

function selectSdkFinalists(state: RoundState, finalistIds: string[]): RoundState {
  return {
    ...state,
    selectedFinalistIds: finalistIds.slice(0, 4),
    updatedAt: new Date().toISOString(),
  };
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled operator action: ${JSON.stringify(value)}`);
}
