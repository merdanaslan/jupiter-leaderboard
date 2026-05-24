import { describe, expect, it } from "vitest";
import type { JupiterPerpsOpenPosition } from "./jupiter-perps-normalize";
import {
  calculatePositionPnlUsd,
  calculateWalletUnrealizedPnlUsd,
} from "./jupiter-perps-pnl";

const basePosition: JupiterPerpsOpenPosition = {
  pubkey: "position",
  owner: "owner",
  market: "SOL",
  side: "long",
  sizeUsd: 1_000,
  collateralUsd: 200,
  entryPriceUsd: 100,
  realisedPnlUsd: 0,
  openTime: 1,
  updateTime: 1,
};

describe("Jupiter Perps PnL calculations", () => {
  it("calculates long and short mark-to-market PnL from the repo formula", () => {
    expect(calculatePositionPnlUsd(basePosition, 110)).toBe(100);
    expect(calculatePositionPnlUsd(basePosition, 90)).toBe(-100);

    expect(
      calculatePositionPnlUsd(
        {
          ...basePosition,
          side: "short",
        },
        90,
      ),
    ).toBe(100);
  });

  it("sums wallet unrealized PnL from market prices", () => {
    expect(
      calculateWalletUnrealizedPnlUsd(
        [
          basePosition,
          {
            ...basePosition,
            pubkey: "position-2",
            market: "BTC",
            side: "short",
            entryPriceUsd: 50_000,
            sizeUsd: 2_000,
          },
        ],
        {
          SOL: 110,
          BTC: 45_000,
        },
      ),
    ).toBe(300);
  });
});
