import { PublicKey } from "@solana/web3.js";
import type { JupiterPerpsOnChainClient } from "./jupiter-perps-client";
import {
  JUPITER_PERPS_EVENT_AUTHORITY,
  JUPITER_PERPS_PROGRAM_ID,
  type JupiterPerpsOpenPosition,
  type JupiterPerpsPositionRequestEvent,
  type JupiterPerpsTradeEvent,
  type JupiterPerpsTriggerOrder,
} from "./jupiter-perps-normalize";
import { DOVES_ORACLE_BY_MARKET, type JupiterPerpsOraclePrice } from "./jupiter-perps-oracle";
import {
  SolstreamClient,
  SolstreamCommitmentLevel,
  type SolstreamSubscription,
  type SolstreamUpdate,
} from "./solstream-client";

export interface JupiterPerpsSolstreamAdapterOptions {
  commitment?: SolstreamCommitmentLevel;
  fromSlot?: number;
}

export interface JupiterPerpsSolstreamPositionUpdate {
  position: JupiterPerpsOpenPosition;
  slot: number;
  isStartup: boolean;
}

export interface JupiterPerpsSolstreamTradeUpdate {
  trade: JupiterPerpsTradeEvent;
  slot: number;
}

export type JupiterPerpsSolstreamWalletEventUpdate =
  | {
      kind: "trade";
      trade: JupiterPerpsTradeEvent;
      slot: number;
    }
  | {
      kind: "position-request";
      request: JupiterPerpsPositionRequestEvent;
      slot: number;
    };

export interface JupiterPerpsSolstreamTriggerOrderUpdate {
  pubkey: string;
  order?: JupiterPerpsTriggerOrder;
  removed?: boolean;
  slot: number;
  isStartup: boolean;
}

export interface JupiterPerpsSolstreamOracleUpdate {
  price: JupiterPerpsOraclePrice;
  slot: number;
  isStartup: boolean;
}

export class JupiterPerpsSolstreamAdapter {
  constructor(
    private readonly perpsClient: JupiterPerpsOnChainClient,
    private readonly solstreamClient = SolstreamClient.fromEnv(),
  ) {}

  derivePositionAccountAddresses(walletAddresses: string[]): string[] {
    const addresses = new Set<string>();
    for (const walletAddress of walletAddresses.map((address) => new PublicKey(address).toBase58())) {
      for (const candidate of this.perpsClient.deriveCompetitionPositionAddressesForWallet(walletAddress)) {
        addresses.add(candidate.pubkey.toBase58());
      }
    }

    return [...addresses].sort();
  }

  subscribePositionAccounts(
    walletAddresses: string[],
    onPosition: (update: JupiterPerpsSolstreamPositionUpdate) => void,
    onError?: (error: Error) => void,
    options: JupiterPerpsSolstreamAdapterOptions = {},
  ): SolstreamSubscription {
    const walletSet = new Set(walletAddresses.map((address) => new PublicKey(address).toBase58()));
    const positionAccounts = this.derivePositionAccountAddresses(walletAddresses);
    if (positionAccounts.length === 0) {
      throw new Error("No Jupiter Perps position accounts could be derived for the requested wallets");
    }

    return this.solstreamClient.subscribe(
      {
        accounts: {
          "jupiter-perps-positions": {
            account: positionAccounts,
          },
        },
        commitment: options.commitment ?? SolstreamCommitmentLevel.CONFIRMED,
        fromSlot: options.fromSlot,
      },
      (update) => {
        if (update.kind !== "account") return;
        if (update.data.owner !== JUPITER_PERPS_PROGRAM_ID) return;

        const position = this.perpsClient.decodePositionAccount(update.data.pubkey, update.data.data);
        if (!walletSet.has(position.owner)) return;

        onPosition({
          position,
          slot: update.data.slot,
          isStartup: update.data.isStartup,
        });
      },
      onError,
    );
  }

  subscribeWalletTrades(
    walletAddresses: string[],
    onTrade: (update: JupiterPerpsSolstreamTradeUpdate) => void,
    onError?: (error: Error) => void,
    options: JupiterPerpsSolstreamAdapterOptions = {},
  ): SolstreamSubscription {
    return this.subscribeWalletEvents(
      walletAddresses,
      (update) => {
        if (update.kind !== "trade") return;
        onTrade({
          trade: update.trade,
          slot: update.slot,
        });
      },
      onError,
      options,
    );
  }

  subscribeWalletEvents(
    walletAddresses: string[],
    onEvent: (update: JupiterPerpsSolstreamWalletEventUpdate) => void,
    onError?: (error: Error) => void,
    options: JupiterPerpsSolstreamAdapterOptions = {},
  ): SolstreamSubscription {
    const walletSet = walletAddresses.length
      ? new Set(walletAddresses.map((address) => new PublicKey(address).toBase58()))
      : null;

    return this.solstreamClient.subscribe(
      {
        transactions: buildTradeTransactionFilters(),
        commitment: options.commitment ?? SolstreamCommitmentLevel.CONFIRMED,
        fromSlot: options.fromSlot,
      },
      (update) => {
        if (update.kind !== "transaction" || !update.data.success) return;

        for (const event of this.perpsClient.decodeWalletEventsFromTransactionLike(update.data)) {
          const owner = event.kind === "trade" ? event.trade.owner : event.request.owner;
          if (walletSet && !walletSet.has(owner)) continue;
          onEvent({ ...event, slot: update.data.slot });
        }
      },
      onError,
    );
  }

  subscribePositionRequestAccounts(
    walletAddresses: string[],
    onOrder: (update: JupiterPerpsSolstreamTriggerOrderUpdate) => void,
    onError?: (error: Error) => void,
    options: JupiterPerpsSolstreamAdapterOptions = {},
  ): SolstreamSubscription {
    const normalizedWallets = walletAddresses.map((address) => new PublicKey(address).toBase58());
    if (normalizedWallets.length === 0) {
      throw new Error("No wallets were provided for PositionRequest account subscriptions");
    }

    return this.solstreamClient.subscribe(
      {
        accounts: Object.fromEntries(
          normalizedWallets.map((walletAddress) => [
            `jupiter-perps-position-requests-${walletAddress}`,
            {
              owner: [JUPITER_PERPS_PROGRAM_ID],
              filters: this.perpsClient.positionRequestFilters(walletAddress).map((filter) => {
                if ("dataSize" in filter) {
                  return { datasize: filter.dataSize };
                }

                return {
                  memcmp: {
                    offset: filter.memcmp.offset,
                    base58: filter.memcmp.bytes,
                  },
                };
              }),
            },
          ]),
        ),
        commitment: options.commitment ?? SolstreamCommitmentLevel.CONFIRMED,
        fromSlot: options.fromSlot,
      },
      (update) => {
        if (update.kind !== "account") return;
        const baseUpdate = {
          pubkey: update.data.pubkey,
          slot: update.data.slot,
          isStartup: update.data.isStartup,
        };

        if (
          update.data.owner !== JUPITER_PERPS_PROGRAM_ID ||
          update.data.lamports === BigInt(0) ||
          update.data.data.length === 0
        ) {
          onOrder({
            ...baseUpdate,
            removed: true,
          });
          return;
        }

        try {
          const order = this.perpsClient.decodePositionRequestAccount(update.data.pubkey, update.data.data);

          onOrder({
            ...baseUpdate,
            order: order ?? undefined,
            removed: !order,
          });
        } catch (error) {
          onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      },
      onError,
    );
  }

  subscribeSlots(
    onSlot: (slot: number) => void,
    onError?: (error: Error) => void,
    options: JupiterPerpsSolstreamAdapterOptions = {},
  ): SolstreamSubscription {
    return this.solstreamClient.subscribe(
      {
        slots: {
          "confirmed-slots": {
            filterByCommitment: true,
          },
        },
        commitment: options.commitment ?? SolstreamCommitmentLevel.CONFIRMED,
        fromSlot: options.fromSlot,
      },
      (update: SolstreamUpdate) => {
        if (update.kind === "slot") onSlot(update.data.slot);
      },
      onError,
    );
  }

  subscribeOraclePrices(
    onPrice: (update: JupiterPerpsSolstreamOracleUpdate) => void,
    onError?: (error: Error) => void,
    options: JupiterPerpsSolstreamAdapterOptions = {},
  ): SolstreamSubscription {
    const marketByOracleAddress = new Map(
      Object.entries(DOVES_ORACLE_BY_MARKET).map(([market, address]) => [
        new PublicKey(address).toBase58(),
        market as keyof typeof DOVES_ORACLE_BY_MARKET,
      ]),
    );

    return this.solstreamClient.subscribe(
      {
        accounts: {
          "jupiter-perps-oracles": {
            account: [...marketByOracleAddress.keys()],
          },
        },
        commitment: options.commitment ?? SolstreamCommitmentLevel.CONFIRMED,
        fromSlot: options.fromSlot,
      },
      (update) => {
        if (update.kind !== "account") return;
        const market = marketByOracleAddress.get(update.data.pubkey);
        if (!market) return;

        onPrice({
          price: this.perpsClient.oracleClient.decodeOracleAccount(market, update.data.data),
          slot: update.data.slot,
          isStartup: update.data.isStartup,
        });
      },
      onError,
    );
  }
}

function buildTradeTransactionFilters() {
  return {
    "jupiter-perps-event-authority": {
      vote: false,
      failed: false,
      accountInclude: [JUPITER_PERPS_EVENT_AUTHORITY],
    },
  };
}
