"use client";

import Image from "next/image";
import { Fragment } from "react";
import type { CompetitionMode, PublicLeaderboardPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLeaderboard } from "./useLeaderboard";
import { useSmoothLeaderboardTimer } from "./useSmoothLeaderboardTimer";

const TIMER_CONFIG = {
  qualifier: {
    label: "Qualifier",
    leaderboardPath: "/qualifier",
    publicUrl: "tradingcup.live/qualifier",
  },
  final: {
    label: "Final",
    leaderboardPath: "/final",
    publicUrl: "tradingcup.live/final",
  },
} as const satisfies Record<
  CompetitionMode,
  {
    label: string;
    leaderboardPath: string;
    publicUrl: string;
  }
>;

const SIDE_PATTERN_SEGMENTS = [
  { id: 1, className: "summit-side-pattern-segment-1" },
  { id: 2, className: "summit-side-pattern-segment-2 summit-side-pattern-continuation" },
  { id: 3, className: "summit-side-pattern-segment-3 summit-side-pattern-continuation" },
  { id: 4, className: "summit-side-pattern-segment-4 summit-side-pattern-continuation" },
] as const;

export function SummitTimerPage({ mode }: { mode: CompetitionMode }) {
  const config = TIMER_CONFIG[mode];
  const leaderboard = useLeaderboard(mode, 2_000);
  const payload = leaderboard.data;
  const timer = useSmoothLeaderboardTimer(payload, "--:--");
  const statusLabel = getStatusLabel(payload, leaderboard.isLoading, leaderboard.error, timer);

  return (
    <main className="summit-theme min-h-screen bg-black text-white">
      <section
        className={cn(
          "summit-qualifier-stage relative min-h-[100svh] overflow-hidden bg-black",
          mode === "final" && "summit-final-stage",
        )}
      >
        <SummitSidePatterns finalMode={mode === "final"} />

        <header className="summit-container relative z-20 flex flex-wrap items-center justify-between gap-4 py-5">
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

          <div className="timer-event-lockup flex min-w-0 flex-1 items-center justify-end gap-4 text-right">
            <h1 className="shrink-0 text-[14px] font-bold uppercase leading-none text-white/86 sm:text-[15px] lg:text-[16px]">
              Trading Cup
            </h1>
            <div className="hidden h-8 w-px bg-white/[0.14] sm:block" aria-hidden="true" />
            <div className="flex items-center justify-end gap-2">
              <span className="hidden text-[11px] font-bold uppercase leading-none text-white/[0.62] sm:inline lg:text-[12px]">
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
        </header>

        <section className="summit-container relative z-10 flex min-h-[calc(100svh-132px)] flex-col items-center justify-center pb-10 pt-4 text-center sm:min-h-[calc(100svh-148px)] lg:min-h-[calc(100svh-164px)]">
          <div
            role="timer"
            aria-label={`${config.label} timer`}
            aria-live="polite"
            className={cn(
              "summit-outline-cta timer-display-clock flex h-[150px] w-[min(88vw,720px)] flex-col items-center justify-center gap-3 rounded-full px-8 text-white sm:h-[clamp(210px,31vw,340px)] sm:w-[min(88vw,900px)] sm:gap-5 lg:h-[clamp(250px,31vw,360px)] lg:w-[min(78vw,980px)]",
              timer === "00:00" && "shadow-[0_0_46px_rgba(20,241,149,0.2)]",
            )}
          >
            <span className="whitespace-nowrap text-[12px] font-black uppercase leading-none tracking-[0.1em] text-[#14f195] sm:text-[18px] sm:tracking-[0.12em] lg:text-[24px]">
              {config.label} time left
            </span>
            <span className="font-black leading-none tabular-nums text-[64px] sm:text-[132px] lg:text-[184px] xl:text-[208px]">
              {timer}
            </span>
          </div>

          <p
            className={cn(
              "mt-5 min-h-5 text-[13px] font-bold uppercase leading-none text-white/62 sm:text-[15px] lg:text-[17px]",
              timer === "00:00" && "text-[#14f195]",
              leaderboard.error && !payload && "text-[#ff6b8a]",
            )}
          >
            {statusLabel}
          </p>

          {leaderboard.error && !payload ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 min-h-10 rounded-full border border-[#14f195]/45 px-5 py-2 text-[12px] font-black uppercase text-[#14f195] transition-colors hover:bg-[#14f195]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14f195] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Reload timer
            </button>
          ) : null}

          <a
            href={config.leaderboardPath}
            aria-label={`Open ${config.label.toLowerCase()} leaderboard`}
            className="mt-8 min-h-10 rounded-full border border-white/[0.08] bg-black/30 px-5 py-2.5 text-[13px] font-black leading-none text-white/72 shadow-[0_0_22px_rgba(153,69,255,0.08)] transition-colors hover:border-[#14f195]/45 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14f195] focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:text-[15px] lg:text-[17px]"
          >
            {config.publicUrl}
          </a>
        </section>
      </section>
    </main>
  );
}

function getStatusLabel(
  payload: PublicLeaderboardPayload | null,
  isLoading: boolean,
  error: string | null,
  timer: string,
): string {
  if (timer === "00:00") return "Standings locked";
  if (error && !payload) return "Connection lost";
  if (error) return "Reconnecting";
  if (isLoading && !payload) return "Loading round clock";

  switch (payload?.state.status) {
    case "live":
      return "Round live";
    case "connecting":
      return "Connecting";
    case "interrupted":
      return "Interrupted";
    case "locked":
    case "final":
      return "Standings locked";
    case "waiting":
    default:
      return "Waiting for start";
  }
}

function SummitSidePatterns({ finalMode }: { finalMode: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "summit-side-patterns summit-hero-side-patterns",
        finalMode && "summit-final-side-patterns",
      )}
    >
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
