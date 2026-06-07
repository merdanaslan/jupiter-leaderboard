import Image from "next/image";
import { Fragment } from "react";
import { cn } from "@/lib/utils";

const FINAL_TIMER = "30:00";

const FINALISTS = [
  {
    rank: 1,
    placement: "1st",
    accent: "gold",
    handle: "@merdan",
    name: "Merdan",
    initials: "MA",
    pnlUsd: "+$435.00",
    pnlPercent: "+43.5%",
    equity: "$1,435.00",
    volume: "$63.6K",
    positive: true,
    recent: {
      action: "CLOSE",
      side: "LONG",
      market: "SOL",
      pnl: "+$42.00",
      detail: "18.2 @ $162.40",
      positive: true,
    },
  },
  {
    rank: 2,
    placement: "2nd",
    accent: "silver",
    handle: "@solape",
    name: "Sol Ape",
    initials: "SA",
    pnlUsd: "+$428.00",
    pnlPercent: "+42.8%",
    equity: "$1,428.00",
    volume: "$59.2K",
    positive: true,
    recent: {
      action: "OPEN",
      side: "LONG",
      market: "BTC",
      pnl: "+$11.80",
      detail: "0.018 @ $68,240",
      positive: true,
    },
  },
  {
    rank: 3,
    placement: "3rd",
    accent: "bronze",
    handle: "@juptrader",
    name: "Jup Trader",
    initials: "JT",
    pnlUsd: "+$414.00",
    pnlPercent: "+41.4%",
    equity: "$1,414.00",
    volume: "$54.8K",
    positive: true,
    recent: {
      action: "CLOSE",
      side: "SHORT",
      market: "ETH",
      pnl: "-$9.50",
      detail: "0.46 @ $3,120",
      positive: false,
    },
  },
  {
    rank: 4,
    placement: "4th",
    accent: "mint",
    handle: "@berlinbull",
    name: "Berlin Bull",
    initials: "BB",
    pnlUsd: "+$387.00",
    pnlPercent: "+38.7%",
    equity: "$1,387.00",
    volume: "$50.6K",
    positive: true,
    recent: {
      action: "FILL",
      side: "LONG",
      market: "SOL",
      pnl: "+$7.20",
      detail: "4.6 @ $162.40",
      positive: true,
    },
  },
] as const;

const SIDE_PATTERN_SEGMENTS = [
  { id: 1, className: "summit-side-pattern-segment-1" },
  { id: 2, className: "summit-side-pattern-segment-2 summit-side-pattern-continuation" },
  { id: 3, className: "summit-side-pattern-segment-3 summit-side-pattern-continuation" },
  { id: 4, className: "summit-side-pattern-segment-4 summit-side-pattern-continuation" },
] as const;

const FINAL_ROW_CLASSES = {
  gold: "final-row-gold",
  silver: "final-row-silver",
  bronze: "final-row-bronze",
  mint: "final-row-mint",
} as const;

type Finalist = (typeof FINALISTS)[number];
type RecentTrade = Finalist["recent"];

export function SummitFinalPage() {
  return (
    <main className="summit-theme min-h-screen bg-black text-white">
      <section className="summit-qualifier-stage summit-final-stage relative min-h-[100svh] overflow-x-hidden bg-black">
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

          <div className="final-event-lockup order-3 col-span-2 mx-auto flex w-full max-w-[340px] min-w-0 flex-col items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-black/35 px-4 py-3 text-center shadow-[0_0_28px_rgba(20,241,149,0.06)] backdrop-blur-md md:order-none md:col-span-1 md:w-auto md:max-w-none md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0 lg:flex-row lg:gap-4">
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
            aria-label="Final timer"
            className="summit-outline-cta flex h-[82px] w-[142px] flex-col items-center justify-center gap-1 rounded-full px-4 text-white sm:h-[91px] sm:w-[176px] lg:h-[104px] lg:w-[260px]"
          >
            <span className="whitespace-nowrap text-[7px] font-black uppercase leading-none tracking-[0.1em] text-[#14f195] sm:text-[9px] sm:tracking-[0.12em] lg:text-[11px]">
              Final time left
            </span>
            <span className="font-black leading-none tabular-nums text-[30px] sm:text-[38px] lg:text-[52px]">
              {FINAL_TIMER}
            </span>
          </div>
        </header>

        <section className="summit-container final-board-section relative z-10 flex min-h-[calc(100svh-208px)] flex-col justify-center pb-6 pt-6 sm:pb-8 sm:pt-8 md:min-h-[calc(100svh-144px)] lg:pb-12">
          <FinalBoardTitle />
          <MobileFinalBoardHeader />
          <FinalBoardHeader />
          <div
            role="list"
            aria-label="Final leaderboard"
            className="final-leaderboard-rows mx-auto flex w-full max-w-[1320px] flex-col gap-3 sm:gap-4 lg:gap-6 xl:gap-7"
          >
            {FINALISTS.map((finalist) => (
              <FinalRow key={finalist.placement} finalist={finalist} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function FinalBoardTitle() {
  return (
    <div className="final-board-title mx-auto mb-5 mt-1 flex w-full max-w-[1320px] -translate-y-2 items-center justify-center gap-4 px-1 sm:mb-6 sm:-translate-y-3 sm:gap-5 sm:px-6 lg:mb-7">
      <span className="final-board-title-line final-board-title-line-left" aria-hidden="true" />
      <div className="final-board-title-label flex shrink-0 items-center">
        <span className="final-title-flame mr-3 text-[15px] leading-none sm:text-[18px]" aria-hidden="true">
          🔥
        </span>
        <h2 className="shrink-0 text-[17px] font-black uppercase leading-none tracking-[0.1em] text-white sm:text-[25px] sm:tracking-[0.12em]">
          Final Showdown
        </h2>
        <span className="final-title-flame ml-3 text-[15px] leading-none sm:text-[18px]" aria-hidden="true">
          🔥
        </span>
      </div>
      <span className="final-board-title-line final-board-title-line-right" aria-hidden="true" />
    </div>
  );
}

function MobileFinalBoardHeader() {
  return (
    <div className="final-board-mobile-header mx-auto mb-1 grid max-w-[1320px] grid-cols-[54px_minmax(0,1fr)_minmax(112px,auto)] gap-2 px-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#c2bfca]/82 sm:hidden">
      <span>Rank</span>
      <span>Trader</span>
      <span className="text-right">PnL</span>
      <span className="sr-only">Recent</span>
    </div>
  );
}

function FinalBoardHeader() {
  return (
    <div className="mx-auto mb-1 hidden max-w-[1320px] grid-cols-[86px_minmax(220px,1.35fr)_minmax(140px,0.75fr)_minmax(110px,0.55fr)_minmax(130px,0.65fr)_minmax(120px,0.6fr)_minmax(280px,1fr)] gap-4 px-6 text-[12px] font-black uppercase tracking-[0.16em] text-[#f1edf7]/82 sm:grid">
      <span>Rank</span>
      <span>Trader / X handle</span>
      <span>PnL USD</span>
      <span>PnL %</span>
      <span>Equity</span>
      <span>Volume</span>
      <span>Recent activity</span>
    </div>
  );
}

function FinalRow({ finalist }: { finalist: Finalist }) {
  return (
    <article
      role="listitem"
      data-placement={finalist.placement}
      data-accent={finalist.accent}
      data-leader={finalist.rank === 1 ? "true" : "false"}
      aria-label={`${finalist.placement} place, ${finalist.handle}`}
      className={cn(
        "final-board-row qualifier-board-row qualifier-row-glass grid min-h-[84px] grid-cols-[54px_minmax(0,1fr)_minmax(112px,auto)] items-center gap-x-2 gap-y-1.5 border px-3 py-2.5 transition-colors sm:min-h-[86px] sm:grid-cols-[86px_minmax(220px,1.35fr)_minmax(140px,0.75fr)_minmax(110px,0.55fr)_minmax(130px,0.65fr)_minmax(120px,0.6fr)_minmax(280px,1fr)] sm:gap-x-4 sm:px-6 lg:min-h-[92px]",
        FINAL_ROW_CLASSES[finalist.accent],
      )}
    >
      <div className="final-row-rank font-mono text-[30px] font-black leading-none tabular-nums sm:text-[34px] lg:text-[40px]">
        #{finalist.rank}
      </div>

      <div className="finalist-trader-lockup flex min-w-0 items-center gap-2.5 sm:gap-3">
        <div
          className="finalist-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-black leading-none sm:h-10 sm:w-10 sm:text-[12px]"
          aria-hidden="true"
        >
          {finalist.initials}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-[18px] font-black leading-tight text-white sm:text-[19px]">
            {finalist.handle}
          </h3>
          <p className="mt-0.5 truncate text-[13px] font-medium leading-none text-white/[0.48] sm:text-[14px]">
            {finalist.name}
          </p>
        </div>
      </div>

      <CompactMetric
        className="final-row-main-pnl"
        value={finalist.pnlUsd}
        dominant
        positive={finalist.positive}
      />
      <CompactMetric className="hidden sm:block" value={finalist.pnlPercent} positive={finalist.positive} />
      <CompactMetric className="hidden sm:block" value={finalist.equity} />
      <CompactMetric className="hidden sm:block" value={finalist.volume} muted />
      <RecentActivity recent={finalist.recent} />
    </article>
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
        "text-right font-mono text-[17px] font-black leading-none tabular-nums sm:text-left sm:text-[18px]",
        dominant && "text-[20px] sm:text-[22px] lg:text-[24px]",
        dominant && positive && "text-[#14f195]",
        dominant && !positive && "text-[#ff6b8a]",
        !dominant && !muted && "text-white/84",
        muted && "text-white/64",
        className,
      )}
    >
      {value}
    </p>
  );
}

function RecentActivity({ recent }: { recent: RecentTrade }) {
  return (
    <div className="final-row-recent-activity col-span-3 min-w-0 border-t border-white/[0.08] pt-2 sm:col-auto sm:border-t-0 sm:pt-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="final-activity-action rounded px-2 py-1 text-[10px] font-black uppercase leading-none tracking-[0.08em]">
            {recent.action}
          </span>
          <span
            className={cn(
              "final-activity-side rounded border px-2 py-1 text-[10px] font-black uppercase leading-none tracking-[0.08em]",
              recent.side === "LONG" ? "final-activity-long" : "final-activity-short",
            )}
          >
            {recent.side}
          </span>
        </div>
        <span className="font-mono text-[14px] font-black leading-none text-white/86">
          {recent.market}
        </span>
        <div className="final-row-recent-detail ml-auto min-w-0 text-right">
          <p
            className={cn(
              "font-mono text-[14px] font-black leading-none tabular-nums",
              recent.positive ? "text-[#14f195]" : "text-[#ff6b8a]",
            )}
          >
            {recent.pnl}
          </p>
          <p className="mt-1 whitespace-nowrap font-mono text-[11px] font-semibold leading-none text-white/42">
            {recent.detail}
          </p>
        </div>
      </div>
    </div>
  );
}

function SummitSidePatterns() {
  return (
    <div aria-hidden="true" className="summit-side-patterns summit-final-side-patterns summit-hero-side-patterns">
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
