import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createInitialRoundState } from "./data-sources/mock";
import type { RoundState } from "./types";

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
      return JSON.parse(raw) as RoundState;
    } catch (error) {
      if (isMissingFileError(error)) {
        return createInitialRoundState();
      }
      throw error;
    }
  }

  async set(state: RoundState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.filePath);
  }

  async update(updater: (state: RoundState) => RoundState | Promise<RoundState>): Promise<RoundState> {
    let result: RoundState | undefined;

    const run = this.updateQueue.then(async () => {
      const current = await this.get();
      const next = await updater(current);
      await this.set(next);
      result = next;
    });

    this.updateQueue = run.catch(() => undefined);
    await run;

    return result as RoundState;
  }
}

let stateStore: RoundStateStore | null = null;

export function getRoundStateStore(): RoundStateStore {
  if (!stateStore) {
    stateStore = new LocalJsonRoundStateStore();
  }

  return stateStore;
}

export function setRoundStateStoreForTests(store: RoundStateStore | null): void {
  stateStore = store;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
