import type { PublicTraderScore } from "./types";

export type QualifierCelebrationEvent =
  | {
      type: "top-four-entry";
      traderIds: string[];
    }
  | {
      type: "top-four-reorder";
      traderIds: string[];
    };

export type FinalCelebrationEvent = {
  type: "final-position-change";
  traderIds: string[];
};

export function getQualifierCelebrationEvent(
  previousTraders: PublicTraderScore[],
  nextTraders: PublicTraderScore[],
): QualifierCelebrationEvent | null {
  const previousTopFour = previousTraders.slice(0, 4).map((trader) => trader.id);
  const nextTopFour = nextTraders.slice(0, 4).map((trader) => trader.id);

  if (previousTopFour.length < 4 || nextTopFour.length < 4) return null;
  if (previousTopFour.join("|") === nextTopFour.join("|")) return null;

  const previousTopFourSet = new Set(previousTopFour);
  const newTopFourEntrants = nextTopFour.filter((traderId) => !previousTopFourSet.has(traderId));

  if (newTopFourEntrants.length > 0) {
    return {
      type: "top-four-entry",
      traderIds: newTopFourEntrants,
    };
  }

  return {
    type: "top-four-reorder",
    traderIds: nextTopFour,
  };
}

export function getFinalCelebrationEvent(
  previousTraders: PublicTraderScore[],
  nextTraders: PublicTraderScore[],
): FinalCelebrationEvent | null {
  const previousFinalists = previousTraders.slice(0, 4).map((trader) => trader.id);
  const nextFinalists = nextTraders.slice(0, 4).map((trader) => trader.id);

  if (previousFinalists.length < 4 || nextFinalists.length < 4) return null;
  if (previousFinalists.join("|") === nextFinalists.join("|")) return null;

  const movedFinalists = nextFinalists.filter(
    (traderId, nextIndex) => previousFinalists[nextIndex] !== traderId,
  );

  return {
    type: "final-position-change",
    traderIds: movedFinalists,
  };
}

export function isCelebrationCooldownReady({
  lastTriggeredAt,
  now,
  cooldownMs,
}: {
  lastTriggeredAt: number | null;
  now: number;
  cooldownMs: number;
}): boolean {
  return lastTriggeredAt === null || now - lastTriggeredAt >= cooldownMs;
}
