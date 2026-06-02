import { describe, expect, it } from "vitest";
import {
  buildTradeLifecycles,
  formatTradeLifecycleDetailsForTerminal,
  formatTriggerOrdersForTerminal,
} from "./jupiter-perps-terminal-format";

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

describe("buildTradeLifecycles", () => {
  it("groups position executions into an open lifecycle with active TP/SL orders", () => {
    const lifecycles = buildTradeLifecycles({
      walletAddress: "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E",
      positions: [
        {
          pubkey: "position-1",
          owner: "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E",
          market: "SOL",
          side: "long",
          sizeUsd: 80,
          collateralUsd: 25,
          entryPriceUsd: 84.5,
          realisedPnlUsd: 0,
          unrealizedPnlUsd: 3,
          openTime: 1,
          updateTime: 4,
        },
      ],
      trades: [
        trade({ signature: "sig-open", slot: 1, name: "IncreasePositionEvent", notionalUsd: 100, priceUsd: 84, feeUsd: 0.06 }),
        trade({ signature: "sig-add", slot: 2, name: "IncreasePositionEvent", notionalUsd: 20, priceUsd: 85, feeUsd: 0.01 }),
        trade({ signature: "sig-tp", slot: 3, name: "DecreasePositionEvent", notionalUsd: 40, priceUsd: 90, pnlUsd: 2, feeUsd: 0.02 }),
      ],
      triggerOrders: [
        {
          pubkey: "sl",
          owner: "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E",
          position: "position-1",
          market: "SOL",
          side: "long",
          kind: "SL",
          sizeUsd: 0,
          triggerPriceUsd: 77,
          triggerAboveThreshold: false,
          entirePosition: true,
          counter: 1,
          openTime: 1,
          updateTime: 4,
        },
      ],
      notionalVolumeUsd: 160,
      realizedPnlUsd: 2,
      unrealizedPnlUsd: 3,
      totalPnlUsd: 5,
    });

    expect(lifecycles).toHaveLength(1);
    expect(lifecycles[0]).toEqual(
      expect.objectContaining({
        walletAddress: "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E",
        position: "position-1",
        sequence: 1,
        status: "open",
        market: "SOL",
        side: "long",
        sizeUsd: 80,
        entryPriceUsd: 84.5,
        collateralUsd: 25,
        leverage: 3.2,
        realizedPnlUsd: 2,
        unrealizedPnlUsd: 3,
        grossPnlUsd: 5,
        netPnlUsd: 4.91,
        volumeUsd: 160,
      }),
    );
    expect(lifecycles[0].executions.map((execution) => execution.action)).toEqual(["open", "increase", "decrease"]);
    expect(lifecycles[0].triggerOrders?.[0]).toEqual(expect.objectContaining({ kind: "SL" }));
  });

  it("starts a new lifecycle when a position is fully closed and reopened", () => {
    const lifecycles = buildTradeLifecycles({
      walletAddress: "wallet",
      positions: [
        {
          pubkey: "position-1",
          owner: "wallet",
          market: "SOL",
          side: "long",
          sizeUsd: 30,
          collateralUsd: 10,
          entryPriceUsd: 82,
          realisedPnlUsd: 0,
          openTime: 4,
          updateTime: 4,
        },
      ],
      trades: [
        trade({ signature: "sig-open-1", slot: 1, name: "IncreasePositionEvent", notionalUsd: 50, priceUsd: 80, feeUsd: 0.03 }),
        trade({ signature: "sig-close-1", slot: 2, name: "DecreasePositionEvent", notionalUsd: 50, priceUsd: 81, pnlUsd: 0.5, feeUsd: 0.03 }),
        trade({ signature: "sig-open-2", slot: 3, name: "IncreasePositionEvent", notionalUsd: 30, priceUsd: 82, feeUsd: 0.02 }),
      ],
      notionalVolumeUsd: 130,
      realizedPnlUsd: 0.5,
      unrealizedPnlUsd: 0,
      totalPnlUsd: 0.5,
    });

    expect(lifecycles.map((lifecycle) => `${lifecycle.market} ${lifecycle.side} #${lifecycle.sequence} ${lifecycle.status}`)).toEqual([
      "SOL long #2 open",
      "SOL long #1 closed",
    ]);
    expect(lifecycles[1].executions.map((execution) => execution.action)).toEqual(["open", "close"]);
  });
});

describe("formatTradeLifecycleDetailsForTerminal", () => {
  it("formats grouped lifecycle details below the leaderboard", () => {
    const output = formatTradeLifecycleDetailsForTerminal(
      [
        {
          walletAddress: "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E",
          positions: [],
          trades: [
            trade({ signature: "sig-open", slot: 1, name: "IncreasePositionEvent", notionalUsd: 29.9, priceUsd: 85.26, feeUsd: 0.02 }),
            trade({ signature: "sig-close", slot: 2, name: "DecreasePositionEvent", notionalUsd: 29.9, priceUsd: 86, pnlUsd: 0.19, feeUsd: 0.02 }),
          ],
          notionalVolumeUsd: 59.8,
          realizedPnlUsd: 0.19,
          unrealizedPnlUsd: 0,
          totalPnlUsd: 0.19,
        },
      ],
      { limitPerWallet: 3 },
    );

    expect(output).toContain("Trade Details");
    expect(output).toContain("7org...mH9E");
    expect(output).toContain("SOL long #1 | closed");
    expect(output).toContain("open market size $29.90 price $85.2600 fee $0.02");
    expect(output).toContain("close market size $29.90 price $86.0000 pnl +$0.19 fee $0.02");
  });
});

function trade(input: Partial<Parameters<typeof buildTradeLifecycles>[0]["trades"][number]> & {
  signature: string;
  slot: number;
  name: string;
  notionalUsd: number;
}): Parameters<typeof buildTradeLifecycles>[0]["trades"][number] {
  return {
    signature: input.signature,
    slot: input.slot,
    blockTime: 1,
    instructionIndex: input.instructionIndex ?? 0,
    name: input.name,
    owner: input.owner ?? "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E",
    position: input.position ?? "position-1",
    market: input.market ?? "SOL",
    side: input.side ?? "long",
    notionalUsd: input.notionalUsd,
    collateralUsdDelta: input.collateralUsdDelta,
    feeUsd: input.feeUsd ?? 0,
    pnlUsd: input.pnlUsd ?? 0,
    priceUsd: input.priceUsd ?? null,
    timestamp: input.timestamp ?? `2026-05-27T10:00:0${input.slot}.000Z`,
  };
}
