import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialRoundState } from "./data-sources/mock";
import {
  getRoundStateStore,
  LocalJsonRoundStateStore,
  setRoundStateStoreForTests,
  SupabaseRoundStateStore,
} from "./state-store";

let dir: string;

const managedEnvKeys = [
  "LEADERBOARD_STATE_FILE",
  "LEADERBOARD_STATE_ID",
  "LEADERBOARD_STATE_STORE",
  "LEADERBOARD_STATE_TABLE",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
] as const;

const originalEnv = Object.fromEntries(
  managedEnvKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof managedEnvKeys)[number], string | undefined>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leaderboard-state-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  setRoundStateStoreForTests(null);
  restoreEnv();
  vi.unstubAllGlobals();
});

function restoreEnv(): void {
  for (const key of managedEnvKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("LocalJsonRoundStateStore", () => {
  it("returns an initial state when no state file exists", async () => {
    const store = new LocalJsonRoundStateStore(join(dir, "state.json"));
    const state = await store.get();

    expect(state.activeMode).toBe("qualifier");
    expect(state.mockTraders).toHaveLength(25);
  });

  it("persists and reloads round state", async () => {
    const statePath = join(dir, "state.json");
    const store = new LocalJsonRoundStateStore(statePath);
    const state = {
      ...createInitialRoundState(),
      activeMode: "final" as const,
      status: "locked" as const,
    };

    await store.set(state);

    const reloaded = await store.get();
    expect(reloaded.activeMode).toBe("final");
    expect(reloaded.status).toBe("locked");
  });

  it("writes JSON data and does not leave the temporary file behind", async () => {
    const statePath = join(dir, "state.json");
    const store = new LocalJsonRoundStateStore(statePath);

    await store.set(createInitialRoundState());

    const raw = await readFile(statePath, "utf8");
    expect(JSON.parse(raw).activeMode).toBe("qualifier");

    const files = await readdir(dir);
    expect(files.filter((file) => file.endsWith(".tmp"))).toHaveLength(0);
  });

  it("serializes concurrent updates and avoids temporary file collisions", async () => {
    const statePath = join(dir, "state.json");
    const store = new LocalJsonRoundStateStore(statePath);
    await store.set(createInitialRoundState());

    await Promise.all(
      Array.from({ length: 5 }).map(() =>
        store.update((state) => ({
          ...state,
          remainingSeconds: state.remainingSeconds - 1,
        })),
      ),
    );

    const reloaded = await store.get();
    const files = await readdir(dir);

    expect(reloaded.remainingSeconds).toBe(3595);
    expect(files.filter((file) => file.endsWith(".tmp"))).toHaveLength(0);
  });
});

describe("SupabaseRoundStateStore", () => {
  it("returns an initial state when the state row does not exist", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const store = new SupabaseRoundStateStore({
      anonOrServiceKey: "service-key",
      rowId: "round/default",
      tableName: "cup_state",
      url: "https://example.supabase.co/",
    });

    const state = await store.get();

    expect(state.activeMode).toBe("qualifier");
    expect(state.mockTraders).toHaveLength(25);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/cup_state?id=eq.round%2Fdefault&select=state,version&limit=1",
      {
        headers: {
          apikey: "service-key",
          Authorization: "Bearer service-key",
          "Content-Type": "application/json",
        },
      },
    );
  });

  it("normalizes a state row returned by Supabase", async () => {
    const storedState = {
      ...createInitialRoundState(),
      activeMode: "final" as const,
      traderConfigs: [
        {
          avatarUrl: "/avatars/mert.jpg",
          displayName: "Jupiter Wallet",
          id: "jupiter-wallet",
          mode: "final",
          startingBalance: 1000,
          startingEquity: 1000,
          status: "active",
          walletAddress: "BQLXF4S9QeAEAgUP3F3HhsXC3cDHYpPYWHctjhNCnPNc",
          xHandle: "@jupiterwallet",
        },
      ],
    };
    const fetchMock = vi.fn(async () => Response.json([{ state: storedState }]));
    vi.stubGlobal("fetch", fetchMock);

    const store = new SupabaseRoundStateStore({
      anonOrServiceKey: "service-key",
      url: "https://example.supabase.co",
    });

    const state = await store.get();

    expect(state.activeMode).toBe("final");
    expect(state.traderConfigs[0]?.avatarUrl).toBe("/avatars/mert.jpg");
  });

  it("upserts normalized state through the Supabase REST endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const store = new SupabaseRoundStateStore({
      anonOrServiceKey: "service-key",
      rowId: "event-final",
      tableName: "leaderboard_state",
      url: "https://example.supabase.co",
    });
    const state = {
      ...createInitialRoundState(),
      activeMode: "final" as const,
      status: "locked" as const,
    };

    await store.set(state);

    expect(fetchMock).toHaveBeenCalledWith("https://example.supabase.co/rest/v1/leaderboard_state?on_conflict=id", {
      body: expect.any(String),
      headers: {
        apikey: "service-key",
        Authorization: "Bearer service-key",
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      method: "POST",
    });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      id: string;
      state: { activeMode: string; status: string };
      updated_at: string;
    };
    expect(body.id).toBe("event-final");
    expect(body.state.activeMode).toBe("final");
    expect(body.state.status).toBe("locked");
    expect(new Date(body.updated_at).toString()).not.toBe("Invalid Date");
  });

  it("inserts a missing row when updating Supabase state for the first time", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ version: 1 }], { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const store = new SupabaseRoundStateStore({
      anonOrServiceKey: "service-key",
      rowId: "event-default",
      url: "https://example.supabase.co",
    });

    const state = await store.update((current) => ({
      ...current,
      remainingSeconds: 120,
    }));

    expect(state.remainingSeconds).toBe(120);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://example.supabase.co/rest/v1/leaderboard_state?select=version",
      {
        body: expect.any(String),
        headers: {
          apikey: "service-key",
          Authorization: "Bearer service-key",
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        method: "POST",
      },
    );
    const body = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
      id: string;
      version: number;
    };
    expect(body.id).toBe("event-default");
    expect(body.version).toBe(1);
  });

  it("retries Supabase updates when another serverless invocation wins the version race", async () => {
    const initial = createInitialRoundState();
    let reads = 0;
    let patches = 0;
    const fetchMock = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        patches += 1;
        return Response.json(patches === 1 ? [] : [{ version: 3 }]);
      }

      reads += 1;
      return Response.json([
        {
          state: {
            ...initial,
            remainingSeconds: reads === 1 ? 3600 : 3590,
          },
          version: reads === 1 ? 1 : 2,
        },
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = new SupabaseRoundStateStore({
      anonOrServiceKey: "service-key",
      url: "https://example.supabase.co",
    });

    const state = await store.update((current) => ({
      ...current,
      remainingSeconds: current.remainingSeconds - 1,
    }));

    const patchCalls = fetchMock.mock.calls.filter(([, options]) => options?.method === "PATCH");
    expect(state.remainingSeconds).toBe(3589);
    expect(patchCalls).toHaveLength(2);
    expect(patchCalls[0]?.[0]).toBe(
      "https://example.supabase.co/rest/v1/leaderboard_state?id=eq.default&version=eq.1&select=version",
    );
    expect(patchCalls[1]?.[0]).toBe(
      "https://example.supabase.co/rest/v1/leaderboard_state?id=eq.default&version=eq.2&select=version",
    );
  });

  it("throws readable errors when Supabase reads or writes fail", async () => {
    const readFetchMock = vi.fn(async () => new Response("permission denied", { status: 403 }));
    vi.stubGlobal("fetch", readFetchMock);
    const store = new SupabaseRoundStateStore({
      anonOrServiceKey: "service-key",
      url: "https://example.supabase.co",
    });

    await expect(store.get()).rejects.toThrow("Supabase state read failed: 403 permission denied");

    const writeFetchMock = vi.fn(async () => new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", writeFetchMock);

    await expect(store.set(createInitialRoundState())).rejects.toThrow(
      "Supabase state write failed: 400 bad request",
    );
  });
});

describe("getRoundStateStore", () => {
  it("uses Supabase when server-side Supabase env vars are configured", () => {
    delete process.env.LEADERBOARD_STATE_STORE;
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    const store = getRoundStateStore();

    expect(store).toBeInstanceOf(SupabaseRoundStateStore);
  });

  it("uses the local JSON store when local state is explicitly forced", () => {
    process.env.LEADERBOARD_STATE_STORE = "local";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    const store = getRoundStateStore();

    expect(store).toBeInstanceOf(LocalJsonRoundStateStore);
  });
});
