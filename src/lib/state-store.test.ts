import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInitialRoundState } from "./data-sources/mock";
import { LocalJsonRoundStateStore } from "./state-store";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leaderboard-state-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

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
