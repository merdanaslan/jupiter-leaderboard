import type { Connection } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import type { JupiterPerpsOnChainClient } from "./jupiter-perps-client";
import {
  JupiterPerpsSolstreamLiveTracker,
  type JupiterPerpsSolstreamLiveUpdate,
} from "./jupiter-perps-solstream-live-tracker";
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

describe("JupiterPerpsSolstreamLiveTracker", () => {
  it("builds live wallet snapshots from Solstream trades, positions, and oracle prices", async () => {
    let tradeHandler: ((update: { trade: JupiterPerpsTradeEvent; slot: number }) => void) | undefined;
    let positionHandler: ((update: { position: JupiterPerpsOpenPosition; slot: number; isStartup: boolean }) => void) | undefined;
    let oracleHandler:
      | ((update: {
          price: { market: "SOL"; custody: string; oracleAddress: string; priceUsd: number; exponent: number; timestamp: number };
          slot: number;
          isStartup: boolean;
        }) => void)
      | undefined;
    const cancelTrade = vi.fn();
    const cancelPosition = vi.fn();
    const cancelOracle = vi.fn();
    const adapter = {
      subscribeWalletTrades: vi.fn((_wallets, onTrade) => {
        tradeHandler = onTrade;
        return { id: "trades", cancel: cancelTrade };
      }),
      subscribePositionAccounts: vi.fn((_wallets, onPosition) => {
        positionHandler = onPosition;
        return { id: "positions", cancel: cancelPosition };
      }),
      subscribeOraclePrices: vi.fn((onPrice) => {
        oracleHandler = onPrice;
        return { id: "oracles", cancel: cancelOracle };
      }),
    };
    const client = {
      connection: {} as Connection,
      fetchWalletSnapshots: vi.fn(async () => ({
        programId: "program",
        eventAuthority: "event-authority",
        fetchedSignatureCount: 0,
        parsedEventCount: 0,
        wallets: [emptySnapshot()],
      })),
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
      },
    } as unknown as JupiterPerpsOnChainClient;
    const tracker = new JupiterPerpsSolstreamLiveTracker(
      client,
      {
        walletAddresses: [walletAddress],
        fromSlot: 123,
        includeOraclePrices: true,
      },
      adapter,
    );
    const updates: JupiterPerpsSolstreamLiveUpdate[] = [];

    const stop = await tracker.start((update) => updates.push(update));

    expect(adapter.subscribeWalletTrades).toHaveBeenCalledWith(
      [walletAddress],
      expect.any(Function),
      expect.any(Function),
      { fromSlot: 123 },
    );
    expect(adapter.subscribePositionAccounts).toHaveBeenCalledWith(
      [walletAddress],
      expect.any(Function),
      expect.any(Function),
      { fromSlot: 123 },
    );
    expect(adapter.subscribeOraclePrices).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      fromSlot: 123,
    });
    expect(client.fetchWalletSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddresses: [walletAddress],
        signatureLimit: 0,
      }),
    );
    expect(updates[0].reason).toBe("initial");

    positionHandler?.({
      position: {
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
      },
      slot: 124,
      isStartup: false,
    });

    expect(updates.at(-1)?.reason).toBe("position");
    expect(updates.at(-1)?.snapshot?.unrealizedPnlUsd).toBe(100);

    tradeHandler?.({
      trade: {
        name: "IncreasePositionEvent",
        signature: "sig",
        slot: 125,
        blockTime: 1,
        owner: walletAddress,
        position: "position",
        market: "SOL",
        side: "long",
        notionalUsd: 500,
        feeUsd: 1,
        pnlUsd: 0,
        priceUsd: 100,
        timestamp: "2026-05-23T10:00:00.000Z",
      },
      slot: 125,
    });

    expect(updates.at(-1)?.reason).toBe("trade");
    expect(updates.at(-1)?.snapshot?.notionalVolumeUsd).toBe(500);

    oracleHandler?.({
      price: {
        market: "SOL",
        custody: "custody",
        oracleAddress: "oracle",
        priceUsd: 110,
        exponent: 8,
        timestamp: 2,
      },
      slot: 126,
      isStartup: false,
    });

    expect(updates.at(-1)?.reason).toBe("oracle");
    expect(updates.at(-1)?.snapshots[0].unrealizedPnlUsd).toBe(200);

    await stop();
    expect(cancelTrade).toHaveBeenCalled();
    expect(cancelPosition).toHaveBeenCalled();
    expect(cancelOracle).toHaveBeenCalled();
  });

  it("merges Solstream updates that arrive while the initial snapshot is loading", async () => {
    let tradeHandler: ((update: { trade: JupiterPerpsTradeEvent; slot: number }) => void) | undefined;
    let resolveInitialSnapshot: ((value: unknown) => void) | undefined;
    const initialSnapshot = new Promise((resolve) => {
      resolveInitialSnapshot = resolve;
    });
    const adapter = {
      subscribeWalletTrades: vi.fn((_wallets, onTrade) => {
        tradeHandler = onTrade;
        return { id: "trades", cancel: vi.fn() };
      }),
      subscribePositionAccounts: vi.fn(() => ({ id: "positions", cancel: vi.fn() })),
      subscribeOraclePrices: vi.fn(() => ({ id: "oracles", cancel: vi.fn() })),
    };
    const client = {
      connection: {} as Connection,
      fetchWalletSnapshots: vi.fn(() => initialSnapshot),
      oracleClient: {
        fetchOraclePrices: vi.fn(async () => []),
      },
    } as unknown as JupiterPerpsOnChainClient;
    const tracker = new JupiterPerpsSolstreamLiveTracker(
      client,
      {
        walletAddresses: [walletAddress],
        includeOraclePrices: false,
      },
      adapter,
    );
    const updates: JupiterPerpsSolstreamLiveUpdate[] = [];
    const startPromise = tracker.start((update) => updates.push(update));

    tradeHandler?.({
      trade: {
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
      },
      slot: 10,
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
