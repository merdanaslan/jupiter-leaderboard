import { PublicKey } from "@solana/web3.js";
import type { TradeMarket } from "../types";
import type { JupiterPerpsOnChainClient } from "./jupiter-perps-client";
import { JupiterPerpsSolstreamAdapter } from "./jupiter-perps-solstream";
import type { JupiterPerpsOraclePrice } from "./jupiter-perps-oracle";
import type { PricesByMarket } from "./jupiter-perps-pnl";
import {
  buildWalletSnapshot,
  type JupiterPerpsCustodyConfig,
  type JupiterPerpsOpenPosition,
  type JupiterPerpsPositionRequestEvent,
  type JupiterPerpsTradeEvent,
  type JupiterPerpsTriggerOrder,
  type JupiterPerpsWalletSnapshot,
} from "./jupiter-perps-normalize";
import type { SolstreamSubscription } from "./solstream-client";

export interface JupiterPerpsSolstreamLiveTrackerOptions {
  walletAddresses: string[];
  fromSlot?: number;
  sinceUnixSeconds?: number;
  signatureLimit?: number;
  includeClosedPositions?: boolean;
  includeOraclePrices?: boolean;
  skipInitialSnapshot?: boolean;
  continueOnInitialSnapshotError?: boolean;
  onError?: (error: Error) => void;
}

export type JupiterPerpsSolstreamLiveUpdateReason = "initial" | "trade" | "position" | "trigger-order" | "oracle";

export interface JupiterPerpsSolstreamLiveUpdate {
  reason: JupiterPerpsSolstreamLiveUpdateReason;
  receivedAt: string;
  walletAddress?: string;
  snapshot?: JupiterPerpsWalletSnapshot;
  snapshots: JupiterPerpsWalletSnapshot[];
  trade?: JupiterPerpsTradeEvent;
  position?: JupiterPerpsOpenPosition;
  triggerOrder?: JupiterPerpsTriggerOrder;
  triggerOrderPubkey?: string;
  triggerOrderRemoved?: boolean;
  positionRequestEvent?: JupiterPerpsPositionRequestEvent;
  oraclePrice?: JupiterPerpsOraclePrice;
  slot?: number;
}

interface SolstreamAdapterLike {
  subscribeWalletTrades: JupiterPerpsSolstreamAdapter["subscribeWalletTrades"];
  subscribeWalletEvents?: JupiterPerpsSolstreamAdapter["subscribeWalletEvents"];
  subscribePositionAccounts: JupiterPerpsSolstreamAdapter["subscribePositionAccounts"];
  subscribePositionRequestAccounts?: JupiterPerpsSolstreamAdapter["subscribePositionRequestAccounts"];
  subscribeOraclePrices: JupiterPerpsSolstreamAdapter["subscribeOraclePrices"];
}

export class JupiterPerpsSolstreamLiveTracker {
  private readonly walletAddresses: string[];
  private readonly positionMapsByWallet = new Map<string, Map<string, JupiterPerpsOpenPosition>>();
  private readonly tradesByWallet = new Map<string, JupiterPerpsTradeEvent[]>();
  private readonly triggerOrdersByWallet = new Map<string, JupiterPerpsTriggerOrder[]>();
  private readonly triggerOrdersUnavailableByWallet = new Map<string, boolean>();
  private readonly initialOpenVolumeByWallet = new Map<string, number>();
  private readonly oraclePricesByMarket = new Map<TradeMarket, JupiterPerpsOraclePrice>();
  private custodyConfigsByAddress = new Map<string, JupiterPerpsCustodyConfig>();
  private pricesByMarket: PricesByMarket | undefined;

  constructor(
    private readonly client: JupiterPerpsOnChainClient,
    private readonly options: JupiterPerpsSolstreamLiveTrackerOptions,
    private readonly adapter: SolstreamAdapterLike = new JupiterPerpsSolstreamAdapter(client),
  ) {
    this.walletAddresses = options.walletAddresses.map((address) => new PublicKey(address).toBase58());
    this.walletAddresses.forEach((walletAddress) => {
      this.positionMapsByWallet.set(walletAddress, new Map());
      this.tradesByWallet.set(walletAddress, []);
      this.triggerOrdersByWallet.set(walletAddress, []);
      this.triggerOrdersUnavailableByWallet.set(walletAddress, false);
    });
  }

  async start(onUpdate: (update: JupiterPerpsSolstreamLiveUpdate) => void): Promise<() => Promise<void>> {
    let initialized = false;
    const subscriptions: SolstreamSubscription[] = [];
    const handleError = (error: Error) => this.options.onError?.(error);
    const handleTradeUpdate = (update: { trade: JupiterPerpsTradeEvent; slot: number }) => {
      this.addTrade(update.trade);
      if (!initialized) return;
      onUpdate(
        this.buildUpdate({
          reason: "trade",
          walletAddress: update.trade.owner,
          trade: update.trade,
          slot: update.slot,
        }),
      );
    };
    const handlePositionRequestEventUpdate = (update: { request: JupiterPerpsPositionRequestEvent; slot: number }) => {
      if (update.request.action !== "close") return;

      const walletAddress = this.removeTriggerOrder(update.request.positionRequestKey) ?? update.request.owner;
      if (!initialized) return;
      onUpdate(
        this.buildUpdate({
          reason: "trigger-order",
          walletAddress,
          triggerOrderPubkey: update.request.positionRequestKey,
          triggerOrderRemoved: true,
          positionRequestEvent: update.request,
          slot: update.slot,
        }),
      );
    };

    if (this.adapter.subscribeWalletEvents) {
      subscriptions.push(
        this.adapter.subscribeWalletEvents(
          this.walletAddresses,
          (update) => {
            if (update.kind === "trade") {
              handleTradeUpdate(update);
              return;
            }

            handlePositionRequestEventUpdate(update);
          },
          handleError,
          { fromSlot: this.options.fromSlot },
        ),
      );
    } else {
      subscriptions.push(
        this.adapter.subscribeWalletTrades(
          this.walletAddresses,
          handleTradeUpdate,
          handleError,
          { fromSlot: this.options.fromSlot },
        ),
      );
    }

    subscriptions.push(
      this.adapter.subscribePositionAccounts(
        this.walletAddresses,
        (update) => {
          this.upsertPosition(update.position);
          if (!initialized) return;
          onUpdate(
            this.buildUpdate({
              reason: "position",
              walletAddress: update.position.owner,
              position: update.position,
              slot: update.slot,
            }),
          );
        },
        handleError,
        { fromSlot: this.options.fromSlot },
      ),
    );

    if (this.adapter.subscribePositionRequestAccounts) {
      subscriptions.push(
        this.adapter.subscribePositionRequestAccounts(
          this.walletAddresses,
          (update) => {
            const walletAddress = update.order
              ? this.upsertTriggerOrder(update.order)
              : update.removed
                ? this.removeTriggerOrder(update.pubkey)
                : undefined;
            if (!initialized) return;
            onUpdate(
              this.buildUpdate({
                reason: "trigger-order",
                walletAddress,
                triggerOrder: update.order,
                triggerOrderPubkey: update.pubkey,
                triggerOrderRemoved: update.removed,
                slot: update.slot,
              }),
            );
          },
          handleError,
          { fromSlot: this.options.fromSlot },
        ),
      );
    }

    if (this.options.includeOraclePrices !== false) {
      subscriptions.push(
        this.adapter.subscribeOraclePrices(
          (update) => {
            this.upsertOraclePrice(update.price);
            if (!initialized) return;
            onUpdate(
              this.buildUpdate({
                reason: "oracle",
                oraclePrice: update.price,
                slot: update.slot,
              }),
            );
          },
          handleError,
          { fromSlot: this.options.fromSlot },
        ),
      );
    }

    const stop = async () => {
      subscriptions.forEach((subscription) => subscription.cancel());
    };

    try {
      await this.loadInitialSnapshots();
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      if (!this.options.continueOnInitialSnapshotError) {
        await stop();
        throw normalizedError;
      }
      handleError(normalizedError);
    }

    initialized = true;
    onUpdate(this.buildUpdate({ reason: "initial" }));
    return stop;
  }

  getSnapshots(): JupiterPerpsWalletSnapshot[] {
    return this.walletAddresses.map((walletAddress) => this.buildSnapshot(walletAddress));
  }

  private async loadInitialSnapshots(): Promise<void> {
    if (this.options.skipInitialSnapshot) return;

    if (this.options.includeOraclePrices !== false) {
      const oraclePrices = await this.client.oracleClient.fetchOraclePrices(this.openMarkets());
      oraclePrices.forEach((oraclePrice) => this.upsertOraclePrice(oraclePrice));
    }
    this.custodyConfigsByAddress = await this.fetchCustodyConfigsByAddress();

    const result = await this.client.fetchWalletSnapshots({
      walletAddresses: this.walletAddresses,
      sinceUnixSeconds: this.options.sinceUnixSeconds,
      signatureLimit: this.options.signatureLimit ?? 0,
      positionRequestSignatureLimit: this.options.signatureLimit ?? 0,
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
      this.triggerOrdersByWallet.set(
        snapshot.walletAddress,
        mergeTriggerOrders(this.triggerOrdersByWallet.get(snapshot.walletAddress) ?? [], snapshot.triggerOrders ?? []),
      );
      this.triggerOrdersUnavailableByWallet.set(
        snapshot.walletAddress,
        snapshot.triggerOrdersUnavailable === true && (this.triggerOrdersByWallet.get(snapshot.walletAddress)?.length ?? 0) === 0,
      );
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

  private upsertTriggerOrder(order: JupiterPerpsTriggerOrder): string {
    const current = this.triggerOrdersByWallet.get(order.owner) ?? [];
    this.triggerOrdersByWallet.set(order.owner, mergeTriggerOrders(current, [order]));
    this.triggerOrdersUnavailableByWallet.set(order.owner, false);
    return order.owner;
  }

  private removeTriggerOrder(pubkey: string): string | undefined {
    let removedWallet: string | undefined;

    for (const [walletAddress, orders] of this.triggerOrdersByWallet.entries()) {
      const nextOrders = orders.filter((order) => order.pubkey !== pubkey);
      if (nextOrders.length === orders.length) continue;

      this.triggerOrdersByWallet.set(walletAddress, nextOrders);
      this.triggerOrdersUnavailableByWallet.set(walletAddress, false);
      removedWallet ??= walletAddress;
    }

    return removedWallet;
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
    reason: JupiterPerpsSolstreamLiveUpdateReason;
    walletAddress?: string;
    trade?: JupiterPerpsTradeEvent;
    position?: JupiterPerpsOpenPosition;
    triggerOrder?: JupiterPerpsTriggerOrder;
    triggerOrderPubkey?: string;
    triggerOrderRemoved?: boolean;
    positionRequestEvent?: JupiterPerpsPositionRequestEvent;
    oraclePrice?: JupiterPerpsOraclePrice;
    slot?: number;
  }): JupiterPerpsSolstreamLiveUpdate {
    const snapshot = input.walletAddress ? this.buildSnapshot(input.walletAddress) : undefined;

    return {
      reason: input.reason,
      receivedAt: new Date().toISOString(),
      walletAddress: input.walletAddress,
      snapshot,
      snapshots: this.getSnapshots(),
      trade: input.trade,
      position: input.position,
      triggerOrder: input.triggerOrder,
      triggerOrderPubkey: input.triggerOrderPubkey,
      triggerOrderRemoved: input.triggerOrderRemoved,
      positionRequestEvent: input.positionRequestEvent,
      oraclePrice: input.oraclePrice,
      slot: input.slot,
    };
  }

  private buildSnapshot(walletAddress: string): JupiterPerpsWalletSnapshot {
    return buildWalletSnapshot({
      walletAddress,
      positions: [...(this.positionMapsByWallet.get(walletAddress)?.values() ?? [])],
      trades: this.tradesByWallet.get(walletAddress) ?? [],
      triggerOrders: this.triggerOrdersByWallet.get(walletAddress) ?? [],
      triggerOrdersUnavailable: this.triggerOrdersUnavailableByWallet.get(walletAddress),
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

function mergeTriggerOrders(
  current: JupiterPerpsTriggerOrder[],
  next: JupiterPerpsTriggerOrder[],
): JupiterPerpsTriggerOrder[] {
  const byPubkey = new Map(current.map((order) => [order.pubkey, order]));
  for (const order of next) {
    const existing = byPubkey.get(order.pubkey);
    if (!existing || order.updateTime >= existing.updateTime) {
      byPubkey.set(order.pubkey, order);
    }
  }

  return [...byPubkey.values()].sort((a, b) => a.triggerPriceUsd - b.triggerPriceUsd || a.counter - b.counter);
}
