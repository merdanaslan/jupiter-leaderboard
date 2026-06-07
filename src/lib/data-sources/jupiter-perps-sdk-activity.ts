export type SdkOrderSide = "long" | "short";
export type SdkOrderMarket = "BTC" | "ETH" | "SOL";
export type SdkOrderAction = "place" | "cancel";
export type SdkOrderKind = "LIMIT" | "SL" | "TP";

const MARKET_BY_MINT: Record<string, SdkOrderMarket> = {
  "So11111111111111111111111111111111111111112": "SOL",
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ETH",
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": "BTC",
};

export interface SdkActiveTpslRequest {
  positionRequestPubkey: string;
  type: "sl" | "tp";
  market: SdkOrderMarket;
  side: SdkOrderSide;
  triggerPriceUsd: number;
  sizeUsd: number;
  entirePosition: boolean;
}

export interface SdkActiveLimitOrder {
  positionRequestPubkey: string;
  marketMint: string;
  side: SdkOrderSide;
  triggerPrice: string | null;
  sizeUsdDelta?: string | null;
  maxSizeUsdDelta?: string | null;
  minSizeUsdDelta?: string | null;
  collateralUsd?: string | null;
}

export interface SdkActiveOrderSnapshot {
  walletAddress: string;
  tpslRequests: SdkActiveTpslRequest[];
  limitOrders: SdkActiveLimitOrder[];
}

export interface SdkOrderActivity {
  action: SdkOrderAction;
  orderKind: SdkOrderKind;
  walletAddress: string;
  market: SdkOrderMarket;
  side: SdkOrderSide;
  triggerPriceUsd: number;
  sizeUsd: number;
  entirePosition: boolean;
  timestamp: number;
  summary: string;
}

export function mergeSdkOrderActivityHistory(
  existing: SdkOrderActivity[],
  incoming: SdkOrderActivity[],
  limit: number,
): SdkOrderActivity[] {
  if (incoming.length === 0) return existing.slice(-limit);

  const deduped = new Map<string, SdkOrderActivity>();
  for (const activity of [...existing, ...incoming]) {
    deduped.set(orderActivityKey(activity), activity);
  }

  return [...deduped.values()]
    .sort((a, b) => a.timestamp - b.timestamp || a.summary.localeCompare(b.summary))
    .slice(-limit);
}

export function diffSdkOrderActivities(
  previous: SdkActiveOrderSnapshot | undefined,
  current: SdkActiveOrderSnapshot,
  timestamp = Math.floor(Date.now() / 1000),
): SdkOrderActivity[] {
  if (!previous) return [];

  const previousOrders = new Map(snapshotOrders(previous).map((order) => [order.key, order]));
  const currentOrders = new Map(snapshotOrders(current).map((order) => [order.key, order]));
  const activities: SdkOrderActivity[] = [];

  for (const [key, order] of currentOrders) {
    if (previousOrders.has(key)) continue;
    activities.push(toOrderActivity("place", current.walletAddress, order, timestamp));
  }

  for (const [key, order] of previousOrders) {
    if (currentOrders.has(key)) continue;
    activities.push(toOrderActivity("cancel", current.walletAddress, order, timestamp));
  }

  return activities;
}

export function formatSdkActiveOrderSummary(snapshot: SdkActiveOrderSnapshot): string {
  const summaries = snapshotOrders(snapshot).map((order) => {
    if (order.kind === "LIMIT") {
      return `LMT ${order.market} ${order.side} ${formatPrice(order.triggerPriceUsd)} ${formatOrderSize(order)}`;
    }

    return `${order.kind} ${formatPrice(order.triggerPriceUsd)} ${formatOrderSize(order)}`;
  });

  return summaries.length > 0 ? summaries.join(" | ") : "TP/SL --";
}

function toOrderActivity(
  action: SdkOrderAction,
  walletAddress: string,
  order: NormalizedOrder,
  timestamp: number,
): SdkOrderActivity {
  const summary = `${action} ${order.kind} ${order.market} ${order.side} ${formatPrice(order.triggerPriceUsd)} ${formatOrderSize(order)}`;
  return {
    action,
    entirePosition: order.entirePosition,
    market: order.market,
    orderKind: order.kind,
    side: order.side,
    sizeUsd: order.sizeUsd,
    summary,
    timestamp,
    triggerPriceUsd: order.triggerPriceUsd,
    walletAddress,
  };
}

function orderActivityKey(activity: SdkOrderActivity): string {
  return [
    activity.walletAddress,
    activity.action,
    activity.orderKind,
    activity.market,
    activity.side,
    activity.triggerPriceUsd,
    activity.sizeUsd,
    activity.entirePosition ? "full" : "partial",
    activity.timestamp,
  ].join(":");
}

interface NormalizedOrder {
  key: string;
  kind: SdkOrderKind;
  market: SdkOrderMarket;
  side: SdkOrderSide;
  triggerPriceUsd: number;
  sizeUsd: number;
  entirePosition: boolean;
}

function snapshotOrders(snapshot: SdkActiveOrderSnapshot): NormalizedOrder[] {
  return [
    ...snapshot.tpslRequests.map((request) => ({
      entirePosition: request.entirePosition,
      key: `tpsl:${request.positionRequestPubkey}`,
      kind: request.type.toUpperCase() as "SL" | "TP",
      market: request.market,
      side: request.side,
      sizeUsd: request.sizeUsd,
      triggerPriceUsd: request.triggerPriceUsd,
    })),
    ...snapshot.limitOrders.map((order) => ({
      entirePosition: false,
      key: `limit:${order.positionRequestPubkey}`,
      kind: "LIMIT" as const,
      market: MARKET_BY_MINT[order.marketMint] ?? "SOL",
      side: order.side,
      sizeUsd: sdkUsdToNumber(order.sizeUsdDelta ?? order.maxSizeUsdDelta ?? order.minSizeUsdDelta ?? order.collateralUsd),
      triggerPriceUsd: sdkUsdToNumber(order.triggerPrice),
    })),
  ];
}

function formatOrderSize(order: Pick<NormalizedOrder, "entirePosition" | "sizeUsd">): string {
  return order.entirePosition ? "full" : formatUsd(order.sizeUsd);
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 1_000 ? 0 : 4,
    minimumFractionDigits: value >= 1_000 ? 0 : 2,
  })}`;
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function sdkUsdToNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.abs(parsed) >= 100_000 ? parsed / 1_000_000 : parsed;
}
