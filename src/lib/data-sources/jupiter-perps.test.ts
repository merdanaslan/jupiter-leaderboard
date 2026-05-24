import { describe, expect, it } from "vitest";
import {
  JupiterPerpsDataSource,
  JUPITER_PERPS_EVENT_AUTHORITY,
  JUPITER_PERPS_PROGRAM_ID,
} from "./jupiter-perps";
import type { JupiterPerpsOnChainClient } from "./jupiter-perps-client";

describe("JupiterPerpsDataSource", () => {
  it("uses the Jupiter Perps program id and on-chain source id", () => {
    const source = new JupiterPerpsDataSource({
      rpcUrl: "https://rpc.example",
      grpcUrl: "https://grpc.example",
      streamUrl: "https://stream.example",
    });

    expect(source.id).toBe("jupiter-perps");
    expect(JUPITER_PERPS_PROGRAM_ID).toBe("PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu");
    expect(JUPITER_PERPS_EVENT_AUTHORITY).toBe("37hJBDnntwqhGbK7L6M1bLyvccj4u55CCUiLPdYkiqBN");
  });

  it("describes IDL-derived account and event dependencies", () => {
    const source = new JupiterPerpsDataSource({});

    expect(source.describePlan()).toEqual(
      expect.objectContaining({
        sourceOfTruth: "on-chain-idl",
        usesJupiterPerpsApi: false,
      }),
    );
    expect(source.describePlan().accounts).toContain("Position");
    expect(source.describePlan().events).toContain("IncreasePositionEvent");
  });

  it("creates a real-data initial state without mock traders", () => {
    const source = new JupiterPerpsDataSource({});
    const state = source.getInitialState();

    expect(state.dataSource).toBe("jupiter-perps");
    expect(state.mockTraders).toHaveLength(0);
  });

  it("loads CSV trader mappings through the shared config parser", () => {
    const source = new JupiterPerpsDataSource({});
    const traders = source.loadTraderConfig(
      [
        "id,xHandle,displayName,walletAddress,status,mode,startingBalance,startingEquity",
        "q-1,@alice,Alice,11111111111111111111111111111111,active,qualifier,100,100",
      ].join("\n"),
    );

    expect(traders[0]).toEqual(
      expect.objectContaining({
        xHandle: "@alice",
        walletAddress: "11111111111111111111111111111111",
      }),
    );
  });

  it("maps IDL-derived wallet snapshots into ranked trader scores", async () => {
    const client = {
      fetchWalletSnapshots: async () => ({
        programId: JUPITER_PERPS_PROGRAM_ID,
        eventAuthority: JUPITER_PERPS_EVENT_AUTHORITY,
        fetchedSignatureCount: 2,
        parsedEventCount: 1,
        wallets: [
          {
            walletAddress: "11111111111111111111111111111111",
            positions: [],
            trades: [],
            notionalVolumeUsd: 1_750,
            realizedPnlUsd: 12.5,
            recentTrade: {
              market: "SOL" as const,
              side: "long" as const,
              notionalUsd: 250,
              pnlUsd: 4,
              timestamp: "2026-05-23T10:00:00.000Z",
            },
          },
        ],
      }),
    } as unknown as JupiterPerpsOnChainClient;
    const source = new JupiterPerpsDataSource({
      client,
      traders: [
        {
          id: "q-1",
          xHandle: "@alice",
          displayName: "Alice",
          walletAddress: "11111111111111111111111111111111",
          status: "active",
          mode: "qualifier",
          startingBalance: 100,
          startingEquity: 100,
        },
      ],
    });

    const scores = await source.getTraders("qualifier", {
      ...source.getInitialState(),
      startedAt: "2026-05-23T09:00:00.000Z",
    });

    expect(scores[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        pnlUsd: 12.5,
        pnlPercent: 12.5,
        equity: 112.5,
        volume: 1_750,
      }),
    );
  });

  it("does not silently fetch real data without an RPC-backed client", async () => {
    const source = new JupiterPerpsDataSource({
      traders: [
        {
          id: "q-1",
          xHandle: "@alice",
          displayName: "Alice",
          walletAddress: "11111111111111111111111111111111",
          status: "active",
          mode: "qualifier",
          startingBalance: 100,
          startingEquity: 100,
        },
      ],
    });

    await expect(source.getTraders("qualifier", source.getInitialState())).rejects.toThrow(
      "Missing SOLANA_RPC_URL",
    );
  });
});
