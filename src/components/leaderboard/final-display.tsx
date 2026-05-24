"use client";

import { AlertTriangle, Medal, Trophy } from "lucide-react";
import { DisplayShell } from "./display-shell";
import { formatPercent, formatUsd, formatVolume } from "./format";
import { useLeaderboard } from "./useLeaderboard";
import { cn } from "@/lib/utils";
import type { PublicTraderScore } from "@/lib/types";

export function FinalDisplay() {
  const { data, isLoading, error } = useLeaderboard("final");
  const traders = data?.traders ?? [];
  const winner = data?.state.status === "locked" || data?.state.status === "final";

  return (
    <DisplayShell mode="final" state={data?.state ?? null}>
      {isLoading ? <FinalSkeleton /> : null}
      {error ? <FinalError message={error} /> : null}
      {!isLoading && !error ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pb-4 lg:grid-cols-2">
          {traders.map((trader) => (
            <FinalistCard key={trader.id} trader={trader} locked={winner} />
          ))}
        </div>
      ) : null}
    </DisplayShell>
  );
}

function FinalistCard({ trader, locked }: { trader: PublicTraderScore; locked: boolean }) {
  const leader = trader.rank === 1;
  const positive = trader.pnlUsd >= 0;

  return (
    <article
      className={cn(
        "relative flex min-h-[260px] flex-col justify-between rounded-lg border bg-panel p-4",
        leader && "border-accent/80 bg-accent/10 shadow-glow",
        trader.rank === 2 && "border-warning/55",
        trader.rank > 2 && "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-muted">
            {leader ? <Trophy className="h-5 w-5 text-accent" aria-hidden /> : <Medal className="h-5 w-5" aria-hidden />}
            Rank {trader.rank}
          </div>
          <h2 className="mt-2 truncate text-3xl font-black tracking-normal sm:text-4xl">
            {trader.xHandle}
          </h2>
        </div>
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-sm font-black uppercase tracking-[0.16em]",
            leader && "border-accent bg-accent text-background",
            !leader && "border-border text-muted",
          )}
        >
          {leader ? (locked ? "Winner" : "Leader") : `#${trader.rank}`}
        </div>
      </div>

      <div className="mt-4">
        <p
          className={cn(
            "font-mono text-5xl font-black tabular-nums tracking-normal xl:text-6xl",
            positive ? "text-accent" : "text-danger",
          )}
        >
          {formatUsd(trader.pnlUsd, { signed: true })}
        </p>
        <p className="mt-2 font-mono text-xl font-black text-muted">
          {formatPercent(trader.pnlPercent)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <MiniMetric label="Equity" value={formatUsd(trader.equity)} />
        <MiniMetric label="Volume" value={formatVolume(trader.volume)} />
        <MiniMetric
          label="Gap"
          value={leader ? "Leader" : formatUsd(trader.gapToLeader)}
          accent={!leader}
        />
      </div>
    </article>
  );
}

function MiniMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-border/80 bg-background/55 p-2.5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={cn("mt-1 truncate font-mono text-sm font-black tabular-nums sm:text-base", accent && "text-warning")}>
        {value}
      </p>
    </div>
  );
}

function FinalSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="min-h-[220px] animate-pulse rounded-lg border border-border bg-panel" />
      ))}
    </div>
  );
}

function FinalError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger">
      <AlertTriangle className="h-5 w-5" aria-hidden />
      <p className="font-semibold">{message}</p>
    </div>
  );
}
