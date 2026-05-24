export function formatUsd(value: number, options?: { signed?: boolean; compact?: boolean }): string {
  const signDisplay = options?.signed ? "always" : "auto";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    signDisplay,
    notation: options?.compact ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatVolume(value: number): string {
  return formatUsd(value, { compact: true });
}
