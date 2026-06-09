import { buildLeaderboard, createLockedSnapshot } from "../leaderboard";
import { durationForMode, QUALIFIER_DURATION_SECONDS } from "../round-durations";
import type {
  CompetitionMode,
  MockScenario,
  RoundState,
  RoundStatus,
  TraderScore,
} from "../types";
import type { LeaderboardDataSource } from "./types";

const MOCK_HANDLES = [
  "@mertTrades",
  "@solanaLena",
  "@jupMax",
  "@berlinPerps",
  "@greenCandle",
  "@satoshiSam",
  "@ethEva",
  "@btcBen",
  "@solHunter",
  "@perpNina",
  "@alpacaAlpha",
  "@limitLuca",
  "@marginMila",
  "@wickWizard",
  "@volVictor",
  "@fundingFritz",
  "@chartClara",
  "@orbitalOtto",
  "@quantKira",
  "@basisBasti",
  "@deltaDina",
  "@gammaGero",
  "@riskRosa",
  "@breakoutBo",
  "@hedgeHanna",
];

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function mockWallet(index: number): string {
  return `MockWallet${String(index + 1).padStart(2, "0")}111111111111111111111111`;
}

function baseQualifierTrader(index: number, now = new Date("2026-05-23T12:00:00.000Z")): TraderScore {
  const startingEquity = 100;
  const pnlUsd = (12 - index) * 1.35;

  return {
    id: `q-${index + 1}`,
    xHandle: MOCK_HANDLES[index],
    displayName: MOCK_HANDLES[index].replace("@", ""),
    walletAddress: mockWallet(index),
    status: "active",
    mode: "qualifier",
    startingBalance: 100,
    startingEquity,
    equity: startingEquity + pnlUsd,
    pnlUsd,
    pnlPercent: (pnlUsd / startingEquity) * 100,
    volume: 350 + index * 112,
    rank: 0,
    lastUpdated: nowIso(now),
    gapToLeader: 0,
  };
}

function scenarioMultiplier(scenario: MockScenario, index: number): number {
  switch (scenario) {
    case "close-race":
      return index < 6 ? 0.22 : 0.08;
    case "top-4-battle":
      return index >= 2 && index <= 7 ? 0.7 : 0.15;
    case "negative-market":
      return index % 3 === 0 ? -0.25 : -0.52;
    case "last-minute-upset":
      return index === 4 ? 1.4 : 0.2;
    case "interruption":
    case "locked":
      return 0;
    case "steady":
    default:
      return 0.35;
  }
}

function tickDelta(now: Date, index: number, scenario: MockScenario): number {
  const seconds = Math.floor(now.getTime() / 1000);
  const wave = Math.sin(seconds / 7 + index * 1.73);
  const drift = Math.cos(seconds / 19 + index);
  return (wave * 1.1 + drift * 0.45) * scenarioMultiplier(scenario, index);
}

export function createInitialRoundState(now = new Date("2026-05-23T12:00:00.000Z")): RoundState {
  return {
    activeMode: "qualifier",
    status: "waiting",
    scenario: "steady",
    durationSeconds: QUALIFIER_DURATION_SECONDS,
    remainingSeconds: QUALIFIER_DURATION_SECONDS,
    startedAt: null,
    updatedAt: nowIso(now),
    selectedFinalistIds: [],
    lockedStandings: {
      qualifier: null,
      final: null,
    },
    liveStandings: {
      qualifier: null,
      final: null,
    },
    liveDataUpdatedAt: {
      qualifier: null,
      final: null,
    },
    liveDataStatus: {
      qualifier: "idle",
      final: "idle",
    },
    mockTraders: rankMockTraders(MOCK_HANDLES.map((_, index) => baseQualifierTrader(index, now))),
    traderConfigs: [],
    sdkRuntime: {
      lastError: null,
      orderActivitiesByWallet: {},
      orderSnapshotsByWallet: {},
    },
    dataSource: "mock",
  };
}

export function getDisplayTraders(state: RoundState, mode: CompetitionMode): TraderScore[] {
  const locked = state.lockedStandings[mode];
  if (locked) return locked;

  return buildLeaderboard(
    state.mockTraders.filter(
      (trader) => trader.mode === mode && trader.status === "active",
    ),
  );
}

export function advanceMockRound(state: RoundState, now = new Date()): RoundState {
  if (state.status !== "live") {
    return { ...state, updatedAt: nowIso(now) };
  }

  const nextTraders = state.mockTraders.map((trader, index) => {
    if (trader.mode !== state.activeMode || trader.status !== "active") return trader;

    const pnlUsd = Number((trader.pnlUsd + tickDelta(now, index, state.scenario)).toFixed(2));
    const volumeBump = Math.max(0, Math.round(18 + Math.abs(tickDelta(now, index, "steady")) * 72));
    const equity = Number((trader.startingEquity + pnlUsd).toFixed(2));

    return {
      ...trader,
      pnlUsd,
      equity,
      pnlPercent: trader.startingEquity > 0 ? (pnlUsd / trader.startingEquity) * 100 : 0,
      volume: trader.volume + volumeBump,
      lastUpdated: nowIso(now),
      recentTrade: {
        market: index % 3 === 0 ? "SOL" : index % 3 === 1 ? "BTC" : "ETH",
        side: index % 2 === 0 ? "long" : "short",
        notionalUsd: volumeBump,
        pnlUsd: Number(tickDelta(now, index, state.scenario).toFixed(2)),
        timestamp: nowIso(now),
      },
    } satisfies TraderScore;
  });

  return {
    ...state,
    mockTraders: rankMockTraders(nextTraders),
    updatedAt: nowIso(now),
  };
}

export function selectTopFinalists(state: RoundState, finalistIds?: string[]): RoundState {
  const qualifierLeaderboard = getDisplayTraders(state, "qualifier");
  const selectedIds = finalistIds?.length
    ? finalistIds.slice(0, 4)
    : qualifierLeaderboard.slice(0, 4).map((trader) => trader.id);

  const selectedQualifiers = selectedIds
    .map((id) => qualifierLeaderboard.find((trader) => trader.id === id))
    .filter((trader): trader is TraderScore => Boolean(trader));

  const finalistTraders = selectedQualifiers.map((trader, index) => ({
    ...trader,
    id: `f-${trader.id}`,
    mode: "final" as const,
    startingBalance: 1000,
    startingEquity: 1000,
    equity: 1000 + index * 2,
    pnlUsd: index * -1.5,
    pnlPercent: index * -0.15,
    volume: 0,
    rank: 0,
    gapToLeader: 0,
    recentTrade: undefined,
    openTrade: undefined,
  }));

  return {
    ...state,
    selectedFinalistIds: selectedIds,
    mockTraders: rankMockTraders([
      ...state.mockTraders.filter((trader) => trader.mode !== "final"),
      ...finalistTraders,
    ]),
  };
}

export function lockCurrentMode(state: RoundState): RoundState {
  const standings = getDisplayTraders(state, state.activeMode);
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

export function resetRound(state: RoundState, mode: CompetitionMode): RoundState {
  const now = new Date();
  const nextState: RoundState = {
    ...state,
    activeMode: mode,
    status: "waiting",
    durationSeconds: durationForMode(mode),
    remainingSeconds: durationForMode(mode),
    startedAt: null,
    updatedAt: nowIso(now),
    lockedStandings: {
      ...state.lockedStandings,
      [mode]: null,
    },
    liveStandings: {
      ...state.liveStandings,
      [mode]: null,
    },
    liveDataUpdatedAt: {
      ...state.liveDataUpdatedAt,
      [mode]: null,
    },
    liveDataStatus: {
      ...state.liveDataStatus,
      [mode]: "idle",
    },
  };

  return mode === "final" && nextState.mockTraders.filter((trader) => trader.mode === "final").length === 0
    ? selectTopFinalists(nextState)
    : nextState;
}

export function setRoundStatus(state: RoundState, status: RoundStatus, now = new Date()): RoundState {
  return {
    ...state,
    status,
    startedAt: status === "live" && !state.startedAt ? nowIso(now) : state.startedAt,
    updatedAt: nowIso(now),
  };
}

export function setScenario(state: RoundState, scenario: MockScenario): RoundState {
  return {
    ...state,
    scenario,
    status: scenario === "interruption" ? "interrupted" : state.status,
    updatedAt: nowIso(),
  };
}

export class MockLeaderboardDataSource implements LeaderboardDataSource {
  readonly id = "mock";

  getInitialState(): RoundState {
    return createInitialRoundState();
  }

  getTraders(mode: CompetitionMode, state: RoundState): TraderScore[] {
    return getDisplayTraders(state, mode);
  }
}

export function rankMockTraders(traders: TraderScore[]): TraderScore[] {
  return (["qualifier", "final"] as const).flatMap((mode) =>
    buildLeaderboard(traders.filter((trader) => trader.mode === mode)),
  );
}
