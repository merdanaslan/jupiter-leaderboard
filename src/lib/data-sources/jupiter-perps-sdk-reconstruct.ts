import { PublicKey } from "@solana/web3.js";
import type { createPerpsClient } from "jupiter-perps-api-sdk";
import {
  diffSdkOrderActivities,
  formatSdkActiveOrderSummary,
  mergeSdkOrderActivityHistory,
  type SdkActiveOrderSnapshot,
  type SdkActiveTpslRequest,
  type SdkOrderActivity,
} from "./jupiter-perps-sdk-activity";
import { buildLeaderboard } from "../leaderboard";
import type {
  CompetitionMode,
  RecentActivity,
  RecentOrderActivity,
  RecentTradeActivity,
  TradeMarket,
  TradeSide,
  TraderConfig,
  TraderScore,
} from "../types";

const DEFAULT_BASE_URL = "https://perps-api.jup.ag/v1";
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_TRADE_LIMIT = 100;
const DEFAULT_MAX_TRADE_PAGES = 5;
const DEFAULT_RECENT_LIMIT = 8;
const DEFAULT_CONCURRENCY = 8;

const MARKET_BY_MINT: Record<string, TradeMarket> = {
  "So11111111111111111111111111111111111111112": "SOL",
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ETH",
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": "BTC",
};

export type SdkWalletFetchStatus = "ok" | "partial" | "error";

export interface SdkPositionTpslRequest {
  [key: string]: unknown;
  collateralUsdDelta?: string | number | null;
  desiredMint?: string | null;
  desiredToken?: string | null;
  entirePosition: boolean;
  openTime?: string | number | null;
  positionRequestPubkey: string;
  requestType: "tp" | "sl";
  sizePercentage?: string | number | null;
  sizeUsd: string | number;
  triggerPriceUsd: string | number | null;
}

export interface SdkPosition {
  [key: string]: unknown;
  asset: TradeMarket;
  assetMint?: string;
  borrowFeesUsd: string | number;
  closeFeesUsd: string | number;
  collateralUsd: string | number;
  entryPriceUsd: string | number;
  leverage: string | number;
  markPriceUsd: string | number;
  openFeesUsd: string | number;
  pnlAfterFeesUsd: string | number;
  pnlBeforeFeesUsd: string | number;
  positionPubkey: string;
  side: TradeSide;
  sizeUsd: string | number;
  totalFeesUsd: string | number;
  tpslRequests: SdkPositionTpslRequest[];
  valueUsd: string | number;
}

export interface SdkTrade {
  [key: string]: unknown;
  action: "Increase" | "Decrease";
  collateralUsdDelta?: string | number | null;
  createdTime: number;
  fee: string | number;
  mint: string;
  orderType: "Market" | "Trigger" | "Liquidation";
  owner: string;
  pnl: string | number | null;
  positionName: "SOL-PERP" | "ETH-PERP" | "BTC-PERP";
  positionPubkey: string;
  price: string | number;
  side: TradeSide;
  size: string | number;
  txHash: string;
}

export interface SdkLimitOrder {
  [key: string]: unknown;
  collateralUsd?: string | number | null;
  executed: boolean;
  marketMint: string;
  maxSizeUsdDelta?: string | number | null;
  minSizeUsdDelta?: string | number | null;
  positionRequestPubkey: string;
  side: TradeSide;
  sizeUsdDelta?: string | number | null;
  triggerPrice: string | number | null;
}

export interface SdkWalletSnapshot {
  walletAddress: string;
  positions: SdkPosition[];
  trades: SdkTrade[];
  tradeCount: number;
  limitOrders: SdkLimitOrder[];
  errors: string[];
  latencyMs: number;
}

interface TradeRecentActivity {
  kind: "trade";
  walletAddress: string;
  market: TradeMarket;
  side: TradeSide;
  action: RecentTradeActivity["action"];
  executionType: RecentTradeActivity["executionType"];
  sizeUsd: number;
  sizeToken: number;
  executionPriceUsd: number;
  collateralUsdDelta?: number;
  realizedPnlUsd: number | null;
  netRealizedPnlUsd: number | null;
  feeUsd: number;
  timestamp: number;
  signature: string;
}

interface OrderRecentActivity extends SdkOrderActivity {
  kind: "order";
}

type SdkRecentActivity = TradeRecentActivity | OrderRecentActivity;

export interface SdkReconstructedRow {
  rank: number;
  trader: string;
  walletAddress: string;
  pnlUsd: number;
  pnlPercent: number;
  equityUsd: number;
  volumeUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  unrealizedGrossPnlUsd: number;
  openPositionValueUsd: number;
  openPositionNotionalUsd: number;
  positionPnlPercent: number;
  collateralUsd: number;
  leverage: number;
  openFeeUsd: number;
  borrowFeeUsd: number;
  closeFeeUsd: number;
  feesUsd: number;
  grossPnlUsd: number;
  sizeUsd?: number;
  entryPriceUsd?: number;
  markPriceUsd?: number;
  openLabel: string;
  openPositionCount: number;
  activeOrderSnapshot: SdkActiveOrderSnapshot;
  activeTpslRequests: SdkActiveTpslRequest[];
  activeTpslCount: number;
  activeLimitOrderCount: number;
  recentActivity?: SdkRecentActivity;
  recentActivities: SdkRecentActivity[];
  status: SdkWalletFetchStatus;
  errors: string[];
  latencyMs: number;
}

export interface SdkReconstructOptions {
  baseUrl?: string;
  concurrency?: number;
  includeLimitOrders?: boolean;
  maxTradePages?: number;
  recentLimit?: number;
  requestTimeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  startTimestamp: number;
  startingEquity?: number;
  tradeLimit?: number;
}

export interface SdkLeaderboardSnapshot {
  dataStatus: "ok" | "partial" | "error";
  errors: string[];
  latencyMs: number;
  orderActivitiesByWallet: Record<string, RecentActivity[]>;
  orderSnapshotsByWallet: Record<string, SdkActiveOrderSnapshot>;
  rows: SdkReconstructedRow[];
  traders: TraderScore[];
  updatedAt: string;
}

type PerpsClient = ReturnType<typeof createPerpsClient>;
type SdkModule = typeof import("jupiter-perps-api-sdk");

let sdkModulePromise: Promise<SdkModule> | undefined;

export async function buildSdkLeaderboardSnapshot(input: {
  mode: CompetitionMode;
  orderActivitiesByWallet?: Record<string, RecentActivity[]>;
  orderSnapshotsByWallet?: Record<string, unknown>;
  options: SdkReconstructOptions;
  traderConfig: TraderConfig[];
}): Promise<SdkLeaderboardSnapshot> {
  const startedAt = Date.now();
  const options = normalizeOptions(input.options);
  const activeTraders = input.traderConfig.filter(
    (trader) => trader.mode === input.mode && trader.status === "active",
  );
  const walletAddresses = [...new Set(activeTraders.map((trader) => normalizePublicKey(trader.walletAddress)))];

  if (walletAddresses.length === 0) {
    const updatedAt = new Date().toISOString();
    return {
      dataStatus: "ok",
      errors: [],
      latencyMs: 0,
      orderActivitiesByWallet: {},
      orderSnapshotsByWallet: {},
      rows: [],
      traders: [],
      updatedAt,
    };
  }

  const snapshots = await fetchSdkWalletSnapshots({
    options,
    walletAddresses,
  });
  const previousOrderSnapshots = recordToSnapshotMap(input.orderSnapshotsByWallet);
  const existingOrderActivities = recordToOrderActivityMap(input.orderActivitiesByWallet);
  const orderActivitiesByWallet = buildOrderActivitiesByWallet({
    historyByWallet: existingOrderActivities,
    historyLimit: Math.max(options.recentLimit, 20),
    previousOrderSnapshots,
    snapshots,
    timestamp: Math.floor(Date.now() / 1000),
  });
  const rows = buildSdkLeaderboardRows({
    orderActivitiesByWallet,
    recentLimit: options.recentLimit,
    snapshots,
    startingEquity: options.startingEquity,
    traderConfig: activeTraders,
  });
  const updatedAt = new Date().toISOString();
  const traders = sdkRowsToTraderScores(rows, activeTraders, input.mode, updatedAt);
  const errors = rows.flatMap((row) => row.errors.map((error) => `${row.trader}: ${error}`));

  return {
    dataStatus: rows.every((row) => row.status === "ok") ? "ok" : rows.some((row) => row.status !== "error") ? "partial" : "error",
    errors,
    latencyMs: Date.now() - startedAt,
    orderActivitiesByWallet: orderActivityMapToRecord(orderActivitiesByWallet),
    orderSnapshotsByWallet: snapshotMapToRecord(previousOrderSnapshots),
    rows,
    traders,
    updatedAt,
  };
}

export async function fetchSdkWalletSnapshots(input: {
  options: Required<SdkReconstructOptions>;
  walletAddresses: string[];
}): Promise<SdkWalletSnapshot[]> {
  const sdk = await loadSdkModule();
  const perps = sdk.createPerpsClient({
    baseUrl: input.options.baseUrl,
    fetch: createTimeoutFetch(input.options.requestTimeoutMs),
  });

  return mapWithConcurrency(input.walletAddresses, input.options.concurrency, (walletAddress) =>
    fetchSdkWalletSnapshot({
      options: input.options,
      perps,
      walletAddress,
    }),
  );
}

export async function fetchSdkWalletSnapshot(input: {
  options: Required<SdkReconstructOptions>;
  perps: PerpsClient;
  walletAddress: string;
}): Promise<SdkWalletSnapshot> {
  const startedAt = Date.now();
  const positionsPromise = retry(
    () => input.perps.positions.get({ walletAddress: input.walletAddress }),
    input.options,
    "positions",
  );
  const tradesPromise = retry(
    async () => {
      const pages: SdkTrade[] = [];
      let count = 0;

      for (let page = 0; page < input.options.maxTradePages; page += 1) {
        const start = page * input.options.tradeLimit;
        const end = start + input.options.tradeLimit;
        const response = await input.perps.positions.getTrades({
          createdAtAfter: input.options.startTimestamp,
          end,
          start,
          walletAddress: input.walletAddress,
        });

        count = response.count;
        pages.push(...(response.dataList as unknown as SdkTrade[]));

        if (response.dataList.length < input.options.tradeLimit || pages.length >= response.count) break;
      }

      return {
        count,
        dataList: dedupeTrades(pages),
      };
    },
    input.options,
    "trades",
  );
  const limitOrdersPromise = input.options.includeLimitOrders
    ? retry(() => input.perps.orders.getLimitOrders({ walletAddress: input.walletAddress }), input.options, "limit-orders")
    : Promise.resolve({ count: 0, dataList: [] });

  const [positionsResult, tradesResult, limitOrdersResult] = await Promise.allSettled([
    positionsPromise,
    tradesPromise,
    limitOrdersPromise,
  ]);

  const errors: string[] = [];
  const positions = unwrapSettled(positionsResult, errors, "positions")?.dataList ?? [];
  const tradesResponse = unwrapSettled(tradesResult, errors, "trades");
  const trades = tradesResponse?.dataList ?? [];
  const tradeCount = tradesResponse?.count ?? 0;
  const limitOrders = unwrapSettled(limitOrdersResult, errors, "limit-orders")?.dataList ?? [];

  if (tradeCount > trades.length) {
    errors.push(`trades: fetched ${trades.length}/${tradeCount}; increase maxTradePages or tradeLimit`);
  }

  return {
    errors,
    latencyMs: Date.now() - startedAt,
    limitOrders: limitOrders as unknown as SdkLimitOrder[],
    positions: positions as unknown as SdkPosition[],
    tradeCount,
    trades,
    walletAddress: input.walletAddress,
  };
}

export function buildSdkLeaderboardRows(input: {
  orderActivitiesByWallet: Map<string, OrderRecentActivity[]>;
  recentLimit: number;
  snapshots: SdkWalletSnapshot[];
  startingEquity: number;
  traderConfig: TraderConfig[];
}): SdkReconstructedRow[] {
  const tradersByWallet = new Map(input.traderConfig.map((trader) => [normalizePublicKey(trader.walletAddress), trader]));

  const rows = input.snapshots.map((snapshot): Omit<SdkReconstructedRow, "rank"> => {
    const walletAddress = normalizePublicKey(snapshot.walletAddress);
    const trader = tradersByWallet.get(walletAddress);
    const startingEquity = trader?.startingEquity ?? input.startingEquity;
    const openPositions = snapshot.positions.filter((position) => rawUsdToNumber(position.sizeUsd) > 0.005);
    const sortedTrades = sortTradesOldestFirst(snapshot.trades);
    const activeOrderSnapshot = buildActiveOrderSnapshot(snapshot);
    const tradeActivities = buildRecentActivities(sortedTrades);
    const orderActivities = suppressFilledOrderCancels(
      input.orderActivitiesByWallet.get(walletAddress) ?? [],
      tradeActivities,
    );
    const recentActivities = [...tradeActivities, ...orderActivities].sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    const primaryPosition = [...openPositions].sort(
      (a, b) => rawUsdToNumber(b.sizeUsd) - rawUsdToNumber(a.sizeUsd),
    )[0];

    const realizedGrossPnlUsd = sortedTrades.reduce((sum, trade) => sum + realizedPnlForTrade(trade), 0);
    const realizedFeeUsd = realizedFeeForLeaderboard(sortedTrades, openPositions);
    const realizedPnlUsd = realizedGrossPnlUsd - realizedFeeUsd;
    const volumeUsd = sortedTrades.reduce((sum, trade) => sum + decimalToNumber(trade.size), 0);
    const unrealizedGrossPnlUsd = openPositions.reduce((sum, position) => sum + rawUsdToNumber(position.pnlBeforeFeesUsd), 0);
    const openPositionValueUsd = openPositions.reduce((sum, position) => sum + rawUsdToNumber(position.valueUsd), 0);
    const openPositionNotionalUsd = openPositions.reduce((sum, position) => sum + rawUsdToNumber(position.sizeUsd), 0);
    const collateralUsd = openPositions.reduce((sum, position) => sum + rawUsdToNumber(position.collateralUsd), 0);
    const openFeeUsd = openPositions.reduce((sum, position) => sum + rawUsdToNumber(position.openFeesUsd), 0);
    const borrowFeeUsd = openPositions.reduce((sum, position) => sum + rawUsdToNumber(position.borrowFeesUsd), 0);
    const closeFeeUsd = openPositions.reduce((sum, position) => sum + rawUsdToNumber(position.closeFeesUsd), 0);
    const openPositionFeesUsd = openPositions.reduce((sum, position) => sum + rawUsdToNumber(position.totalFeesUsd), 0);
    const unrealizedPnlUsd = unrealizedGrossPnlUsd - openPositionFeesUsd;
    const feesUsd = openPositionFeesUsd + realizedFeeUsd;
    const pnlUsd = realizedPnlUsd + unrealizedPnlUsd;

    return {
      activeLimitOrderCount: snapshot.limitOrders.filter((order) => !order.executed).length,
      activeOrderSnapshot,
      activeTpslRequests: activeOrderSnapshot.tpslRequests,
      activeTpslCount: activeOrderSnapshot.tpslRequests.length,
      borrowFeeUsd,
      collateralUsd,
      closeFeeUsd,
      equityUsd: startingEquity + pnlUsd,
      errors: snapshot.errors,
      entryPriceUsd: primaryPosition ? rawUsdToNumber(primaryPosition.entryPriceUsd) : undefined,
      feesUsd,
      grossPnlUsd: realizedGrossPnlUsd + unrealizedGrossPnlUsd,
      leverage: primaryPosition
        ? decimalToNumber(primaryPosition.leverage) ||
          (rawUsdToNumber(primaryPosition.collateralUsd) > 0
            ? rawUsdToNumber(primaryPosition.sizeUsd) / rawUsdToNumber(primaryPosition.collateralUsd)
            : 0)
        : 0,
      latencyMs: snapshot.latencyMs,
      markPriceUsd: primaryPosition ? rawUsdToNumber(primaryPosition.markPriceUsd) : undefined,
      openFeeUsd,
      openLabel: primaryPosition ? `${primaryPosition.asset} ${primaryPosition.side}` : sortedTrades.length > 0 ? "closed" : "--",
      openPositionCount: openPositions.length,
      openPositionNotionalUsd,
      openPositionValueUsd,
      positionPnlPercent: collateralUsd > 0 ? (unrealizedGrossPnlUsd / collateralUsd) * 100 : 0,
      pnlPercent: startingEquity > 0 ? (pnlUsd / startingEquity) * 100 : 0,
      pnlUsd,
      realizedPnlUsd,
      recentActivity: recentActivities.at(-1),
      recentActivities: recentActivities.slice(-input.recentLimit).reverse(),
      sizeUsd: primaryPosition ? rawUsdToNumber(primaryPosition.sizeUsd) : undefined,
      status: snapshot.errors.length === 0 ? "ok" : openPositions.length || sortedTrades.length ? "partial" : "error",
      trader: trader ? trader.xHandle || trader.displayName : shortAddress(walletAddress),
      unrealizedGrossPnlUsd,
      unrealizedPnlUsd,
      volumeUsd,
      walletAddress,
    };
  });

  return rows
    .sort((a, b) => b.pnlUsd - a.pnlUsd || b.volumeUsd - a.volumeUsd || a.walletAddress.localeCompare(b.walletAddress))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function sdkRowsToTraderScores(
  rows: SdkReconstructedRow[],
  traderConfig: TraderConfig[],
  mode: CompetitionMode,
  updatedAt: string,
): TraderScore[] {
  const tradersByWallet = new Map(traderConfig.map((trader) => [normalizePublicKey(trader.walletAddress), trader]));
  const scores = rows.map((row): TraderScore => {
    const trader = tradersByWallet.get(row.walletAddress);
    const startingEquity = trader?.startingEquity ?? 0;
    const recentActivity = row.recentActivity ? toPublicRecentActivity(row.recentActivity) : undefined;
    const recentActivities = row.recentActivities.map(toPublicRecentActivity);

    return {
      avatarUrl: trader?.avatarUrl,
      displayName: trader?.displayName ?? row.trader,
      equity: row.equityUsd,
      gapToLeader: 0,
      id: trader?.id ?? row.walletAddress,
      lastUpdated: updatedAt,
      mode,
      openTrade:
        row.sizeUsd !== undefined && row.entryPriceUsd !== undefined && row.openLabel !== "--" && row.openLabel !== "closed"
          ? {
              entryPrice: row.entryPriceUsd,
              market: row.openLabel.startsWith("BTC") ? "BTC" : row.openLabel.startsWith("ETH") ? "ETH" : "SOL",
              side: row.openLabel.endsWith("short") ? "short" : "long",
              sizeUsd: row.sizeUsd,
            }
          : undefined,
      pnlPercent: startingEquity > 0 ? (row.pnlUsd / startingEquity) * 100 : row.pnlPercent,
      pnlUsd: row.pnlUsd,
      rank: row.rank,
      recentActivities,
      recentActivity,
      recentTrade: recentActivityToLegacyRecentTrade(recentActivity),
      startingBalance: trader?.startingBalance ?? startingEquity,
      startingEquity,
      status: trader?.status ?? "active",
      volume: row.volumeUsd,
      walletAddress: row.walletAddress,
      xHandle: trader?.xHandle ?? row.trader,
    };
  });

  return buildLeaderboard(scores);
}

function buildOrderActivitiesByWallet(input: {
  historyByWallet: Map<string, OrderRecentActivity[]>;
  historyLimit: number;
  previousOrderSnapshots: Map<string, SdkActiveOrderSnapshot>;
  snapshots: SdkWalletSnapshot[];
  timestamp: number;
}): Map<string, OrderRecentActivity[]> {
  const activitiesByWallet = new Map<string, OrderRecentActivity[]>();

  for (const snapshot of input.snapshots) {
    const current = buildActiveOrderSnapshot(snapshot);
    const walletAddress = normalizePublicKey(snapshot.walletAddress);
    const previous = input.previousOrderSnapshots.get(walletAddress);
    const activities = diffSdkOrderActivities(previous, current, input.timestamp).map(
      (activity): OrderRecentActivity => ({
        ...activity,
        kind: "order",
      }),
    );

    const existing = input.historyByWallet.get(walletAddress) ?? [];
    const nextHistory = mergeSdkOrderActivityHistory(existing, activities, input.historyLimit) as OrderRecentActivity[];
    if (nextHistory.length > 0) {
      input.historyByWallet.set(walletAddress, nextHistory);
      activitiesByWallet.set(walletAddress, nextHistory);
    }
    input.previousOrderSnapshots.set(walletAddress, current);
  }

  return activitiesByWallet;
}

function buildActiveOrderSnapshot(snapshot: SdkWalletSnapshot): SdkActiveOrderSnapshot {
  const openPositions = snapshot.positions.filter((position) => rawUsdToNumber(position.sizeUsd) > 0.005);

  return {
    limitOrders: snapshot.limitOrders
      .filter((order) => !order.executed)
      .map((order) => ({
        collateralUsd: sdkNumberStringOrNull(order.collateralUsd),
        marketMint: order.marketMint,
        maxSizeUsdDelta: sdkNumberStringOrNull(order.maxSizeUsdDelta),
        minSizeUsdDelta: sdkNumberStringOrNull(order.minSizeUsdDelta),
        positionRequestPubkey: order.positionRequestPubkey,
        side: order.side,
        sizeUsdDelta: sdkNumberStringOrNull(order.sizeUsdDelta),
        triggerPrice: sdkNumberStringOrNull(order.triggerPrice),
      })),
    tpslRequests: openPositions.flatMap((position) =>
      position.tpslRequests.map((request) => ({
        entirePosition: request.entirePosition,
        market: position.asset,
        positionRequestPubkey: request.positionRequestPubkey,
        side: position.side,
        sizeUsd: rawUsdToNumber(request.sizeUsd),
        triggerPriceUsd: request.triggerPriceUsd ? rawUsdToNumber(request.triggerPriceUsd) : 0,
        type: request.requestType,
      })),
    ),
    walletAddress: normalizePublicKey(snapshot.walletAddress),
  };
}

function buildRecentActivities(tradesOldestFirst: SdkTrade[]): TradeRecentActivity[] {
  const runningSizeByPosition = new Map<string, number>();

  return tradesOldestFirst.map((trade) => {
    const market = MARKET_BY_MINT[trade.mint] ?? marketFromPositionName(trade.positionName);
    const sizeUsd = decimalToNumber(trade.size);
    const executionPriceUsd = decimalToNumber(trade.price);
    const previousSize = runningSizeByPosition.get(trade.positionPubkey) ?? 0;
    const action = inferRecentAction(trade, previousSize, sizeUsd);
    const nextSize = trade.action === "Increase" ? previousSize + sizeUsd : Math.max(0, previousSize - sizeUsd);
    runningSizeByPosition.set(trade.positionPubkey, nextSize);

    return {
      action,
      ...(trade.collateralUsdDelta !== undefined && trade.collateralUsdDelta !== null
        ? { collateralUsdDelta: decimalToNumber(trade.collateralUsdDelta) }
        : {}),
      executionPriceUsd,
      executionType: executionTypeForTrade(trade),
      feeUsd: decimalToNumber(trade.fee),
      kind: "trade",
      market,
      netRealizedPnlUsd: netRealizedPnlForTradeOrNull(trade),
      realizedPnlUsd: realizedPnlForTradeOrNull(trade),
      side: trade.side,
      signature: trade.txHash,
      sizeToken: executionPriceUsd > 0 ? sizeUsd / executionPriceUsd : 0,
      sizeUsd,
      timestamp: trade.createdTime,
      walletAddress: normalizePublicKey(trade.owner),
    };
  });
}

function suppressFilledOrderCancels(
  orderActivities: OrderRecentActivity[],
  tradeActivities: TradeRecentActivity[],
): OrderRecentActivity[] {
  return orderActivities.filter((activity) => !isFilledOrderCleanupCancel(activity, tradeActivities));
}

function isFilledOrderCleanupCancel(
  activity: OrderRecentActivity,
  tradeActivities: TradeRecentActivity[],
): boolean {
  if (activity.action !== "cancel") return false;

  return tradeActivities.some((trade) => {
    if (trade.executionType !== "trigger") return false;
    if (trade.walletAddress !== activity.walletAddress) return false;
    if (trade.market !== activity.market || trade.side !== activity.side) return false;
    if (Math.abs(trade.timestamp - activity.timestamp) > 10) return false;

    if (activity.orderKind !== "LIMIT") return true;
    return isNearOrderTriggerPrice(activity.triggerPriceUsd, trade.executionPriceUsd);
  });
}

function isNearOrderTriggerPrice(triggerPriceUsd: number, executionPriceUsd: number): boolean {
  if (!Number.isFinite(triggerPriceUsd) || !Number.isFinite(executionPriceUsd)) return false;
  const tolerance = Math.max(0.05, Math.abs(triggerPriceUsd) * 0.0005);
  return Math.abs(triggerPriceUsd - executionPriceUsd) <= tolerance;
}

function toPublicRecentActivity(activity: SdkRecentActivity): RecentActivity {
  if (activity.kind === "order") {
    return {
      action: activity.action,
      entirePosition: activity.entirePosition,
      market: activity.market,
      orderKind: activity.orderKind,
      side: activity.side,
      sizeUsd: activity.sizeUsd,
      timestamp: timestampToIso(activity.timestamp),
      triggerPriceUsd: activity.triggerPriceUsd,
      type: "order",
    } satisfies RecentOrderActivity;
  }

  return {
    action: activity.action,
    ...(activity.collateralUsdDelta !== undefined ? { collateralUsdDelta: activity.collateralUsdDelta } : {}),
    executionType: activity.executionType,
    feeUsd: activity.feeUsd,
    market: activity.market,
    netRealizedPnlUsd: activity.netRealizedPnlUsd,
    notionalUsd: activity.sizeUsd,
    priceUsd: activity.executionPriceUsd,
    realizedPnlUsd: activity.realizedPnlUsd,
    side: activity.side,
    sizeToken: activity.sizeToken,
    timestamp: timestampToIso(activity.timestamp),
    type: "trade",
  } satisfies RecentTradeActivity;
}

function recentActivityToLegacyRecentTrade(activity: RecentActivity | undefined): TraderScore["recentTrade"] {
  if (!activity || activity.type !== "trade") return undefined;
  return {
    action:
      activity.action === "liquidation"
        ? "liquidate"
        : activity.action === "close" || activity.action === "decrease" || activity.action === "withdraw"
          ? "decrease"
          : "increase",
    market: activity.market,
    notionalUsd: activity.notionalUsd,
    pnlUsd: activity.netRealizedPnlUsd ?? activity.realizedPnlUsd ?? undefined,
    side: activity.side,
    timestamp: activity.timestamp,
  };
}

function recordToSnapshotMap(record: Record<string, unknown> | undefined): Map<string, SdkActiveOrderSnapshot> {
  const map = new Map<string, SdkActiveOrderSnapshot>();
  for (const [walletAddress, value] of Object.entries(record ?? {})) {
    if (isActiveOrderSnapshot(value)) map.set(normalizePublicKey(walletAddress), value);
  }
  return map;
}

function recordToOrderActivityMap(record: Record<string, RecentActivity[]> | undefined): Map<string, OrderRecentActivity[]> {
  const map = new Map<string, OrderRecentActivity[]>();
  for (const [walletAddress, values] of Object.entries(record ?? {})) {
    const orderActivities = values
      .filter((activity): activity is RecentOrderActivity => activity.type === "order")
      .map((activity): OrderRecentActivity => ({
        action: activity.action,
        entirePosition: activity.entirePosition,
        kind: "order",
        market: activity.market,
        orderKind: activity.orderKind,
        side: activity.side,
        sizeUsd: activity.sizeUsd,
        summary: `${activity.action} ${activity.orderKind} ${activity.market} ${activity.side}`,
        timestamp: Math.floor(new Date(activity.timestamp).getTime() / 1000),
        triggerPriceUsd: activity.triggerPriceUsd,
        walletAddress,
      }));
    if (orderActivities.length > 0) map.set(normalizePublicKey(walletAddress), orderActivities);
  }
  return map;
}

function snapshotMapToRecord(map: Map<string, SdkActiveOrderSnapshot>): Record<string, SdkActiveOrderSnapshot> {
  return Object.fromEntries(map);
}

function orderActivityMapToRecord(map: Map<string, OrderRecentActivity[]>): Record<string, RecentActivity[]> {
  return Object.fromEntries(
    [...map.entries()].map(([walletAddress, activities]) => [
      walletAddress,
      activities.map(toPublicRecentActivity),
    ]),
  );
}

function isActiveOrderSnapshot(value: unknown): value is SdkActiveOrderSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "walletAddress" in value &&
    "tpslRequests" in value &&
    "limitOrders" in value &&
    Array.isArray((value as SdkActiveOrderSnapshot).tpslRequests) &&
    Array.isArray((value as SdkActiveOrderSnapshot).limitOrders)
  );
}

function normalizeOptions(options: SdkReconstructOptions): Required<SdkReconstructOptions> {
  return {
    baseUrl: options.baseUrl ?? process.env.PERPS_SDK_API_URL ?? process.env.PERPS_API_URL ?? DEFAULT_BASE_URL,
    concurrency: options.concurrency ?? Number(process.env.PERPS_SDK_CONCURRENCY ?? DEFAULT_CONCURRENCY),
    includeLimitOrders: options.includeLimitOrders ?? true,
    maxTradePages: options.maxTradePages ?? Number(process.env.PERPS_SDK_MAX_TRADE_PAGES ?? DEFAULT_MAX_TRADE_PAGES),
    recentLimit: options.recentLimit ?? DEFAULT_RECENT_LIMIT,
    requestTimeoutMs: options.requestTimeoutMs ?? Number(process.env.PERPS_SDK_TIMEOUT_MS ?? DEFAULT_REQUEST_TIMEOUT_MS),
    retries: options.retries ?? Number(process.env.PERPS_SDK_RETRIES ?? DEFAULT_RETRIES),
    retryDelayMs: options.retryDelayMs ?? Number(process.env.PERPS_SDK_RETRY_DELAY_MS ?? DEFAULT_RETRY_DELAY_MS),
    startTimestamp: options.startTimestamp,
    startingEquity: options.startingEquity ?? 100,
    tradeLimit: options.tradeLimit ?? Number(process.env.PERPS_SDK_TRADE_LIMIT ?? DEFAULT_TRADE_LIMIT),
  };
}

function dedupeTrades(trades: SdkTrade[]): SdkTrade[] {
  const seen = new Set<string>();
  const deduped: SdkTrade[] = [];

  for (const trade of trades) {
    const key = `${trade.txHash}:${trade.positionPubkey}:${trade.action}:${trade.size}:${trade.createdTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(trade);
  }

  return deduped;
}

function unwrapSettled<T>(
  result: PromiseSettledResult<T>,
  errors: string[],
  label: string,
): T | undefined {
  if (result.status === "fulfilled") return result.value;
  errors.push(`${label}: ${formatUnknownError(result.reason)}`);
  return undefined;
}

async function retry<T>(fn: () => Promise<T>, options: Required<SdkReconstructOptions>, label: string): Promise<T> {
  const maxAttempts = options.retries + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;

      const delayMs = options.retryDelayMs * 2 ** (attempt - 1);
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  throw new Error(`${label} failed after ${maxAttempts} attempt${maxAttempts === 1 ? "" : "s"}: ${formatUnknownError(lastError)}`);
}

async function loadSdkModule(): Promise<SdkModule> {
  sdkModulePromise ??= import("jupiter-perps-api-sdk");
  return sdkModulePromise;
}

function createTimeoutFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: init?.signal ?? controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`SDK request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}

async function mapWithConcurrency<TInput, TOutput>(
  inputs: TInput[],
  concurrency: number,
  mapper: (input: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results = new Array<TOutput>(inputs.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < inputs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(inputs[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  return results;
}

function inferRecentAction(trade: SdkTrade, previousSizeUsd: number, sizeUsd: number): RecentTradeActivity["action"] {
  if (trade.orderType === "Liquidation") return "liquidation";
  if (sizeUsd <= 0.005) {
    return trade.action === "Increase" ? "deposit" : "withdraw";
  }
  if (trade.action === "Increase") return previousSizeUsd > 0.005 ? "increase" : "open";
  return previousSizeUsd > 0.005 && previousSizeUsd - sizeUsd > 0.005 ? "decrease" : "close";
}

function executionTypeForTrade(trade: SdkTrade): TradeRecentActivity["executionType"] {
  if (trade.orderType === "Liquidation") return "liquidation";
  if (trade.orderType === "Trigger") return "trigger";
  return "market";
}

function realizedFeeForLeaderboard(trades: SdkTrade[], openPositions: SdkPosition[]): number {
  const tradeFeeUsd = trades.reduce((sum, trade) => sum + decimalToNumber(trade.fee), 0);
  return tradeFeeUsd - activeLifecycleIncreaseFeeUsd(trades, openPositions);
}

function activeLifecycleIncreaseFeeUsd(trades: SdkTrade[], openPositions: SdkPosition[]): number {
  const openPositionPubkeys = new Set(openPositions.map((position) => position.positionPubkey));
  if (openPositionPubkeys.size === 0) return 0;

  const runningSizeByPosition = new Map<string, number>();
  const activeIncreaseFeesByPosition = new Map<string, number>();

  for (const trade of sortTradesOldestFirst(trades)) {
    const positionPubkey = trade.positionPubkey;
    const sizeUsd = decimalToNumber(trade.size);
    const previousSizeUsd = runningSizeByPosition.get(positionPubkey) ?? 0;
    const changesPositionSize = sizeUsd > 0.005;

    if (trade.action === "Increase") {
      if (changesPositionSize && previousSizeUsd <= 0.005) {
        activeIncreaseFeesByPosition.set(positionPubkey, 0);
      }

      if (changesPositionSize) {
        activeIncreaseFeesByPosition.set(
          positionPubkey,
          (activeIncreaseFeesByPosition.get(positionPubkey) ?? 0) + decimalToNumber(trade.fee),
        );
        runningSizeByPosition.set(positionPubkey, previousSizeUsd + sizeUsd);
      }
      continue;
    }

    if (!changesPositionSize) continue;

    const nextSizeUsd = Math.max(0, previousSizeUsd - sizeUsd);
    runningSizeByPosition.set(positionPubkey, nextSizeUsd);

    if (nextSizeUsd <= 0.005) {
      activeIncreaseFeesByPosition.set(positionPubkey, 0);
    }
  }

  return [...activeIncreaseFeesByPosition.entries()]
    .filter(([positionPubkey]) => openPositionPubkeys.has(positionPubkey))
    .reduce((sum, [, feeUsd]) => sum + feeUsd, 0);
}

function isRealizingTrade(trade: SdkTrade): boolean {
  return trade.action === "Decrease" || trade.orderType === "Liquidation";
}

function realizedPnlForTrade(trade: SdkTrade): number {
  return realizedPnlForTradeOrNull(trade) ?? 0;
}

function realizedPnlForTradeOrNull(trade: SdkTrade): number | null {
  if (!isRealizingTrade(trade)) return null;
  return trade.pnl === null ? null : decimalToNumber(trade.pnl);
}

function netRealizedPnlForTradeOrNull(trade: SdkTrade): number | null {
  const realizedPnlUsd = realizedPnlForTradeOrNull(trade);
  if (realizedPnlUsd === null) return null;
  return realizedPnlUsd - decimalToNumber(trade.fee);
}

function sortTradesOldestFirst(trades: SdkTrade[]): SdkTrade[] {
  return [...trades].sort((a, b) => a.createdTime - b.createdTime || a.txHash.localeCompare(b.txHash));
}

function marketFromPositionName(positionName: SdkTrade["positionName"]): TradeMarket {
  if (positionName.startsWith("BTC")) return "BTC";
  if (positionName.startsWith("ETH")) return "ETH";
  return "SOL";
}

function rawUsdToNumber(value: string | number | bigint | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value) / 1_000_000;
}

function decimalToNumber(value: string | number | bigint | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value);
}

function sdkNumberStringOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function normalizePublicKey(address: string): string {
  return new PublicKey(address).toBase58();
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function timestampToIso(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.name === "PerpsApiError") {
    const apiError = error as Error & { code?: string; status?: number };
    const code = apiError.code ? ` ${apiError.code}` : "";
    return `Perps SDK/API returned ${apiError.status ?? "unknown"}${code}: ${apiError.message}`;
  }

  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { formatSdkActiveOrderSummary };
