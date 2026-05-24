"use client";

import { AlertCircle, ChevronDown, Crown } from "lucide-react";
import { DisplayShell } from "./display-shell";
import { formatPercent, formatUsd, formatVolume } from "./format";
import { useLeaderboard } from "./useLeaderboard";
import { cn } from "@/lib/utils";
import type { PublicTraderScore } from "@/lib/types";

export function QualifierDisplay() {
  const { data, isLoading, error } = useLeaderboard("qualifier");
  const traders = data?.traders ?? [];

  return (
    <DisplayShell mode="qualifier" state={data?.state ?? null}>
      {isLoading ? <QualifierSkeleton /> : null}
      {error ? <DisplayError message={error} /> : null}
      {!isLoading && !error ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="grid grid-cols-[64px_minmax(0,1.4fr)_minmax(130px,0.9fr)_minmax(110px,0.7fr)_minmax(110px,0.7fr)] gap-3 px-4 text-xs font-bold uppercase tracking-[0.18em] text-muted max-md:hidden">
            <span>Rank</span>
            <span>Trader</span>
            <span>PnL</span>
            <span>Equity</span>
            <span>Volume</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="space-y-3 pb-4">
              {traders.map((trader, index) => (
                <div key={trader.id}>
                  <QualifierRow trader={trader} />
                  {index === 3 ? <TopFourDivider /> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </DisplayShell>
  );
}

function QualifierRow({ trader }: { trader: PublicTraderScore }) {
  const leader = trader.rank === 1;
  const topFour = trader.rank <= 4;
  const positive = trader.pnlUsd >= 0;

  return (
    <article
      className={cn(
        "grid min-h-[78px] grid-cols-[52px_minmax(0,1fr)] items-center gap-3 rounded-lg border bg-panel/82 p-3 transition-colors md:grid-cols-[64px_minmax(0,1.4fr)_minmax(130px,0.9fr)_minmax(110px,0.7fr)_minmax(110px,0.7fr)] md:px-4",
        leader && "border-accent/70 bg-accent/10 shadow-glow",
        topFour && !leader && "border-accent/35 bg-accent/5",
        !topFour && "border-border/80",
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-md border font-mono text-xl font-black",
          leader && "border-accent bg-accent text-background",
          topFour && !leader && "border-accent/60 text-accent",
          !topFour && "border-border text-muted",
        )}
      >
        {trader.rank}
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {leader ? <Crown className="h-5 w-5 flex-none text-accent" aria-hidden /> : null}
          <h2 className="truncate text-xl font-black tracking-normal md:text-2xl">
            {trader.xHandle}
          </h2>
        </div>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          {topFour ? "Currently Top 4" : "Chasing"}
        </p>
      </div>

      <MetricBlock
        label="PnL"
        value={formatUsd(trader.pnlUsd, { signed: true })}
        detail={formatPercent(trader.pnlPercent)}
        emphasis
        positive={positive}
      />
      <MetricBlock label="Equity" value={formatUsd(trader.equity)} />
      <MetricBlock label="Volume" value={formatVolume(trader.volume)} />
    </article>
  );
}

function TopFourDivider() {
  return (
    <div className="my-3 flex items-center gap-3 text-accent">
      <div className="h-px flex-1 bg-accent/45" />
      <div className="flex items-center gap-2 rounded-md border border-accent/50 bg-accent/10 px-3 py-2 text-xs font-black uppercase tracking-[0.2em]">
        <ChevronDown className="h-4 w-4" aria-hidden />
        Top 4 Zone
      </div>
      <div className="h-px flex-1 bg-accent/45" />
    </div>
  );
}

function MetricBlock({
  label,
  value,
  detail,
  emphasis,
  positive,
}: {
  label: string;
  value: string;
  detail?: string;
  emphasis?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="col-span-2 grid grid-cols-2 items-baseline gap-2 md:col-span-1 md:block">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted md:hidden">{label}</p>
      <div className="text-right md:text-left">
        <p
          className={cn(
            "font-mono font-black tabular-nums",
            emphasis ? "text-2xl md:text-3xl" : "text-lg md:text-xl",
            emphasis && positive && "text-accent",
            emphasis && !positive && "text-danger",
          )}
        >
          {value}
        </p>
        {detail ? <p className="font-mono text-sm font-bold text-muted">{detail}</p> : null}
      </div>
    </div>
  );
}

function QualifierSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="h-[78px] animate-pulse rounded-lg border border-border bg-panel" />
      ))}
    </div>
  );
}

function DisplayError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger">
      <AlertCircle className="h-5 w-5" aria-hidden />
      <p className="font-semibold">{message}</p>
    </div>
  );
}
