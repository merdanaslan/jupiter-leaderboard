import { Activity, Lock, Radio, Trophy } from "lucide-react";
import { formatTimer, isUrgencyState } from "@/lib/leaderboard";
import type { CompetitionMode, PublicRoundState } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DisplayShellProps {
  mode: CompetitionMode;
  state: PublicRoundState | null;
  children: React.ReactNode;
}

export function DisplayShell({ mode, state, children }: DisplayShellProps) {
  const status = state?.status ?? "connecting";
  const remainingSeconds = state?.remainingSeconds ?? (mode === "qualifier" ? 3600 : 1800);
  const urgent = isUrgencyState(remainingSeconds, status);
  const locked = status === "locked" || status === "final";

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border/70 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              <span>Solana Summit Germany</span>
              <span className="h-1 w-1 rounded-full bg-accent" />
              <span>Jupiter Perps</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="text-3xl font-black tracking-normal sm:text-4xl lg:text-5xl">
                Trading Cup
              </h1>
              <span className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1 text-sm font-bold uppercase tracking-[0.18em] text-accent">
                {mode === "qualifier" ? "Qualifier" : "Final"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={status} />
            <div
              className={cn(
                "rounded-lg border px-5 py-3 font-mono text-3xl font-black tabular-nums sm:text-4xl",
                urgent && "border-warning bg-warning/10 text-warning",
                locked && "border-muted/40 bg-panel text-muted",
                !urgent && !locked && "border-accent/50 bg-accent/10 text-accent",
              )}
            >
              {formatTimer(remainingSeconds)}
            </div>
          </div>
        </header>

        <section className="flex min-h-0 flex-1 flex-col py-5">{children}</section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: PublicRoundState["status"] | "connecting" }) {
  const iconClass = "h-4 w-4";
  if (status === "locked" || status === "final") {
    return (
      <div className="flex min-h-10 items-center gap-2 rounded-md border border-muted/40 bg-panel px-3 text-sm font-bold uppercase tracking-[0.16em] text-muted">
        <Lock className={iconClass} aria-hidden />
        Locked
      </div>
    );
  }
  if (status === "live") {
    return (
      <div className="flex min-h-10 items-center gap-2 rounded-md border border-accent/50 bg-accent/10 px-3 text-sm font-bold uppercase tracking-[0.16em] text-accent">
        <Radio className={iconClass} aria-hidden />
        Live
      </div>
    );
  }
  if (status === "interrupted" || status === "connecting") {
    return (
      <div className="flex min-h-10 items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 text-sm font-bold uppercase tracking-[0.16em] text-warning">
        <Activity className={iconClass} aria-hidden />
        Reconnecting
      </div>
    );
  }
  return (
    <div className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-panel px-3 text-sm font-bold uppercase tracking-[0.16em] text-muted">
      <Trophy className={iconClass} aria-hidden />
      Waiting
    </div>
  );
}
