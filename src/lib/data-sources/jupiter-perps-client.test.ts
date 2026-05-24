// @vitest-environment node

import { Connection, PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { JupiterPerpsOnChainClient } from "./jupiter-perps-client";
import { JUPITER_PERPS_EVENT_AUTHORITY, JUPITER_PERPS_PROGRAM_ID } from "./jupiter-perps-normalize";

const WALLET = "5TRxgLWsCFc9FfgfzBZoet3wMriLGMFBjfjjtAjVHohN";

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
