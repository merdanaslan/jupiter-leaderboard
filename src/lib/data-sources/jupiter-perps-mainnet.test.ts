import { Connection } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { JupiterPerpsOnChainClient } from "./jupiter-perps-client";

const runMainnetTests = process.env.RUN_MAINNET_TESTS === "1" && Boolean(process.env.SOLANA_RPC_URL);

describe.skipIf(!runMainnetTests)("Jupiter Perps mainnet IDL parser", () => {
  it("decodes recent event-authority trade events from mainnet", async () => {
    const client = new JupiterPerpsOnChainClient(
      new Connection(process.env.SOLANA_RPC_URL as string, {
        commitment: "confirmed",
      }),
    );

    const signatureLimit = Number(process.env.JUPITER_MAINNET_SIGNATURE_LIMIT ?? 25);
    const result = await client.fetchRecentTradeEvents({ signatureLimit });

    expect(result.signatures.length).toBeGreaterThan(0);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events[0]).toEqual(
      expect.objectContaining({
        owner: expect.any(String),
        position: expect.any(String),
        signature: expect.any(String),
        notionalUsd: expect.any(Number),
      }),
    );
  }, 60_000);
});
