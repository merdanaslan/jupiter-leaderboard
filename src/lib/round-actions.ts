import {
  lockCurrentMode,
  resetRound,
  selectTopFinalists,
  setRoundStatus,
  setScenario,
} from "./data-sources/mock";
import type { CompetitionMode, MockScenario, RoundState } from "./types";

export type OperatorAction =
  | { type: "start"; now?: string }
  | { type: "lock" }
  | { type: "reset"; mode?: CompetitionMode }
  | { type: "setMode"; mode: CompetitionMode }
  | { type: "setScenario"; scenario: MockScenario }
  | { type: "selectFinalists"; finalistIds: string[] };

export function applyOperatorAction(state: RoundState, action: OperatorAction): RoundState {
  switch (action.type) {
    case "start":
      return setRoundStatus(state, "live", action.now ? new Date(action.now) : new Date());
    case "lock":
      return lockCurrentMode(state);
    case "reset":
      return resetRound(state, action.mode ?? state.activeMode);
    case "setMode":
      return resetRound(state, action.mode);
    case "setScenario":
      return setScenario(state, action.scenario);
    case "selectFinalists":
      return selectTopFinalists(state, action.finalistIds);
    default:
      return exhaustive(action);
  }
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled operator action: ${JSON.stringify(value)}`);
}
