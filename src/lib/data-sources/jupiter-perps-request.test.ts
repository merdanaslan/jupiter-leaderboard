import { describe, expect, it } from "vitest";
import {
  normalizeSolanaPublicKeys,
  parseWalletAddressList,
  sseMessage,
} from "./jupiter-perps-request";

describe("Jupiter Perps operator request helpers", () => {
  it("parses comma, whitespace, and repeated wallet address inputs", () => {
    expect(
      parseWalletAddressList({
        repeated: ["11111111111111111111111111111111"],
        combined: "Stake11111111111111111111111111111111111111\nSysvarC1ock11111111111111111111111111111111",
      }),
    ).toEqual([
      "11111111111111111111111111111111",
      "Stake11111111111111111111111111111111111111",
      "SysvarC1ock11111111111111111111111111111111",
    ]);
  });

  it("normalizes Solana public keys and rejects invalid addresses", () => {
    expect(normalizeSolanaPublicKeys(["11111111111111111111111111111111"])).toEqual([
      "11111111111111111111111111111111",
    ]);
    expect(() => normalizeSolanaPublicKeys(["not-a-wallet"])).toThrow();
  });

  it("formats server-sent event messages", () => {
    expect(sseMessage("ready", { walletCount: 2 })).toBe(
      'event: ready\ndata: {"walletCount":2}\n\n',
    );
  });
});
