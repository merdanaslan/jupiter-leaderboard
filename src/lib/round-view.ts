import { publicLeaderboardView } from "./leaderboard";
import { durationForMode } from "./round-durations";
import type { CompetitionMode, PublicRoundState, RoundState } from "./types";

export function publicRoundStateForMode(state: RoundState, mode: CompetitionMode): PublicRoundState {
  const {
    liveStandings: _liveStandings,
    mockTraders: _mockTraders,
    sdkRuntime: _sdkRuntime,
    traderConfigs: _traderConfigs,
    lockedStandings,
    ...basePublicState
  } = state;
  const publicLockedStandings = {
    qualifier: lockedStandings.qualifier ? publicLeaderboardView(lockedStandings.qualifier) : null,
    final: lockedStandings.final ? publicLeaderboardView(lockedStandings.final) : null,
  };

  if (state.activeMode === mode) {
    return {
      ...basePublicState,
      lockedStandings: publicLockedStandings,
    };
  }

  const modeLocked = Boolean(lockedStandings[mode]);
  const modeDurationSeconds = durationForMode(mode);

  return {
    ...basePublicState,
    status: modeLocked ? "locked" : "waiting",
    durationSeconds: modeDurationSeconds,
    remainingSeconds: modeLocked ? 0 : modeDurationSeconds,
    startedAt: null,
    lockedStandings: publicLockedStandings,
  };
}
