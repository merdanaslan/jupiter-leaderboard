import { describe, expect, it } from "vitest";
import {
  buildSdkLeaderboardRows,
  sdkRowsToTraderScores,
  type SdkWalletSnapshot,
} from "./jupiter-perps-sdk-reconstruct";
import type { TraderConfig } from "../types";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const WALLET = "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E";

const trader: TraderConfig = {
  id: "qualifier-01",
  xHandle: "@testtrader",
  displayName: "Test Trader",
  walletAddress: WALLET,
  status: "active",
  mode: "qualifier",
  startingBalance: 100,
  startingEquity: 100,
};

describe("Jupiter Perps SDK reconstruction", () => {
  it("reconstructs public leaderboard scores from SDK positions, trades, and active order diffs", () => {
    const snapshots: SdkWalletSnapshot[] = [
      {
        errors: [],
        latencyMs: 85,
        limitOrders: [],
        positions: [
          {
            asset: "SOL",
            assetMint: SOL_MINT,
            borrowFeesUsd: "0",
            closeFeesUsd: "13000",
            collateralMint: SOL_MINT,
            collateralToken: "SOL",
            collateralUsd: "9970000",
            createdTime: 1780000000,
            entryPriceUsd: "61270000",
            leverage: "2",
            liquidationPriceUsd: "31000000",
            markPriceUsd: "61800000",
            openFeesUsd: "13000",
            pnlAfterFeesPct: "0.0037",
            pnlAfterFeesUsd: "37000",
            pnlBeforeFeesPct: "0.005",
            pnlBeforeFeesUsd: "50000",
            positionPubkey: "position-1",
            side: "long",
            sizeTokenAmount: "0.3257",
            sizeUsd: "19970000",
            totalFeesUsd: "26000",
            tpslRequests: [
              {
                collateralUsdDelta: "0",
                desiredMint: SOL_MINT,
                desiredToken: "USDC",
                entirePosition: false,
                openTime: "1780000020",
                positionRequestPubkey: "tp-1",
                requestType: "tp",
                sizePercentage: "0.5",
                sizeUsd: "9985000",
                triggerPriceUsd: "63000000",
              },
            ],
            updatedTime: 1780000020,
            valueUsd: "10007000",
          },
        ],
        tradeCount: 1,
        trades: [
          {
            action: "Increase",
            baseFee: "0.013",
            borrowFee: "0",
            collateralUsdDelta: "9.97",
            createdTime: 1780000010,
            fee: "0.013",
            integratorFeeTokenAmount: null,
            integratorFeeTokenMint: null,
            liquidationFee: "0",
            mint: SOL_MINT,
            orderType: "Market",
            owner: WALLET,
            pnl: null,
            pnlPercentage: null,
            positionName: "SOL-PERP",
            positionPubkey: "position-1",
            price: "61.27",
            priceImpactFee: "0",
            priorityFeeLamports: null,
            side: "long",
            size: "19.97",
            swapFeeBps: null,
            swapFeeTokenAmount: null,
            swapFeeTokenMint: null,
            swapFeeUsd: null,
            transactionFeeLamports: null,
            txHash: "sig-open",
            updatedTime: 1780000010,
          },
        ],
        walletAddress: WALLET,
      },
    ];

    const rows = buildSdkLeaderboardRows({
      orderActivitiesByWallet: new Map(),
      recentLimit: 5,
      snapshots,
      startingEquity: 100,
      traderConfig: [trader],
    });
    const scores = sdkRowsToTraderScores(rows, [trader], "qualifier", "2026-06-07T09:00:00.000Z");

    expect(scores[0]).toMatchObject({
      id: "qualifier-01",
      xHandle: "@testtrader",
      displayName: "Test Trader",
      pnlUsd: 0.024000000000000004,
      pnlPercent: 0.024000000000000004,
      equity: 100.024,
      volume: 19.97,
      rank: 1,
    });
    expect(scores[0].walletAddress).toBe(WALLET);
    expect(scores[0].recentActivity).toMatchObject({
      type: "trade",
      action: "open",
      executionType: "market",
      market: "SOL",
      side: "long",
      notionalUsd: 19.97,
      priceUsd: 61.27,
    });
    expect(scores[0].openTrade).toMatchObject({
      market: "SOL",
      side: "long",
      sizeUsd: 19.97,
      entryPrice: 61.27,
    });
  });

  it("keeps fully closed SDK positions net of trade fees", () => {
    const snapshots: SdkWalletSnapshot[] = [
      {
        errors: [],
        latencyMs: 42,
        limitOrders: [],
        positions: [],
        tradeCount: 2,
        trades: [
          {
            action: "Increase",
            baseFee: "0.01",
            borrowFee: "0",
            collateralUsdDelta: "-10.00",
            createdTime: 1780000010,
            fee: "0.01",
            liquidationFee: "0",
            mint: SOL_MINT,
            orderType: "Market",
            owner: WALLET,
            pnl: null,
            positionName: "SOL-PERP",
            positionPubkey: "closed-position",
            price: "66.15",
            side: "long",
            size: "19.96",
            txHash: "sig-open-closed",
          },
          {
            action: "Decrease",
            baseFee: "0.02",
            borrowFee: "0",
            collateralUsdDelta: "9.97",
            createdTime: 1780000110,
            fee: "0.02",
            liquidationFee: "0",
            mint: SOL_MINT,
            orderType: "Market",
            owner: WALLET,
            pnl: "0.00",
            positionName: "SOL-PERP",
            positionPubkey: "closed-position",
            price: "66.14",
            side: "long",
            size: "19.96",
            txHash: "sig-close-closed",
          },
        ],
        walletAddress: WALLET,
      },
    ];

    const rows = buildSdkLeaderboardRows({
      orderActivitiesByWallet: new Map(),
      recentLimit: 5,
      snapshots,
      startingEquity: 100,
      traderConfig: [trader],
    });
    const scores = sdkRowsToTraderScores(rows, [trader], "qualifier", "2026-06-07T09:00:00.000Z");

    expect(rows[0]).toMatchObject({
      feesUsd: 0.03,
      grossPnlUsd: 0,
      pnlUsd: -0.03,
      realizedPnlUsd: -0.03,
    });
    expect(scores[0]).toMatchObject({
      equity: 99.97,
      pnlPercent: -0.03,
      pnlUsd: -0.03,
    });
    expect(scores[0].recentActivity).toMatchObject({
      action: "close",
      feeUsd: 0.02,
      netRealizedPnlUsd: -0.02,
      realizedPnlUsd: 0,
    });
  });

  it("includes active position fees in net PnL even when SDK pnlAfterFeesUsd is stale", () => {
    const snapshots: SdkWalletSnapshot[] = [
      {
        errors: [],
        latencyMs: 42,
        limitOrders: [],
        positions: [
          {
            asset: "SOL",
            assetMint: SOL_MINT,
            borrowFeesUsd: "0",
            closeFeesUsd: "10000",
            collateralUsd: "9980000",
            entryPriceUsd: "66050000",
            leverage: "2",
            markPriceUsd: "66050000",
            openFeesUsd: "10000",
            pnlAfterFeesUsd: "0",
            pnlBeforeFeesUsd: "0",
            positionPubkey: "active-position",
            side: "short",
            sizeUsd: "19960000",
            totalFeesUsd: "20000",
            tpslRequests: [],
            valueUsd: "9980000",
          },
        ],
        tradeCount: 1,
        trades: [
          {
            action: "Increase",
            baseFee: "0.01",
            borrowFee: "0",
            collateralUsdDelta: "-10.00",
            createdTime: 1780000010,
            fee: "0.01",
            liquidationFee: "0",
            mint: SOL_MINT,
            orderType: "Market",
            owner: WALLET,
            pnl: null,
            positionName: "SOL-PERP",
            positionPubkey: "active-position",
            price: "66.05",
            side: "short",
            size: "19.96",
            txHash: "sig-open-active",
          },
        ],
        walletAddress: WALLET,
      },
    ];

    const rows = buildSdkLeaderboardRows({
      orderActivitiesByWallet: new Map(),
      recentLimit: 5,
      snapshots,
      startingEquity: 100,
      traderConfig: [trader],
    });

    expect(rows[0]).toMatchObject({
      feesUsd: 0.02,
      grossPnlUsd: 0,
      pnlUsd: -0.02,
      unrealizedGrossPnlUsd: 0,
      unrealizedPnlUsd: -0.02,
    });
  });

  it("counts fees from closed lifecycles when an SDK position pubkey is reopened", () => {
    const snapshots: SdkWalletSnapshot[] = [
      {
        errors: [],
        latencyMs: 42,
        limitOrders: [],
        positions: [
          {
            asset: "SOL",
            assetMint: SOL_MINT,
            borrowFeesUsd: "0",
            closeFeesUsd: "10000",
            collateralUsd: "9980000",
            entryPriceUsd: "66060000",
            leverage: "2",
            markPriceUsd: "66060000",
            openFeesUsd: "10000",
            pnlAfterFeesUsd: "0",
            pnlBeforeFeesUsd: "0",
            positionPubkey: "reused-position",
            side: "short",
            sizeUsd: "19970000",
            totalFeesUsd: "20000",
            tpslRequests: [],
            valueUsd: "9980000",
          },
        ],
        tradeCount: 3,
        trades: [
          {
            action: "Increase",
            baseFee: "0.01",
            borrowFee: "0",
            collateralUsdDelta: "-10.00",
            createdTime: 1780000010,
            fee: "0.01",
            liquidationFee: "0",
            mint: SOL_MINT,
            orderType: "Market",
            owner: WALLET,
            pnl: null,
            positionName: "SOL-PERP",
            positionPubkey: "reused-position",
            price: "66.17",
            side: "short",
            size: "19.97",
            txHash: "sig-open-first",
          },
          {
            action: "Decrease",
            baseFee: "0.01",
            borrowFee: "0",
            collateralUsdDelta: "9.97",
            createdTime: 1780000110,
            fee: "0.01",
            liquidationFee: "0",
            mint: SOL_MINT,
            orderType: "Market",
            owner: WALLET,
            pnl: "0.00",
            positionName: "SOL-PERP",
            positionPubkey: "reused-position",
            price: "66.18",
            side: "short",
            size: "19.97",
            txHash: "sig-close-first",
          },
          {
            action: "Increase",
            baseFee: "0.01",
            borrowFee: "0",
            collateralUsdDelta: "-10.00",
            createdTime: 1780000210,
            fee: "0.01",
            liquidationFee: "0",
            mint: SOL_MINT,
            orderType: "Market",
            owner: WALLET,
            pnl: null,
            positionName: "SOL-PERP",
            positionPubkey: "reused-position",
            price: "66.06",
            side: "short",
            size: "19.97",
            txHash: "sig-open-second",
          },
        ],
        walletAddress: WALLET,
      },
    ];

    const rows = buildSdkLeaderboardRows({
      orderActivitiesByWallet: new Map(),
      recentLimit: 5,
      snapshots,
      startingEquity: 100,
      traderConfig: [trader],
    });

    expect(rows[0].feesUsd).toBeCloseTo(0.04);
    expect(rows[0].grossPnlUsd).toBeCloseTo(0);
    expect(rows[0].pnlUsd).toBeCloseTo(-0.04);
    expect(rows[0].realizedPnlUsd).toBeCloseTo(-0.02);
    expect(rows[0].unrealizedPnlUsd).toBeCloseTo(-0.02);
  });
});
