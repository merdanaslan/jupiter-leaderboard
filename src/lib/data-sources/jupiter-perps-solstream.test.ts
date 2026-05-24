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

  it("subscribes to Doves oracle account updates through Solstream", () => {
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
