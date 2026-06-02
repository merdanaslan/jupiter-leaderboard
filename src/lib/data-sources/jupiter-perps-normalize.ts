import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { OpenTrade, RecentTrade, TradeMarket, TradeSide } from "../types";
import {
  calculatePositionPnlUsd,
  calculateWalletFeeSummary,
  calculateWalletUnrealizedPnlUsd,
  type PricesByMarket,
} from "./jupiter-perps-pnl";

export const USDC_DECIMALS = 6;

export const JUPITER_PERPS_PROGRAM_ID = "PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu";
export const JUPITER_PERPS_EVENT_AUTHORITY = "37hJBDnntwqhGbK7L6M1bLyvccj4u55CCUiLPdYkiqBN";
export const JLP_POOL_ACCOUNT = "5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq";

export const CUSTODY_BY_MARKET = {
  SOL: "7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz",
  ETH: "AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn",
  BTC: "5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm",
  USDC: "G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa",
  USDT: "4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk",
} as const;

const MARKET_BY_CUSTODY = new Map<string, TradeMarket>([
  [CUSTODY_BY_MARKET.SOL, "SOL"],
  [CUSTODY_BY_MARKET.ETH, "ETH"],
  [CUSTODY_BY_MARKET.BTC, "BTC"],
]);

const TRADE_EVENT_NAMES = new Set([
  "IncreasePositionEvent",
  "InstantIncreasePositionEvent",
  "DecreasePositionEvent",
  "InstantDecreasePositionEvent",
  "LiquidateFullPositionEvent",
]);

const POSITION_REQUEST_EVENT_NAMES = new Set([
  "CreatePositionRequestEvent",
  "ClosePositionRequestEvent",
  "InstantCreateLimitOrderEvent",
  "InstantCreateTpslEvent",
  "InstantUpdateTpslEvent",
]);

type RequestChange = "none" | "increase" | "decrease" | "unknown";
type RequestType = "market" | "trigger" | "unknown";
export type JupiterPerpsPositionRequestAction = "create" | "update" | "close";

export interface DecodedPerpsEvent {
  name: string;
  data: Record<string, unknown>;
  signature: string;
  slot: number;
  blockTime: number | null;
  instructionIndex: number;
}

export interface JupiterPerpsTradeEvent {
  name: string;
  signature: string;
  slot: number;
  blockTime: number | null;
  instructionIndex?: number;
  owner: string;
  position: string;
  market: TradeMarket | "UNKNOWN";
  side: TradeSide | "unknown";
  notionalUsd: number;
  collateralUsdDelta?: number;
  positionSizeUsd?: number;
  positionCollateralUsd?: number;
  originalPositionCollateralUsd?: number;
  positionEntryPriceUsd?: number;
  feeUsd: number;
  positionFeeUsd?: number;
  fundingFeeUsd?: number;
  priceImpactFeeUsd?: number;
  pnlUsd: number;
  priceUsd: number | null;
  timestamp: string;
}

export interface JupiterPerpsPositionRequestEvent {
  name: string;
  signature: string;
  slot: number;
  blockTime: number | null;
  owner: string;
  positionRequestKey: string;
  action: JupiterPerpsPositionRequestAction;
  timestamp: string;
}

export interface JupiterPerpsOpenPosition {
  pubkey: string;
  owner: string;
  custody?: string;
  collateralCustody?: string;
  market: TradeMarket | "UNKNOWN";
  side: TradeSide | "unknown";
  sizeUsd: number;
  collateralUsd: number;
  entryPriceUsd: number;
  realisedPnlUsd: number;
  cumulativeInterestSnapshot?: number;
  unrealizedPnlUsd?: number;
  markPriceUsd?: number;
  openTime: number;
  updateTime: number;
}

export interface JupiterPerpsCustodyConfig {
  custody: string;
  increasePositionBps: number;
  decreasePositionBps: number;
  cumulativeInterestRate: number;
  lastUpdate: number;
  minRateBps: number;
  maxRateBps: number;
  targetRateBps: number;
  targetUtilizationRate: number;
  assetsOwned: number;
  assetsLocked: number;
}

export interface JupiterPerpsFeeSummary {
  eventFeeUsd: number;
  estimatedOpenFeeUsd: number;
  estimatedCloseFeeUsd: number;
  estimatedBorrowFeeUsd: number;
  totalFeesUsd: number;
}

export interface JupiterPerpsTriggerOrder {
  pubkey: string;
  owner: string;
  position: string;
  market: TradeMarket | "UNKNOWN";
  side: TradeSide | "unknown";
  kind: "TP" | "SL" | "trigger";
  sizeUsd: number;
  triggerPriceUsd: number;
  triggerAboveThreshold: boolean;
  entirePosition: boolean;
  counter: number;
  openTime: number;
  updateTime: number;
}

export interface JupiterPerpsWalletSnapshot {
  walletAddress: string;
  positions: JupiterPerpsOpenPosition[];
  trades: JupiterPerpsTradeEvent[];
  triggerOrders?: JupiterPerpsTriggerOrder[];
  triggerOrdersUnavailable?: boolean;
  tradeNotionalVolumeUsd?: number;
  openPositionNotionalUsd?: number;
  syntheticOpenPositionVolumeUsd?: number;
  collateralUsd?: number;
  fees?: JupiterPerpsFeeSummary;
  notionalVolumeUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  grossPnlUsd?: number;
  netPnlUsd?: number;
  totalPnlUsd: number;
  recentTrade?: RecentTrade;
  openTrade?: OpenTrade;
}

export function bnToNumber(value: unknown, decimals = USDC_DECIMALS): number {
  if (BN.isBN(value)) return (value as BN).toNumber() / 10 ** decimals;
  if (typeof value === "bigint") return Number(value) / 10 ** decimals;
  if (typeof value === "number") return value / 10 ** decimals;
  if (typeof value === "string") return Number(value) / 10 ** decimals;
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString()) / 10 ** decimals;
  }
  return 0;
}

export function bnToRawNumber(value: unknown): number {
  if (BN.isBN(value)) return Number((value as BN).toString());
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString());
  }
  return 0;
}

export function publicKeyToString(value: unknown): string {
  if (value instanceof PublicKey) return value.toBase58();
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toBase58" in value) {
    return (value as { toBase58: () => string }).toBase58();
  }
  return "";
}

export function sideToString(value: unknown): TradeSide | "unknown" {
  if (!value || typeof value !== "object") return "unknown";
  const side = value as Record<string, unknown>;
  if ("long" in side || "Long" in side) return "long";
  if ("short" in side || "Short" in side) return "short";
  return "unknown";
}

export function requestChangeToString(value: unknown): RequestChange {
  if (!value || typeof value !== "object") return "unknown";
  const requestChange = value as Record<string, unknown>;
  if ("none" in requestChange || "None" in requestChange) return "none";
  if ("increase" in requestChange || "Increase" in requestChange) return "increase";
  if ("decrease" in requestChange || "Decrease" in requestChange) return "decrease";
  return "unknown";
}

export function requestTypeToString(value: unknown): RequestType {
  if (!value || typeof value !== "object") return "unknown";
  const requestType = value as Record<string, unknown>;
  if ("market" in requestType || "Market" in requestType) return "market";
  if ("trigger" in requestType || "Trigger" in requestType) return "trigger";
  return "unknown";
}

function optionBoolToBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

export function sideByteToString(value: unknown): TradeSide | "unknown" {
  const side = Number(value);
  if (side === 1) return "long";
  if (side === 2) return "short";
  return "unknown";
}

export function marketFromCustody(custody: unknown): TradeMarket | "UNKNOWN" {
  return MARKET_BY_CUSTODY.get(publicKeyToString(custody)) ?? "UNKNOWN";
}

export function isTradeEventName(name: string): boolean {
  return TRADE_EVENT_NAMES.has(name);
}

export function isPositionRequestEventName(name: string): boolean {
  return POSITION_REQUEST_EVENT_NAMES.has(name);
}

export function normalizeOpenPosition(pubkey: string, account: Record<string, unknown>): JupiterPerpsOpenPosition {
  return {
    pubkey,
    owner: publicKeyToString(account.owner),
    custody: publicKeyToString(account.custody),
    collateralCustody: publicKeyToString(account.collateralCustody),
    market: marketFromCustody(account.custody),
    side: sideToString(account.side),
    sizeUsd: bnToNumber(account.sizeUsd),
    collateralUsd: bnToNumber(account.collateralUsd),
    entryPriceUsd: bnToNumber(account.price),
    realisedPnlUsd: bnToNumber(account.realisedPnlUsd),
    cumulativeInterestSnapshot: bnToRawNumber(account.cumulativeInterestSnapshot),
    openTime: Number(account.openTime?.toString?.() ?? account.openTime ?? 0),
    updateTime: Number(account.updateTime?.toString?.() ?? account.updateTime ?? 0),
  };
}

export function normalizeCustodyConfig(pubkey: string, account: Record<string, unknown>): JupiterPerpsCustodyConfig {
  const fundingRateState = (account.fundingRateState ?? {}) as Record<string, unknown>;
  const jumpRateState = (account.jumpRateState ?? {}) as Record<string, unknown>;
  const assets = (account.assets ?? {}) as Record<string, unknown>;

  return {
    custody: pubkey,
    increasePositionBps: bnToRawNumber(account.increasePositionBps),
    decreasePositionBps: bnToRawNumber(account.decreasePositionBps),
    cumulativeInterestRate: bnToRawNumber(fundingRateState.cumulativeInterestRate),
    lastUpdate: bnToRawNumber(fundingRateState.lastUpdate),
    minRateBps: bnToRawNumber(jumpRateState.minRateBps),
    maxRateBps: bnToRawNumber(jumpRateState.maxRateBps),
    targetRateBps: bnToRawNumber(jumpRateState.targetRateBps),
    targetUtilizationRate: bnToRawNumber(jumpRateState.targetUtilizationRate),
    assetsOwned: bnToRawNumber(assets.owned),
    assetsLocked: bnToRawNumber(assets.locked),
  };
}

export function normalizePositionRequest(
  pubkey: string,
  account: Record<string, unknown>,
): JupiterPerpsTriggerOrder | null {
  const requestChange = requestChangeToString(account.requestChange);
  const requestType = requestTypeToString(account.requestType);
  const triggerPriceUsd = bnToNumber(account.triggerPrice);
  const executed = account.executed === true;

  if (executed || requestChange !== "decrease" || requestType !== "trigger" || triggerPriceUsd <= 0) {
    return null;
  }

  const side = sideToString(account.side);
  const triggerAboveThreshold = optionBoolToBoolean(account.triggerAboveThreshold);
  const kind =
    side === "long"
      ? triggerAboveThreshold
        ? "TP"
        : "SL"
      : side === "short"
        ? triggerAboveThreshold
          ? "SL"
          : "TP"
        : "trigger";

  return {
    pubkey,
    owner: publicKeyToString(account.owner),
    position: publicKeyToString(account.position),
    market: marketFromCustody(account.custody),
    side,
    kind,
    sizeUsd: bnToNumber(account.sizeUsdDelta),
    triggerPriceUsd,
    triggerAboveThreshold,
    entirePosition: optionBoolToBoolean(account.entirePosition),
    counter: bnToRawNumber(account.counter),
    openTime: Number(account.openTime?.toString?.() ?? account.openTime ?? 0),
    updateTime: Number(account.updateTime?.toString?.() ?? account.updateTime ?? 0),
  };
}

export function normalizeTradeEvent(event: DecodedPerpsEvent): JupiterPerpsTradeEvent | null {
  if (!isTradeEventName(event.name)) return null;

  const data = event.data;
  const owner = publicKeyToString(data.owner);
  const position = publicKeyToString(data.positionKey);
  if (!owner || !position) return null;

  const hasProfit = data.hasProfit === true;
  const pnlDelta = bnToNumber(data.pnlDelta);
  const pnlUsd =
    event.name.includes("Decrease") || event.name.includes("Liquidate")
      ? hasProfit
        ? pnlDelta
        : -pnlDelta
      : 0;
  const timestampSeconds = event.blockTime ?? Number(data.openTime?.toString?.() ?? 0);

  return {
    name: event.name,
    signature: event.signature,
    slot: event.slot,
    blockTime: event.blockTime,
    instructionIndex: event.instructionIndex,
    owner,
    position,
    market: marketFromCustody(data.positionCustody),
    side: sideByteToString(data.positionSide),
    notionalUsd: "sizeUsdDelta" in data ? bnToNumber(data.sizeUsdDelta) : bnToNumber(data.positionSizeUsd),
    collateralUsdDelta: "collateralUsdDelta" in data ? bnToNumber(data.collateralUsdDelta) : undefined,
    positionSizeUsd: "positionSizeUsd" in data ? bnToNumber(data.positionSizeUsd) : undefined,
    positionCollateralUsd: "positionCollateralUsd" in data ? bnToNumber(data.positionCollateralUsd) : undefined,
    originalPositionCollateralUsd: "originalPositionCollateralUsd" in data ? bnToNumber(data.originalPositionCollateralUsd) : undefined,
    positionEntryPriceUsd: "positionPrice" in data ? bnToNumber(data.positionPrice) : undefined,
    feeUsd: bnToNumber(data.feeUsd),
    positionFeeUsd: bnToNumber(data.positionFeeUsd),
    fundingFeeUsd: bnToNumber(data.fundingFeeUsd),
    priceImpactFeeUsd: bnToNumber(data.priceImpactFeeUsd),
    pnlUsd,
    priceUsd: "price" in data ? bnToNumber(data.price) : null,
    timestamp: timestampSeconds > 0 ? new Date(timestampSeconds * 1000).toISOString() : new Date(0).toISOString(),
  };
}

export function normalizePositionRequestEvent(event: DecodedPerpsEvent): JupiterPerpsPositionRequestEvent | null {
  if (!isPositionRequestEventName(event.name)) return null;

  const data = event.data;
  const owner = publicKeyToString(data.owner);
  const positionRequestKey = publicKeyToString(data.positionRequestKey);
  if (!owner || !positionRequestKey) return null;

  const timestampSeconds =
    event.blockTime ??
    Number(data.openTime?.toString?.() ?? data.updateTime?.toString?.() ?? 0);

  return {
    name: event.name,
    signature: event.signature,
    slot: event.slot,
    blockTime: event.blockTime,
    owner,
    positionRequestKey,
    action: positionRequestAction(event.name),
    timestamp: timestampSeconds > 0 ? new Date(timestampSeconds * 1000).toISOString() : new Date(0).toISOString(),
  };
}

export function buildWalletSnapshot(input: {
  walletAddress: string;
  positions: JupiterPerpsOpenPosition[];
  trades: JupiterPerpsTradeEvent[];
  triggerOrders?: JupiterPerpsTriggerOrder[];
  triggerOrdersUnavailable?: boolean;
  pricesByMarket?: PricesByMarket;
  custodyConfigsByAddress?: Map<string, JupiterPerpsCustodyConfig>;
  syntheticOpenPositionVolumeUsd?: number;
  currentTimeSeconds?: number;
}): JupiterPerpsWalletSnapshot {
  const positions = input.positions.map((position) => {
    if (position.market === "UNKNOWN") return position;

    const markPriceUsd = input.pricesByMarket?.[position.market];
    if (!markPriceUsd) return position;

    return {
      ...position,
      markPriceUsd,
      unrealizedPnlUsd: calculatePositionPnlUsd(position, markPriceUsd),
    };
  });
  const tradeNotionalVolumeUsd = input.trades.reduce((sum, trade) => sum + Math.abs(trade.notionalUsd), 0);
  const positionsWithIncreaseTrade = new Set(
    input.trades
      .filter((trade) => trade.name.includes("Increase"))
      .map((trade) => trade.position),
  );
  const inferredOpenPositionVolumeUsd =
    input.syntheticOpenPositionVolumeUsd ??
    positions
      .filter((position) => !positionsWithIncreaseTrade.has(position.pubkey))
      .reduce((sum, position) => sum + Math.abs(position.sizeUsd), 0);
  const openPositionNotionalUsd = positions.reduce((sum, position) => sum + Math.abs(position.sizeUsd), 0);
  const collateralUsd = positions.reduce((sum, position) => sum + position.collateralUsd, 0);
  const notionalVolumeUsd = tradeNotionalVolumeUsd + inferredOpenPositionVolumeUsd;
  const realizedPnlUsd = input.trades.reduce((sum, trade) => sum + trade.pnlUsd, 0);
  const unrealizedPnlUsd = calculateWalletUnrealizedPnlUsd(positions, input.pricesByMarket);
  const fees = calculateWalletFeeSummary({
    positions,
    trades: input.trades,
    custodyConfigsByAddress: input.custodyConfigsByAddress,
    currentTimeSeconds: input.currentTimeSeconds,
  });
  const grossPnlUsd = realizedPnlUsd + unrealizedPnlUsd;
  const netPnlUsd = grossPnlUsd - fees.totalFeesUsd;
  const latestTrade = [...input.trades].sort((a, b) => b.slot - a.slot || b.signature.localeCompare(a.signature)).at(0);
  const largestPosition = [...positions].sort((a, b) => b.sizeUsd - a.sizeUsd)[0];

  return {
    walletAddress: input.walletAddress,
    positions,
    trades: input.trades,
    triggerOrders: input.triggerOrders ?? [],
    triggerOrdersUnavailable: input.triggerOrdersUnavailable,
    tradeNotionalVolumeUsd,
    openPositionNotionalUsd,
    syntheticOpenPositionVolumeUsd: inferredOpenPositionVolumeUsd,
    collateralUsd,
    fees,
    notionalVolumeUsd,
    realizedPnlUsd,
    unrealizedPnlUsd,
    grossPnlUsd,
    netPnlUsd,
    totalPnlUsd: grossPnlUsd,
    recentTrade: latestTrade && latestTrade.market !== "UNKNOWN" && latestTrade.side !== "unknown"
      ? {
          market: latestTrade.market,
          side: latestTrade.side,
          notionalUsd: latestTrade.notionalUsd,
          pnlUsd: latestTrade.pnlUsd,
          timestamp: latestTrade.timestamp,
          action: tradeAction(latestTrade.name),
        }
      : undefined,
    openTrade: largestPosition && largestPosition.market !== "UNKNOWN" && largestPosition.side !== "unknown"
      ? {
          market: largestPosition.market,
          side: largestPosition.side,
          sizeUsd: largestPosition.sizeUsd,
          entryPrice: largestPosition.entryPriceUsd,
        }
      : undefined,
  };
}

function tradeAction(name: string): RecentTrade["action"] {
  if (name.includes("Liquidate")) return "liquidate";
  if (name.includes("Decrease")) return "decrease";
  if (name.includes("Increase")) return "increase";
  return undefined;
}

function positionRequestAction(name: string): JupiterPerpsPositionRequestAction {
  if (name.includes("Close")) return "close";
  if (name.includes("Update")) return "update";
  return "create";
}
