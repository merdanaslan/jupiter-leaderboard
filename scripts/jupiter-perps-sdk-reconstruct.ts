#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { PublicKey } from "@solana/web3.js";
import type {
  GetLimitOrdersResponse,
  GetPositionsResponse,
  GetTradesResponse,
  LimitOrder,
  Position,
  SupportedMarketMint,
  Trade,
} from "../node_modules/jupiter-perps-api-sdk/dist/index.js";
import {
  diffSdkOrderActivities,
  formatSdkActiveOrderSummary,
  mergeSdkOrderActivityHistory,
  type SdkActiveOrderSnapshot,
  type SdkActiveTpslRequest,
  type SdkOrderActivity,
} from "../src/lib/data-sources/jupiter-perps-sdk-activity";
import { parseTraderConfig } from "../src/lib/trader-config";
import type { CompetitionMode, TraderConfig } from "../src/lib/types";

loadEnvConfig(process.cwd());

type SdkModule = typeof import("../node_modules/jupiter-perps-api-sdk/dist/index.js");
type Market = "SOL" | "ETH" | "BTC";
type RecentAction = "open" | "increase" | "decrease" | "close" | "liquidation" | "deposit" | "withdraw";
type WalletFetchStatus = "ok" | "partial" | "error";

const DEFAULT_BASE_URL = "https://perps-api.jup.ag/v1";
const MARKET_BY_MINT: Record<SupportedMarketMint, Market> = {
  "So11111111111111111111111111111111111111112": "SOL",
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ETH",
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": "BTC",
};

interface CliOptions {
  baseUrl: string;
  walletAddresses: string[];
  walletFile?: string;
  traderConfigFile?: string;
  mode?: CompetitionMode;
  startTimestamp?: number;
  sinceMinutes: number;
  startingEquity: number;
  intervalMs: number;
  requestTimeoutMs: number;
  retries: number;
  retryDelayMs: number;
  maxPolls: number;
  tradeLimit: number;
  maxTradePages: number;
  recentLimit: number;
  concurrency: number;
  includeLimitOrders: boolean;
  json: boolean;
}

interface TradeRecentActivity {
  kind: "trade";
  walletAddress: string;
  market: Market;
  side: "long" | "short";
  action: RecentAction;
  executionType: "market" | "trigger" | "liquidation";
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

type RecentActivity = TradeRecentActivity | OrderRecentActivity;

interface SdkReconstructedRow {
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
  recentActivity?: RecentActivity;
  recentActivities: RecentActivity[];
  status: WalletFetchStatus;
  errors: string[];
  latencyMs: number;
}

interface WalletSnapshot {
  walletAddress: string;
  positions: Position[];
  trades: Trade[];
  tradeCount: number;
  limitOrders: LimitOrder[];
  errors: string[];
  latencyMs: number;
}

let sdkModulePromise: Promise<SdkModule> | undefined;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const traderConfig = loadTraderConfig(options);
  const walletAddresses = resolveWalletAddresses(options, traderConfig);

  if (walletAddresses.length === 0) {
    throw new Error("Provide --wallet, --wallets, --wallet-file, or --trader-config-file");
  }

  let polls = 0;
  const previousOrderSnapshots = new Map<string, SdkActiveOrderSnapshot>();
  const orderActivityHistoryByWallet = new Map<string, OrderRecentActivity[]>();
  while (true) {
    polls += 1;
    await pollOnce({ options, orderActivityHistoryByWallet, previousOrderSnapshots, traderConfig, walletAddresses });

    if (options.maxPolls > 0 && polls >= options.maxPolls) break;
    if (options.intervalMs <= 0) break;

    await sleep(options.intervalMs);
  }
}

async function pollOnce(input: {
  options: CliOptions;
  orderActivityHistoryByWallet: Map<string, OrderRecentActivity[]>;
  previousOrderSnapshots: Map<string, SdkActiveOrderSnapshot>;
  traderConfig: TraderConfig[];
  walletAddresses: string[];
}) {
  const startedAt = Date.now();
  const startTimestamp = input.options.startTimestamp ?? Math.floor(Date.now() / 1000) - input.options.sinceMinutes * 60;

  const snapshots = await mapWithConcurrency(input.walletAddresses, input.options.concurrency, (walletAddress) =>
    fetchWalletSnapshot({
      options: input.options,
      startTimestamp,
      walletAddress,
    }),
  );
  const orderActivitiesByWallet = buildOrderActivitiesByWallet({
    historyByWallet: input.orderActivityHistoryByWallet,
    historyLimit: Math.max(input.options.recentLimit, 20),
    previousOrderSnapshots: input.previousOrderSnapshots,
    snapshots,
    timestamp: Math.floor(Date.now() / 1000),
  });

  const rows = buildRows({
    orderActivitiesByWallet,
    options: input.options,
    snapshots,
    startTimestamp,
    traderConfig: input.traderConfig,
  });

  const latencyMs = Date.now() - startedAt;

  if (input.options.json) {
    console.log(
      JSON.stringify(
        {
          latencyMs,
          rows,
          source: "jupiter-perps-api-sdk:positions+trades",
          startTimestamp,
          wallets: input.walletAddresses.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  renderTerminalLeaderboard({
    baseUrl: input.options.baseUrl,
    latencyMs,
    rows,
    startTimestamp,
    walletCount: input.walletAddresses.length,
  });
}

async function fetchWalletSnapshot(input: {
  options: CliOptions;
  startTimestamp: number;
  walletAddress: string;
}): Promise<WalletSnapshot> {
  const startedAt = Date.now();
  const sdk = await loadSdkModule();
  const perps = sdk.createPerpsClient({
    baseUrl: input.options.baseUrl,
    fetch: createTimeoutFetch(input.options.requestTimeoutMs),
  });

  const positionsPromise = retry(
    () => perps.positions.get({ walletAddress: input.walletAddress }),
    input.options,
    "positions",
  );
  const tradesPromise = retry(
    async () => {
      const pages: Trade[] = [];
      let count = 0;

      for (let page = 0; page < input.options.maxTradePages; page += 1) {
        const start = page * input.options.tradeLimit;
        const end = start + input.options.tradeLimit;
        const response = await perps.positions.getTrades({
          createdAtAfter: input.startTimestamp,
          end,
          start,
          walletAddress: input.walletAddress,
        });

        count = response.count;
        pages.push(...response.dataList);

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
    ? retry(() => perps.orders.getLimitOrders({ walletAddress: input.walletAddress }), input.options, "limit-orders")
    : Promise.resolve<GetLimitOrdersResponse>({ count: 0, dataList: [] });

  const [positionsResult, tradesResult, limitOrdersResult] = await Promise.allSettled([
    positionsPromise,
    tradesPromise,
    limitOrdersPromise,
  ]);

  const errors: string[] = [];
  const positions = unwrapSettled<GetPositionsResponse>(positionsResult, errors, "positions")?.dataList ?? [];
  const tradesResponse = unwrapSettled<GetTradesResponse>(tradesResult, errors, "trades");
  const trades = tradesResponse?.dataList ?? [];
  const tradeCount = tradesResponse?.count ?? 0;
  const limitOrders = unwrapSettled<GetLimitOrdersResponse>(limitOrdersResult, errors, "limit-orders")?.dataList ?? [];

  if (tradeCount > trades.length) {
    errors.push(`trades: fetched ${trades.length}/${tradeCount}; increase --max-trade-pages or --trade-limit`);
  }

  return {
    errors,
    latencyMs: Date.now() - startedAt,
    limitOrders,
    positions,
    tradeCount,
    trades,
    walletAddress: input.walletAddress,
  };
}

function dedupeTrades(trades: Trade[]): Trade[] {
  const seen = new Set<string>();
  const deduped: Trade[] = [];

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

async function retry<T>(fn: () => Promise<T>, options: CliOptions, label: string): Promise<T> {
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

function buildOrderActivitiesByWallet(input: {
  historyByWallet: Map<string, OrderRecentActivity[]>;
  historyLimit: number;
  previousOrderSnapshots: Map<string, SdkActiveOrderSnapshot>;
  snapshots: WalletSnapshot[];
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

function buildActiveOrderSnapshot(snapshot: WalletSnapshot): SdkActiveOrderSnapshot {
  const openPositions = snapshot.positions.filter((position) => rawUsdToNumber(position.sizeUsd) > 0.005);

  return {
    limitOrders: snapshot.limitOrders
      .filter((order) => !order.executed)
      .map((order) => ({
        collateralUsd: order.collateralUsd,
        marketMint: order.marketMint,
        maxSizeUsdDelta: order.maxSizeUsdDelta,
        minSizeUsdDelta: order.minSizeUsdDelta,
        positionRequestPubkey: order.positionRequestPubkey,
        side: order.side,
        sizeUsdDelta: order.sizeUsdDelta,
        triggerPrice: order.triggerPrice,
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

function buildRows(input: {
  orderActivitiesByWallet: Map<string, OrderRecentActivity[]>;
  options: CliOptions;
  snapshots: WalletSnapshot[];
  startTimestamp: number;
  traderConfig: TraderConfig[];
}): SdkReconstructedRow[] {
  const tradersByWallet = new Map(input.traderConfig.map((trader) => [normalizePublicKey(trader.walletAddress), trader]));

  const rows = input.snapshots.map((snapshot): Omit<SdkReconstructedRow, "rank"> => {
    const walletAddress = normalizePublicKey(snapshot.walletAddress);
    const trader = tradersByWallet.get(walletAddress);
    const startingEquity = trader?.startingEquity ?? input.options.startingEquity;
    const openPositions = snapshot.positions.filter((position) => rawUsdToNumber(position.sizeUsd) > 0.005);
    const sortedTrades = sortTradesOldestFirst(snapshot.trades);
    const activeOrderSnapshot = buildActiveOrderSnapshot(snapshot);
    const tradeActivities = buildRecentActivities(sortedTrades);
    const orderActivities = suppressFilledOrderCancels(
      input.orderActivitiesByWallet.get(walletAddress) ?? [],
      tradeActivities,
    );
    const recentActivities = [
      ...tradeActivities,
      ...orderActivities,
    ].sort((a, b) => a.timestamp - b.timestamp);
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
      activeTpslCount: openPositions.reduce((sum, position) => sum + position.tpslRequests.length, 0),
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
      recentActivities: recentActivities.slice(-input.options.recentLimit).reverse(),
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

function buildRecentActivities(tradesOldestFirst: Trade[]): TradeRecentActivity[] {
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
      walletAddress: trade.owner,
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

function inferRecentAction(trade: Trade, previousSizeUsd: number, sizeUsd: number): RecentAction {
  if (trade.orderType === "Liquidation") return "liquidation";
  if (sizeUsd <= 0.005) {
    return trade.action === "Increase" ? "deposit" : "withdraw";
  }
  if (trade.action === "Increase") return previousSizeUsd > 0.005 ? "increase" : "open";
  return previousSizeUsd > 0.005 && previousSizeUsd - sizeUsd > 0.005 ? "decrease" : "close";
}

function executionTypeForTrade(trade: Trade): TradeRecentActivity["executionType"] {
  if (trade.orderType === "Liquidation") return "liquidation";
  if (trade.orderType === "Trigger") return "trigger";
  return "market";
}

function realizedFeeForLeaderboard(trades: Trade[], openPositions: Position[]): number {
  const tradeFeeUsd = trades.reduce((sum, trade) => sum + decimalToNumber(trade.fee), 0);
  return tradeFeeUsd - activeLifecycleIncreaseFeeUsd(trades, openPositions);
}

function activeLifecycleIncreaseFeeUsd(trades: Trade[], openPositions: Position[]): number {
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

function isRealizingTrade(trade: Trade): boolean {
  return trade.action === "Decrease" || trade.orderType === "Liquidation";
}

function realizedPnlForTrade(trade: Trade): number {
  return realizedPnlForTradeOrNull(trade) ?? 0;
}

function realizedPnlForTradeOrNull(trade: Trade): number | null {
  if (!isRealizingTrade(trade)) return null;
  return trade.pnl === null ? null : decimalToNumber(trade.pnl);
}

function netRealizedPnlForTradeOrNull(trade: Trade): number | null {
  const realizedPnlUsd = realizedPnlForTradeOrNull(trade);
  if (realizedPnlUsd === null) return null;
  return realizedPnlUsd - decimalToNumber(trade.fee);
}

function sortTradesOldestFirst(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => a.createdTime - b.createdTime || a.txHash.localeCompare(b.txHash));
}

function marketFromPositionName(positionName: Trade["positionName"]): Market {
  if (positionName.startsWith("BTC")) return "BTC";
  if (positionName.startsWith("ETH")) return "ETH";
  return "SOL";
}

function renderTerminalLeaderboard(input: {
  baseUrl: string;
  latencyMs: number;
  rows: SdkReconstructedRow[];
  startTimestamp: number;
  walletCount: number;
}) {
  const width = terminalWidth();
  if (process.stdout.isTTY) console.clear();

  const errorCount = input.rows.filter((row) => row.status !== "ok").length;
  console.log("Jupiter Perps SDK Reconstructed Leaderboard");
  console.log(
    [
      `updated=${new Date().toISOString()}`,
      `latency=${input.latencyMs}ms`,
      `wallets=${input.walletCount}`,
      `start=${input.startTimestamp}`,
      errorCount ? `walletErrors=${errorCount}` : "status=ok",
    ].join(" | "),
  );
  console.log(`base=${input.baseUrl}`);
  console.log(separator(width));
  console.log(
    [
      pad("Rank", 4),
      pad("Trader", 16, "left"),
      pad("Net PnL", 11, "left"),
      pad("Cup %", 8, "left"),
      pad("Pos %", 8, "left"),
      pad("Equity", 10, "left"),
      pad("Volume", 10, "left"),
      pad("Collat", 9, "left"),
      pad("Lev", 6, "left"),
      pad("Open", 10, "left"),
      pad("Recent", 22, "left"),
    ].join(" "),
  );
  console.log(
    [
      pad("", 4),
      pad("", 16),
      pad("Size", 10, "left"),
      pad("Entry", 10, "left"),
      pad("Mark", 10, "left"),
      pad("Gross", 10, "left"),
      pad("Value", 10, "left"),
      pad("FeeTot", 8, "left"),
      pad("Fees", 26, "left"),
      pad("TP/SL", 20, "left"),
    ].join(" "),
  );
  console.log(separator(width));

  for (const row of input.rows) {
    console.log(
      [
        pad(String(row.rank), 4),
        pad(row.trader, 16, "left"),
        pad(formatSignedUsd(row.pnlUsd), 11, "left"),
        pad(formatPercent(row.pnlPercent), 8, "left"),
        pad(formatPercent(row.positionPnlPercent), 8, "left"),
        pad(formatUsd(row.equityUsd), 10, "left"),
        pad(formatUsd(row.volumeUsd), 10, "left"),
        pad(formatUsd(row.collateralUsd), 9, "left"),
        pad(formatLeverage(row.leverage), 6, "left"),
        pad(row.openLabel, 10, "left"),
        pad(formatRecentSummary(row.recentActivity), 22, "left"),
      ].join(" "),
    );
    console.log(
      [
        pad("", 4),
        pad(row.status === "ok" ? "" : row.status, 16, "left"),
        pad(row.sizeUsd === undefined ? "--" : formatUsd(row.sizeUsd), 10, "left"),
        pad(row.entryPriceUsd === undefined ? "--" : formatPrice(row.entryPriceUsd), 10, "left"),
        pad(row.markPriceUsd === undefined ? "--" : formatPrice(row.markPriceUsd), 10, "left"),
        pad(formatSignedUsd(row.grossPnlUsd), 10, "left"),
        pad(formatUsd(row.openPositionValueUsd), 10, "left"),
        pad(formatFeeUsd(row.feesUsd), 8, "left"),
        pad(formatFeeBreakdown(row), 26, "left"),
        pad(formatOrderSummary(row), 20, "left"),
      ].join(" "),
    );
    if (row.errors.length > 0) {
      console.log(`${"".padEnd(6)}errors: ${row.errors.join(" | ")}`);
    }
  }

  console.log(separator(width));
  console.log(
    "Ctrl+C to stop. Net PnL = trade.pnl + open gross PnL - realized fees - open position total fees; Pos % is gross open PnL divided by collateral.",
  );
  const recentDetails = formatRecentActivityDetails(input.rows);
  if (recentDetails) console.log(recentDetails);
}

function formatRecentSummary(activity: RecentActivity | undefined): string {
  if (!activity) return "--";
  if (activity.kind === "order") return activity.summary;
  const pnlUsd = activity.netRealizedPnlUsd ?? activity.realizedPnlUsd;
  const pnl = pnlUsd === null ? "--" : formatSignedUsd(pnlUsd);
  return `${activity.action} ${activity.market} ${activity.side} ${pnl}`;
}

function formatRecentActivityDetails(rows: SdkReconstructedRow[]): string {
  const sections = rows
    .filter((row) => row.recentActivities.length > 0)
    .map((row) => {
      const items = row.recentActivities.map((activity) => {
        if (activity.kind === "order") {
          return [
            "  ",
            formatTime(activity.timestamp),
            pad(activity.action, 11, "left"),
            pad(orderActivityExecutionLabel(activity), 11, "left"),
            pad(activity.orderKind, 8, "left"),
            pad(`${activity.market} ${activity.side}`, 10, "left"),
            pad(formatPrice(activity.triggerPriceUsd), 10, "left"),
            pad(activity.entirePosition ? "full" : formatUsd(activity.sizeUsd), 10, "left"),
          ].join(" ");
        }

        const pnlUsd = activity.netRealizedPnlUsd ?? activity.realizedPnlUsd;
        const pnl = pnlUsd === null ? "--" : formatSignedUsd(pnlUsd);
        const isCollateralOnly = activity.action === "deposit" || activity.action === "withdraw";
        const size = isCollateralOnly && activity.collateralUsdDelta !== undefined
          ? `${formatSignedUsd(activity.collateralUsdDelta)} collateral`
          : formatUsd(activity.sizeUsd);
        const price = isCollateralOnly
          ? "--"
          : `${formatTokenAmount(activity.sizeToken)} @ ${formatPrice(activity.executionPriceUsd)}`;
        return [
          "  ",
          formatTime(activity.timestamp),
          pad(activity.action, 11, "left"),
          pad(activity.executionType, 11, "left"),
          pad(`${activity.market} ${activity.side}`, 10, "left"),
          pad(pnl, 10, "left"),
          pad(size, 18, "left"),
          pad(price, 22, "left"),
          pad(`fee ${formatFeeUsd(activity.feeUsd)}`, 12, "left"),
          shortSignature(activity.signature),
        ].join(" ");
      });

      return [`${row.trader} recent activity`, ...items].join("\n");
    });

  return sections.length > 0 ? `\nRecent Activity\n${sections.join("\n")}` : "";
}

function orderActivityExecutionLabel(activity: OrderRecentActivity): "limit" | "trigger" {
  return activity.orderKind === "LIMIT" ? "limit" : "trigger";
}

function formatOrderSummary(row: SdkReconstructedRow): string {
  return formatSdkActiveOrderSummary(row.activeOrderSnapshot);
}

function formatFeeBreakdown(row: {
  openFeeUsd: number;
  borrowFeeUsd: number;
  closeFeeUsd: number;
}): string {
  return `O ${formatFeeUsd(row.openFeeUsd)} B ${formatFeeUsd(row.borrowFeeUsd)} C ${formatFeeUsd(row.closeFeeUsd)}`;
}

function loadTraderConfig(options: CliOptions): TraderConfig[] {
  if (!options.traderConfigFile) return [];
  const traders = parseTraderConfig(readFileSync(options.traderConfigFile, "utf8"));
  return options.mode ? traders.filter((trader) => trader.mode === options.mode && trader.status === "active") : traders;
}

function resolveWalletAddresses(options: CliOptions, traderConfig: TraderConfig[]): string[] {
  const walletAddresses = [...options.walletAddresses];

  if (options.walletFile) {
    walletAddresses.push(
      ...readFileSync(options.walletFile, "utf8")
        .split(/\r?\n/)
        .map((line) => line.replace(/#.*/, "").trim())
        .filter(Boolean),
    );
  }

  walletAddresses.push(...traderConfig.map((trader) => trader.walletAddress));

  return [...new Set(walletAddresses.map(normalizePublicKey))].sort();
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    baseUrl: process.env.PERPS_SDK_API_URL || process.env.PERPS_API_URL || DEFAULT_BASE_URL,
    concurrency: 8,
    includeLimitOrders: false,
    intervalMs: 5_000,
    json: false,
    maxPolls: 0,
    maxTradePages: 5,
    recentLimit: 3,
    requestTimeoutMs: 8_000,
    retries: 1,
    retryDelayMs: 500,
    sinceMinutes: 60,
    startingEquity: 100,
    tradeLimit: 100,
    walletAddresses: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];

    switch (flag) {
      case "--base-url":
        requireValue(flag, value);
        options.baseUrl = value;
        index += 1;
        break;
      case "--wallet":
        requireValue(flag, value);
        options.walletAddresses.push(value);
        index += 1;
        break;
      case "--wallets":
        requireValue(flag, value);
        options.walletAddresses.push(...value.split(/[,\s]+/).filter(Boolean));
        index += 1;
        break;
      case "--wallet-file":
        requireValue(flag, value);
        options.walletFile = value;
        index += 1;
        break;
      case "--trader-config-file":
        requireValue(flag, value);
        options.traderConfigFile = value;
        index += 1;
        break;
      case "--mode":
        requireValue(flag, value);
        if (value !== "qualifier" && value !== "final") throw new Error("--mode must be qualifier or final");
        options.mode = value;
        index += 1;
        break;
      case "--start-timestamp":
        requireValue(flag, value);
        options.startTimestamp = Number(value);
        index += 1;
        break;
      case "--since-minutes":
        requireValue(flag, value);
        options.sinceMinutes = Number(value);
        index += 1;
        break;
      case "--starting-equity":
        requireValue(flag, value);
        options.startingEquity = Number(value);
        index += 1;
        break;
      case "--interval-ms":
        requireValue(flag, value);
        options.intervalMs = Number(value);
        index += 1;
        break;
      case "--request-timeout-ms":
        requireValue(flag, value);
        options.requestTimeoutMs = Number(value);
        index += 1;
        break;
      case "--retries":
        requireValue(flag, value);
        options.retries = Number(value);
        index += 1;
        break;
      case "--retry-delay-ms":
        requireValue(flag, value);
        options.retryDelayMs = Number(value);
        index += 1;
        break;
      case "--max-polls":
        requireValue(flag, value);
        options.maxPolls = Number(value);
        index += 1;
        break;
      case "--trade-limit":
        requireValue(flag, value);
        options.tradeLimit = Number(value);
        index += 1;
        break;
      case "--max-trade-pages":
        requireValue(flag, value);
        options.maxTradePages = Number(value);
        index += 1;
        break;
      case "--recent-limit":
        requireValue(flag, value);
        options.recentLimit = Number(value);
        index += 1;
        break;
      case "--concurrency":
        requireValue(flag, value);
        options.concurrency = Number(value);
        index += 1;
        break;
      case "--include-limit-orders":
        options.includeLimitOrders = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  validateOptions(options);
  return options;
}

function validateOptions(options: CliOptions) {
  if (!Number.isInteger(options.sinceMinutes) || options.sinceMinutes <= 0) {
    throw new Error("--since-minutes must be a positive integer");
  }
  if (options.startTimestamp !== undefined && (!Number.isInteger(options.startTimestamp) || options.startTimestamp <= 0)) {
    throw new Error("--start-timestamp must be a positive Unix timestamp");
  }
  if (!Number.isFinite(options.startingEquity) || options.startingEquity < 0) {
    throw new Error("--starting-equity must be a non-negative number");
  }
  if (!Number.isInteger(options.intervalMs) || options.intervalMs < 0) {
    throw new Error("--interval-ms must be a non-negative integer");
  }
  if (!Number.isInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
    throw new Error("--request-timeout-ms must be a positive integer");
  }
  if (!Number.isInteger(options.retries) || options.retries < 0) {
    throw new Error("--retries must be a non-negative integer");
  }
  if (!Number.isInteger(options.retryDelayMs) || options.retryDelayMs < 0) {
    throw new Error("--retry-delay-ms must be a non-negative integer");
  }
  if (!Number.isInteger(options.maxPolls) || options.maxPolls < 0) {
    throw new Error("--max-polls must be a non-negative integer");
  }
  if (!Number.isInteger(options.tradeLimit) || options.tradeLimit <= 0) {
    throw new Error("--trade-limit must be a positive integer");
  }
  if (!Number.isInteger(options.maxTradePages) || options.maxTradePages <= 0) {
    throw new Error("--max-trade-pages must be a positive integer");
  }
  if (!Number.isInteger(options.recentLimit) || options.recentLimit < 0) {
    throw new Error("--recent-limit must be a non-negative integer");
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency <= 0) {
    throw new Error("--concurrency must be a positive integer");
  }
}

async function loadSdkModule(): Promise<SdkModule> {
  sdkModulePromise ??= import("../node_modules/jupiter-perps-api-sdk/dist/index.js");
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

function rawUsdToNumber(value: string | number | bigint | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value) / 1_000_000;
}

function decimalToNumber(value: string | number | bigint | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value);
}

function normalizePublicKey(address: string): string {
  return new PublicKey(address).toBase58();
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.name === "PerpsApiError") {
    const apiError = error as Error & { code?: string; status?: number };
    const code = apiError.code ? ` ${apiError.code}` : "";
    return `Perps SDK/API returned ${apiError.status ?? "unknown"}${code}: ${apiError.message}`;
  }

  return error instanceof Error ? error.message : String(error);
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatSignedUsd(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${formatUsd(Math.abs(value))}`;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 1_000 ? 0 : 4,
    minimumFractionDigits: value >= 1_000 ? 0 : 2,
  })}`;
}

function formatFeeUsd(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 2,
  })}`;
}

function formatLeverage(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "--";
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}x`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${Math.abs(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}%`;
}

function formatTokenAmount(value: number): string {
  if (!Number.isFinite(value)) return "--";
  if (value >= 10) return value.toFixed(2);
  if (value >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function shortSignature(signature: string): string {
  return `${signature.slice(0, 4)}...${signature.slice(-4)}`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(11, 19);
}

function pad(value: string, width: number, align: "left" | "right" = "right"): string {
  if (value.length >= width) return value;
  return align === "left" ? value.padEnd(width) : value.padStart(width);
}

function separator(width: number): string {
  return "".padEnd(width, "-");
}

function terminalWidth(): number {
  return Math.max(132, Math.min(process.stdout.columns ?? 160, 180));
}

function requireValue(flag: string, value: string | undefined): asserts value is string {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  console.log(`
Usage:
  npm run jupiter:sdk-reconstruct -- [options]

Examples:
  npm run jupiter:sdk-reconstruct -- --wallet <WALLET> --starting-equity 100 --max-polls 1
  npm run jupiter:sdk-reconstruct -- --wallet-file config/test-wallets.local.txt --starting-equity 100 --interval-ms 3000
  npm run jupiter:sdk-reconstruct -- --trader-config-file config/traders.local.csv --mode qualifier --starting-equity 100

Options:
  --wallet <address>             Add a wallet. Repeatable.
  --wallets <a,b,c>              Add comma/space-separated wallets.
  --wallet-file <path>           Read wallets from a local ignored file.
  --trader-config-file <path>    Read wallet/display-name/starting-equity mapping from CSV/JSON.
  --mode qualifier|final         Filter trader config by competition mode.
  --starting-equity <usd>        Starting equity used when no trader config is provided. Default: 100.
  --start-timestamp <unix>       Round start Unix seconds. Default: now - --since-minutes.
  --since-minutes <minutes>      Rolling start window if no explicit start is provided. Default: 60.
  --interval-ms <ms>             Poll interval. Default: 5000. Use 0 for one request.
  --request-timeout-ms <ms>      Per-request timeout. Default: 8000.
  --retries <count>              Extra attempts per endpoint request. Default: 1.
  --retry-delay-ms <ms>          Initial retry delay with exponential backoff. Default: 500.
  --max-polls <count>            Stop after N polls. Default: 0 for infinite.
  --trade-limit <count>          Trades per SDK page. Default: 100.
  --max-trade-pages <count>      Max trade pages per wallet before marking partial. Default: 5.
  --recent-limit <count>         Recent activity rows per wallet below table. Default: 3.
  --concurrency <count>          Wallets fetched in parallel. Default: 8.
  --include-limit-orders         Also fetch active limit orders per wallet.
  --base-url <url>               API base URL. Default: PERPS_SDK_API_URL, PERPS_API_URL, then production SDK URL.
  --json                         Print normalized JSON rows.

Notes:
  This reconstructs leaderboard data from SDK read endpoints:
  positions.get + positions.getTrades, with optional orders.getLimitOrders.
  It does not use the dedicated competition leaderboard endpoint.
`);
}

main().catch((error) => {
  console.error(formatUnknownError(error));
  process.exit(1);
});
