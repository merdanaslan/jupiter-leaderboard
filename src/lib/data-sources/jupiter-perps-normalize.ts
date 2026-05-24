import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { OpenTrade, RecentTrade, TradeMarket, TradeSide } from "../types";
import { calculateWalletUnrealizedPnlUsd, type PricesByMarket } from "./jupiter-perps-pnl";

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
  owner: string;
  position: string;
  market: TradeMarket | "UNKNOWN";
  side: TradeSide | "unknown";
  notionalUsd: number;
  feeUsd: number;
  pnlUsd: number;
  priceUsd: number | null;
  timestamp: string;
}

export interface JupiterPerpsOpenPosition {
  pubkey: string;
  owner: string;
  market: TradeMarket | "UNKNOWN";
  side: TradeSide | "unknown";
  sizeUsd: number;
  collateralUsd: number;
  entryPriceUsd: number;
  realisedPnlUsd: number;
  openTime: number;
  updateTime: number;
}

export interface JupiterPerpsWalletSnapshot {
  walletAddress: string;
  positions: JupiterPerpsOpenPosition[];
  trades: JupiterPerpsTradeEvent[];
  notionalVolumeUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
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

export function normalizeOpenPosition(pubkey: string, account: Record<string, unknown>): JupiterPerpsOpenPosition {
  return {
    pubkey,
    owner: publicKeyToString(account.owner),
    market: marketFromCustody(account.custody),
    side: sideToString(account.side),
    sizeUsd: bnToNumber(account.sizeUsd),
    collateralUsd: bnToNumber(account.collateralUsd),
    entryPriceUsd: bnToNumber(account.price),
    realisedPnlUsd: bnToNumber(account.realisedPnlUsd),
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
    owner,
    position,
    market: marketFromCustody(data.positionCustody),
    side: sideByteToString(data.positionSide),
    notionalUsd: bnToNumber(data.sizeUsdDelta),
    feeUsd: bnToNumber(data.feeUsd),
    pnlUsd,
    priceUsd: "price" in data ? bnToNumber(data.price) : null,
    timestamp: timestampSeconds > 0 ? new Date(timestampSeconds * 1000).toISOString() : new Date(0).toISOString(),
  };
}

export function buildWalletSnapshot(input: {
  walletAddress: string;
  positions: JupiterPerpsOpenPosition[];
  trades: JupiterPerpsTradeEvent[];
  pricesByMarket?: PricesByMarket;
}): JupiterPerpsWalletSnapshot {
  const notionalVolumeUsd = input.trades.reduce((sum, trade) => sum + Math.abs(trade.notionalUsd), 0);
  const realizedPnlUsd = input.trades.reduce((sum, trade) => sum + trade.pnlUsd, 0);
  const unrealizedPnlUsd = calculateWalletUnrealizedPnlUsd(input.positions, input.pricesByMarket);
  const latestTrade = input.trades.at(0);
  const largestPosition = [...input.positions].sort((a, b) => b.sizeUsd - a.sizeUsd)[0];

  return {
    walletAddress: input.walletAddress,
    positions: input.positions,
    trades: input.trades,
    notionalVolumeUsd,
    realizedPnlUsd,
    unrealizedPnlUsd,
    totalPnlUsd: realizedPnlUsd + unrealizedPnlUsd,
    recentTrade: latestTrade && latestTrade.market !== "UNKNOWN" && latestTrade.side !== "unknown"
      ? {
          market: latestTrade.market,
          side: latestTrade.side,
          notionalUsd: latestTrade.notionalUsd,
          pnlUsd: latestTrade.pnlUsd,
          timestamp: latestTrade.timestamp,
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
