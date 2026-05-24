import { describe, expect, it } from "vitest";
import { parseTraderConfig } from "./trader-config";

describe("parseTraderConfig", () => {
  it("parses JSON trader mappings", () => {
    const traders = parseTraderConfig(
      JSON.stringify([
        {
          id: "q-1",
          xHandle: "@alice",
          displayName: "Alice",
          walletAddress: "Wallet111111111111111111111111111111111",
          status: "active",
          mode: "qualifier",
          startingBalance: 100,
          startingEquity: 100,
        },
      ]),
    );

    expect(traders[0].xHandle).toBe("@alice");
    expect(traders[0].walletAddress).toContain("Wallet");
  });

  it("parses CSV trader mappings", () => {
    const traders = parseTraderConfig(
      [
        "id,xHandle,displayName,walletAddress,status,mode,startingBalance,startingEquity",
        "q-1,@alice,Alice,Wallet111111111111111111111111111111111,active,qualifier,100,100",
      ].join("\n"),
    );

    expect(traders).toHaveLength(1);
    expect(traders[0].mode).toBe("qualifier");
  });
});
