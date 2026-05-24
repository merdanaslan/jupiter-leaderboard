import { BN, BorshCoder, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { TradeMarket } from "../types";
import { IDL as dovesIdl } from "./idl/doves-idl";
import { bnToNumber, CUSTODY_BY_MARKET, publicKeyToString } from "./jupiter-perps-normalize";
import type { PricesByMarket } from "./jupiter-perps-pnl";

export const DOVES_PROGRAM_ID = "DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e";

export const DOVES_ORACLE_BY_MARKET: Record<TradeMarket, string> = {
  SOL: "39cWjvHrpHNz2SbXv6ME4NPhqBDBd4KsjUYv5JkHEAJU",
  ETH: "5URYohbPy32nxK1t3jAHVNfdWY2xTubHiFvLrE3VhXEp",
  BTC: "4HBbPx9QJdjJ7GUe6bsiJjGybvfpDhQMMPXP1UEa7VT5",
};

const CUSTODY_BY_TRADE_MARKET: Record<TradeMarket, string> = {
  SOL: CUSTODY_BY_MARKET.SOL,
  ETH: CUSTODY_BY_MARKET.ETH,
  BTC: CUSTODY_BY_MARKET.BTC,
};

export interface JupiterPerpsOraclePrice {
  market: TradeMarket;
  custody: string;
  oracleAddress: string;
  priceUsd: number;
  exponent: number;
  timestamp: number;
}

export class JupiterPerpsOracleClient {
  readonly programId = new PublicKey(DOVES_PROGRAM_ID);
  readonly coder = new BorshCoder(dovesIdl as Idl);

  constructor(readonly connection: Connection) {}

  async fetchOraclePrices(markets: TradeMarket[] = ["SOL", "ETH", "BTC"]): Promise<JupiterPerpsOraclePrice[]> {
    const uniqueMarkets = [...new Set(markets)];
    const oraclePublicKeys = uniqueMarkets.map((market) => new PublicKey(DOVES_ORACLE_BY_MARKET[market]));
    const accounts = await this.connection.getMultipleAccountsInfo(oraclePublicKeys, "confirmed");

    return accounts.map((account, index) => {
      if (!account) {
        throw new Error(`Missing Doves oracle account for ${uniqueMarkets[index]}`);
      }

      return normalizeDovesOraclePrice({
        market: uniqueMarkets[index],
        oracleAddress: oraclePublicKeys[index].toBase58(),
        decoded: this.decodePriceFeedData(account.data),
      });
    });
  }

  decodeOracleAccount(market: TradeMarket, data: Buffer | Uint8Array): JupiterPerpsOraclePrice {
    return normalizeDovesOraclePrice({
      market,
      oracleAddress: DOVES_ORACLE_BY_MARKET[market],
      decoded: this.decodePriceFeedData(data),
    });
  }

  private decodePriceFeedData(data: Buffer | Uint8Array): Record<string, unknown> {
    return this.coder.accounts.decode("priceFeed", Buffer.from(data)) as Record<string, unknown>;
  }

  async fetchPricesByMarket(markets: TradeMarket[] = ["SOL", "ETH", "BTC"]): Promise<PricesByMarket> {
    const prices = await this.fetchOraclePrices(markets);
    return Object.fromEntries(prices.map((price) => [price.market, price.priceUsd])) as PricesByMarket;
  }

  subscribeOraclePrices(
    onPrice: (price: JupiterPerpsOraclePrice, context: { slot: number }) => void,
    markets: TradeMarket[] = ["SOL", "ETH", "BTC"],
  ): number[] {
    return [...new Set(markets)].map((market) =>
      this.connection.onAccountChange(
        new PublicKey(DOVES_ORACLE_BY_MARKET[market]),
        (accountInfo, context) => {
          onPrice(
            normalizeDovesOraclePrice({
              market,
              oracleAddress: DOVES_ORACLE_BY_MARKET[market],
              decoded: this.decodePriceFeedData(accountInfo.data),
            }),
            { slot: context.slot },
          );
        },
        "confirmed",
      ),
    );
  }
}

export function normalizeDovesOraclePrice(input: {
  market: TradeMarket;
  oracleAddress: string;
  decoded: Record<string, unknown>;
}): JupiterPerpsOraclePrice {
  const exponent = Math.abs(Number(input.decoded.expo ?? 0));

  return {
    market: input.market,
    custody: CUSTODY_BY_TRADE_MARKET[input.market],
    oracleAddress: publicKeyToString(input.oracleAddress),
    priceUsd: bnToNumber(input.decoded.price, exponent),
    exponent,
    timestamp: bnToInteger(input.decoded.timestamp),
  };
}

function bnToInteger(value: unknown): number {
  if (BN.isBN(value)) return (value as BN).toNumber();
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) return Number(value.toString());
  return 0;
}
