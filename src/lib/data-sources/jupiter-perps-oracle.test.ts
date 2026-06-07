import { BN } from "@coral-xyz/anchor";
import { describe, expect, it } from "vitest";
import {
  DOVES_AG_ORACLE_BY_MARKET,
  DOVES_ORACLE_BY_MARKET,
  DOVES_PRICE_FEED_BY_MARKET,
  DOVES_PROGRAM_ID,
  normalizeDovesOraclePrice,
} from "./jupiter-perps-oracle";
import { CUSTODY_BY_MARKET } from "./jupiter-perps-normalize";

describe("Jupiter Perps Doves oracle parser", () => {
  it("uses oracle accounts from the Jupiter Perps IDL parsing repo", () => {
    expect(DOVES_PROGRAM_ID).toBe("DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e");
    expect(DOVES_PRICE_FEED_BY_MARKET.SOL).toBe("39cWjvHrpHNz2SbXv6ME4NPhqBDBd4KsjUYv5JkHEAJU");
    expect(DOVES_PRICE_FEED_BY_MARKET.ETH).toBe("5URYohbPy32nxK1t3jAHVNfdWY2xTubHiFvLrE3VhXEp");
    expect(DOVES_PRICE_FEED_BY_MARKET.BTC).toBe("4HBbPx9QJdjJ7GUe6bsiJjGybvfpDhQMMPXP1UEa7VT5");
    expect(DOVES_AG_ORACLE_BY_MARKET.SOL).toBe("FYq2BWQ1V5P1WFBqr3qB2Kb5yHVvSv7upzKodgQE5zXh");
    expect(DOVES_AG_ORACLE_BY_MARKET.ETH).toBe("AFZnHPzy4mvVCffrVwhewHbFc93uTHvDSFrVH7GtfXF1");
    expect(DOVES_AG_ORACLE_BY_MARKET.BTC).toBe("hUqAT1KQ7eW1i6Csp9CXYtpPfSAvi835V7wKi5fRfmC");
    expect(DOVES_ORACLE_BY_MARKET).toBe(DOVES_AG_ORACLE_BY_MARKET);
  });

  it("normalizes Doves agPriceFeed account data", () => {
    const price = normalizeDovesOraclePrice({
      market: "BTC",
      oracleAddress: DOVES_ORACLE_BY_MARKET.BTC,
      decoded: {
        price: new BN("6800000000000"),
        expo: -8,
        timestamp: new BN("1716400010"),
      },
    });

    expect(price).toEqual({
      market: "BTC",
      custody: CUSTODY_BY_MARKET.BTC,
      oracleAddress: DOVES_ORACLE_BY_MARKET.BTC,
      priceUsd: 68000,
      exponent: 8,
      timestamp: 1716400010,
      source: "doves-ag",
    });
  });
});
