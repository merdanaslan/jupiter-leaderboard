import { PublicKey } from "@solana/web3.js";
import type { TradeMarket } from "../types";
import type { JupiterPerpsOnChainClient } from "./jupiter-perps-client";
import type { JupiterPerpsOraclePrice } from "./jupiter-perps-oracle";
import type { PricesByMarket } from "./jupiter-perps-pnl";
import {
  buildWalletSnapshot,
  type JupiterPerpsCustodyConfig,
  type JupiterPerpsOpenPosition,
  type JupiterPerpsTradeEvent,
  type JupiterPerpsWalletSnapshot,
} from "./jupiter-perps-normalize";

export interface JupiterPerpsLiveTrackerOptions {
  walletAddresses: string[];
  sinceUnixSeconds?: number;
  signatureLimit?: number;
  includeClosedPositions?: boolean;
  includeOraclePrices?: boolean;
  logFilter?: "event-authority" | "program";
}

export type JupiterPerpsLiveUpdateReason = "initial" | "trade" | "position" | "oracle";

export interface JupiterPerpsLiveUpdate {
  reason: JupiterPerpsLiveUpdateReason;
  receivedAt: string;
  walletAddress?: string;
  snapshot?: JupiterPerpsWalletSnapshot;
  snapshots: JupiterPerpsWalletSnapshot[];
  trade?: JupiterPerpsTradeEvent;
  position?: JupiterPerpsOpenPosition;
  oraclePrice?: JupiterPerpsOraclePrice;
}

export class JupiterPerpsLiveTracker {
  private readonly walletAddresses: string[];
  private readonly positionMapsByWallet = new Map<string, Map<string, JupiterPerpsOpenPosition>>();
  private readonly tradesByWallet = new Map<string, JupiterPerpsTradeEvent[]>();
  private readonly initialOpenVolumeByWallet = new Map<string, number>();
  private readonly oraclePricesByMarket = new Map<TradeMarket, JupiterPerpsOraclePrice>();
  private custodyConfigsByAddress = new Map<string, JupiterPerpsCustodyConfig>();
  private pricesByMarket: PricesByMarket | undefined;

  constructor(
    private readonly client: JupiterPerpsOnChainClient,
    private readonly options: JupiterPerpsLiveTrackerOptions,
  ) {
    this.walletAddresses = options.walletAddresses.map((address) => new PublicKey(address).toBase58());
    this.walletAddresses.forEach((walletAddress) => {
      this.positionMapsByWallet.set(walletAddress, new Map());
      this.tradesByWallet.set(walletAddress, []);
    });
  }

  async start(onUpdate: (update: JupiterPerpsLiveUpdate) => void): Promise<() => Promise<void>> {
    let initialized = false;

    const tradeSubscriptionId = this.client.subscribeTradeEventsForWallets(
      this.walletAddresses,
      (trade) => {
        this.addTrade(trade);
        if (!initialized) return;
        onUpdate(
          this.buildUpdate({
            reason: "trade",
            walletAddress: trade.owner,
            trade,
          }),
        );
      },
      {
        logFilter: this.options.logFilter,
      },
    );
    const positionSubscriptionIds = this.walletAddresses.map((walletAddress) =>
      this.client.subscribePositionsForWallet(walletAddress, (position) => {
        this.upsertPosition(position);
        if (!initialized) return;
        onUpdate(
          this.buildUpdate({
            reason: "position",
            walletAddress: position.owner,
            position,
          }),
        );
      }),
    );
    const oracleSubscriptionIds = this.options.includeOraclePrices
      ? this.client.oracleClient.subscribeOraclePrices((oraclePrice) => {
          this.upsertOraclePrice(oraclePrice);
          if (!initialized) return;
          onUpdate(
            this.buildUpdate({
              reason: "oracle",
              oraclePrice,
            }),
          );
        }, this.openMarkets())
      : [];

    const stop = async () => {
      await Promise.all([
        this.client.connection.removeOnLogsListener(tradeSubscriptionId),
        ...positionSubscriptionIds.map((subscriptionId) =>
          this.client.connection.removeAccountChangeListener(subscriptionId),
        ),
        ...oracleSubscriptionIds.map((subscriptionId) =>
          this.client.connection.removeAccountChangeListener(subscriptionId),
        ),
      ]);
    };

    try {
      await this.loadInitialSnapshots();
      initialized = true;
      onUpdate(this.buildUpdate({ reason: "initial" }));
      return stop;
    } catch (error) {
      await stop();
      throw error;
    }
  }

  getSnapshots(): JupiterPerpsWalletSnapshot[] {
    return this.walletAddresses.map((walletAddress) => this.buildSnapshot(walletAddress));
  }

  private async loadInitialSnapshots(): Promise<void> {
    if (this.options.includeOraclePrices) {
      const oraclePrices = await this.client.oracleClient.fetchOraclePrices(this.openMarkets());
      oraclePrices.forEach((oraclePrice) => this.upsertOraclePrice(oraclePrice));
    }
    this.custodyConfigsByAddress = await this.fetchCustodyConfigsByAddress();

    const result = await this.client.fetchWalletSnapshots({
      walletAddresses: this.walletAddresses,
      sinceUnixSeconds: this.options.sinceUnixSeconds,
      signatureLimit: this.options.signatureLimit,
      includeClosedPositions: this.options.includeClosedPositions,
      pricesByMarket: this.pricesByMarket,
    });

    for (const snapshot of result.wallets) {
      const positions = this.positionMapsByWallet.get(snapshot.walletAddress) ?? new Map();
      for (const position of snapshot.positions) {
        const current = positions.get(position.pubkey);
        if (!current || position.updateTime >= current.updateTime) {
          positions.set(position.pubkey, position);
        }
      }
      this.positionMapsByWallet.set(snapshot.walletAddress, positions);
      this.initialOpenVolumeByWallet.set(snapshot.walletAddress, snapshot.syntheticOpenPositionVolumeUsd ?? 0);

      snapshot.trades.forEach((trade) => this.addTrade(trade));
    }
  }

  private addTrade(trade: JupiterPerpsTradeEvent): void {
    const current = this.tradesByWallet.get(trade.owner) ?? [];
    this.tradesByWallet.set(
      trade.owner,
      [trade, ...current.filter((existing) => existing.signature !== trade.signature)]
        .sort((a, b) => b.slot - a.slot || b.signature.localeCompare(a.signature)),
    );
  }

  private upsertPosition(position: JupiterPerpsOpenPosition): void {
    const positions = this.positionMapsByWallet.get(position.owner);
    if (!positions) return;

    if (!this.options.includeClosedPositions && position.sizeUsd <= 0) {
      positions.delete(position.pubkey);
      return;
    }

    positions.set(position.pubkey, position);
  }

  private upsertOraclePrice(oraclePrice: JupiterPerpsOraclePrice): void {
    const current = this.oraclePricesByMarket.get(oraclePrice.market);
    if (current && current.timestamp > oraclePrice.timestamp) return;

    this.oraclePricesByMarket.set(oraclePrice.market, oraclePrice);
    this.pricesByMarket = Object.fromEntries(
      [...this.oraclePricesByMarket.entries()].map(([market, price]) => [market, price.priceUsd]),
    ) as PricesByMarket;
  }

  private buildUpdate(input: {
    reason: JupiterPerpsLiveUpdateReason;
    walletAddress?: string;
    trade?: JupiterPerpsTradeEvent;
    position?: JupiterPerpsOpenPosition;
    oraclePrice?: JupiterPerpsOraclePrice;
  }): JupiterPerpsLiveUpdate {
    const snapshot = input.walletAddress ? this.buildSnapshot(input.walletAddress) : undefined;

    return {
      reason: input.reason,
      receivedAt: new Date().toISOString(),
      walletAddress: input.walletAddress,
      snapshot,
      snapshots: this.getSnapshots(),
      trade: input.trade,
      position: input.position,
      oraclePrice: input.oraclePrice,
    };
  }

  private buildSnapshot(walletAddress: string): JupiterPerpsWalletSnapshot {
    return buildWalletSnapshot({
      walletAddress,
      positions: [...(this.positionMapsByWallet.get(walletAddress)?.values() ?? [])],
      trades: this.tradesByWallet.get(walletAddress) ?? [],
      pricesByMarket: this.pricesByMarket,
      custodyConfigsByAddress: this.custodyConfigsByAddress,
      syntheticOpenPositionVolumeUsd: this.initialOpenVolumeByWallet.get(walletAddress),
    });
  }

  private async fetchCustodyConfigsByAddress(): Promise<Map<string, JupiterPerpsCustodyConfig>> {
    const client = this.client as JupiterPerpsOnChainClient & {
      fetchCustodyConfigsByAddress?: () => Promise<Map<string, JupiterPerpsCustodyConfig>>;
    };

    return client.fetchCustodyConfigsByAddress ? client.fetchCustodyConfigsByAddress() : new Map();
  }

  private openMarkets(): TradeMarket[] {
    const markets = new Set<TradeMarket>();
    for (const positions of this.positionMapsByWallet.values()) {
      for (const position of positions.values()) {
        if (position.market !== "UNKNOWN") markets.add(position.market);
      }
    }

    return markets.size ? [...markets] : ["SOL", "ETH", "BTC"];
  }
}
