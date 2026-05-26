import { BorshCoder, DISCRIMINATOR_SIZE, type Idl, utils } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  type Commitment,
  type GetProgramAccountsFilter,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
import type { TradeMarket, TradeSide } from "../types";
import idlJson from "./idl/jupiter-perpetuals-idl.json";
import { JupiterPerpsOracleClient } from "./jupiter-perps-oracle";
import type { PricesByMarket } from "./jupiter-perps-pnl";
import {
  CUSTODY_BY_MARKET,
  buildWalletSnapshot,
  JUPITER_PERPS_EVENT_AUTHORITY,
  JLP_POOL_ACCOUNT,
  JUPITER_PERPS_PROGRAM_ID,
  normalizeCustodyConfig,
  normalizeOpenPosition,
  normalizePositionRequest,
  normalizePositionRequestEvent,
  normalizeTradeEvent,
  publicKeyToString,
  type JupiterPerpsCustodyConfig,
  type DecodedPerpsEvent,
  type JupiterPerpsOpenPosition,
  type JupiterPerpsPositionRequestEvent,
  type JupiterPerpsTradeEvent,
  type JupiterPerpsTriggerOrder,
  type JupiterPerpsWalletSnapshot,
} from "./jupiter-perps-normalize";

type CustodyKey = keyof typeof CUSTODY_BY_MARKET;
type PositionSide = Extract<TradeSide, "long" | "short">;

const COMPETITION_MARKETS = ["SOL", "ETH", "BTC"] as const satisfies readonly TradeMarket[];
const POSITION_COLLATERALS = ["SOL", "ETH", "BTC", "USDC", "USDT"] as const satisfies readonly CustodyKey[];
const POSITION_SIDES = ["long", "short"] as const satisfies readonly PositionSide[];
const POSITION_REQUEST_ACCOUNT_SIZE = 312;
const DEFAULT_POSITION_REQUEST_SIGNATURE_LIMIT = 50;
const DEFAULT_HISTORY_RPC_URL = "https://solana-rpc.publicnode.com";

export interface FetchPerpsWalletInput {
  walletAddresses: string[];
  sinceUnixSeconds?: number;
  signatureLimit?: number;
  positionRequestSignatureLimit?: number;
  includeClosedPositions?: boolean;
  includeOraclePrices?: boolean;
  pricesByMarket?: PricesByMarket;
}

export interface FetchPerpsTradeEventsInput {
  walletAddresses?: string[];
  sinceUnixSeconds?: number;
  signatureLimit?: number;
}

export interface JupiterPerpsPositionAddressCandidate {
  pubkey: PublicKey;
  market: TradeMarket;
  collateral: CustodyKey;
  side: PositionSide;
}

export interface FetchPerpsTradeEventsResult {
  signatures: string[];
  events: JupiterPerpsTradeEvent[];
}

export interface FetchPerpsTradeEventsForSignaturesInput {
  signatures: string[];
  walletAddresses?: string[];
}

export interface JupiterPerpsTransactionLike {
  signature: string;
  slot: number;
  blockTime?: number | null;
  innerInstructions: {
    instructions: {
      instruction?: {
        data: Uint8Array;
      };
      data?: Uint8Array;
    }[];
  }[];
}

export type JupiterPerpsDecodedWalletEvent =
  | { kind: "trade"; trade: JupiterPerpsTradeEvent }
  | { kind: "position-request"; request: JupiterPerpsPositionRequestEvent };

export interface FetchPerpsWalletResult {
  programId: string;
  eventAuthority: string;
  wallets: JupiterPerpsWalletSnapshot[];
  fetchedSignatureCount: number;
  parsedEventCount: number;
}

export class JupiterPerpsOnChainClient {
  readonly programId: PublicKey;
  readonly eventAuthority: PublicKey;
  readonly pool: PublicKey;
  readonly coder: BorshCoder;
  readonly oracleClient: JupiterPerpsOracleClient;
  readonly historyConnection: Connection;

  constructor(
    readonly connection: Connection,
    options: {
      programId?: string;
      eventAuthority?: string;
      idl?: Idl;
      historyConnection?: Connection;
    } = {},
  ) {
    this.programId = new PublicKey(options.programId ?? JUPITER_PERPS_PROGRAM_ID);
    this.eventAuthority = new PublicKey(options.eventAuthority ?? JUPITER_PERPS_EVENT_AUTHORITY);
    this.pool = new PublicKey(JLP_POOL_ACCOUNT);
    this.coder = new BorshCoder((options.idl ?? idlJson) as Idl);
    this.oracleClient = new JupiterPerpsOracleClient(connection);
    this.historyConnection = options.historyConnection ?? connection;
  }

  positionFilters(walletAddress: string): GetProgramAccountsFilter[] {
    return [
      {
        memcmp: {
          bytes: new PublicKey(walletAddress).toBase58(),
          offset: 8,
        },
      },
      {
        memcmp: this.coder.accounts.memcmp("position"),
      },
    ];
  }

  positionRequestFilters(walletAddress: string): GetProgramAccountsFilter[] {
    return [
      {
        dataSize: POSITION_REQUEST_ACCOUNT_SIZE,
      },
      {
        memcmp: {
          bytes: new PublicKey(walletAddress).toBase58(),
          offset: 8,
        },
      },
      {
        memcmp: this.coder.accounts.memcmp("PositionRequest"),
      },
    ];
  }

  async fetchOpenPositionsForWallet(
    walletAddress: string,
    options: { includeClosedPositions?: boolean } = {},
  ): Promise<JupiterPerpsOpenPosition[]> {
    return this.fetchDerivedPositionsForWallet(walletAddress, options);
  }

  async fetchOpenTriggerOrdersForWallet(walletAddress: string): Promise<JupiterPerpsTriggerOrder[]> {
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      commitment: "confirmed",
      filters: this.positionRequestFilters(walletAddress),
    });

    return accounts
      .map(({ pubkey, account }) => this.decodePositionRequestAccount(pubkey.toBase58(), account.data))
      .filter((order): order is JupiterPerpsTriggerOrder => Boolean(order))
      .sort((a, b) => a.triggerPriceUsd - b.triggerPriceUsd || a.counter - b.counter);
  }

  async fetchOpenTriggerOrdersForWalletByRecentEvents(
    walletAddress: string,
    options: {
      signatureLimit?: number;
      sinceUnixSeconds?: number;
    } = {},
  ): Promise<JupiterPerpsTriggerOrder[]> {
    const requestKeys = await this.fetchRecentPositionRequestKeysForWallet(walletAddress, options);
    if (requestKeys.length === 0) return [];

    const accounts = await this.fetchMultipleAccounts(
      requestKeys.map((key) => new PublicKey(key)),
      this.connection,
    );

    return accounts
      .map((account, index) => {
        if (!account || !account.owner.equals(this.programId)) return null;
        return this.decodePositionRequestAccount(requestKeys[index], account.data);
      })
      .filter((order): order is JupiterPerpsTriggerOrder => Boolean(order))
      .sort((a, b) => a.triggerPriceUsd - b.triggerPriceUsd || a.counter - b.counter);
  }

  async fetchRecentPositionRequestKeysForWallet(
    walletAddress: string,
    options: {
      signatureLimit?: number;
      sinceUnixSeconds?: number;
    } = {},
  ): Promise<string[]> {
    const normalizedWallet = new PublicKey(walletAddress).toBase58();
    const signatureLimit = options.signatureLimit ?? DEFAULT_POSITION_REQUEST_SIGNATURE_LIMIT;
    if (signatureLimit === 0) return [];

    const signatures = await this.fetchSignaturesForAddress(
      new PublicKey(normalizedWallet),
      {
        sinceUnixSeconds: options.sinceUnixSeconds,
        limit: signatureLimit,
      },
      this.historyConnection,
    );
    const transactions = await this.fetchTransactions(signatures, this.historyConnection);
    const requestKeys = new Set<string>();

    transactions.forEach((tx, index) => {
      if (!tx) return;
      for (const event of this.decodeEventsFromTransaction(tx, signatures[index])
        .map((decodedEvent) => normalizePositionRequestEvent(decodedEvent))
        .filter((requestEvent): requestEvent is JupiterPerpsPositionRequestEvent => Boolean(requestEvent))) {
        if (event.owner !== normalizedWallet) continue;

        const requestKey = publicKeyToString(event.positionRequestKey);
        if (requestKey) requestKeys.add(requestKey);
      }
    });

    return [...requestKeys];
  }

  derivePositionAddress(input: {
    walletAddress: string | PublicKey;
    custody: string | PublicKey;
    collateralCustody: string | PublicKey;
    side: PositionSide;
  }): PublicKey {
    const walletAddress = new PublicKey(input.walletAddress);
    const custody = new PublicKey(input.custody);
    const collateralCustody = new PublicKey(input.collateralCustody);
    const [position] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        walletAddress.toBuffer(),
        this.pool.toBuffer(),
        custody.toBuffer(),
        collateralCustody.toBuffer(),
        Buffer.from(input.side === "long" ? [1] : [2]),
      ],
      this.programId,
    );

    return position;
  }

  deriveCompetitionPositionAddressesForWallet(walletAddress: string): JupiterPerpsPositionAddressCandidate[] {
    const candidates: JupiterPerpsPositionAddressCandidate[] = [];

    for (const market of COMPETITION_MARKETS) {
      for (const collateral of POSITION_COLLATERALS) {
        for (const side of POSITION_SIDES) {
          try {
            candidates.push({
              pubkey: this.derivePositionAddress({
                walletAddress,
                custody: CUSTODY_BY_MARKET[market],
                collateralCustody: CUSTODY_BY_MARKET[collateral],
                side,
              }),
              market,
              collateral,
              side,
            });
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes("viable program address nonce")) {
              throw error;
            }
          }
        }
      }
    }

    return candidates;
  }

  async fetchDerivedPositionsForWallet(
    walletAddress: string,
    options: { includeClosedPositions?: boolean } = {},
  ): Promise<JupiterPerpsOpenPosition[]> {
    const candidates = this.deriveCompetitionPositionAddressesForWallet(walletAddress);
    const accounts = await this.fetchMultipleAccounts(candidates.map((candidate) => candidate.pubkey));

    return accounts
      .map((account, index) => {
        if (!account || !account.owner.equals(this.programId)) return null;
        return this.decodePositionAccount(candidates[index].pubkey.toBase58(), account.data);
      })
      .filter((position): position is JupiterPerpsOpenPosition => Boolean(position))
      .filter((position) => options.includeClosedPositions || position.sizeUsd > 0)
      .sort((a, b) => b.sizeUsd - a.sizeUsd);
  }

  async fetchProgramAccountPositionsForWallet(
    walletAddress: string,
    options: { includeClosedPositions?: boolean } = {},
  ): Promise<JupiterPerpsOpenPosition[]> {
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      commitment: "confirmed",
      filters: this.positionFilters(walletAddress),
    });

    return accounts
      .map(({ pubkey, account }) =>
        this.decodePositionAccount(pubkey.toBase58(), account.data),
      )
      .filter((position) => options.includeClosedPositions || position.sizeUsd > 0)
      .sort((a, b) => b.sizeUsd - a.sizeUsd);
  }

  subscribePositionsForWallet(
    walletAddress: string,
    onPosition: (position: JupiterPerpsOpenPosition, context: { slot: number }) => void,
  ): number {
    return this.connection.onProgramAccountChange(
      this.programId,
      ({ accountId, accountInfo }, context) => {
        onPosition(this.decodePositionAccount(accountId.toBase58(), accountInfo.data), { slot: context.slot });
      },
      {
        commitment: "confirmed",
        filters: this.positionFilters(walletAddress),
      },
    );
  }

  subscribeTradeEventsForWallets(
    walletAddresses: string[],
    onTrade: (trade: JupiterPerpsTradeEvent, context: { slot: number; signature: string }) => void,
    options: {
      commitment?: Commitment;
      logFilter?: "event-authority" | "program";
      onError?: (error: unknown) => void;
    } = {},
  ): number {
    const walletSet = new Set(walletAddresses.map((address) => new PublicKey(address).toBase58()));
    const seenSignatures = new Set<string>();
    const filter = options.logFilter === "program" ? this.programId : this.eventAuthority;

    return this.connection.onLogs(
      filter,
      (logs, context) => {
        if (logs.err || seenSignatures.has(logs.signature)) return;
        seenSignatures.add(logs.signature);

        void this.fetchTransactions([logs.signature])
          .then(([tx]) => {
            if (!tx) return;

            this.decodeEventsFromTransaction(tx, logs.signature)
              .map((event) => normalizeTradeEvent(event))
              .filter((event): event is JupiterPerpsTradeEvent => Boolean(event))
              .filter((event) => walletSet.has(event.owner))
              .forEach((event) => onTrade(event, { slot: context.slot, signature: logs.signature }));
          })
          .catch((error) => options.onError?.(error));
      },
      options.commitment ?? "confirmed",
    );
  }

  async fetchRecentTradeEvents(options: FetchPerpsTradeEventsInput = {}): Promise<FetchPerpsTradeEventsResult> {
    const signatureLimit = options.signatureLimit ?? 250;
    if (signatureLimit === 0) {
      return { signatures: [], events: [] };
    }

    const signatures = await this.fetchEventAuthoritySignatures({
      sinceUnixSeconds: options.sinceUnixSeconds,
      limit: signatureLimit,
    });

    return this.fetchTradeEventsForSignatures({
      signatures,
      walletAddresses: options.walletAddresses,
    });
  }

  async fetchTradeEventsForSignatures(
    options: FetchPerpsTradeEventsForSignaturesInput,
  ): Promise<FetchPerpsTradeEventsResult> {
    const walletSet = options.walletAddresses?.length
      ? new Set(options.walletAddresses.map((address) => new PublicKey(address).toBase58()))
      : null;
    const signatures = options.signatures.filter(Boolean);
    const transactions = await this.fetchTransactions(signatures);
    const decodedEvents = transactions.flatMap((tx, index) =>
      tx ? this.decodeEventsFromTransaction(tx, signatures[index]) : [],
    );
    const events = decodedEvents
      .map((event) => normalizeTradeEvent(event))
      .filter((event): event is JupiterPerpsTradeEvent => Boolean(event))
      .filter((event) => !walletSet || walletSet.has(event.owner))
      .sort((a, b) => b.slot - a.slot || b.signature.localeCompare(a.signature));

    return { signatures, events };
  }

  async fetchWalletSnapshots(input: FetchPerpsWalletInput): Promise<FetchPerpsWalletResult> {
    const normalizedWallets = input.walletAddresses.map((address) => new PublicKey(address).toBase58());
    const pricesByMarket =
      input.pricesByMarket ??
      (input.includeOraclePrices ? await this.fetchOraclePricesByMarket() : undefined);
    const custodyConfigsByAddress = await this.fetchCustodyConfigsByAddress();
    const positionsByWallet = [];
    for (const walletAddress of normalizedWallets) {
      const triggerOrdersResult = await this.fetchOpenTriggerOrdersForWalletSafe(walletAddress, {
        signatureLimit: input.positionRequestSignatureLimit,
        sinceUnixSeconds: input.sinceUnixSeconds,
      });
      positionsByWallet.push({
        walletAddress,
        positions: await this.fetchOpenPositionsForWallet(walletAddress, {
          includeClosedPositions: input.includeClosedPositions,
        }),
        triggerOrders: triggerOrdersResult.orders,
        triggerOrdersUnavailable: triggerOrdersResult.unavailable,
      });
    }
    const tradeResult = await this.fetchRecentTradeEvents({
      walletAddresses: normalizedWallets,
      sinceUnixSeconds: input.sinceUnixSeconds,
      signatureLimit: input.signatureLimit,
    });

    const tradesByWallet = groupTradesByWallet(tradeResult.events);

    return {
      programId: this.programId.toBase58(),
      eventAuthority: this.eventAuthority.toBase58(),
      fetchedSignatureCount: tradeResult.signatures.length,
      parsedEventCount: tradeResult.events.length,
      wallets: positionsByWallet.map(({ walletAddress, positions, triggerOrders, triggerOrdersUnavailable }) =>
        buildWalletSnapshot({
          walletAddress,
          positions,
          trades: tradesByWallet.get(walletAddress) ?? [],
          triggerOrders,
          triggerOrdersUnavailable,
          pricesByMarket,
          custodyConfigsByAddress,
        }),
      ),
    };
  }

  async fetchCustodyConfigsByAddress(): Promise<Map<string, JupiterPerpsCustodyConfig>> {
    const custodyPubkeys = COMPETITION_MARKETS.map((market) => new PublicKey(CUSTODY_BY_MARKET[market]));
    const accounts = await this.fetchMultipleAccounts(custodyPubkeys);
    const configs = new Map<string, JupiterPerpsCustodyConfig>();

    accounts.forEach((account, index) => {
      if (!account || !account.owner.equals(this.programId)) return;

      const pubkey = custodyPubkeys[index].toBase58();
      configs.set(
        pubkey,
        normalizeCustodyConfig(
          pubkey,
          this.coder.accounts.decode("Custody", account.data) as Record<string, unknown>,
        ),
      );
    });

    return configs;
  }

  private async fetchOpenTriggerOrdersForWalletSafe(
    walletAddress: string,
    options: {
      signatureLimit?: number;
      sinceUnixSeconds?: number;
    } = {},
  ): Promise<{
    orders: JupiterPerpsTriggerOrder[];
    unavailable?: boolean;
  }> {
    try {
      return {
        orders: await this.fetchOpenTriggerOrdersForWallet(walletAddress),
      };
    } catch {
      try {
        return {
          orders: await this.fetchOpenTriggerOrdersForWalletByRecentEvents(walletAddress, options),
        };
      } catch {
        return {
          orders: [],
          unavailable: true,
        };
      }
    }
  }

  async fetchOraclePricesByMarket(): Promise<PricesByMarket> {
    return this.oracleClient.fetchPricesByMarket(["SOL", "ETH", "BTC"]);
  }

  decodePositionAccount(pubkey: string, data: Buffer | Uint8Array): JupiterPerpsOpenPosition {
    return normalizeOpenPosition(
      pubkey,
      this.coder.accounts.decode("Position", Buffer.from(data)) as Record<string, unknown>,
    );
  }

  decodePositionRequestAccount(pubkey: string, data: Buffer | Uint8Array): JupiterPerpsTriggerOrder | null {
    return normalizePositionRequest(
      pubkey,
      this.coder.accounts.decode("PositionRequest", Buffer.from(data)) as Record<string, unknown>,
    );
  }

  decodeTradeEventsFromTransactionLike(tx: JupiterPerpsTransactionLike): JupiterPerpsTradeEvent[] {
    return this.decodeEventsFromTransactionLike(tx)
      .map((event) => normalizeTradeEvent(event))
      .filter((event): event is JupiterPerpsTradeEvent => Boolean(event));
  }

  decodePositionRequestEventsFromTransactionLike(tx: JupiterPerpsTransactionLike): JupiterPerpsPositionRequestEvent[] {
    return this.decodeEventsFromTransactionLike(tx)
      .map((event) => normalizePositionRequestEvent(event))
      .filter((event): event is JupiterPerpsPositionRequestEvent => Boolean(event));
  }

  decodeWalletEventsFromTransactionLike(tx: JupiterPerpsTransactionLike): JupiterPerpsDecodedWalletEvent[] {
    const walletEvents: JupiterPerpsDecodedWalletEvent[] = [];

    for (const event of this.decodeEventsFromTransactionLike(tx)) {
      const trade = normalizeTradeEvent(event);
      if (trade) {
        walletEvents.push({ kind: "trade", trade });
        continue;
      }

      const request = normalizePositionRequestEvent(event);
      if (request) {
        walletEvents.push({ kind: "position-request", request });
      }
    }

    return walletEvents;
  }

  private async fetchEventAuthoritySignatures(options: {
    sinceUnixSeconds?: number;
    limit: number;
  }): Promise<string[]> {
    return this.fetchSignaturesForAddress(this.eventAuthority, options, this.connection);
  }

  private async fetchSignaturesForAddress(
    address: PublicKey,
    options: {
      sinceUnixSeconds?: number;
      limit: number;
    },
    connection: Connection,
  ): Promise<string[]> {
    const signatures: string[] = [];
    let before: string | undefined;

    while (signatures.length < options.limit) {
      const batch = await connection.getSignaturesForAddress(address, {
        before,
        limit: Math.min(100, options.limit - signatures.length),
      });
      if (batch.length === 0) break;

      for (const signatureInfo of batch) {
        if (signatureInfo.err) continue;
        if (options.sinceUnixSeconds && signatureInfo.blockTime && signatureInfo.blockTime < options.sinceUnixSeconds) {
          return signatures;
        }
        signatures.push(signatureInfo.signature);
      }

      before = batch.at(-1)?.signature;
      if (!before) break;
    }

    return signatures;
  }

  private async fetchTransactions(
    signatures: string[],
    connection = this.connection,
  ): Promise<(VersionedTransactionResponse | null)[]> {
    const chunks = chunk(signatures, 25);
    const results: (VersionedTransactionResponse | null)[] = [];

    for (const signatureChunk of chunks) {
      const txs = await this.fetchTransactionChunk(signatureChunk, connection);
      results.push(...txs);
    }

    return results;
  }

  private async fetchTransactionChunk(
    signatures: string[],
    connection: Connection,
  ): Promise<(VersionedTransactionResponse | null)[]> {
    try {
      return await connection.getTransactions(signatures, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
    } catch (error) {
      if (signatures.length <= 1 || !isTransactionBatchLimitError(error)) {
        throw error;
      }

      const transactions = [];
      for (const signature of signatures) {
        transactions.push(
          await connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          }),
        );
      }

      return transactions;
    }
  }

  private async fetchMultipleAccounts(pubkeys: PublicKey[], connection = this.connection) {
    const chunks = chunk(pubkeys, 100);
    const results = [];

    for (const pubkeyChunk of chunks) {
      results.push(...(await connection.getMultipleAccountsInfo(pubkeyChunk, "confirmed")));
    }

    return results;
  }

  decodeEventsFromTransaction(tx: VersionedTransactionResponse, signature: string): DecodedPerpsEvent[] {
    const innerInstructions = tx.meta?.innerInstructions ?? [];
    const events: DecodedPerpsEvent[] = [];

    for (const inner of innerInstructions) {
      inner.instructions.forEach((instruction, instructionIndex) => {
        const data = "data" in instruction ? instruction.data : undefined;
        const event = typeof data === "string" ? this.decodeEventInstruction(data) : null;
        if (!event) return;

        events.push({
          name: event.name,
          data: event.data as Record<string, unknown>,
          signature,
          slot: tx.slot,
          blockTime: tx.blockTime ?? null,
          instructionIndex,
        });
      });
    }

    return events;
  }

  decodeEventsFromTransactionLike(tx: JupiterPerpsTransactionLike): DecodedPerpsEvent[] {
    const events: DecodedPerpsEvent[] = [];

    for (const inner of tx.innerInstructions) {
      inner.instructions.forEach((instruction, instructionIndex) => {
        const data = instruction.instruction?.data ?? instruction.data;
        const event = data ? this.decodeEventInstructionBytes(data) : null;
        if (!event) return;

        events.push({
          name: event.name,
          data: event.data as Record<string, unknown>,
          signature: tx.signature,
          slot: tx.slot,
          blockTime: tx.blockTime ?? null,
          instructionIndex,
        });
      });
    }

    return events;
  }

  decodeEventInstruction(instructionDataBase58: string): { name: string; data: unknown } | null {
    try {
      const ixData = utils.bytes.bs58.decode(instructionDataBase58);
      return this.decodeEventInstructionBytes(ixData);
    } catch {
      return null;
    }
  }

  decodeEventInstructionBytes(instructionData: Uint8Array): { name: string; data: unknown } | null {
    try {
      if (instructionData.length <= DISCRIMINATOR_SIZE) return null;

      const eventData = utils.bytes.base64.encode(Buffer.from(instructionData).subarray(DISCRIMINATOR_SIZE));
      return this.coder.events.decode(eventData);
    } catch {
      return null;
    }
  }
}

export function createJupiterPerpsClientFromEnv(): JupiterPerpsOnChainClient {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new Error("Missing SOLANA_RPC_URL");
  }
  const historyRpcUrl =
    process.env.SOLANA_BACKFILL_RPC_URL ||
    process.env.SOLANA_HISTORY_RPC_URL ||
    DEFAULT_HISTORY_RPC_URL;

  return new JupiterPerpsOnChainClient(
    new Connection(rpcUrl, {
      commitment: "confirmed",
      wsEndpoint: process.env.SOLANA_STREAM_URL || undefined,
    }),
    {
      historyConnection: new Connection(historyRpcUrl, {
        commitment: "confirmed",
      }),
    },
  );
}

function groupTradesByWallet(events: JupiterPerpsTradeEvent[]): Map<string, JupiterPerpsTradeEvent[]> {
  const grouped = new Map<string, JupiterPerpsTradeEvent[]>();
  for (const event of events) {
    const owner = publicKeyToString(event.owner);
    grouped.set(owner, [...(grouped.get(owner) ?? []), event]);
  }
  return grouped;
}

function chunk<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function isTransactionBatchLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("getTransaction") && message.includes("batch");
}
