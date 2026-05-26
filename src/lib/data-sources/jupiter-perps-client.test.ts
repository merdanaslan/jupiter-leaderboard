// @vitest-environment node

import { Connection, PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { JupiterPerpsOnChainClient } from "./jupiter-perps-client";
import { JUPITER_PERPS_EVENT_AUTHORITY, JUPITER_PERPS_PROGRAM_ID, type DecodedPerpsEvent } from "./jupiter-perps-normalize";

const WALLET = "5TRxgLWsCFc9FfgfzBZoet3wMriLGMFBjfjjtAjVHohN";
const REQUEST = "8AoB6hSL6fKMcmaBhru64aQHS42qoo1XeSLzarPep91o";

describe("JupiterPerpsOnChainClient", () => {
  it("builds Anchor discriminator and owner filters for Position accounts", () => {
    const client = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));
    const filters = client.positionFilters("11111111111111111111111111111111");

    expect(client.programId.toBase58()).toBe(JUPITER_PERPS_PROGRAM_ID);
    expect(client.eventAuthority.toBase58()).toBe(JUPITER_PERPS_EVENT_AUTHORITY);
    expect(filters).toEqual([
      {
        memcmp: {
          bytes: "11111111111111111111111111111111",
          offset: 8,
        },
      },
      {
        memcmp: {
          bytes: "VZMoMoKgZQb",
          offset: 0,
        },
      },
    ]);
  });

  it("builds Anchor discriminator and owner filters for PositionRequest accounts", () => {
    const client = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));
    const filters = client.positionRequestFilters("11111111111111111111111111111111");

    expect(filters).toEqual([
      {
        dataSize: 312,
      },
      {
        memcmp: {
          bytes: "11111111111111111111111111111111",
          offset: 8,
        },
      },
      {
        memcmp: {
          bytes: "32tkJosYU3Z",
          offset: 0,
        },
      },
    ]);
  });

  it("ignores non-Anchor event instruction data", () => {
    const client = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));

    expect(client.decodeEventInstruction("not-base58")).toBeNull();
    expect(client.decodeEventInstruction("11111111")).toBeNull();
  });

  it("subscribes to live trade events through the event authority by default", () => {
    const onLogs = vi.fn(() => 99);
    const client = new JupiterPerpsOnChainClient({ onLogs } as unknown as Connection);

    const subscriptionId = client.subscribeTradeEventsForWallets(
      ["11111111111111111111111111111111"],
      () => undefined,
    );

    expect(subscriptionId).toBe(99);
    expect(onLogs).toHaveBeenCalledTimes(1);
    expect(onLogs.mock.calls[0][0].toBase58()).toBe(JUPITER_PERPS_EVENT_AUTHORITY);
    expect(onLogs.mock.calls[0][2]).toBe("confirmed");
  });

  it("derives deterministic competition Position PDAs for each market, collateral, and side", () => {
    const client = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));
    const candidates = client.deriveCompetitionPositionAddressesForWallet(WALLET);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(30);
    expect(candidates[0]).toEqual(
      expect.objectContaining({
        pubkey: expect.any(PublicKey),
        market: expect.stringMatching(/^(SOL|ETH|BTC)$/),
        collateral: expect.stringMatching(/^(SOL|ETH|BTC|USDC|USDT)$/),
        side: expect.stringMatching(/^(long|short)$/),
      }),
    );
    expect(new Set(candidates.map((candidate) => candidate.pubkey.toBase58())).size).toBe(candidates.length);
  });

  it("fetches wallet positions by deterministic PDAs instead of program account scans", async () => {
    const getMultipleAccountsInfo = vi.fn(async () => Array.from({ length: 30 }, () => null));
    const getProgramAccounts = vi.fn();
    const client = new JupiterPerpsOnChainClient({
      getMultipleAccountsInfo,
      getProgramAccounts,
    } as unknown as Connection);

    const positions = await client.fetchOpenPositionsForWallet(WALLET);

    expect(positions).toEqual([]);
    expect(getMultipleAccountsInfo).toHaveBeenCalledTimes(1);
    expect(getMultipleAccountsInfo.mock.calls[0][0].length).toBeGreaterThan(0);
    expect(getMultipleAccountsInfo.mock.calls[0][0].length).toBeLessThanOrEqual(30);
    expect(getProgramAccounts).not.toHaveBeenCalled();
  });

  it("fetches open TP/SL PositionRequest accounts through owner-filtered program scans", async () => {
    const getProgramAccounts = vi.fn(async () => []);
    const client = new JupiterPerpsOnChainClient({
      getProgramAccounts,
    } as unknown as Connection);

    const requests = await client.fetchOpenTriggerOrdersForWallet(WALLET);

    expect(requests).toEqual([]);
    expect(getProgramAccounts).toHaveBeenCalledWith(client.programId, {
      commitment: "confirmed",
      filters: client.positionRequestFilters(WALLET),
    });
  });

  it("fetches open TP/SL PositionRequest accounts through recent wallet request events", async () => {
    const getSignaturesForAddress = vi.fn(async () => [
      {
        signature: "sig-1",
        slot: 1,
        err: null,
        memo: null,
        blockTime: 1716400000,
        confirmationStatus: "confirmed",
      },
    ]);
    const getTransactions = vi.fn(async () => [{ slot: 1, blockTime: 1716400000, meta: { innerInstructions: [] } }]);
    const getMultipleAccountsInfo = vi.fn(async () => [
      {
        owner: new PublicKey(JUPITER_PERPS_PROGRAM_ID),
        data: Buffer.from("position-request"),
      },
    ]);
    const client = new JupiterPerpsOnChainClient({
      getSignaturesForAddress,
      getTransactions,
      getMultipleAccountsInfo,
    } as unknown as Connection);
    vi.spyOn(client, "decodeEventsFromTransaction").mockReturnValue([
      {
        name: "InstantCreateTpslEvent",
        signature: "sig-1",
        slot: 1,
        blockTime: 1716400000,
        instructionIndex: 0,
        data: {
          owner: new PublicKey(WALLET),
          positionRequestKey: new PublicKey(REQUEST),
        },
      } satisfies DecodedPerpsEvent,
    ]);
    vi.spyOn(client, "decodePositionRequestAccount").mockReturnValue({
      pubkey: REQUEST,
      owner: WALLET,
      position: "11111111111111111111111111111111",
      market: "SOL",
      side: "long",
      kind: "TP",
      sizeUsd: 0,
      triggerPriceUsd: 100,
      triggerAboveThreshold: true,
      entirePosition: true,
      counter: 1,
      openTime: 1716400000,
      updateTime: 1716400000,
    });

    const requests = await client.fetchOpenTriggerOrdersForWalletByRecentEvents(WALLET);

    expect(requests).toEqual([
      expect.objectContaining({
        pubkey: REQUEST,
        kind: "TP",
        triggerPriceUsd: 100,
      }),
    ]);
    expect(getSignaturesForAddress.mock.calls[0][0].toBase58()).toBe(WALLET);
    expect(getMultipleAccountsInfo.mock.calls[0][0][0].toBase58()).toBe(REQUEST);
  });

  it("falls back to sequential transaction fetches when the history RPC rejects transaction batches", async () => {
    const getSignaturesForAddress = vi
      .fn()
      .mockResolvedValueOnce([
        {
          signature: "sig-1",
          slot: 1,
          err: null,
          memo: null,
          blockTime: 1716400000,
          confirmationStatus: "confirmed",
        },
        {
          signature: "sig-2",
          slot: 2,
          err: null,
          memo: null,
          blockTime: 1716400001,
          confirmationStatus: "confirmed",
        },
      ])
      .mockResolvedValue([]);
    const getTransactions = vi.fn(async () => {
      throw new Error("Maximum number of 'getTransaction' calls in a batch request is 1");
    });
    const getTransaction = vi.fn(async () => ({ slot: 1, blockTime: 1716400000, meta: { innerInstructions: [] } }));
    const getMultipleAccountsInfo = vi.fn(async () => []);
    const client = new JupiterPerpsOnChainClient({
      getSignaturesForAddress,
      getTransactions,
      getTransaction,
      getMultipleAccountsInfo,
    } as unknown as Connection);
    vi.spyOn(client, "decodeEventsFromTransaction").mockReturnValue([]);

    await client.fetchRecentPositionRequestKeysForWallet(WALLET);

    expect(getTransactions).toHaveBeenCalledTimes(1);
    expect(getTransaction).toHaveBeenCalledTimes(2);
  });

  it("falls back to recent wallet request events when TP/SL account scans are unavailable", async () => {
    const client = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));
    const triggerOrder = {
      pubkey: REQUEST,
      owner: WALLET,
      position: "11111111111111111111111111111111",
      market: "SOL" as const,
      side: "long" as const,
      kind: "TP" as const,
      sizeUsd: 0,
      triggerPriceUsd: 100,
      triggerAboveThreshold: true,
      entirePosition: true,
      counter: 1,
      openTime: 1716400000,
      updateTime: 1716400000,
    };
    vi.spyOn(client, "fetchCustodyConfigsByAddress").mockResolvedValue(new Map());
    vi.spyOn(client, "fetchOpenPositionsForWallet").mockResolvedValue([]);
    vi.spyOn(client, "fetchOpenTriggerOrdersForWallet").mockRejectedValue(new Error("getProgramAccounts unavailable"));
    vi.spyOn(client, "fetchOpenTriggerOrdersForWalletByRecentEvents").mockResolvedValue([triggerOrder]);
    vi.spyOn(client, "fetchRecentTradeEvents").mockResolvedValue({
      signatures: [],
      events: [],
    });

    const result = await client.fetchWalletSnapshots({
      walletAddresses: [WALLET],
      signatureLimit: 0,
    });

    expect(result.wallets[0]).toEqual(
      expect.objectContaining({
        walletAddress: WALLET,
        triggerOrders: [triggerOrder],
        triggerOrdersUnavailable: undefined,
      }),
    );
  });

  it("keeps wallet snapshots available when TP/SL account scans are unavailable", async () => {
    const client = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));
    vi.spyOn(client, "fetchCustodyConfigsByAddress").mockResolvedValue(new Map());
    vi.spyOn(client, "fetchOpenPositionsForWallet").mockResolvedValue([]);
    vi.spyOn(client, "fetchOpenTriggerOrdersForWallet").mockRejectedValue(new Error("getProgramAccounts unavailable"));
    vi.spyOn(client, "fetchOpenTriggerOrdersForWalletByRecentEvents").mockRejectedValue(new Error("history unavailable"));
    vi.spyOn(client, "fetchRecentTradeEvents").mockResolvedValue({
      signatures: [],
      events: [],
    });

    const result = await client.fetchWalletSnapshots({
      walletAddresses: ["11111111111111111111111111111111"],
      signatureLimit: 0,
    });

    expect(result.wallets[0]).toEqual(
      expect.objectContaining({
        walletAddress: "11111111111111111111111111111111",
        triggerOrders: [],
        triggerOrdersUnavailable: true,
      }),
    );
  });

  it("can decode a supplied transaction signature without event-authority signature discovery", async () => {
    const getTransactions = vi.fn(async () => [null]);
    const client = new JupiterPerpsOnChainClient({ getTransactions } as unknown as Connection);

    const result = await client.fetchTradeEventsForSignatures({
      signatures: ["sig-1"],
      walletAddresses: ["11111111111111111111111111111111"],
    });

    expect(getTransactions).toHaveBeenCalledWith(["sig-1"], {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    expect(result).toEqual({
      signatures: ["sig-1"],
      events: [],
    });
  });

  it("can skip event-history discovery when signature limit is zero", async () => {
    const getSignaturesForAddress = vi.fn();
    const client = new JupiterPerpsOnChainClient({ getSignaturesForAddress } as unknown as Connection);

    const result = await client.fetchRecentTradeEvents({ signatureLimit: 0 });

    expect(getSignaturesForAddress).not.toHaveBeenCalled();
    expect(result).toEqual({ signatures: [], events: [] });
  });
});
