import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  bnToNumber,
  buildWalletSnapshot,
  CUSTODY_BY_MARKET,
  normalizeOpenPosition,
  normalizeTradeEvent,
} from "./jupiter-perps-normalize";

const owner = new PublicKey("11111111111111111111111111111111");
const position = new PublicKey("Stake11111111111111111111111111111111111111");

describe("Jupiter Perps IDL normalizers", () => {
  it("converts BN dollar fields using USDC precision", () => {
    expect(bnToNumber(new BN("123456789"))).toBe(123.456789);
  });

  it("normalizes open Position accounts", () => {
    const normalized = normalizeOpenPosition(position.toBase58(), {
      owner,
      custody: new PublicKey(CUSTODY_BY_MARKET.SOL),
      side: { long: {} },
      sizeUsd: new BN("2500000000"),
      collateralUsd: new BN("500000000"),
      price: new BN("175000000"),
      realisedPnlUsd: new BN("12000000"),
      openTime: new BN("1716400000"),
      updateTime: new BN("1716400060"),
    });

    expect(normalized).toEqual(
      expect.objectContaining({
        owner: owner.toBase58(),
        market: "SOL",
        side: "long",
        sizeUsd: 2500,
        collateralUsd: 500,
        entryPriceUsd: 175,
        realisedPnlUsd: 12,
        openTime: 1716400000,
      }),
    );
  });

  it("normalizes trade events and signed realized PnL", () => {
    const decrease = normalizeTradeEvent({
      name: "DecreasePositionEvent",
      signature: "sig",
      slot: 123,
      blockTime: 1716400010,
      instructionIndex: 0,
      data: {
        owner,
        positionKey: position,
        positionCustody: new PublicKey(CUSTODY_BY_MARKET.BTC),
        positionSide: 2,
        sizeUsdDelta: new BN("1500000000"),
        feeUsd: new BN("2000000"),
        pnlDelta: new BN("750000"),
        hasProfit: false,
        price: new BN("68000000000"),
      },
    });

    expect(decrease).toEqual(
      expect.objectContaining({
        owner: owner.toBase58(),
        position: position.toBase58(),
        market: "BTC",
        side: "short",
        notionalUsd: 1500,
        feeUsd: 2,
        pnlUsd: -0.75,
        priceUsd: 68000,
      }),
    );
  });

  it("uses transaction block time as the trade timestamp when an event also includes position open time", () => {
    const trade = normalizeTradeEvent({
      name: "IncreasePositionEvent",
      signature: "sig",
      slot: 123,
      blockTime: 1716400010,
      instructionIndex: 0,
      data: {
        owner,
        positionKey: position,
        positionCustody: new PublicKey(CUSTODY_BY_MARKET.SOL),
        positionSide: 1,
        sizeUsdDelta: new BN("1000000"),
        feeUsd: new BN("0"),
        openTime: new BN("1716300000"),
      },
    });

    expect(trade?.timestamp).toBe("2024-05-22T17:46:50.000Z");
  });

  it("builds a wallet snapshot with round volume, realized PnL, and display trade hints", () => {
    const trades = [
      {
        name: "DecreasePositionEvent",
        signature: "sig-2",
        slot: 2,
        blockTime: 1716400020,
        owner: owner.toBase58(),
        position: position.toBase58(),
        market: "ETH" as const,
        side: "long" as const,
        notionalUsd: 200,
        feeUsd: 1,
        pnlUsd: 7,
        priceUsd: 3400,
        timestamp: "2024-05-22T18:00:20.000Z",
      },
      {
        name: "IncreasePositionEvent",
        signature: "sig-1",
        slot: 1,
        blockTime: 1716400010,
        owner: owner.toBase58(),
        position: position.toBase58(),
        market: "SOL" as const,
        side: "short" as const,
        notionalUsd: 150,
        feeUsd: 0.5,
        pnlUsd: 0,
        priceUsd: 175,
        timestamp: "2024-05-22T18:00:10.000Z",
      },
    ];
    const positions = [
      {
        pubkey: position.toBase58(),
        owner: owner.toBase58(),
        market: "SOL" as const,
        side: "short" as const,
        sizeUsd: 150,
        collateralUsd: 40,
        entryPriceUsd: 175,
        realisedPnlUsd: 0,
        openTime: 1716400010,
        updateTime: 1716400020,
      },
    ];

    const snapshot = buildWalletSnapshot({
      walletAddress: owner.toBase58(),
      positions,
      trades,
    });

    expect(snapshot.notionalVolumeUsd).toBe(350);
    expect(snapshot.realizedPnlUsd).toBe(7);
    expect(snapshot.unrealizedPnlUsd).toBe(0);
    expect(snapshot.totalPnlUsd).toBe(7);
    expect(snapshot.recentTrade?.market).toBe("ETH");
    expect(snapshot.openTrade?.market).toBe("SOL");
  });

  it("includes mark-to-market open position PnL when oracle prices are supplied", () => {
    const snapshot = buildWalletSnapshot({
      walletAddress: owner.toBase58(),
      trades: [],
      positions: [
        {
          pubkey: position.toBase58(),
          owner: owner.toBase58(),
          market: "SOL",
          side: "long",
          sizeUsd: 1_000,
          collateralUsd: 200,
          entryPriceUsd: 100,
          realisedPnlUsd: 0,
          openTime: 1716400010,
          updateTime: 1716400020,
        },
      ],
      pricesByMarket: {
        SOL: 110,
      },
    });

    expect(snapshot.unrealizedPnlUsd).toBe(100);
    expect(snapshot.totalPnlUsd).toBe(100);
  });
});
