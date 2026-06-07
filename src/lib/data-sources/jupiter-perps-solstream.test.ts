// @vitest-environment node

import { Connection } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { JupiterPerpsOnChainClient } from "./jupiter-perps-client";
import { JupiterPerpsSolstreamAdapter } from "./jupiter-perps-solstream";
import { DOVES_ORACLE_BY_MARKET } from "./jupiter-perps-oracle";
import { SolstreamCommitmentLevel, type SolstreamClient } from "./solstream-client";

const WALLET = "5TRxgLWsCFc9FfgfzBZoet3wMriLGMFBjfjjtAjVHohN";

describe("JupiterPerpsSolstreamAdapter", () => {
  it("derives position account subscriptions from whitelisted wallets", () => {
    const perpsClient = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));
    const adapter = new JupiterPerpsSolstreamAdapter(perpsClient, fakeSolstreamClient());

    const accounts = adapter.derivePositionAccountAddresses([WALLET]);

    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts.length).toBeLessThanOrEqual(30);
    expect(new Set(accounts).size).toBe(accounts.length);
  });

  it("subscribes to derived Position accounts through Solstream", () => {
    const subscribe = vi.fn(() => ({ id: "sub", cancel: vi.fn() }));
    const perpsClient = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));
    const adapter = new JupiterPerpsSolstreamAdapter(perpsClient, fakeSolstreamClient(subscribe));

    adapter.subscribePositionAccounts([WALLET], vi.fn());

    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        accounts: {
          "jupiter-perps-positions": {
            account: expect.arrayContaining([expect.any(String)]),
          },
        },
        commitment: SolstreamCommitmentLevel.CONFIRMED,
      }),
      expect.any(Function),
      undefined,
    );
  });

  it("subscribes to Jupiter Perps event-authority transactions and filters wallets after decoding", () => {
    const subscribe = vi.fn(() => ({ id: "sub", cancel: vi.fn() }));
    const perpsClient = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));
    const adapter = new JupiterPerpsSolstreamAdapter(perpsClient, fakeSolstreamClient(subscribe));

    adapter.subscribeWalletTrades([WALLET], vi.fn());

    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        transactions: {
          "jupiter-perps-event-authority": {
            vote: false,
            failed: false,
            accountInclude: ["37hJBDnntwqhGbK7L6M1bLyvccj4u55CCUiLPdYkiqBN"],
          },
        },
        commitment: SolstreamCommitmentLevel.CONFIRMED,
      }),
      expect.any(Function),
      undefined,
    );
  });

  it("emits wallet PositionRequest events from the event-authority transaction stream", () => {
    const onEvent = vi.fn();
    const subscribe = vi.fn((_request, onUpdate) => {
      onUpdate({
        kind: "transaction",
        data: {
          signature: "sig",
          slot: 789,
          success: true,
          accountKeys: [],
          logMessages: [],
          innerInstructions: [],
        },
      });
      return { id: "sub", cancel: vi.fn() };
    });
    const perpsClient = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));
    vi.spyOn(perpsClient, "decodeWalletEventsFromTransactionLike").mockReturnValue([
      {
        kind: "position-request",
        request: {
          name: "ClosePositionRequestEvent",
          signature: "sig",
          slot: 789,
          blockTime: 1,
          owner: WALLET,
          positionRequestKey: "request-account",
          action: "close",
          timestamp: "2026-05-23T10:00:00.000Z",
        },
      },
    ]);
    const adapter = new JupiterPerpsSolstreamAdapter(perpsClient, fakeSolstreamClient(subscribe));

    adapter.subscribeWalletEvents([WALLET], onEvent);

    expect(onEvent).toHaveBeenCalledWith({
      kind: "position-request",
      request: expect.objectContaining({
        positionRequestKey: "request-account",
        action: "close",
      }),
      slot: 789,
    });
  });

  it("subscribes to PositionRequest trigger order accounts through Solstream owner filters", () => {
    const subscribe = vi.fn(() => ({ id: "sub", cancel: vi.fn() }));
    const perpsClient = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));
    const adapter = new JupiterPerpsSolstreamAdapter(perpsClient, fakeSolstreamClient(subscribe));

    adapter.subscribePositionRequestAccounts([WALLET], vi.fn());

    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        accounts: {
          [`jupiter-perps-position-requests-${WALLET}`]: {
            owner: ["PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu"],
            filters: [
              { datasize: 312 },
              {
                memcmp: {
                  offset: 8,
                  base58: WALLET,
                },
              },
              {
                memcmp: {
                  offset: 0,
                  base58: "32tkJosYU3Z",
                },
              },
            ],
          },
        },
        commitment: SolstreamCommitmentLevel.CONFIRMED,
      }),
      expect.any(Function),
      undefined,
    );
  });

  it("emits PositionRequest removals when an updated request no longer decodes as an open trigger order", () => {
    const onOrder = vi.fn();
    const subscribe = vi.fn((_request, onUpdate) => {
      onUpdate({
        kind: "account",
        data: {
          pubkey: "request-account",
          slot: 456,
          lamports: 1n,
          owner: "PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu",
          executable: false,
          rentEpoch: 0n,
          data: new Uint8Array([1, 2, 3]),
          writeVersion: 1n,
          isStartup: false,
        },
      });
      return { id: "sub", cancel: vi.fn() };
    });
    const perpsClient = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));
    vi.spyOn(perpsClient, "decodePositionRequestAccount").mockReturnValue(null);
    const adapter = new JupiterPerpsSolstreamAdapter(perpsClient, fakeSolstreamClient(subscribe));

    adapter.subscribePositionRequestAccounts([WALLET], onOrder);

    expect(onOrder).toHaveBeenCalledWith({
      pubkey: "request-account",
      removed: true,
      slot: 456,
      isStartup: false,
    });
  });

  it("can subscribe to Jupiter Perps trades without a wallet filter for diagnostics", () => {
    const subscribe = vi.fn(() => ({ id: "sub", cancel: vi.fn() }));
    const perpsClient = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));
    const adapter = new JupiterPerpsSolstreamAdapter(perpsClient, fakeSolstreamClient(subscribe));

    adapter.subscribeWalletTrades([], vi.fn());

    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        transactions: {
          "jupiter-perps-event-authority": expect.objectContaining({
            accountInclude: ["37hJBDnntwqhGbK7L6M1bLyvccj4u55CCUiLPdYkiqBN"],
          }),
        },
      }),
      expect.any(Function),
      undefined,
    );
  });

  it("subscribes to Doves AG oracle account updates through Solstream", () => {
    const subscribe = vi.fn(() => ({ id: "sub", cancel: vi.fn() }));
    const perpsClient = new JupiterPerpsOnChainClient(new Connection("http://localhost:8899"));
    const adapter = new JupiterPerpsSolstreamAdapter(perpsClient, fakeSolstreamClient(subscribe));

    adapter.subscribeOraclePrices(vi.fn());

    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        accounts: {
          "jupiter-perps-oracles": {
            account: expect.arrayContaining([
              DOVES_ORACLE_BY_MARKET.SOL,
              DOVES_ORACLE_BY_MARKET.ETH,
              DOVES_ORACLE_BY_MARKET.BTC,
            ]),
          },
        },
        commitment: SolstreamCommitmentLevel.CONFIRMED,
      }),
      expect.any(Function),
      undefined,
    );
  });
});

function fakeSolstreamClient(subscribe = vi.fn(() => ({ id: "sub", cancel: vi.fn() }))): SolstreamClient {
  return { subscribe } as unknown as SolstreamClient;
}
