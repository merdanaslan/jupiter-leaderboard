import Image from "next/image";
import { Fragment } from "react";
import { cn } from "@/lib/utils";

const QUALIFIER_TIMER = "60:00";

const QUALIFIER_TRADERS = [
  { rank: 1, handle: "@merdan", name: "Merdan", initials: "MA", pnlUsd: "+$18,420", pnlPercent: "+36.8%", equity: "$68,420", volume: "$2.84M", positive: true },
  { rank: 2, handle: "@solape", name: "Sol Ape", initials: "SA", pnlUsd: "+$16,980", pnlPercent: "+33.9%", equity: "$66,980", volume: "$2.41M", positive: true },
  { rank: 3, handle: "@juptrader", name: "Jup Trader", initials: "JT", pnlUsd: "+$15,260", pnlPercent: "+30.5%", equity: "$65,260", volume: "$2.19M", positive: true },
  { rank: 4, handle: "@berlinbull", name: "Berlin Bull", initials: "BB", pnlUsd: "+$13,880", pnlPercent: "+27.8%", equity: "$63,880", volume: "$1.96M", positive: true },
  { rank: 5, handle: "@blocksmith", name: "Blocksmith", initials: "BS", pnlUsd: "+$12,940", pnlPercent: "+25.9%", equity: "$62,940", volume: "$1.88M", positive: true },
  { rank: 6, handle: "@perpchef", name: "Perp Chef", initials: "PC", pnlUsd: "+$11,610", pnlPercent: "+23.2%", equity: "$61,610", volume: "$1.76M", positive: true },
  { rank: 7, handle: "@neonmaker", name: "Neon Maker", initials: "NM", pnlUsd: "+$10,420", pnlPercent: "+20.8%", equity: "$60,420", volume: "$1.63M", positive: true },
  { rank: 8, handle: "@satoshisurf", name: "Satoshi Surf", initials: "SS", pnlUsd: "+$9,780", pnlPercent: "+19.6%", equity: "$59,780", volume: "$1.55M", positive: true },
  { rank: 9, handle: "@liquidmax", name: "Liquid Max", initials: "LM", pnlUsd: "+$8,940", pnlPercent: "+17.9%", equity: "$58,940", volume: "$1.48M", positive: true },
  { rank: 10, handle: "@byteflow", name: "Byte Flow", initials: "BF", pnlUsd: "+$7,830", pnlPercent: "+15.7%", equity: "$57,830", volume: "$1.39M", positive: true },
  { rank: 11, handle: "@riskrunner", name: "Risk Runner", initials: "RR", pnlUsd: "+$6,920", pnlPercent: "+13.8%", equity: "$56,920", volume: "$1.34M", positive: true },
  { rank: 12, handle: "@orbitpnl", name: "Orbit PnL", initials: "OP", pnlUsd: "+$6,120", pnlPercent: "+12.2%", equity: "$56,120", volume: "$1.27M", positive: true },
  { rank: 13, handle: "@chainpilot", name: "Chain Pilot", initials: "CP", pnlUsd: "+$5,440", pnlPercent: "+10.9%", equity: "$55,440", volume: "$1.18M", positive: true },
  { rank: 14, handle: "@alphaberlin", name: "Alpha Berlin", initials: "AB", pnlUsd: "+$4,860", pnlPercent: "+9.7%", equity: "$54,860", volume: "$1.10M", positive: true },
  { rank: 15, handle: "@candlemind", name: "Candle Mind", initials: "CM", pnlUsd: "+$4,120", pnlPercent: "+8.2%", equity: "$54,120", volume: "$998K", positive: true },
  { rank: 16, handle: "@swaplogic", name: "Swap Logic", initials: "SL", pnlUsd: "+$3,580", pnlPercent: "+7.2%", equity: "$53,580", volume: "$942K", positive: true },
  { rank: 17, handle: "@turbosol", name: "Turbo SOL", initials: "TS", pnlUsd: "+$2,940", pnlPercent: "+5.9%", equity: "$52,940", volume: "$884K", positive: true },
  { rank: 18, handle: "@greenwick", name: "Green Wick", initials: "GW", pnlUsd: "+$2,160", pnlPercent: "+4.3%", equity: "$52,160", volume: "$821K", positive: true },
  { rank: 19, handle: "@deltahaus", name: "Delta Haus", initials: "DH", pnlUsd: "+$1,520", pnlPercent: "+3.0%", equity: "$51,520", volume: "$760K", positive: true },
  { rank: 20, handle: "@makerbee", name: "Maker Bee", initials: "MB", pnlUsd: "+$940", pnlPercent: "+1.9%", equity: "$50,940", volume: "$705K", positive: true },
  { rank: 21, handle: "@fundingflip", name: "Funding Flip", initials: "FF", pnlUsd: "+$420", pnlPercent: "+0.8%", equity: "$50,420", volume: "$662K", positive: true },
  { rank: 22, handle: "@marginmate", name: "Margin Mate", initials: "MM", pnlUsd: "-$1,220", pnlPercent: "-2.4%", equity: "$48,780", volume: "$608K", positive: false },
  { rank: 23, handle: "@stormtrade", name: "Storm Trade", initials: "ST", pnlUsd: "-$2,680", pnlPercent: "-5.4%", equity: "$47,320", volume: "$571K", positive: false },
  { rank: 24, handle: "@wickedsol", name: "Wicked SOL", initials: "WS", pnlUsd: "-$4,130", pnlPercent: "-8.3%", equity: "$45,870", volume: "$522K", positive: false },
  { rank: 25, handle: "@lastliquid", name: "Last Liquid", initials: "LL", pnlUsd: "-$6,040", pnlPercent: "-12.1%", equity: "$43,960", volume: "$490K", positive: false },
];

const SIDE_PATTERN_SEGMENTS = [
  { id: 1, className: "summit-side-pattern-segment-1" },
  { id: 2, className: "summit-side-pattern-segment-2 summit-side-pattern-continuation" },
  { id: 3, className: "summit-side-pattern-segment-3 summit-side-pattern-continuation" },
  { id: 4, className: "summit-side-pattern-segment-4 summit-side-pattern-continuation" },
] as const;

export function SummitQualifierPage() {
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

          <div className="order-3 col-span-2 flex min-w-0 flex-col items-center justify-center gap-2 text-center md:order-none md:col-span-1 lg:flex-row lg:gap-4">
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
            className="summit-outline-cta flex h-[82px] w-[142px] items-center justify-center rounded-full px-4 text-[32px] font-black leading-none text-white tabular-nums sm:h-[91px] sm:w-[176px] sm:text-[40px] lg:h-[104px] lg:w-[260px] lg:text-[56px]"
          >
            {QUALIFIER_TIMER}
          </div>
        </header>

        <section className="summit-container relative z-10 pt-3">
          <BoardHeader />
          <div
            role="list"
            aria-label="Qualifier leaderboard"
            className="mx-auto flex max-w-[1320px] flex-col gap-1.5"
          >
            {QUALIFIER_TRADERS.map((trader) => (
              <div key={trader.rank}>
                <QualifierRow trader={trader} />
                {trader.rank === 4 ? <QualificationDivider /> : null}
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function QualifierRow({ trader }: { trader: (typeof QUALIFIER_TRADERS)[number] }) {
  const qualifying = trader.rank <= 4;

  return (
    <article
      role="listitem"
      data-qualifying={qualifying ? "true" : "false"}
      aria-label={`Rank #${trader.rank}, ${trader.handle}`}
      className={cn(
        "qualifier-board-row grid min-h-[50px] grid-cols-[44px_minmax(0,1fr)_minmax(96px,auto)] items-center gap-2 border px-3 py-1.5 backdrop-blur-md transition-colors sm:min-h-[48px] sm:grid-cols-[72px_minmax(210px,1.7fr)_minmax(140px,0.8fr)_minmax(110px,0.65fr)_minmax(130px,0.7fr)_minmax(120px,0.65fr)] sm:gap-4 sm:px-6",
        qualifying
          ? "border-[#14f195]/45 bg-[#08291d]/70 shadow-[0_0_18px_rgba(20,241,149,0.045)]"
          : "border-white/10 bg-[#111319]/88",
      )}
    >
      <div
        className={cn(
          "font-mono text-[17px] font-black leading-none tabular-nums sm:text-[18px]",
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
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-black leading-none",
            qualifying
              ? "bg-gradient-to-br from-[#b9ffe7] to-[#14f195] text-[#06130d]"
              : "bg-gradient-to-br from-[#14f195] to-[#5ad7ff] text-[#06130d]",
          )}
          aria-hidden="true"
        >
          {trader.initials}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-black leading-tight text-white sm:text-[15px]">
            {trader.handle}
          </h2>
          <p className="mt-0.5 truncate text-[12px] font-medium leading-none text-white/[0.42]">
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
        "text-right font-mono text-[15px] font-black leading-none tabular-nums sm:text-left sm:text-[16px]",
        dominant && "text-[16px] sm:text-[17px]",
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
    <div className="my-3 flex items-center gap-3 text-[#14f195]">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#14f195]/45 to-[#14f195]/20" />
      <div className="rounded-full border border-[#14f195]/45 bg-black/80 px-4 py-2 text-[12px] font-black uppercase tracking-[0.16em] shadow-[0_0_26px_rgba(20,241,149,0.12)]">
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
              "summit-side-pattern summit-side-pattern-segment summit-side-pattern-left",
              segment.className,
            )}
          />
          <span
            className={cn(
              "summit-side-pattern summit-side-pattern-segment summit-side-pattern-right",
              segment.className,
            )}
          />
        </Fragment>
      ))}
    </div>
  );
}
