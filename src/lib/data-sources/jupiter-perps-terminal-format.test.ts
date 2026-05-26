import { describe, expect, it } from "vitest";
import { formatTriggerOrdersForTerminal } from "./jupiter-perps-terminal-format";

describe("formatTriggerOrdersForTerminal", () => {
  it("formats full and partial TP/SL orders without merging them with position size", () => {
    expect(
      formatTriggerOrdersForTerminal([
        {
          pubkey: "sl",
          owner: "owner",
          position: "position",
          market: "SOL",
          side: "long",
          kind: "SL",
          sizeUsd: 0,
          triggerPriceUsd: 77,
          triggerAboveThreshold: false,
          entirePosition: true,
          counter: 1,
          openTime: 1,
          updateTime: 1,
        },
        {
          pubkey: "tp",
          owner: "owner",
          position: "position",
          market: "SOL",
          side: "long",
          kind: "TP",
          sizeUsd: 12.345,
          triggerPriceUsd: 100,
          triggerAboveThreshold: true,
          entirePosition: false,
          counter: 2,
          openTime: 1,
          updateTime: 1,
        },
      ]),
    ).toBe("TP $100.00 partial $12.35 | SL $77.00 full");
  });

  it("explains unavailable trigger-order state", () => {
    expect(formatTriggerOrdersForTerminal([], true)).toBe("unavailable");
  });
});
