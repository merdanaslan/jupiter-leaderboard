import { describe, expect, it } from "vitest";
import {
  diffSdkOrderActivities,
  formatSdkActiveOrderSummary,
  mergeSdkOrderActivityHistory,
  type SdkActiveOrderSnapshot,
} from "./jupiter-perps-sdk-activity";

const SOL_MINT = "So11111111111111111111111111111111111111112";

describe("diffSdkOrderActivities", () => {
  it("does not synthesize place activity for the first observed snapshot", () => {
    const current = snapshot([
      {
        positionRequestPubkey: "tp-1",
        type: "tp",
        market: "SOL",
        side: "short",
        triggerPriceUsd: 61.43,
        sizeUsd: 10.73,
        entirePosition: false,
      },
    ]);

    expect(diffSdkOrderActivities(undefined, current)).toEqual([]);
  });

  it("synthesizes TP/SL place and cancel activity from active request changes", () => {
    const previous = snapshot();
    const withOrders = snapshot([
      {
        positionRequestPubkey: "tp-1",
        type: "tp",
        market: "SOL",
        side: "short",
        triggerPriceUsd: 61.43,
        sizeUsd: 10.73,
        entirePosition: false,
      },
      {
        positionRequestPubkey: "sl-1",
        type: "sl",
        market: "SOL",
        side: "short",
        triggerPriceUsd: 64,
        sizeUsd: 0,
        entirePosition: true,
      },
    ]);

    expect(diffSdkOrderActivities(previous, withOrders)).toEqual([
      expect.objectContaining({
        action: "place",
        orderKind: "TP",
        summary: "place TP SOL short $61.43 $10.73",
      }),
      expect.objectContaining({
        action: "place",
        orderKind: "SL",
        summary: "place SL SOL short $64.00 full",
      }),
    ]);

    expect(diffSdkOrderActivities(withOrders, previous)).toEqual([
      expect.objectContaining({
        action: "cancel",
        orderKind: "TP",
        summary: "cancel TP SOL short $61.43 $10.73",
      }),
      expect.objectContaining({
        action: "cancel",
        orderKind: "SL",
        summary: "cancel SL SOL short $64.00 full",
      }),
    ]);
  });

  it("synthesizes limit order place and cancel activity from active limit order changes", () => {
    const previous = snapshot();
    const withLimit = snapshot([], [
      {
        positionRequestPubkey: "limit-1",
        marketMint: SOL_MINT,
        side: "long",
        triggerPrice: "62360000",
        sizeUsdDelta: "21170000",
      },
    ]);

    expect(diffSdkOrderActivities(previous, withLimit)).toEqual([
      expect.objectContaining({
        action: "place",
        orderKind: "LIMIT",
        summary: "place LIMIT SOL long $62.36 $21.17",
      }),
    ]);
    expect(diffSdkOrderActivities(withLimit, previous)).toEqual([
      expect.objectContaining({
        action: "cancel",
        orderKind: "LIMIT",
        summary: "cancel LIMIT SOL long $62.36 $21.17",
      }),
    ]);
  });

  it("keeps synthetic order activity in recent history across later unchanged polls", () => {
    const previous = snapshot();
    const withStopLoss = snapshot([
      {
        positionRequestPubkey: "sl-1",
        type: "sl",
        market: "SOL",
        side: "short",
        triggerPriceUsd: 62,
        sizeUsd: 0,
        entirePosition: true,
      },
    ]);

    const placed = diffSdkOrderActivities(previous, withStopLoss, 100);
    const history = mergeSdkOrderActivityHistory([], placed, 8);
    const unchangedPoll = diffSdkOrderActivities(withStopLoss, withStopLoss, 105);

    expect(unchangedPoll).toEqual([]);
    expect(mergeSdkOrderActivityHistory(history, unchangedPoll, 8)).toEqual([
      expect.objectContaining({
        action: "place",
        orderKind: "SL",
        summary: "place SL SOL short $62.00 full",
      }),
    ]);
  });
});

describe("formatSdkActiveOrderSummary", () => {
  it("formats active TP/SL and limit order details", () => {
    expect(
      formatSdkActiveOrderSummary(
        snapshot(
          [
            {
              positionRequestPubkey: "sl-1",
              type: "sl",
              market: "SOL",
              side: "short",
              triggerPriceUsd: 64,
              sizeUsd: 0,
              entirePosition: true,
            },
          ],
          [
            {
              positionRequestPubkey: "limit-1",
              marketMint: SOL_MINT,
              side: "long",
              triggerPrice: "62.36",
              sizeUsdDelta: "21.17",
            },
          ],
        ),
      ),
    ).toBe("SL $64.00 full | LMT SOL long $62.36 $21.17");
  });
});

function snapshot(
  tpslRequests: SdkActiveOrderSnapshot["tpslRequests"] = [],
  limitOrders: SdkActiveOrderSnapshot["limitOrders"] = [],
): SdkActiveOrderSnapshot {
  return {
    limitOrders,
    tpslRequests,
    walletAddress: "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E",
  };
}
