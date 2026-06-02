import type { JupiterPerpsWalletSnapshot } from "./jupiter-perps-normalize";

type TriggerOrders = NonNullable<JupiterPerpsWalletSnapshot["triggerOrders"]>;
type SnapshotTrade = JupiterPerpsWalletSnapshot["trades"][number];
type SnapshotPosition = JupiterPerpsWalletSnapshot["positions"][number];

export type TradeLifecycleStatus = "open" | "closed" | "liquidated";
export type TradeLifecycleExecutionAction = "open" | "increase" | "decrease" | "close" | "liquidate";

export interface TradeLifecycleExecution {
  action: TradeLifecycleExecutionAction;
  timestamp: string;
  signature: string;
  market: SnapshotTrade["market"];
  side: SnapshotTrade["side"];
  notionalUsd: number;
  priceUsd?: number;
  collateralUsdDelta?: number;
  pnlUsd: number;
  feeUsd: number;
  rawName: string;
}

export interface TradeLifecycle {
  walletAddress: string;
  position: string;
  sequence: number;
  status: TradeLifecycleStatus;
  market: SnapshotTrade["market"];
  side: SnapshotTrade["side"];
  sizeUsd: number;
  entryPriceUsd?: number;
  markPriceUsd?: number;
  collateralUsd: number;
  leverage: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  grossPnlUsd: number;
  netPnlUsd: number;
  volumeUsd: number;
  feesUsd: number;
  startedAt?: string;
  updatedAt?: string;
  executions: TradeLifecycleExecution[];
  triggerOrders?: TriggerOrders;
}

export function formatTriggerOrdersForTerminal(orders: TriggerOrders, unavailable?: boolean): string {
  if (unavailable) return "unavailable";
  if (orders.length === 0) return "--";

  return [...orders]
    .sort((a, b) => triggerOrderKindRank(a.kind) - triggerOrderKindRank(b.kind) || a.triggerPriceUsd - b.triggerPriceUsd)
    .map((order) => {
      const size = order.entirePosition ? "full" : `partial ${formatTerminalUsd(order.sizeUsd)}`;
      return `${order.kind} ${formatTerminalUsd(order.triggerPriceUsd)} ${size}`;
    })
    .join(" | ");
}

export function buildTradeLifecycles(snapshot: JupiterPerpsWalletSnapshot): TradeLifecycle[] {
  const triggerOrdersByPosition = groupTriggerOrdersByPosition(snapshot.triggerOrders ?? []);
  const currentLifecycleByPosition = new Map<string, MutableTradeLifecycle>();
  const sequenceByPosition = new Map<string, number>();
  const lifecycles: MutableTradeLifecycle[] = [];
  const trades = [...snapshot.trades].sort(compareTradesAscending);

  for (const trade of trades) {
    if (trade.market === "UNKNOWN" || trade.side === "unknown") continue;

    let lifecycle = currentLifecycleByPosition.get(trade.position);
    const isIncrease = trade.name.includes("Increase");
    const isDecrease = trade.name.includes("Decrease");
    const isLiquidation = trade.name.includes("Liquidate");

    if (!lifecycle || lifecycle.status !== "open" || (isIncrease && lifecycle.runningSizeUsd <= 0)) {
      lifecycle = createMutableLifecycle(snapshot.walletAddress, trade, (sequenceByPosition.get(trade.position) ?? 0) + 1);
      sequenceByPosition.set(trade.position, lifecycle.sequence);
      lifecycles.push(lifecycle);
      currentLifecycleByPosition.set(trade.position, lifecycle);
    }

    const action = tradeActionForLifecycle(trade, lifecycle);
    lifecycle.executions.push({
      action,
      timestamp: trade.timestamp,
      signature: trade.signature,
      market: trade.market,
      side: trade.side,
      notionalUsd: Math.abs(trade.notionalUsd),
      priceUsd: trade.priceUsd ?? undefined,
      collateralUsdDelta: trade.collateralUsdDelta,
      pnlUsd: trade.pnlUsd,
      feeUsd: trade.feeUsd,
      rawName: trade.name,
    });
    lifecycle.volumeUsd += Math.abs(trade.notionalUsd);
    lifecycle.feesUsd += trade.feeUsd;
    lifecycle.realizedPnlUsd += trade.pnlUsd;
    lifecycle.updatedAt = trade.timestamp;
    if (trade.priceUsd && lifecycle.entryPriceUsd === undefined && isIncrease) {
      lifecycle.entryPriceUsd = trade.priceUsd;
    }

    if (isIncrease) {
      lifecycle.runningSizeUsd += Math.abs(trade.notionalUsd);
      lifecycle.runningCollateralUsd += trade.collateralUsdDelta ?? 0;
    } else if (isDecrease || isLiquidation) {
      lifecycle.runningSizeUsd = Math.max(0, lifecycle.runningSizeUsd - Math.abs(trade.notionalUsd));
      if (Number.isFinite(trade.positionCollateralUsd)) {
        lifecycle.runningCollateralUsd = trade.positionCollateralUsd ?? lifecycle.runningCollateralUsd;
      }
    }
    lifecycle.maxObservedSizeUsd = Math.max(lifecycle.maxObservedSizeUsd, lifecycle.runningSizeUsd, Math.abs(trade.positionSizeUsd ?? 0));
    lifecycle.maxObservedCollateralUsd = Math.max(
      lifecycle.maxObservedCollateralUsd,
      lifecycle.runningCollateralUsd,
      trade.positionCollateralUsd ?? 0,
      trade.originalPositionCollateralUsd ?? 0,
    );

    if (isLiquidation) {
      lifecycle.status = "liquidated";
      lifecycle.runningSizeUsd = 0;
    } else if ((isDecrease || isLiquidation) && lifecycle.runningSizeUsd <= 0.005) {
      lifecycle.status = "closed";
      lifecycle.runningSizeUsd = 0;
    }
  }

  for (const position of snapshot.positions) {
    let lifecycle = currentLifecycleByPosition.get(position.pubkey);
    if (!lifecycle) {
      lifecycle = createSyntheticOpenLifecycle(snapshot.walletAddress, position, (sequenceByPosition.get(position.pubkey) ?? 0) + 1);
      sequenceByPosition.set(position.pubkey, lifecycle.sequence);
      lifecycles.push(lifecycle);
      currentLifecycleByPosition.set(position.pubkey, lifecycle);
    }

    applyActivePosition(lifecycle, position);
  }

  return lifecycles
    .map((lifecycle) => finalizeLifecycle(lifecycle, triggerOrdersByPosition.get(lifecycle.position) ?? []))
    .sort((a, b) => {
      if (a.status === "open" && b.status !== "open") return -1;
      if (a.status !== "open" && b.status === "open") return 1;
      return (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0) || b.sequence - a.sequence;
    });
}

export function formatTradeLifecycleDetailsForTerminal(
  snapshots: JupiterPerpsWalletSnapshot[],
  options: {
    limitPerWallet?: number;
    walletOrder?: string[];
  } = {},
): string {
  const limitPerWallet = options.limitPerWallet ?? 3;
  const snapshotsByWallet = new Map(snapshots.map((snapshot) => [snapshot.walletAddress, snapshot]));
  const orderedSnapshots = [
    ...(options.walletOrder ?? []).map((walletAddress) => snapshotsByWallet.get(walletAddress)).filter(Boolean),
    ...snapshots.filter((snapshot) => !(options.walletOrder ?? []).includes(snapshot.walletAddress)),
  ] as JupiterPerpsWalletSnapshot[];
  const lines: string[] = ["", "Trade Details"];

  for (const snapshot of orderedSnapshots) {
    const lifecycles = buildTradeLifecycles(snapshot).slice(0, limitPerWallet);
    if (lifecycles.length === 0) continue;

    lines.push(shortAddress(snapshot.walletAddress));
    for (const lifecycle of lifecycles) {
      lines.push(`  ${formatLifecycleSummary(lifecycle)}`);
      for (const execution of lifecycle.executions) {
        lines.push(`    ${formatLifecycleExecution(execution)}`);
      }
      if (lifecycle.triggerOrders?.length) {
        lines.push(`    active orders: ${formatTriggerOrdersForTerminal(lifecycle.triggerOrders)}`);
      }
    }
  }

  return lines.length > 2 ? lines.join("\n") : "";
}

interface MutableTradeLifecycle extends Omit<TradeLifecycle, "triggerOrders"> {
  runningSizeUsd: number;
  runningCollateralUsd: number;
  maxObservedSizeUsd: number;
  maxObservedCollateralUsd: number;
}

function createMutableLifecycle(walletAddress: string, trade: SnapshotTrade, sequence: number): MutableTradeLifecycle {
  return {
    walletAddress,
    position: trade.position,
    sequence,
    status: "open",
    market: trade.market,
    side: trade.side,
    sizeUsd: 0,
    entryPriceUsd: trade.priceUsd ?? trade.positionEntryPriceUsd,
    collateralUsd: 0,
    leverage: 0,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 0,
    grossPnlUsd: 0,
    netPnlUsd: 0,
    volumeUsd: 0,
    feesUsd: 0,
    startedAt: trade.timestamp,
    updatedAt: trade.timestamp,
    executions: [],
    runningSizeUsd: 0,
    runningCollateralUsd: 0,
    maxObservedSizeUsd: 0,
    maxObservedCollateralUsd: 0,
  };
}

function createSyntheticOpenLifecycle(walletAddress: string, position: SnapshotPosition, sequence: number): MutableTradeLifecycle {
  return {
    walletAddress,
    position: position.pubkey,
    sequence,
    status: "open",
    market: position.market,
    side: position.side,
    sizeUsd: position.sizeUsd,
    entryPriceUsd: position.entryPriceUsd,
    markPriceUsd: position.markPriceUsd,
    collateralUsd: position.collateralUsd,
    leverage: position.collateralUsd > 0 ? position.sizeUsd / position.collateralUsd : 0,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: position.unrealizedPnlUsd ?? 0,
    grossPnlUsd: position.unrealizedPnlUsd ?? 0,
    netPnlUsd: position.unrealizedPnlUsd ?? 0,
    volumeUsd: position.sizeUsd,
    feesUsd: 0,
    startedAt: position.openTime > 0 ? new Date(position.openTime * 1000).toISOString() : undefined,
    updatedAt: position.updateTime > 0 ? new Date(position.updateTime * 1000).toISOString() : undefined,
    executions: [],
    runningSizeUsd: position.sizeUsd,
    runningCollateralUsd: position.collateralUsd,
    maxObservedSizeUsd: position.sizeUsd,
    maxObservedCollateralUsd: position.collateralUsd,
  };
}

function applyActivePosition(lifecycle: MutableTradeLifecycle, position: SnapshotPosition): void {
  lifecycle.status = "open";
  lifecycle.sizeUsd = position.sizeUsd;
  lifecycle.entryPriceUsd = position.entryPriceUsd || lifecycle.entryPriceUsd;
  lifecycle.markPriceUsd = position.markPriceUsd;
  lifecycle.collateralUsd = position.collateralUsd;
  lifecycle.leverage = position.collateralUsd > 0 ? position.sizeUsd / position.collateralUsd : 0;
  lifecycle.unrealizedPnlUsd = position.unrealizedPnlUsd ?? 0;
  lifecycle.runningSizeUsd = position.sizeUsd;
  lifecycle.runningCollateralUsd = position.collateralUsd;
  lifecycle.maxObservedSizeUsd = Math.max(lifecycle.maxObservedSizeUsd, position.sizeUsd);
  lifecycle.maxObservedCollateralUsd = Math.max(lifecycle.maxObservedCollateralUsd, position.collateralUsd);
}

function finalizeLifecycle(lifecycle: MutableTradeLifecycle, triggerOrders: TriggerOrders): TradeLifecycle {
  const open = lifecycle.status === "open";
  const sizeUsd = open ? lifecycle.sizeUsd || lifecycle.runningSizeUsd : 0;
  const collateralUsd = open ? lifecycle.collateralUsd || lifecycle.runningCollateralUsd : 0;
  const leverage = open
    ? lifecycle.leverage || (collateralUsd > 0 ? sizeUsd / collateralUsd : 0)
    : lifecycle.maxObservedCollateralUsd > 0
      ? lifecycle.maxObservedSizeUsd / lifecycle.maxObservedCollateralUsd
      : 0;
  const grossPnlUsd = lifecycle.realizedPnlUsd + (open ? lifecycle.unrealizedPnlUsd : 0);
  const netPnlUsd = grossPnlUsd - lifecycle.feesUsd;

  return {
    walletAddress: lifecycle.walletAddress,
    position: lifecycle.position,
    sequence: lifecycle.sequence,
    status: lifecycle.status,
    market: lifecycle.market,
    side: lifecycle.side,
    sizeUsd,
    entryPriceUsd: lifecycle.entryPriceUsd,
    markPriceUsd: lifecycle.markPriceUsd,
    collateralUsd,
    leverage,
    realizedPnlUsd: lifecycle.realizedPnlUsd,
    unrealizedPnlUsd: open ? lifecycle.unrealizedPnlUsd : 0,
    grossPnlUsd,
    netPnlUsd,
    volumeUsd: lifecycle.volumeUsd,
    feesUsd: lifecycle.feesUsd,
    startedAt: lifecycle.startedAt,
    updatedAt: lifecycle.updatedAt,
    executions: lifecycle.executions,
    triggerOrders: open ? triggerOrders : [],
  };
}

function tradeActionForLifecycle(trade: SnapshotTrade, lifecycle: MutableTradeLifecycle): TradeLifecycleExecutionAction {
  if (trade.name.includes("Liquidate")) return "liquidate";
  if (trade.name.includes("Decrease")) {
    return lifecycle.runningSizeUsd > 0 && Math.abs(trade.notionalUsd) >= lifecycle.runningSizeUsd - 0.005 ? "close" : "decrease";
  }
  if (trade.name.includes("Increase")) return lifecycle.executions.length === 0 ? "open" : "increase";
  return "increase";
}

function compareTradesAscending(a: SnapshotTrade, b: SnapshotTrade): number {
  return (
    a.slot - b.slot ||
    (a.instructionIndex ?? 0) - (b.instructionIndex ?? 0) ||
    a.signature.localeCompare(b.signature)
  );
}

function groupTriggerOrdersByPosition(orders: TriggerOrders): Map<string, TriggerOrders> {
  const grouped = new Map<string, TriggerOrders>();
  for (const order of orders) {
    grouped.set(order.position, [...(grouped.get(order.position) ?? []), order]);
  }
  return grouped;
}

function formatLifecycleSummary(lifecycle: TradeLifecycle): string {
  const labels = [
    `${lifecycle.market} ${lifecycle.side} #${lifecycle.sequence}`,
    lifecycle.status,
    `lev ${formatTerminalLeverage(lifecycle.leverage)}`,
    lifecycle.status === "open" ? `size ${formatTerminalUsd(lifecycle.sizeUsd)}` : undefined,
    lifecycle.entryPriceUsd ? `entry ${formatTerminalPrice(lifecycle.entryPriceUsd)}` : undefined,
    lifecycle.markPriceUsd ? `mark ${formatTerminalPrice(lifecycle.markPriceUsd)}` : undefined,
    `gross ${formatTerminalSignedUsd(lifecycle.grossPnlUsd)}`,
    `net ${formatTerminalSignedUsd(lifecycle.netPnlUsd)}`,
    `volume ${formatTerminalUsd(lifecycle.volumeUsd)}`,
    `fees ${formatTerminalUsd(lifecycle.feesUsd)}`,
  ];

  return labels.filter(Boolean).join(" | ");
}

function formatLifecycleExecution(execution: TradeLifecycleExecution): string {
  const labels = [
    formatTerminalTime(execution.timestamp),
    execution.action,
    "market",
    `size ${formatTerminalUsd(execution.notionalUsd)}`,
    execution.priceUsd ? `price ${formatTerminalPrice(execution.priceUsd)}` : undefined,
    execution.collateralUsdDelta ? `collat ${formatTerminalSignedUsd(execution.collateralUsdDelta)}` : undefined,
    execution.pnlUsd ? `pnl ${formatTerminalSignedUsd(execution.pnlUsd)}` : undefined,
    `fee ${formatTerminalUsd(execution.feeUsd)}`,
    `sig ${shortSignature(execution.signature)}`,
  ];

  return labels.filter(Boolean).join(" ");
}

function triggerOrderKindRank(kind: string): number {
  if (kind === "TP") return 0;
  if (kind === "SL") return 1;
  return 2;
}

function formatTerminalUsd(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  return `$${normalized.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatTerminalSignedUsd(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  const prefix = normalized > 0 ? "+" : normalized < 0 ? "-" : "";
  return `${prefix}${formatTerminalUsd(Math.abs(normalized))}`;
}

function formatTerminalPrice(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 100 ? 2 : 4,
    minimumFractionDigits: value >= 100 ? 2 : 4,
  })}`;
}

function formatTerminalLeverage(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "--";
  const truncated = Math.floor(value * 100) / 100;
  return `${truncated.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}x`;
}

function formatTerminalTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toISOString().slice(11, 19);
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function shortSignature(signature: string): string {
  if (signature.length <= 12) return signature;
  return `${signature.slice(0, 4)}...${signature.slice(-4)}`;
}
