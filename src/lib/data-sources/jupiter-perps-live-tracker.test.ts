import type { Connection } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import type { JupiterPerpsOnChainClient } from "./jupiter-perps-client";
import { JupiterPerpsLiveTracker, type JupiterPerpsLiveUpdate } from "./jupiter-perps-live-tracker";
import type {
  JupiterPerpsOpenPosition,
  JupiterPerpsTradeEvent,
  JupiterPerpsWalletSnapshot,
} from "./jupiter-perps-normalize";

const walletAddress = "11111111111111111111111111111111";

function emptySnapshot(): JupiterPerpsWalletSnapshot {
  return {
    walletAddress,
    positions: [],
    trades: [],
    notionalVolumeUsd: 0,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 0,
    totalPnlUsd: 0,
  };
}

describe("JupiterPerpsLiveTracker", () => {
  it("merges initial snapshots, live trades, position updates, and oracle prices", async () => {
    let tradeHandler: ((trade: JupiterPerpsTradeEvent) => void) | undefined;
    let positionHandler: ((position: JupiterPerpsOpenPosition) => void) | undefined;
    let oracleHandler:
      | ((price: { market: "SOL"; custody: string; oracleAddress: string; priceUsd: number; exponent: number; timestamp: number }) => void)
      | undefined;

    const removeOnLogsListener = vi.fn(async () => undefined);
    const removeAccountChangeListener = vi.fn(async () => undefined);
    const client = {
      connection: {
        removeOnLogsListener,
        removeAccountChangeListener,
      } as unknown as Connection,
      fetchOraclePricesByMarket: vi.fn(async () => ({ SOL: 100 })),
      fetchWalletSnapshots: vi.fn(async () => ({
        programId: "program",
        eventAuthority: "event-authority",
        fetchedSignatureCount: 0,
        parsedEventCount: 0,
        wallets: [emptySnapshot()],
      })),
      subscribeTradeEventsForWallets: vi.fn((_wallets, onTrade) => {
        tradeHandler = onTrade;
        return 10;
      }),
      subscribePositionsForWallet: vi.fn((_wallet, onPosition) => {
        positionHandler = onPosition;
        return 20;
      }),
      oracleClient: {
        fetchOraclePrices: vi.fn(async () => [
          {
            market: "SOL",
            custody: "custody",
            oracleAddress: "oracle",
            priceUsd: 100,
            exponent: 8,
            timestamp: 1,
          },
        ]),
        subscribeOraclePrices: vi.fn((onPrice) => {
          oracleHandler = onPrice;
          return [30];
        }),
      },
    } as unknown as JupiterPerpsOnChainClient;
    const tracker = new JupiterPerpsLiveTracker(client, {
      walletAddresses: [walletAddress],
      includeOraclePrices: true,
      signatureLimit: 10,
    });
    const updates: JupiterPerpsLiveUpdate[] = [];

    const stop = await tracker.start((update) => updates.push(update));

    expect(updates[0].reason).toBe("initial");
    expect(updates[0].snapshots[0].totalPnlUsd).toBe(0);

    tradeHandler?.({
      name: "DecreasePositionEvent",
      signature: "sig",
      slot: 5,
      blockTime: 1,
      owner: walletAddress,
      position: "position",
      market: "SOL",
      side: "long",
      notionalUsd: 500,
      feeUsd: 1,
      pnlUsd: 12,
      priceUsd: 105,
      timestamp: "2026-05-23T10:00:00.000Z",
    });

    expect(updates.at(-1)?.reason).toBe("trade");
    expect(updates.at(-1)?.snapshot?.notionalVolumeUsd).toBe(500);
    expect(updates.at(-1)?.snapshot?.realizedPnlUsd).toBe(12);

    positionHandler?.({
      pubkey: "position",
      owner: walletAddress,
      market: "SOL",
      side: "long",
      sizeUsd: 900,
      collateralUsd: 200,
      entryPriceUsd: 90,
      realisedPnlUsd: 0,
      openTime: 1,
      updateTime: 2,
    });

    expect(updates.at(-1)?.reason).toBe("position");
    expect(updates.at(-1)?.snapshot?.unrealizedPnlUsd).toBe(100);
    expect(updates.at(-1)?.snapshot?.totalPnlUsd).toBe(112);

    oracleHandler?.({
      market: "SOL",
      custody: "custody",
      oracleAddress: "oracle",
      priceUsd: 110,
      exponent: 8,
      timestamp: 3,
    });

    expect(updates.at(-1)?.reason).toBe("oracle");
    expect(updates.at(-1)?.snapshots[0].unrealizedPnlUsd).toBe(200);
    expect(updates.at(-1)?.snapshots[0].totalPnlUsd).toBe(212);

    positionHandler?.({
      pubkey: "position",
      owner: walletAddress,
      market: "SOL",
      side: "long",
      sizeUsd: 0,
      collateralUsd: 0,
      entryPriceUsd: 90,
      realisedPnlUsd: 0,
      openTime: 1,
      updateTime: 4,
    });

    expect(updates.at(-1)?.reason).toBe("position");
    expect(updates.at(-1)?.snapshot?.positions).toEqual([]);
    expect(updates.at(-1)?.snapshot?.openTrade).toBeUndefined();

    await stop();
    expect(removeOnLogsListener).toHaveBeenCalledWith(10);
    expect(removeAccountChangeListener).toHaveBeenCalledWith(20);
    expect(removeAccountChangeListener).toHaveBeenCalledWith(30);
  });

  it("merges live updates that arrive while the initial snapshot is loading", async () => {
    let tradeHandler: ((trade: JupiterPerpsTradeEvent) => void) | undefined;
    let resolveInitialSnapshot: ((value: unknown) => void) | undefined;
    const initialSnapshot = new Promise((resolve) => {
      resolveInitialSnapshot = resolve;
    });
    const client = {
      connection: {
        removeOnLogsListener: vi.fn(async () => undefined),
        removeAccountChangeListener: vi.fn(async () => undefined),
      } as unknown as Connection,
      fetchWalletSnapshots: vi.fn(() => initialSnapshot),
      subscribeTradeEventsForWallets: vi.fn((_wallets, onTrade) => {
        tradeHandler = onTrade;
        return 10;
      }),
      subscribePositionsForWallet: vi.fn(() => 20),
      oracleClient: {
        subscribeOraclePrices: vi.fn(() => []),
      },
    } as unknown as JupiterPerpsOnChainClient;
    const tracker = new JupiterPerpsLiveTracker(client, {
      walletAddresses: [walletAddress],
    });
    const updates: JupiterPerpsLiveUpdate[] = [];
    const startPromise = tracker.start((update) => updates.push(update));

    tradeHandler?.({
      name: "IncreasePositionEvent",
      signature: "live-sig",
      slot: 10,
      blockTime: 1,
      owner: walletAddress,
      position: "position",
      market: "SOL",
      side: "long",
      notionalUsd: 250,
      feeUsd: 1,
      pnlUsd: 0,
      priceUsd: 100,
      timestamp: "2026-05-23T10:00:00.000Z",
    });
    expect(updates).toHaveLength(0);

    resolveInitialSnapshot?.({
      programId: "program",
      eventAuthority: "event-authority",
      fetchedSignatureCount: 0,
      parsedEventCount: 0,
      wallets: [emptySnapshot()],
    });
    const stop = await startPromise;

    expect(updates).toHaveLength(1);
    expect(updates[0].reason).toBe("initial");
    expect(updates[0].snapshots[0].notionalVolumeUsd).toBe(250);
    expect(updates[0].snapshots[0].trades[0].signature).toBe("live-sig");

    await stop();
  });
});
