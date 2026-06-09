"use client";

import { Lock, Play, RefreshCcw, Trash2, Trophy, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CompetitionMode, LeaderboardDataSourceId, MockScenario, RoundState } from "@/lib/types";
import { formatTimer } from "@/lib/leaderboard";
import { cn } from "@/lib/utils";

const scenarios: { value: MockScenario; label: string }[] = [
  { value: "steady", label: "Steady leader" },
  { value: "close-race", label: "Close race" },
  { value: "top-4-battle", label: "Top 4 battle" },
  { value: "negative-market", label: "Negative market" },
  { value: "last-minute-upset", label: "Last-minute upset" },
  { value: "interruption", label: "Data interruption" },
  { value: "locked", label: "Trading closed" },
];

function sameOriginPath(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.protocol}//${window.location.host}${path}`;
}

export function OperatorConsole() {
  const [state, setState] = useState<RoundState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedFinalists, setSelectedFinalists] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(sameOriginPath("/api/operator/state"), {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) throw new Error("Unable to load operator state");
        const next = (await response.json()) as RoundState;
        if (!active) return;
        setState(next);
        setSelectedFinalists(next.selectedFinalistIds);
        setError(null);
      } catch (error) {
        if (!active) return;
        setError(error instanceof Error ? error.message : "Unable to load operator state");
      }
    }

    void load();
    const interval = setInterval(load, 2500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const qualifierTraders = useMemo(
    () => {
      if (!state) return [];
      if (state.dataSource === "mock") {
        return [...state.mockTraders]
          .filter((trader) => trader.mode === "qualifier")
          .sort((a, b) => a.rank - b.rank)
          .map((trader) => ({
            id: trader.id,
            label: `#${trader.rank} ${trader.xHandle}`,
            sublabel: trader.displayName,
          }));
      }

      const liveRanks = new Map(
        (state.liveStandings.qualifier ?? []).map((trader) => [trader.id, trader.rank]),
      );
      return state.traderConfigs
        .filter((trader) => trader.mode === "qualifier" && trader.status === "active")
        .sort((a, b) => (liveRanks.get(a.id) ?? 999) - (liveRanks.get(b.id) ?? 999) || a.xHandle.localeCompare(b.xHandle))
        .map((trader) => ({
          id: trader.id,
          label: `${liveRanks.has(trader.id) ? `#${liveRanks.get(trader.id)} ` : ""}${trader.xHandle}`,
          sublabel: trader.displayName,
        }));
    },
    [state],
  );

  async function sendAction(action: unknown) {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(sameOriginPath("/api/operator/action"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Operator action failed");
      const next = (await response.json()) as RoundState;
      setState(next);
      setSelectedFinalists(next.selectedFinalistIds);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Operator action failed");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleFinalist(id: string) {
    setSelectedFinalists((current) => {
      if (current.includes(id)) return current.filter((finalistId) => finalistId !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  }

  async function importFile(file: File | null) {
    if (!file) return;
    setImportText(await file.text());
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-muted">
              Protected operator controls
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-normal">Trading Cup Control</h1>
          </div>
          <div className="rounded-lg border border-border bg-panel px-4 py-3 font-mono text-3xl font-black tabular-nums text-accent">
            {formatTimer(state?.remainingSeconds ?? 0)}
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm font-semibold text-danger">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <Panel title="Round">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Mode">
                  <select
                    className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    value={state?.activeMode ?? "qualifier"}
                    onChange={(event) =>
                      void sendAction({
                        type: "setMode",
                        mode: event.target.value as CompetitionMode,
                      })
                    }
                    disabled={isSaving}
                  >
                    <option value="qualifier">Qualifier</option>
                    <option value="final">Final</option>
                  </select>
                </Field>

                <Field label="Data source">
                  <select
                    className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    value={state?.dataSource ?? "mock"}
                    onChange={(event) =>
                      void sendAction({
                        type: "setDataSource",
                        dataSource: event.target.value as LeaderboardDataSourceId,
                      })
                    }
                    disabled={isSaving}
                  >
                    <option value="mock">Mock data</option>
                    <option value="jupiter-sdk">Jupiter SDK</option>
                  </select>
                </Field>

                <Field label="Scenario">
                  <select
                    className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    value={state?.scenario ?? "steady"}
                    onChange={(event) =>
                      void sendAction({
                        type: "setScenario",
                        scenario: event.target.value as MockScenario,
                      })
                    }
                    disabled={isSaving}
                  >
                    {scenarios.map((scenario) => (
                      <option key={scenario.value} value={scenario.value}>
                        {scenario.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <ActionButton
                  icon={<Play className="h-4 w-4" aria-hidden />}
                  label="Start"
                  onClick={() => void sendAction({ type: "start" })}
                  disabled={isSaving}
                />
                <ActionButton
                  icon={<Lock className="h-4 w-4" aria-hidden />}
                  label="Lock"
                  onClick={() => void sendAction({ type: "lock" })}
                  disabled={isSaving}
                />
                <ActionButton
                  icon={<RefreshCcw className="h-4 w-4" aria-hidden />}
                  label="Reset"
                  onClick={() => void sendAction({ type: "reset" })}
                  disabled={isSaving}
                />
              </div>
            </Panel>

            <Panel title="Status">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <StatusItem label="State" value={state?.status ?? "loading"} />
                <StatusItem label="Source" value={state?.dataSource ?? "mock"} />
                <StatusItem label="Started" value={state?.startedAt ? "yes" : "no"} />
                <StatusItem label="Finalists" value={String(state?.selectedFinalistIds.length ?? 0)} />
                <StatusItem label="Configs" value={String(state?.traderConfigs.length ?? 0)} />
                <StatusItem
                  label="Live data"
                  value={state ? state.liveDataStatus[state.activeMode] : "idle"}
                />
              </dl>
              {state?.sdkRuntime.lastError ? (
                <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-xs font-semibold text-danger">
                  {state.sdkRuntime.lastError}
                </p>
              ) : null}
            </Panel>

            <Panel title="Trader Config">
              <p className="mb-3 text-sm text-muted">
                Paste CSV or JSON with id, xHandle, displayName, walletAddress, status, mode,
                startingBalance, startingEquity, and optional avatarUrl.
              </p>
              <textarea
                className="min-h-40 w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="id,xHandle,displayName,walletAddress,status,mode,startingBalance,startingEquity,avatarUrl"
              />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-black uppercase tracking-[0.14em] text-foreground transition-colors hover:bg-muted/10">
                  <Upload className="h-4 w-4" aria-hidden />
                  Load File
                  <input
                    className="sr-only"
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    onChange={(event) => void importFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <ActionButton
                  label="Import Config"
                  onClick={() =>
                    void sendAction({
                      type: "importTraderConfig",
                      contents: importText,
                    })
                  }
                  disabled={isSaving || importText.trim().length === 0}
                />
                <ActionButton
                  icon={<Trash2 className="h-4 w-4" aria-hidden />}
                  label="Clear Config"
                  onClick={() => {
                    setImportText("");
                    void sendAction({ type: "clearTraderConfig" });
                  }}
                  disabled={isSaving || (state?.traderConfigs.length ?? 0) === 0}
                />
              </div>
            </Panel>
          </div>

          <Panel title="Finalist Selection">
            <p className="mb-4 text-sm text-muted">
              Select one to four qualifier traders for the final. Public pages only show X handles.
            </p>
            <div className="grid max-h-[520px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {qualifierTraders.map((trader) => {
                const selected = selectedFinalists.includes(trader.id);
                return (
                  <button
                    key={trader.id}
                    type="button"
                    onClick={() => toggleFinalist(trader.id)}
                    className={cn(
                      "flex min-h-12 items-center justify-between gap-3 rounded-md border px-3 text-left text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      selected
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-background text-foreground",
                    )}
                  >
                    <span className="truncate">
                      {trader.label}
                    </span>
                    {selected ? <Trophy className="h-4 w-4 flex-none" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-4">
              <ActionButton
                label="Save Finalists"
                onClick={() =>
                  void sendAction({
                    type: "selectFinalists",
                    finalistIds: selectedFinalists,
                  })
                }
                disabled={
                  isSaving ||
                  selectedFinalists.length === 0 ||
                  selectedFinalists.length > 4
                }
              />
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      <h2 className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{label}</span>
      {children}
    </label>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-accent/50 bg-accent/10 px-4 text-sm font-black uppercase tracking-[0.14em] text-accent transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:border-border disabled:bg-background disabled:text-muted"
    >
      {icon}
      {label}
    </button>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-sm font-black text-foreground">{value}</dd>
    </div>
  );
}
