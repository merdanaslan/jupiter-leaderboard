import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createInitialRoundState } from "./data-sources/mock";
import type { RecentActivity, RoundState } from "./types";

export interface RoundStateStore {
  get(): Promise<RoundState>;
  set(state: RoundState): Promise<void>;
  update(updater: (state: RoundState) => RoundState | Promise<RoundState>): Promise<RoundState>;
}

export class LocalJsonRoundStateStore implements RoundStateStore {
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath = join(process.cwd(), "storage", "leaderboard-state.json")) {}

  async get(): Promise<RoundState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return normalizeRoundState(JSON.parse(raw));
    } catch (error) {
      if (isMissingFileError(error)) {
        return createInitialRoundState();
      }
      throw error;
    }
  }

  async set(state: RoundState): Promise<void> {
    const normalized = normalizeRoundState(state);
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.filePath);
  }

  async update(updater: (state: RoundState) => RoundState | Promise<RoundState>): Promise<RoundState> {
    let result: RoundState | undefined;

    const run = this.updateQueue.then(async () => {
      const current = await this.get();
      const next = normalizeRoundState(await updater(current));
      await this.set(next);
      result = next;
    });

    this.updateQueue = run.catch(() => undefined);
    await run;

    return result as RoundState;
  }
}

export class SupabaseRoundStateStore implements RoundStateStore {
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: {
      anonOrServiceKey: string;
      rowId?: string;
      tableName?: string;
      url: string;
    },
  ) {}

  async get(): Promise<RoundState> {
    const response = await fetch(
      `${this.restUrl()}?id=eq.${encodeURIComponent(this.rowId())}&select=state&limit=1`,
      {
        headers: this.headers(),
      },
    );

    if (!response.ok) {
      throw new Error(`Supabase state read failed: ${response.status} ${await response.text()}`);
    }

    const rows = (await response.json()) as Array<{ state: unknown }>;
    return rows[0]?.state ? normalizeRoundState(rows[0].state) : createInitialRoundState();
  }

  async set(state: RoundState): Promise<void> {
    const response = await fetch(`${this.restUrl()}?on_conflict=id`, {
      body: JSON.stringify({
        id: this.rowId(),
        state: normalizeRoundState(state),
        updated_at: new Date().toISOString(),
      }),
      headers: {
        ...this.headers(),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Supabase state write failed: ${response.status} ${await response.text()}`);
    }
  }

  async update(updater: (state: RoundState) => RoundState | Promise<RoundState>): Promise<RoundState> {
    let result: RoundState | undefined;

    const run = this.updateQueue.then(async () => {
      const current = await this.get();
      const next = normalizeRoundState(await updater(current));
      await this.set(next);
      result = next;
    });

    this.updateQueue = run.catch(() => undefined);
    await run;

    return result as RoundState;
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.config.anonOrServiceKey,
      Authorization: `Bearer ${this.config.anonOrServiceKey}`,
      "Content-Type": "application/json",
    };
  }

  private restUrl(): string {
    return `${this.config.url.replace(/\/$/, "")}/rest/v1/${this.tableName()}`;
  }

  private rowId(): string {
    return this.config.rowId ?? "default";
  }

  private tableName(): string {
    return this.config.tableName ?? "leaderboard_state";
  }
}

let stateStore: RoundStateStore | null = null;

export function getRoundStateStore(): RoundStateStore {
  if (!stateStore) {
    stateStore = createConfiguredRoundStateStore();
  }

  return stateStore;
}

export function setRoundStateStoreForTests(store: RoundStateStore | null): void {
  stateStore = store;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function createConfiguredRoundStateStore(): RoundStateStore {
  const storeKind = process.env.LEADERBOARD_STATE_STORE;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (storeKind !== "local" && supabaseUrl && supabaseKey) {
    return new SupabaseRoundStateStore({
      anonOrServiceKey: supabaseKey,
      rowId: process.env.LEADERBOARD_STATE_ID,
      tableName: process.env.LEADERBOARD_STATE_TABLE,
      url: supabaseUrl,
    });
  }

  return new LocalJsonRoundStateStore(process.env.LEADERBOARD_STATE_FILE);
}

export function normalizeRoundState(input: unknown): RoundState {
  const initial = createInitialRoundState();
  const state = isRecord(input) ? input : {};
  const lockedStandings = isRecord(state.lockedStandings) ? state.lockedStandings : {};
  const liveStandings = isRecord(state.liveStandings) ? state.liveStandings : {};
  const liveDataUpdatedAt = isRecord(state.liveDataUpdatedAt) ? state.liveDataUpdatedAt : {};
  const liveDataStatus = isRecord(state.liveDataStatus) ? state.liveDataStatus : {};
  const sdkRuntime = isRecord(state.sdkRuntime) ? state.sdkRuntime : {};

  return {
    ...initial,
    ...(state as Partial<RoundState>),
    lockedStandings: {
      qualifier: Array.isArray(lockedStandings.qualifier) ? lockedStandings.qualifier : null,
      final: Array.isArray(lockedStandings.final) ? lockedStandings.final : null,
    },
    liveStandings: {
      qualifier: Array.isArray(liveStandings.qualifier) ? liveStandings.qualifier : null,
      final: Array.isArray(liveStandings.final) ? liveStandings.final : null,
    },
    liveDataUpdatedAt: {
      qualifier: typeof liveDataUpdatedAt.qualifier === "string" ? liveDataUpdatedAt.qualifier : null,
      final: typeof liveDataUpdatedAt.final === "string" ? liveDataUpdatedAt.final : null,
    },
    liveDataStatus: {
      qualifier: isLiveDataStatus(liveDataStatus.qualifier) ? liveDataStatus.qualifier : "idle",
      final: isLiveDataStatus(liveDataStatus.final) ? liveDataStatus.final : "idle",
    },
    mockTraders: Array.isArray(state.mockTraders) ? state.mockTraders : initial.mockTraders,
    traderConfigs: Array.isArray(state.traderConfigs) ? state.traderConfigs : [],
    sdkRuntime: {
      lastError: typeof sdkRuntime.lastError === "string" ? sdkRuntime.lastError : null,
      orderActivitiesByWallet: normalizeOrderActivitiesByWallet(sdkRuntime.orderActivitiesByWallet),
      orderSnapshotsByWallet: isRecord(sdkRuntime.orderSnapshotsByWallet) ? sdkRuntime.orderSnapshotsByWallet : {},
    },
    dataSource:
      state.dataSource === "jupiter-sdk" || state.dataSource === "jupiter-perps" || state.dataSource === "mock"
        ? state.dataSource
        : "mock",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLiveDataStatus(value: unknown): value is RoundState["liveDataStatus"]["qualifier"] {
  return value === "idle" || value === "ok" || value === "partial" || value === "error";
}

function normalizeOrderActivitiesByWallet(value: unknown): Record<string, RecentActivity[]> {
  if (!isRecord(value)) return {};

  const entries = Object.entries(value).flatMap(([walletAddress, activities]) => {
    if (!Array.isArray(activities)) return [];
    const normalizedActivities = activities.filter(isRecentActivity);
    return normalizedActivities.length > 0 ? [[walletAddress, normalizedActivities] as const] : [];
  });

  return Object.fromEntries(entries);
}

function isRecentActivity(value: unknown): value is RecentActivity {
  if (!isRecord(value)) return false;

  if (value.type === "order") {
    return (
      (value.action === "place" || value.action === "cancel") &&
      (value.orderKind === "LIMIT" || value.orderKind === "SL" || value.orderKind === "TP") &&
      (value.market === "BTC" || value.market === "ETH" || value.market === "SOL") &&
      (value.side === "long" || value.side === "short") &&
      typeof value.triggerPriceUsd === "number" &&
      typeof value.sizeUsd === "number" &&
      typeof value.entirePosition === "boolean" &&
      typeof value.timestamp === "string"
    );
  }

  if (value.type === "trade") {
    return (
      (value.action === "open" ||
        value.action === "increase" ||
        value.action === "decrease" ||
        value.action === "close" ||
        value.action === "liquidation" ||
        value.action === "deposit" ||
        value.action === "withdraw") &&
      (value.market === "BTC" || value.market === "ETH" || value.market === "SOL") &&
      (value.side === "long" || value.side === "short") &&
      (value.executionType === "market" || value.executionType === "trigger" || value.executionType === "liquidation") &&
      typeof value.notionalUsd === "number" &&
      typeof value.sizeToken === "number" &&
      typeof value.priceUsd === "number" &&
      (!("collateralUsdDelta" in value) || typeof value.collateralUsdDelta === "number") &&
      (typeof value.realizedPnlUsd === "number" || value.realizedPnlUsd === null) &&
      (!("netRealizedPnlUsd" in value) ||
        typeof value.netRealizedPnlUsd === "number" ||
        value.netRealizedPnlUsd === null) &&
      typeof value.feeUsd === "number" &&
      typeof value.timestamp === "string"
    );
  }

  return false;
}
