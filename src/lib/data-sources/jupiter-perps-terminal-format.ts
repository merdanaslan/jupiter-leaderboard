import type { JupiterPerpsWalletSnapshot } from "./jupiter-perps-normalize";

type TriggerOrders = NonNullable<JupiterPerpsWalletSnapshot["triggerOrders"]>;

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
