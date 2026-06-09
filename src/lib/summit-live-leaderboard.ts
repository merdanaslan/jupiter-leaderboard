import { buildLeaderboard, formatTimer, publicLeaderboardView } from "./leaderboard";
import type {
  CompetitionMode,
  PublicLeaderboardPayload,
  PublicTraderScore,
  RecentActivity,
  RecentTrade,
  RoundStatus,
  TradeMarket,
  TraderScore,
} from "./types";

const QUALIFIER_DURATION_SECONDS = 60 * 60;
const FINAL_DURATION_SECONDS = 30 * 60;
const MOCK_STARTED_AT = "2026-06-13T12:00:00.000Z";
const UPDATE_INTERVAL_SECONDS = 2;

const MARKET_PRICES: Record<TradeMarket, number> = {
  BTC: 68_240,
  ETH: 3_120,
  SOL: 162.4,
};

type SummitTraderSeed = {
  slug: string;
  xHandle: string;
  displayName: string;
  initials: string;
  basePnlUsd: number;
  volume: number;
  recentTrade: RecentTrade;
};

export type SummitQualifierRow = {
  id: string;
  rank: number;
  handle: string;
  name: string;
  initials: string;
  avatarUrl?: string;
  pnlUsd: string;
  pnlPercent: string;
  equity: string;
  volume: string;
  positive: boolean;
};

export type SummitFinalAccent = "gold" | "silver" | "bronze" | "mint";

export type SummitFinalRow = SummitQualifierRow & {
  placement: "1st" | "2nd" | "3rd" | "4th";
  accent: SummitFinalAccent;
  recent: {
    action: "OPEN" | "CLOSE" | "LIQ" | "FILL" | "DEPOSIT" | "WITHDRAW" | "PLACE LIMIT" | "CANCEL LIMIT" | "PLACE SL" | "CANCEL SL" | "PLACE TP" | "CANCEL TP";
    side: "LONG" | "SHORT";
    market: TradeMarket;
    pnl: string;
    detail: string;
    positive: boolean;
  } | null;
};

type SummitRecentActivity = NonNullable<SummitFinalRow["recent"]>;

const QUALIFIER_SEEDS: SummitTraderSeed[] = [
  seed("merdan", "@merdan", "Merdan", "MA", 36.8, 5_700, "SOL", "long", "decrease", 4.2, 681.2),
  seed("solape", "@solape", "Sol Ape", "SA", 33.9, 4_800, "BTC", "long", "increase", 2.1, 1_364.8),
  seed("juptrader", "@juptrader", "Jup Trader", "JT", 30.5, 4_400, "ETH", "short", "decrease", -1.8, 936),
  seed("berlinbull", "@berlinbull", "Berlin Bull", "BB", 27.8, 3_900, "SOL", "long", "increase", 1.9, 486),
  seed("blocksmith", "@blocksmith", "Blocksmith", "BS", 25.9, 3_800, "BTC", "short", "increase", 1.4, 1_023.6),
  seed("perpchef", "@perpchef", "Perp Chef", "PC", 23.2, 3_500, "ETH", "long", "decrease", 1.1, 780),
  seed("neonmaker", "@neonmaker", "Neon Maker", "NM", 20.8, 3_300, "SOL", "long", "increase", 0.8, 389.8),
  seed("satoshisurf", "@satoshisurf", "Satoshi Surf", "SS", 19.6, 3_100, "BTC", "long", "decrease", 0.5, 682.4),
  seed("liquidmax", "@liquidmax", "Liquid Max", "LM", 17.9, 3_000, "ETH", "short", "increase", -0.7, 624),
  seed("byteflow", "@byteflow", "Byte Flow", "BF", 15.7, 2_800, "SOL", "long", "increase", 0.6, 324.8),
  seed("riskrunner", "@riskrunner", "Risk Runner", "RR", 13.8, 2_700, "BTC", "short", "decrease", 0.3, 682.4),
  seed("orbitpnl", "@orbitpnl", "Orbit PnL", "OP", 12.2, 2_500, "ETH", "long", "increase", 0.4, 468),
  seed("chainpilot", "@chainpilot", "Chain Pilot", "CP", 10.9, 2_400, "SOL", "short", "decrease", -0.5, 243.6),
  seed("alphaberlin", "@alphaberlin", "Alpha Berlin", "AB", 9.7, 2_200, "BTC", "long", "increase", 0.2, 511.8),
  seed("candlemind", "@candlemind", "Candle Mind", "CM", 8.2, 2_000, "ETH", "short", "increase", -0.3, 374.4),
  seed("swaplogic", "@swaplogic", "Swap Logic", "SL", 7.2, 1_900, "SOL", "long", "decrease", 0.4, 211.1),
  seed("turbosol", "@turbosol", "Turbo SOL", "TS", 5.9, 1_800, "BTC", "long", "increase", 0.2, 341.2),
  seed("greenwick", "@greenwick", "Green Wick", "GW", 4.3, 1_600, "ETH", "long", "decrease", -0.4, 312),
  seed("deltahaus", "@deltahaus", "Delta Haus", "DH", 3, 1_500, "SOL", "short", "increase", 0.1, 194.9),
  seed("makerbee", "@makerbee", "Maker Bee", "MB", 1.9, 1_400, "BTC", "short", "decrease", -0.2, 409.4),
  seed("fundingflip", "@fundingflip", "Funding Flip", "FF", 0.8, 1_300, "ETH", "long", "increase", 0.1, 249.6),
  seed("marginmate", "@marginmate", "Margin Mate", "MM", -2.4, 1_200, "SOL", "long", "decrease", -0.6, 162.4),
  seed("stormtrade", "@stormtrade", "Storm Trade", "ST", -5.4, 1_100, "BTC", "long", "decrease", -0.9, 341.2),
  seed("wickedsol", "@wickedsol", "Wicked SOL", "WS", -8.3, 1_000, "ETH", "short", "increase", -0.7, 218.4),
  seed("lastliquid", "@lastliquid", "Last Liquid", "LL", -12.1, 980, "SOL", "short", "decrease", -1.1, 129.9),
];

const FINAL_SEEDS: SummitTraderSeed[] = [
  seed("merdan", "@merdan", "Merdan", "MA", 435, 63_600, "SOL", "long", "decrease", 42, 2_955.68),
  seed("solape", "@solape", "Sol Ape", "SA", 428, 59_200, "BTC", "long", "increase", 11.8, 1_228.32),
  seed("juptrader", "@juptrader", "Jup Trader", "JT", 414, 54_800, "ETH", "short", "decrease", -9.5, 1_435.2),
  seed("berlinbull", "@berlinbull", "Berlin Bull", "BB", 387, 50_600, "SOL", "long", "increase", 7.2, 747.04),
];

const QUALIFIER_DELTAS: Array<Record<string, number>> = [
  {},
  { berlinbull: 6.6, juptrader: 1.4, blocksmith: 2.1, perpchef: -1.4 },
  { berlinbull: 9.2, juptrader: 0.7, blocksmith: 3.8, perpchef: 7.4, neonmaker: -1.2 },
  { solape: 5.4, juptrader: 8.1, blocksmith: -1.8, riskrunner: 4.9 },
  { merdan: -2.2, solape: 6.6, berlinbull: 4.2, byteflow: 5.8 },
  { juptrader: 6.4, blocksmith: 7.1, perpchef: 5.7, marginmate: 4.2 },
];

const FINAL_DELTAS: Array<Record<string, number>> = [
  {},
  { solape: 5, berlinbull: 16 },
  { merdan: 3, solape: 13, juptrader: 8, berlinbull: 18 },
  { merdan: 4, solape: 12, juptrader: 30, berlinbull: 20 },
  { merdan: 22, solape: 8, juptrader: 17, berlinbull: 31 },
  { solape: 28, juptrader: 13, berlinbull: 26 },
];

export function createSummitMockLeaderboardPayload(
  mode: CompetitionMode,
  tick = 0,
  requestedStatus: RoundStatus = "live",
  options: { durationSeconds?: number } = {},
): PublicLeaderboardPayload {
  const durationSeconds =
    options.durationSeconds ??
    (mode === "qualifier" ? QUALIFIER_DURATION_SECONDS : FINAL_DURATION_SECONDS);
  const remainingSeconds = Math.max(0, durationSeconds - tick * UPDATE_INTERVAL_SECONDS);
  const status: RoundStatus = remainingSeconds === 0 ? "locked" : requestedStatus;
  const updatedAt = new Date(new Date(MOCK_STARTED_AT).getTime() + tick * UPDATE_INTERVAL_SECONDS * 1000).toISOString();
  const seeds = mode === "qualifier" ? QUALIFIER_SEEDS : FINAL_SEEDS;
  const startingEquity = mode === "qualifier" ? 100 : 1_000;
  const rankedTraders = buildLeaderboard(
    seeds.map((trader, index) =>
      toTraderScore({
        trader,
        mode,
        index,
        tick,
        startingEquity,
        updatedAt,
      }),
    ),
  );

  return {
    state: {
      activeMode: mode,
      status,
      scenario: mode === "qualifier" ? "top-4-battle" : "close-race",
      durationSeconds,
      remainingSeconds,
      startedAt: MOCK_STARTED_AT,
      updatedAt,
      selectedFinalistIds:
        mode === "final" ? FINAL_SEEDS.map((trader) => `${mode}-${trader.slug}`) : [],
      lockedStandings: {
        qualifier: null,
        final: null,
      },
      liveDataStatus: {
        qualifier: "idle",
        final: "idle",
      },
      liveDataUpdatedAt: {
        qualifier: null,
        final: null,
      },
      dataSource: "mock",
    },
    traders: publicLeaderboardView(rankedTraders),
  };
}

export function toSummitQualifierRows(traders: PublicTraderScore[]): SummitQualifierRow[] {
  return traders.map(toSummitQualifierRow);
}

export function toSummitFinalRows(traders: PublicTraderScore[]): SummitFinalRow[] {
  return traders.slice(0, 4).map((trader) => ({
    ...toSummitQualifierRow(trader),
    placement: placementForRank(trader.rank),
    accent: accentForRank(trader.rank),
    recent: toSummitRecentActivity(trader),
  }));
}

export function formatSummitTimerFromPayload(payload: PublicLeaderboardPayload): string {
  return formatTimer(payload.state.remainingSeconds);
}

function seed(
  slug: string,
  xHandle: string,
  displayName: string,
  initials: string,
  basePnlUsd: number,
  volume: number,
  market: TradeMarket,
  side: RecentTrade["side"],
  action: NonNullable<RecentTrade["action"]>,
  pnlUsd: number,
  notionalUsd: number,
): SummitTraderSeed {
  return {
    slug,
    xHandle,
    displayName,
    initials,
    basePnlUsd,
    volume,
    recentTrade: {
      market,
      side,
      action,
      pnlUsd,
      notionalUsd,
      timestamp: MOCK_STARTED_AT,
    },
  };
}

function toTraderScore({
  trader,
  mode,
  index,
  tick,
  startingEquity,
  updatedAt,
}: {
  trader: SummitTraderSeed;
  mode: CompetitionMode;
  index: number;
  tick: number;
  startingEquity: number;
  updatedAt: string;
}): TraderScore {
  const pnlUsd = getLivePnlUsd(mode, trader, index, tick);

  return {
    id: `${mode}-${trader.slug}`,
    xHandle: trader.xHandle,
    displayName: trader.displayName,
    walletAddress: `mock-wallet-${mode}-${trader.slug}`,
    status: "active",
    mode,
    startingBalance: startingEquity,
    startingEquity,
    equity: startingEquity + pnlUsd,
    pnlUsd,
    pnlPercent: (pnlUsd / startingEquity) * 100,
    volume: trader.volume + getLiveVolumeDelta(mode, trader.slug, tick),
    rank: index + 1,
    lastUpdated: updatedAt,
    gapToLeader: 0,
    recentTrade: {
      ...trader.recentTrade,
      pnlUsd:
        typeof trader.recentTrade.pnlUsd === "number"
          ? roundCurrency(trader.recentTrade.pnlUsd + getRecentTradeDelta(mode, trader.slug, tick))
          : undefined,
      timestamp: updatedAt,
    },
  };
}

function getLivePnlUsd(
  mode: CompetitionMode,
  trader: SummitTraderSeed,
  index: number,
  tick: number,
): number {
  if (tick === 0) return trader.basePnlUsd;

  const deltas = mode === "qualifier" ? QUALIFIER_DELTAS : FINAL_DELTAS;
  const scriptedDelta = deltas[tick % deltas.length]?.[trader.slug] ?? 0;
  const wave = Math.sin((tick + 1) * (index + 2) * 0.74) * (mode === "qualifier" ? 0.35 : 2.2);

  return roundCurrency(trader.basePnlUsd + scriptedDelta + wave);
}

function getLiveVolumeDelta(mode: CompetitionMode, slug: string, tick: number): number {
  if (tick === 0) return 0;

  const slugWeight = Array.from(slug).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 7;
  return (tick * (slugWeight + 2) * (mode === "qualifier" ? 32 : 620));
}

function getRecentTradeDelta(mode: CompetitionMode, slug: string, tick: number): number {
  if (tick === 0) return 0;

  const slugWeight = Array.from(slug).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
  return (slugWeight - 2) * (mode === "qualifier" ? 0.12 : 1.4);
}

function toSummitQualifierRow(trader: PublicTraderScore): SummitQualifierRow {
  return {
    id: trader.id,
    rank: trader.rank,
    handle: trader.xHandle,
    name: trader.displayName,
    initials: initialsForTrader(trader),
    avatarUrl: trader.avatarUrl,
    pnlUsd: formatSignedUsd(trader.pnlUsd),
    pnlPercent: formatSignedPercent(trader.pnlPercent),
    equity: formatUsd(trader.equity),
    volume: formatCompactUsd(trader.volume),
    positive: trader.pnlUsd >= 0,
  };
}

function toSummitRecentActivity(trader: PublicTraderScore): SummitFinalRow["recent"] {
  if (trader.recentActivity) return sdkRecentActivityToSummitRecent(trader.recentActivity);
  return legacyRecentTradeToSummitRecent(trader.recentTrade);
}

function sdkRecentActivityToSummitRecent(activity: RecentActivity): SummitFinalRow["recent"] {
  if (activity.type === "order") {
    return {
      action: `${activity.action === "place" ? "PLACE" : "CANCEL"} ${activity.orderKind}` as SummitRecentActivity["action"],
      side: activity.side.toUpperCase() as "LONG" | "SHORT",
      market: activity.market,
      pnl: "--",
      detail: activity.entirePosition
        ? `full @ ${formatUsd(activity.triggerPriceUsd)}`
        : `${formatUsd(activity.sizeUsd)} @ ${formatUsd(activity.triggerPriceUsd)}`,
      positive: true,
    };
  }

  if (activity.action === "deposit" || activity.action === "withdraw") {
    const collateralDetail =
      typeof activity.collateralUsdDelta === "number"
        ? `${formatSignedUsd(activity.collateralUsdDelta)} collateral`
        : "collateral";

    return {
      action: sdkTradeActionLabel(activity.action),
      side: activity.side.toUpperCase() as "LONG" | "SHORT",
      market: activity.market,
      pnl: "--",
      detail: collateralDetail,
      positive: true,
    };
  }

  const realizedPnlUsd = activity.netRealizedPnlUsd ?? activity.realizedPnlUsd;

  return {
    action: sdkTradeActionLabel(activity.action),
    side: activity.side.toUpperCase() as "LONG" | "SHORT",
    market: activity.market,
    pnl: realizedPnlUsd === null ? "--" : formatSignedUsd(realizedPnlUsd),
    detail: `${formatCompactUsd(activity.notionalUsd)} @ ${formatUsd(activity.priceUsd)}`,
    positive: (realizedPnlUsd ?? 0) >= 0,
  };
}

function legacyRecentTradeToSummitRecent(recentTrade: PublicTraderScore["recentTrade"]): SummitFinalRow["recent"] {
  if (!recentTrade) return null;

  const recent = recentTrade;
  const price = MARKET_PRICES[recent.market];

  return {
    action: actionLabel(recent.action),
    side: recent.side.toUpperCase() as "LONG" | "SHORT",
    market: recent.market,
    pnl: formatSignedUsd(recent.pnlUsd ?? 0),
    detail: `${formatCompactUsd(recent.notionalUsd)} @ ${formatUsd(price)}`,
    positive: (recent.pnlUsd ?? 0) >= 0,
  };
}

function sdkTradeActionLabel(action: RecentActivity["action"]): SummitRecentActivity["action"] {
  if (action === "deposit") return "DEPOSIT";
  if (action === "withdraw") return "WITHDRAW";
  if (action === "liquidation") return "LIQ";
  if (action === "decrease" || action === "close") return "CLOSE";
  if (action === "increase") return "FILL";
  return "OPEN";
}

function actionLabel(action: RecentTrade["action"]): SummitRecentActivity["action"] {
  if (action === "decrease") return "CLOSE";
  if (action === "liquidate") return "LIQ";
  return "OPEN";
}

function placementForRank(rank: number): SummitFinalRow["placement"] {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return "4th";
}

function accentForRank(rank: number): SummitFinalAccent {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "mint";
}

function initialsForTrader(trader: PublicTraderScore): string {
  const handle = trader.xHandle.replace(/^@/, "");
  const knownSeed = [...QUALIFIER_SEEDS, ...FINAL_SEEDS].find(
    (seededTrader) => seededTrader.xHandle === trader.xHandle,
  );

  if (knownSeed) return knownSeed.initials;

  return handle
    .split(/[_\s-]+/)
    .map((part) => part.at(0)?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function formatSignedUsd(value: number): string {
  const roundedValue = roundCurrency(value);
  const sign = roundedValue >= 0 ? "+" : "-";

  return `${sign}$${formatNumber(Math.abs(roundedValue), 2)}`;
}

function formatUsd(value: number): string {
  return `$${formatNumber(roundCurrency(value), 2)}`;
}

function formatSignedPercent(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const fractionDigits = Math.abs(safeValue) > 0 && Math.abs(safeValue) < 1 ? 2 : 1;
  const roundedValue = roundTo(safeValue, fractionDigits);
  const displayValue = Object.is(roundedValue, -0) ? 0 : roundedValue;
  const sign = displayValue < 0 ? "-" : "+";

  return `${sign}${Math.abs(displayValue).toFixed(fractionDigits)}%`;
}

function formatCompactUsd(value: number): string {
  if (Math.abs(value) < 1_000) {
    return new Intl.NumberFormat("en-US", {
      currency: "USD",
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
      style: "currency",
    }).format(roundCurrency(value));
  }

  if (Math.abs(value) < 1_000_000) return `$${(value / 1_000).toFixed(1)}K`;

  return `$${(value / 1_000_000).toFixed(1)}M`;
}

function formatNumber(value: number, fractionDigits: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function roundCurrency(value: number): number {
  return roundTo(value, 2);
}

function roundTo(value: number, fractionDigits: number): number {
  const multiplier = 10 ** fractionDigits;

  return Math.round(value * multiplier) / multiplier;
}
