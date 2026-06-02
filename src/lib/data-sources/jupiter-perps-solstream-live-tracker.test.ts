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
  JupiterPerpsTriggerOrder,
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
    let walletEventHandler: ((update: {
      kind: string;
      slot: number;
      request?: {
        name: string;
        signature: string;
        slot: number;
        blockTime: number | null;
        owner: string;
        positionRequestKey: string;
        action: "create" | "update" | "close";
        timestamp: string;
      };
      trade?: JupiterPerpsTradeEvent;
    }) => void) | undefined;
    let positionHandler: ((update: { position: JupiterPerpsOpenPosition; slot: number; isStartup: boolean }) => void) | undefined;
    let triggerOrderHandler:
      | ((update: {
          order?: JupiterPerpsTriggerOrder;
          pubkey?: string;
          removed?: boolean;
          slot: number;
          isStartup: boolean;
        }) => void)
      | undefined;
    let oracleHandler:
      | ((update: {
          price: { market: "SOL"; custody: string; oracleAddress: string; priceUsd: number; exponent: number; timestamp: number };
          slot: number;
          isStartup: boolean;
        }) => void)
      | undefined;
    const cancelTrade = vi.fn();
    const cancelWalletEvents = vi.fn();
    const cancelPosition = vi.fn();
    const cancelTriggerOrder = vi.fn();
    const cancelOracle = vi.fn();
    const adapter = {
      subscribeWalletTrades: vi.fn((_wallets, onTrade) => {
        tradeHandler = onTrade;
        return { id: "trades", cancel: cancelTrade };
      }),
      subscribeWalletEvents: vi.fn((_wallets, onEvent) => {
        walletEventHandler = onEvent;
        return { id: "wallet-events", cancel: cancelWalletEvents };
      }),
      subscribePositionAccounts: vi.fn((_wallets, onPosition) => {
        positionHandler = onPosition;
        return { id: "positions", cancel: cancelPosition };
      }),
      subscribePositionRequestAccounts: vi.fn((_wallets, onTriggerOrder) => {
        triggerOrderHandler = onTriggerOrder;
        return { id: "position-requests", cancel: cancelTriggerOrder };
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

    expect(adapter.subscribeWalletEvents).toHaveBeenCalledWith(
      [walletAddress],
      expect.any(Function),
      expect.any(Function),
      { fromSlot: 123 },
    );
    expect(adapter.subscribeWalletTrades).not.toHaveBeenCalled();
    expect(adapter.subscribePositionAccounts).toHaveBeenCalledWith(
      [walletAddress],
      expect.any(Function),
      expect.any(Function),
      { fromSlot: 123 },
    );
    expect(adapter.subscribePositionRequestAccounts).toHaveBeenCalledWith(
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
        positionRequestSignatureLimit: 0,
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

    walletEventHandler?.({
      kind: "trade",
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

    triggerOrderHandler?.({
      order: {
        pubkey: "request",
        owner: walletAddress,
        position: "position",
        market: "SOL",
        side: "long",
        kind: "TP",
        sizeUsd: 250,
        triggerPriceUsd: 120,
        triggerAboveThreshold: true,
        entirePosition: false,
        counter: 1,
        openTime: 1,
        updateTime: 2,
      },
      slot: 126,
      isStartup: false,
    });

    expect(updates.at(-1)?.reason).toBe("trigger-order");
    expect(updates.at(-1)?.snapshot?.triggerOrders?.[0]).toEqual(
      expect.objectContaining({
        kind: "TP",
        triggerPriceUsd: 120,
      }),
    );

    walletEventHandler?.({
      kind: "position-request",
      request: {
        name: "ClosePositionRequestEvent",
        signature: "close-request-sig",
        slot: 127,
        blockTime: 1,
        owner: walletAddress,
        positionRequestKey: "request",
        action: "close",
        timestamp: "2026-05-23T10:00:00.000Z",
      },
      slot: 127,
    });

    expect(updates.at(-1)?.reason).toBe("trigger-order");
    expect(updates.at(-1)?.positionRequestEvent?.action).toBe("close");
    expect(updates.at(-1)?.triggerOrderRemoved).toBe(true);
    expect(updates.at(-1)?.triggerOrderPubkey).toBe("request");
    expect(updates.at(-1)?.snapshot?.triggerOrders).toEqual([]);

    triggerOrderHandler?.({
      order: {
        pubkey: "request",
        owner: walletAddress,
        position: "position",
        market: "SOL",
        side: "long",
        kind: "TP",
        sizeUsd: 250,
        triggerPriceUsd: 120,
        triggerAboveThreshold: true,
        entirePosition: false,
        counter: 1,
        openTime: 1,
        updateTime: 2,
      },
      slot: 128,
      isStartup: false,
    });

    triggerOrderHandler?.({
      pubkey: "request",
      removed: true,
      slot: 129,
      isStartup: false,
    });

    expect(updates.at(-1)?.reason).toBe("trigger-order");
    expect(updates.at(-1)?.triggerOrderRemoved).toBe(true);
    expect(updates.at(-1)?.triggerOrderPubkey).toBe("request");
    expect(updates.at(-1)?.snapshot?.triggerOrders).toEqual([]);

    oracleHandler?.({
      price: {
        market: "SOL",
        custody: "custody",
        oracleAddress: "oracle",
        priceUsd: 110,
        exponent: 8,
        timestamp: 2,
      },
      slot: 127,
      isStartup: false,
    });

    expect(updates.at(-1)?.reason).toBe("oracle");
    expect(updates.at(-1)?.snapshots[0].unrealizedPnlUsd).toBe(200);

    positionHandler?.({
      position: {
        pubkey: "position",
        owner: walletAddress,
        market: "SOL",
        side: "long",
        sizeUsd: 0,
        collateralUsd: 0,
        entryPriceUsd: 90,
        realisedPnlUsd: 0,
        openTime: 1,
        updateTime: 3,
      },
      slot: 128,
      isStartup: false,
    });

    expect(updates.at(-1)?.reason).toBe("position");
    expect(updates.at(-1)?.snapshot?.positions).toEqual([]);
    expect(updates.at(-1)?.snapshot?.openTrade).toBeUndefined();

    await stop();
    expect(cancelTrade).not.toHaveBeenCalled();
    expect(cancelWalletEvents).toHaveBeenCalled();
    expect(cancelPosition).toHaveBeenCalled();
    expect(cancelTriggerOrder).toHaveBeenCalled();
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

  it("can start in live-only mode without startup RPC snapshot reads", async () => {
    const adapter = {
      subscribeWalletEvents: vi.fn(() => ({ id: "wallet-events", cancel: vi.fn() })),
      subscribeWalletTrades: vi.fn(() => ({ id: "trades", cancel: vi.fn() })),
      subscribePositionAccounts: vi.fn(() => ({ id: "positions", cancel: vi.fn() })),
      subscribePositionRequestAccounts: vi.fn(() => ({ id: "position-requests", cancel: vi.fn() })),
      subscribeOraclePrices: vi.fn(() => ({ id: "oracles", cancel: vi.fn() })),
    };
    const client = {
      connection: {} as Connection,
      fetchWalletSnapshots: vi.fn(async () => {
        throw new Error("startup RPC unavailable");
      }),
      fetchCustodyConfigsByAddress: vi.fn(async () => {
        throw new Error("custody RPC unavailable");
      }),
      oracleClient: {
        fetchOraclePrices: vi.fn(async () => {
          throw new Error("oracle RPC unavailable");
        }),
      },
    } as unknown as JupiterPerpsOnChainClient;
    const tracker = new JupiterPerpsSolstreamLiveTracker(
      client,
      {
        walletAddresses: [walletAddress],
        includeOraclePrices: true,
        skipInitialSnapshot: true,
      },
      adapter,
    );
    const updates: JupiterPerpsSolstreamLiveUpdate[] = [];

    const stop = await tracker.start((update) => updates.push(update));

    expect(client.fetchWalletSnapshots).not.toHaveBeenCalled();
    expect(client.oracleClient.fetchOraclePrices).not.toHaveBeenCalled();
    expect(updates[0]).toEqual(
      expect.objectContaining({
        reason: "initial",
        snapshots: [
          expect.objectContaining({
            walletAddress,
            positions: [],
            trades: [],
          }),
        ],
      }),
    );

    await stop();
  });

  it("can continue with live updates when startup RPC snapshot reads fail", async () => {
    let tradeHandler: ((update: { trade: JupiterPerpsTradeEvent; slot: number }) => void) | undefined;
    const onError = vi.fn();
    const adapter = {
      subscribeWalletEvents: vi.fn((_wallets, onEvent) => {
        tradeHandler = (update) => onEvent({ kind: "trade", ...update });
        return { id: "wallet-events", cancel: vi.fn() };
      }),
      subscribeWalletTrades: vi.fn(() => ({ id: "trades", cancel: vi.fn() })),
      subscribePositionAccounts: vi.fn(() => ({ id: "positions", cancel: vi.fn() })),
      subscribePositionRequestAccounts: vi.fn(() => ({ id: "position-requests", cancel: vi.fn() })),
      subscribeOraclePrices: vi.fn(() => ({ id: "oracles", cancel: vi.fn() })),
    };
    const client = {
      connection: {} as Connection,
      fetchWalletSnapshots: vi.fn(async () => {
        throw new Error("startup RPC unavailable");
      }),
      oracleClient: {
        fetchOraclePrices: vi.fn(async () => []),
      },
    } as unknown as JupiterPerpsOnChainClient;
    const tracker = new JupiterPerpsSolstreamLiveTracker(
      client,
      {
        walletAddresses: [walletAddress],
        includeOraclePrices: false,
        continueOnInitialSnapshotError: true,
        onError,
      },
      adapter,
    );
    const updates: JupiterPerpsSolstreamLiveUpdate[] = [];

    const stop = await tracker.start((update) => updates.push(update));

    expect(client.fetchWalletSnapshots).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "startup RPC unavailable" }));
    expect(updates[0]).toEqual(
      expect.objectContaining({
        reason: "initial",
        snapshots: [expect.objectContaining({ walletAddress })],
      }),
    );

    tradeHandler?.({
      trade: {
        name: "IncreasePositionEvent",
        signature: "live-sig-after-rpc-failure",
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

    expect(updates.at(-1)?.reason).toBe("trade");
    expect(updates.at(-1)?.snapshot?.notionalVolumeUsd).toBe(250);

    await stop();
  });
});
