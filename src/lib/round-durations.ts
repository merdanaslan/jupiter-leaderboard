import type { CompetitionMode } from "./types";

export const QUALIFIER_DURATION_SECONDS = 60 * 60;
export const FINAL_DURATION_SECONDS = 30 * 60;

export function durationForMode(mode: CompetitionMode): number {
  return mode === "qualifier" ? QUALIFIER_DURATION_SECONDS : FINAL_DURATION_SECONDS;
}
