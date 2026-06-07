"use client";

import Image from "next/image";
import { Fragment, useMemo } from "react";
import {
  formatSummitTimerFromPayload,
  toSummitQualifierRows,
} from "@/lib/summit-live-leaderboard";
import type { SummitQualifierRow } from "@/lib/summit-live-leaderboard";
import { cn } from "@/lib/utils";
import {
  useFlipListMovement,
  useSummitMockDurationSeconds,
  useSummitMockLeaderboardPayload,
  useSummitMockLiveFlag,
} from "./use-summit-mock-live";
import { useSummitCelebrations } from "./use-summit-celebrations";

const QUALIFIER_TIMER = "60:00";

const STATIC_QUALIFIER_TRADERS = [
  { rank: 1, handle: "@merdan", name: "Merdan", initials: "MA", pnlUsd: "+$36.80", pnlPercent: "+36.8%", equity: "$136.80", volume: "$5.7K", positive: true },
  { rank: 2, handle: "@solape", name: "Sol Ape", initials: "SA", pnlUsd: "+$33.90", pnlPercent: "+33.9%", equity: "$133.90", volume: "$4.8K", positive: true },
  { rank: 3, handle: "@juptrader", name: "Jup Trader", initials: "JT", pnlUsd: "+$30.50", pnlPercent: "+30.5%", equity: "$130.50", volume: "$4.4K", positive: true },
  { rank: 4, handle: "@berlinbull", name: "Berlin Bull", initials: "BB", pnlUsd: "+$27.80", pnlPercent: "+27.8%", equity: "$127.80", volume: "$3.9K", positive: true },
  { rank: 5, handle: "@blocksmith", name: "Blocksmith", initials: "BS", pnlUsd: "+$25.90", pnlPercent: "+25.9%", equity: "$125.90", volume: "$3.8K", positive: true },
  { rank: 6, handle: "@perpchef", name: "Perp Chef", initials: "PC", pnlUsd: "+$23.20", pnlPercent: "+23.2%", equity: "$123.20", volume: "$3.5K", positive: true },
  { rank: 7, handle: "@neonmaker", name: "Neon Maker", initials: "NM", pnlUsd: "+$20.80", pnlPercent: "+20.8%", equity: "$120.80", volume: "$3.3K", positive: true },
  { rank: 8, handle: "@satoshisurf", name: "Satoshi Surf", initials: "SS", pnlUsd: "+$19.60", pnlPercent: "+19.6%", equity: "$119.60", volume: "$3.1K", positive: true },
  { rank: 9, handle: "@liquidmax", name: "Liquid Max", initials: "LM", pnlUsd: "+$17.90", pnlPercent: "+17.9%", equity: "$117.90", volume: "$3.0K", positive: true },
  { rank: 10, handle: "@byteflow", name: "Byte Flow", initials: "BF", pnlUsd: "+$15.70", pnlPercent: "+15.7%", equity: "$115.70", volume: "$2.8K", positive: true },
  { rank: 11, handle: "@riskrunner", name: "Risk Runner", initials: "RR", pnlUsd: "+$13.80", pnlPercent: "+13.8%", equity: "$113.80", volume: "$2.7K", positive: true },
  { rank: 12, handle: "@orbitpnl", name: "Orbit PnL", initials: "OP", pnlUsd: "+$12.20", pnlPercent: "+12.2%", equity: "$112.20", volume: "$2.5K", positive: true },
  { rank: 13, handle: "@chainpilot", name: "Chain Pilot", initials: "CP", pnlUsd: "+$10.90", pnlPercent: "+10.9%", equity: "$110.90", volume: "$2.4K", positive: true },
  { rank: 14, handle: "@alphaberlin", name: "Alpha Berlin", initials: "AB", pnlUsd: "+$9.70", pnlPercent: "+9.7%", equity: "$109.70", volume: "$2.2K", positive: true },
  { rank: 15, handle: "@candlemind", name: "Candle Mind", initials: "CM", pnlUsd: "+$8.20", pnlPercent: "+8.2%", equity: "$108.20", volume: "$2.0K", positive: true },
  { rank: 16, handle: "@swaplogic", name: "Swap Logic", initials: "SL", pnlUsd: "+$7.20", pnlPercent: "+7.2%", equity: "$107.20", volume: "$1.9K", positive: true },
  { rank: 17, handle: "@turbosol", name: "Turbo SOL", initials: "TS", pnlUsd: "+$5.90", pnlPercent: "+5.9%", equity: "$105.90", volume: "$1.8K", positive: true },
  { rank: 18, handle: "@greenwick", name: "Green Wick", initials: "GW", pnlUsd: "+$4.30", pnlPercent: "+4.3%", equity: "$104.30", volume: "$1.6K", positive: true },
  { rank: 19, handle: "@deltahaus", name: "Delta Haus", initials: "DH", pnlUsd: "+$3.00", pnlPercent: "+3.0%", equity: "$103.00", volume: "$1.5K", positive: true },
  { rank: 20, handle: "@makerbee", name: "Maker Bee", initials: "MB", pnlUsd: "+$1.90", pnlPercent: "+1.9%", equity: "$101.90", volume: "$1.4K", positive: true },
  { rank: 21, handle: "@fundingflip", name: "Funding Flip", initials: "FF", pnlUsd: "+$0.80", pnlPercent: "+0.8%", equity: "$100.80", volume: "$1.3K", positive: true },
  { rank: 22, handle: "@marginmate", name: "Margin Mate", initials: "MM", pnlUsd: "-$2.40", pnlPercent: "-2.4%", equity: "$97.60", volume: "$1.2K", positive: false },
  { rank: 23, handle: "@stormtrade", name: "Storm Trade", initials: "ST", pnlUsd: "-$5.40", pnlPercent: "-5.4%", equity: "$94.60", volume: "$1.1K", positive: false },
  { rank: 24, handle: "@wickedsol", name: "Wicked SOL", initials: "WS", pnlUsd: "-$8.30", pnlPercent: "-8.3%", equity: "$91.70", volume: "$1.0K", positive: false },
  { rank: 25, handle: "@lastliquid", name: "Last Liquid", initials: "LL", pnlUsd: "-$12.10", pnlPercent: "-12.1%", equity: "$87.90", volume: "$980", positive: false },
];

const QUALIFIER_TRADERS: SummitQualifierRow[] = STATIC_QUALIFIER_TRADERS.map((trader) => ({
  id: `qualifier-${trader.handle.replace(/^@/, "")}`,
  ...trader,
}));

const SIDE_PATTERN_SEGMENTS = [
  { id: 1, className: "summit-side-pattern-segment-1" },
  { id: 2, className: "summit-side-pattern-segment-2 summit-side-pattern-continuation" },
  { id: 3, className: "summit-side-pattern-segment-3 summit-side-pattern-continuation" },
  { id: 4, className: "summit-side-pattern-segment-4 summit-side-pattern-continuation" },
] as const;

export function SummitQualifierPage({
  mockLive = false,
  mockDurationSeconds,
}: {
  mockLive?: boolean;
  mockDurationSeconds?: number;
} = {}) {
  const liveMode = useSummitMockLiveFlag(mockLive);
  const liveMockDurationSeconds = useSummitMockDurationSeconds(mockDurationSeconds);
  const livePayload = useSummitMockLeaderboardPayload(
    "qualifier",
    liveMode,
    liveMockDurationSeconds ? { durationSeconds: liveMockDurationSeconds } : undefined,
  );
  const traders = liveMode ? toSummitQualifierRows(livePayload.traders) : QUALIFIER_TRADERS;
  const timer = liveMode ? formatSummitTimerFromPayload(livePayload) : QUALIFIER_TIMER;
  const orderedTraderIds = useMemo(() => traders.map((trader) => trader.id), [traders]);
  const registerMovingRow = useFlipListMovement(orderedTraderIds, liveMode);
  useSummitCelebrations({ enabled: liveMode, mode: "qualifier", payload: livePayload });

  return (
    <main className="summit-theme min-h-screen bg-black text-white">
      <section className="summit-qualifier-stage relative min-h-[100svh] overflow-x-hidden bg-black pb-10">
        <SummitSidePatterns />
        <header className="summit-container relative z-20 grid grid-cols-[auto_auto] items-center justify-between gap-x-3 gap-y-4 py-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-x-8">
          <div className="-ml-5 lg:-ml-7">
            <Image
              src="/images/summit-germany/Logo Variant 1 svg-nobg.svg"
              alt="Solana Summit Germany"
              width={500}
              height={500}
              className="h-[82px] w-[184px] object-cover object-center sm:h-[91px] sm:w-[204px] lg:h-[104px] lg:w-[232px]"
              priority
              unoptimized
            />
          </div>

          <div className="qualifier-event-lockup order-3 col-span-2 mx-auto flex w-full max-w-[340px] min-w-0 flex-col items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-black/35 px-4 py-3 text-center shadow-[0_0_28px_rgba(20,241,149,0.06)] backdrop-blur-md md:order-none md:col-span-1 md:w-auto md:max-w-none md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0 lg:flex-row lg:gap-4">
            <h1 className="text-[14px] font-bold uppercase leading-none tracking-[0.18em] text-white/86 sm:text-[15px] lg:text-[16px]">
              Trading Cup
            </h1>
            <div className="hidden h-8 w-px bg-white/[0.14] lg:block" aria-hidden="true" />
            <div className="flex items-center justify-center gap-2">
              <span className="text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-white/[0.62] sm:text-[12px]">
                Powered by
              </span>
              <Image
                src="/images/jupiter-white.svg"
                alt="Jupiter"
                width={130}
                height={40}
                className="h-6 w-auto sm:h-7 lg:h-8"
                unoptimized
              />
            </div>
          </div>

          <div
            role="timer"
            aria-label="Qualifier timer"
            className="summit-outline-cta flex h-[82px] w-[142px] flex-col items-center justify-center gap-1 rounded-full px-4 text-white sm:h-[91px] sm:w-[176px] lg:h-[104px] lg:w-[260px]"
          >
            <span className="whitespace-nowrap text-[7px] font-black uppercase leading-none tracking-[0.1em] text-[#14f195] sm:text-[9px] sm:tracking-[0.12em] lg:text-[11px]">
              Qualifier time left
            </span>
            <span className="font-black leading-none tabular-nums text-[30px] sm:text-[38px] lg:text-[52px]">
              {timer}
            </span>
          </div>
        </header>

        <section className="summit-container relative z-10 pt-3">
          <BoardTitle />
          <MobileBoardHeader />
          <BoardHeader />
          <div
            role="list"
            aria-label="Qualifier leaderboard"
            className="mx-auto flex max-w-[1320px] flex-col gap-2"
          >
            {traders.map((trader) => (
              <Fragment key={trader.id}>
                <QualifierRow
                  trader={trader}
                  rowRef={registerMovingRow(trader.id)}
                  live={liveMode}
                />
                {trader.rank === 4 ? <QualificationDivider /> : null}
              </Fragment>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function QualifierRow({
  trader,
  rowRef,
  live,
}: {
  trader: SummitQualifierRow;
  rowRef: (node: HTMLElement | null) => void;
  live: boolean;
}) {
  const qualifying = trader.rank <= 4;

  return (
    <article
      role="listitem"
      ref={rowRef}
      data-qualifying={qualifying ? "true" : "false"}
      data-summit-trader-id={trader.id}
      data-live={live ? "true" : "false"}
      aria-label={`Rank #${trader.rank}, ${trader.handle}`}
      className={cn(
        "qualifier-board-row qualifier-row-glass qualifier-row-higher-transparency qualifier-row-extra-transparent grid min-h-[56px] grid-cols-[44px_minmax(0,1fr)_minmax(96px,auto)] items-center gap-2 border px-3 py-2 transition-colors sm:min-h-[56px] sm:grid-cols-[72px_minmax(210px,1.7fr)_minmax(140px,0.8fr)_minmax(110px,0.65fr)_minmax(130px,0.7fr)_minmax(120px,0.65fr)] sm:gap-4 sm:px-6",
        qualifying
          ? "qualifier-row-qualifying qualifier-row-qualifying-colored-fill qualifier-row-qualifying-subtle qualifier-row-qualifying-soft-fill qualifier-row-qualifying-gold-border"
          : "qualifier-row-more-transparent qualifier-row-standard-glass",
      )}
    >
      <div
        className={cn(
          "font-mono text-[19px] font-black leading-none tabular-nums sm:text-[20px]",
          qualifying
            ? "text-[#b9ffe7]"
            : "text-white/72",
        )}
      >
        #{trader.rank}
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black leading-none",
            qualifying
              ? "bg-gradient-to-br from-[#b9ffe7] to-[#14f195] text-[#06130d]"
              : "bg-gradient-to-br from-[#14f195] to-[#5ad7ff] text-[#06130d]",
          )}
          aria-hidden="true"
        >
          {trader.initials}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-black leading-tight text-white sm:text-[16px]">
            {trader.handle}
          </h2>
          <p className="mt-0.5 truncate text-[12px] font-medium leading-none text-white/[0.46] sm:text-[13px]">
            {trader.name}
          </p>
        </div>
      </div>

      <CompactMetric value={trader.pnlUsd} dominant positive={trader.positive} />
      <CompactMetric className="hidden sm:block" value={trader.pnlPercent} positive={trader.positive} />
      <CompactMetric className="hidden sm:block" value={trader.equity} />
      <CompactMetric className="hidden sm:block" value={trader.volume} muted />
    </article>
  );
}

function BoardTitle() {
  return (
    <div className="qualifier-board-title mx-auto mb-5 mt-4 flex max-w-[1320px] items-center justify-center px-1 sm:px-6">
      <div className="qualifier-board-title-label qualifier-board-title-glass flex shrink-0 items-center px-4 py-2.5">
        <h2 className="shrink-0 text-[16px] font-black uppercase leading-none tracking-[0.1em] text-white sm:text-[24px] sm:tracking-[0.12em]">
          Qualifier Leaderboard
        </h2>
      </div>
    </div>
  );
}

function MobileBoardHeader() {
  return (
    <div className="qualifier-mobile-board-header mx-auto mb-1 grid max-w-[1320px] grid-cols-[44px_minmax(0,1fr)_minmax(96px,auto)] gap-2 px-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#c2bfca]/82 sm:hidden">
      <span>Rank</span>
      <span>Trader</span>
      <span className="text-right">PnL</span>
    </div>
  );
}

function BoardHeader() {
  return (
    <div className="mx-auto mb-1 hidden max-w-[1320px] grid-cols-[72px_minmax(210px,1.7fr)_minmax(140px,0.8fr)_minmax(110px,0.65fr)_minmax(130px,0.7fr)_minmax(120px,0.65fr)] gap-4 px-6 text-[12px] font-black uppercase tracking-[0.16em] text-[#c2bfca]/78 sm:grid">
      <span>Rank</span>
      <span>Trader / X handle</span>
      <span>PnL USD</span>
      <span>PnL %</span>
      <span>Equity</span>
      <span>Volume</span>
    </div>
  );
}

function CompactMetric({
  value,
  dominant,
  positive,
  muted,
  className,
}: {
  value: string;
  dominant?: boolean;
  positive?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-right font-mono text-[16px] font-black leading-none tabular-nums sm:text-left sm:text-[17px]",
        dominant && "text-[17px] sm:text-[18px]",
        dominant && positive && "text-[#14f195]",
        dominant && !positive && "text-[#ff6b8a]",
        !dominant && !muted && "text-white/82",
        muted && "text-white/58",
        className,
      )}
    >
      {value}
    </p>
  );
}

function QualificationDivider() {
  return (
    <div
      data-qualification-divider="true"
      className="qualification-divider my-5 flex items-center gap-3 text-[#14f195] sm:my-6"
    >
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#14f195]/45 to-[#14f195]/20" />
      <div className="rounded-full border border-[#14f195]/45 bg-black/80 px-4 py-2 text-center text-[12px] font-black uppercase tracking-[0.16em] shadow-[0_0_26px_rgba(20,241,149,0.12)]">
        Top 4 qualify for the final
      </div>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[#14f195]/45 to-[#14f195]/20" />
    </div>
  );
}

function SummitSidePatterns() {
  return (
    <div aria-hidden="true" className="summit-side-patterns summit-hero-side-patterns">
      {SIDE_PATTERN_SEGMENTS.map((segment) => (
        <Fragment key={segment.id}>
          <span
            className={cn(
              "summit-side-pattern summit-side-pattern-muted summit-side-pattern-segment summit-side-pattern-left",
              segment.className,
            )}
          />
          <span
            className={cn(
              "summit-side-pattern summit-side-pattern-muted summit-side-pattern-segment summit-side-pattern-right",
              segment.className,
            )}
          />
        </Fragment>
      ))}
    </div>
  );
}
