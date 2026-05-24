import type { TradeMarket } from "../types";
import type { JupiterPerpsOpenPosition } from "./jupiter-perps-normalize";

export type PricesByMarket = Partial<Record<TradeMarket, number>>;

export function calculatePositionPnlUsd(
  position: JupiterPerpsOpenPosition,
  currentPriceUsd: number | undefined,
): number {
  if (
    !currentPriceUsd ||
    currentPriceUsd <= 0 ||
    position.entryPriceUsd <= 0 ||
    position.sizeUsd <= 0 ||
    position.side === "unknown"
  ) {
    return 0;
  }

  const priceDelta = Math.abs(currentPriceUsd - position.entryPriceUsd);
  const unsignedPnl = (position.sizeUsd * priceDelta) / position.entryPriceUsd;
  const hasProfit =
    position.side === "long"
      ? currentPriceUsd > position.entryPriceUsd
      : position.entryPriceUsd > currentPriceUsd;

  return hasProfit ? unsignedPnl : -unsignedPnl;
}

export function calculateWalletUnrealizedPnlUsd(
  positions: JupiterPerpsOpenPosition[],
  pricesByMarket: PricesByMarket | undefined,
): number {
  if (!pricesByMarket) return 0;

  return positions.reduce((sum, position) => {
    if (position.market === "UNKNOWN") return sum;
    return sum + calculatePositionPnlUsd(position, pricesByMarket[position.market]);
  }, 0);
}
