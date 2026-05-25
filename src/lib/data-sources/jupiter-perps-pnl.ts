import type { TradeMarket } from "../types";
import type {
  JupiterPerpsCustodyConfig,
  JupiterPerpsFeeSummary,
  JupiterPerpsOpenPosition,
  JupiterPerpsTradeEvent,
} from "./jupiter-perps-normalize";

export type PricesByMarket = Partial<Record<TradeMarket, number>>;

const BPS_POWER = 10_000;
const RATE_POWER = 1_000_000_000;
const HOURS_IN_YEAR = 24 * 365;

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

export function calculateWalletFeeSummary(input: {
  positions: JupiterPerpsOpenPosition[];
  trades: JupiterPerpsTradeEvent[];
  custodyConfigsByAddress?: Map<string, JupiterPerpsCustodyConfig>;
  currentTimeSeconds?: number;
}): JupiterPerpsFeeSummary {
  const eventFeeUsd = input.trades.reduce((sum, trade) => sum + trade.feeUsd, 0);
  const positionsWithIncreaseTrade = new Set(
    input.trades
      .filter((trade) => trade.name.includes("Increase"))
      .map((trade) => trade.position),
  );
  let estimatedOpenFeeUsd = 0;
  let estimatedCloseFeeUsd = 0;
  let estimatedBorrowFeeUsd = 0;

  for (const position of input.positions) {
    const custodyConfig = position.custody ? input.custodyConfigsByAddress?.get(position.custody) : undefined;

    if (!custodyConfig) continue;

    if (!positionsWithIncreaseTrade.has(position.pubkey)) {
      estimatedOpenFeeUsd += calculateBasePositionFeeUsd(position.sizeUsd, custodyConfig.increasePositionBps);
    }

    estimatedCloseFeeUsd += calculateBasePositionFeeUsd(position.sizeUsd, custodyConfig.decreasePositionBps);
    estimatedBorrowFeeUsd += calculateBorrowFeeUsd(position, custodyConfig, input.currentTimeSeconds);
  }

  return normalizeFeeSummary({
    eventFeeUsd,
    estimatedOpenFeeUsd,
    estimatedCloseFeeUsd,
    estimatedBorrowFeeUsd,
    totalFeesUsd: eventFeeUsd + estimatedOpenFeeUsd + estimatedCloseFeeUsd + estimatedBorrowFeeUsd,
  });
}

function calculateBasePositionFeeUsd(sizeUsd: number, feeBps: number): number {
  if (!Number.isFinite(sizeUsd) || !Number.isFinite(feeBps) || sizeUsd <= 0 || feeBps <= 0) return 0;
  return (sizeUsd * feeBps) / BPS_POWER;
}

function calculateBorrowFeeUsd(
  position: JupiterPerpsOpenPosition,
  custody: JupiterPerpsCustodyConfig,
  currentTimeSeconds = Math.floor(Date.now() / 1000),
): number {
  if (
    position.sizeUsd <= 0 ||
    !Number.isFinite(position.cumulativeInterestSnapshot) ||
    !Number.isFinite(custody.cumulativeInterestRate)
  ) {
    return 0;
  }

  const cumulativeInterest = getCumulativeInterestRate(custody, currentTimeSeconds);
  const positionInterest = Math.max(0, cumulativeInterest - (position.cumulativeInterestSnapshot ?? 0));

  return (positionInterest * position.sizeUsd) / RATE_POWER;
}

function getCumulativeInterestRate(custody: JupiterPerpsCustodyConfig, currentTimeSeconds: number): number {
  if (currentTimeSeconds <= custody.lastUpdate) return custody.cumulativeInterestRate;

  return custody.cumulativeInterestRate + getHourlyBorrowRate(custody) * ((currentTimeSeconds - custody.lastUpdate) / 3600);
}

function getHourlyBorrowRate(custody: JupiterPerpsCustodyConfig): number {
  const utilizationRate =
    custody.assetsOwned > 0 && custody.assetsLocked > 0
      ? (custody.assetsLocked * RATE_POWER) / custody.assetsOwned
      : 0;

  let yearlyRateBps: number;
  if (utilizationRate <= custody.targetUtilizationRate) {
    yearlyRateBps =
      custody.targetUtilizationRate > 0
        ? ((custody.targetRateBps - custody.minRateBps) * utilizationRate) / custody.targetUtilizationRate +
          custody.minRateBps
        : custody.minRateBps;
  } else {
    const utilizationDiff = utilizationRate - custody.targetUtilizationRate;
    const denominator = RATE_POWER - custody.targetUtilizationRate;
    yearlyRateBps =
      denominator > 0
        ? ((custody.maxRateBps - custody.targetRateBps) * utilizationDiff) / denominator + custody.targetRateBps
        : custody.maxRateBps;
  }

  return ((yearlyRateBps / BPS_POWER) * RATE_POWER) / HOURS_IN_YEAR;
}

function normalizeFeeSummary(fees: JupiterPerpsFeeSummary): JupiterPerpsFeeSummary {
  return {
    eventFeeUsd: roundUsd(fees.eventFeeUsd),
    estimatedOpenFeeUsd: roundUsd(fees.estimatedOpenFeeUsd),
    estimatedCloseFeeUsd: roundUsd(fees.estimatedCloseFeeUsd),
    estimatedBorrowFeeUsd: roundUsd(fees.estimatedBorrowFeeUsd),
    totalFeesUsd: roundUsd(fees.totalFeesUsd),
  };
}

function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(6));
}
