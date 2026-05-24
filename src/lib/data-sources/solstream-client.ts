import { randomUUID } from "node:crypto";
import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import bs58 from "bs58";

export enum SolstreamCommitmentLevel {
  PROCESSED = 0,
  CONFIRMED = 1,
  FINALIZED = 2,
}

export interface SolstreamConfig {
  endpoint: string;
  apiKey?: string;
  channelOptions?: grpc.ChannelOptions;
}

interface NormalizedSolstreamConfig extends SolstreamConfig {
  target: string;
  secure: boolean;
}

export interface SolstreamSubscribeRequest {
  clientId?: string;
  accounts?: Record<string, SolstreamAccountFilter>;
  slots?: Record<string, SolstreamSlotFilter>;
  transactions?: Record<string, SolstreamTransactionFilter>;
  commitment?: SolstreamCommitmentLevel;
  fromSlot?: bigint | number;
}

export interface SolstreamAccountFilter {
  account?: string[];
  owner?: string[];
  filters?: SolstreamAccountDataFilter[];
  nonemptyTxnSignature?: boolean;
}

export interface SolstreamAccountDataFilter {
  memcmp?: {
    offset: bigint | number;
    bytes?: Uint8Array;
    base58?: string;
    base64?: string;
  };
  datasize?: bigint | number;
}

export interface SolstreamSlotFilter {
  filterByCommitment?: boolean;
}

export interface SolstreamTransactionFilter {
  vote?: boolean;
  failed?: boolean;
  signature?: string;
  accountInclude?: string[];
  accountExclude?: string[];
  accountRequired?: string[];
}

export interface SolstreamAccountUpdate {
  pubkey: string;
  slot: number;
  lamports: bigint;
  owner: string;
  executable: boolean;
  rentEpoch: bigint;
  data: Uint8Array;
  writeVersion: bigint;
  isStartup: boolean;
}

export interface SolstreamInstructionUpdate {
  programIdIndex: number;
  accounts: Uint8Array;
  data: Uint8Array;
}

export interface SolstreamInnerInstructionUpdate {
  stackHeight?: number;
  instruction: SolstreamInstructionUpdate;
}

export interface SolstreamInnerInstructionsUpdate {
  index: number;
  instructions: SolstreamInnerInstructionUpdate[];
}

export interface SolstreamTransactionUpdate {
  signature: string;
  slot: number;
  success: boolean;
  accountKeys: string[];
  logMessages: string[];
  innerInstructions: SolstreamInnerInstructionsUpdate[];
}

export interface SolstreamSlotUpdate {
  slot: number;
  parent?: number;
  status: number;
}

export type SolstreamUpdate =
  | { kind: "account"; data: SolstreamAccountUpdate }
  | { kind: "transaction"; data: SolstreamTransactionUpdate }
  | { kind: "slot"; data: SolstreamSlotUpdate }
  | { kind: "unknown"; data: unknown };

export interface SolstreamSubscription {
  id: string;
  cancel: () => void;
}

const PROTO_PATH = path.join(process.cwd(), "src/lib/data-sources/proto/solstream.proto");
const GOOGLE_PROTO_DIR = path.join(process.cwd(), "node_modules/google-proto-files");
const MAX_MESSAGE_BYTES = 128 * 1024 * 1024;

let streamingServiceConstructor: grpc.ServiceClientConstructor | undefined;

export class SolstreamClient {
  static fromEnv(): SolstreamClient {
    const endpoint = process.env.SOLANA_GRPC_URL;
    if (!endpoint) throw new Error("Missing SOLANA_GRPC_URL");

    return new SolstreamClient({
      endpoint,
      apiKey: process.env.SOLANA_GRPC_API_KEY || process.env.SOLSTREAM_API_KEY || undefined,
    });
  }

  private readonly config: NormalizedSolstreamConfig;

  constructor(config: SolstreamConfig) {
    this.config = normalizeSolstreamConfig(config);
  }

  subscribe(
    request: SolstreamSubscribeRequest,
    onUpdate: (update: SolstreamUpdate) => void,
    onError?: (error: Error) => void,
    onEnd?: () => void,
  ): SolstreamSubscription {
    const client = this.createGrpcClient();
    const metadata = this.createMetadata();
    const normalizedRequest = {
      ...request,
      clientId: request.clientId ?? `jupiter-leaderboard-${randomUUID()}`,
    };
    const call = metadata ? client.subscribe(normalizedRequest, metadata) : client.subscribe(normalizedRequest);

    call.on("data", (raw: unknown) => {
      try {
        onUpdate(decodeSolstreamUpdate(raw));
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    });
    call.on("error", (error: Error) => onError?.(error));
    call.on("end", () => onEnd?.());

    return {
      id: normalizedRequest.clientId,
      cancel: () => {
        call.cancel();
        client.close();
      },
    };
  }

  private createGrpcClient(): grpc.Client & {
    subscribe: (request: unknown, metadata?: grpc.Metadata) => grpc.ClientReadableStream<unknown>;
  } {
    const constructor = getStreamingServiceConstructor();
    const credentials = this.createCredentials();
    const channelOptions: grpc.ChannelOptions = {
      "grpc.max_receive_message_length": MAX_MESSAGE_BYTES,
      "grpc.max_send_message_length": -1,
      "grpc.keepalive_time_ms": 30_000,
      "grpc.keepalive_timeout_ms": 5_000,
      "grpc.keepalive_permit_without_calls": 1,
      ...this.config.channelOptions,
    };

    return new constructor(this.config.target, credentials, channelOptions) as unknown as grpc.Client & {
      subscribe: (request: unknown, metadata?: grpc.Metadata) => grpc.ClientReadableStream<unknown>;
    };
  }

  private createCredentials(): grpc.ChannelCredentials {
    return this.config.secure ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
  }

  private createMetadata(): grpc.Metadata | undefined {
    if (!this.config.apiKey) return undefined;
    const metadata = new grpc.Metadata();
    metadata.add("x-api-key", this.config.apiKey);
    return metadata;
  }
}

export function decodeSolstreamUpdate(raw: unknown): SolstreamUpdate {
  const update = raw as Record<string, unknown>;
  if (update.account) return { kind: "account", data: decodeAccountUpdate(update.account) };
  if (update.transaction) return { kind: "transaction", data: decodeTransactionUpdate(update.transaction) };
  if (update.slot) return { kind: "slot", data: decodeSlotUpdate(update.slot) };
  return { kind: "unknown", data: raw };
}

function decodeAccountUpdate(raw: unknown): SolstreamAccountUpdate {
  const envelope = raw as Record<string, unknown>;
  const account = (envelope.account ?? envelope) as Record<string, unknown>;
  return {
    pubkey: toBase58(account.pubkey),
    slot: toSafeNumber(envelope.slot ?? account.slot),
    lamports: toBigInt(account.lamports),
    owner: toBase58(account.owner),
    executable: Boolean(account.executable),
    rentEpoch: toBigInt(account.rentEpoch),
    data: toBytes(account.data),
    writeVersion: toBigInt(account.writeVersion),
    isStartup: Boolean(envelope.isStartup ?? account.isStartup),
  };
}

function decodeTransactionUpdate(raw: unknown): SolstreamTransactionUpdate {
  const envelope = raw as Record<string, unknown>;
  const txInfo = (envelope.transaction ?? envelope) as Record<string, unknown>;
  const transaction = txInfo.transaction as Record<string, unknown> | undefined;
  const message = transaction?.message as Record<string, unknown> | undefined;
  const meta = txInfo.transactionMeta as Record<string, unknown> | undefined;
  const accountKeys = [
    ...toBytesArray(message?.accountKeys),
    ...toBytesArray(meta?.loadedWritableAddresses),
    ...toBytesArray(meta?.loadedReadonlyAddresses),
  ].map((bytes) => bs58.encode(bytes));

  return {
    signature: toBase58(txInfo.signature),
    slot: toSafeNumber(envelope.slot ?? txInfo.slot),
    success: meta ? meta.err == null || isEmptyError(meta.err) : false,
    accountKeys,
    logMessages: toStringArray(meta?.logMessages),
    innerInstructions: toInnerInstructions(meta?.innerInstructions),
  };
}

function decodeSlotUpdate(raw: unknown): SolstreamSlotUpdate {
  const envelope = raw as Record<string, unknown>;
  const info = (envelope.slotInfo ?? envelope) as Record<string, unknown>;
  return {
    slot: toSafeNumber(info.slot),
    parent: info.parent === undefined ? undefined : toSafeNumber(info.parent),
    status: Number(info.status ?? 0),
  };
}

function toInnerInstructions(value: unknown): SolstreamInnerInstructionsUpdate[] {
  if (!Array.isArray(value)) return [];
  return value.map((group) => {
    const groupRecord = group as Record<string, unknown>;
    return {
      index: Number(groupRecord.index ?? 0),
      instructions: Array.isArray(groupRecord.instructions)
        ? groupRecord.instructions.map((inner) => {
            const innerRecord = inner as Record<string, unknown>;
            const instruction = (innerRecord.instruction ?? {}) as Record<string, unknown>;
            return {
              stackHeight:
                innerRecord.stackHeight === undefined ? undefined : Number(innerRecord.stackHeight),
              instruction: {
                programIdIndex: Number(instruction.programIdIndex ?? 0),
                accounts: toBytes(instruction.accounts),
                data: toBytes(instruction.data),
              },
            };
          })
        : [],
    };
  });
}

function getStreamingServiceConstructor(): grpc.ServiceClientConstructor {
  if (streamingServiceConstructor) return streamingServiceConstructor;
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: BigInt,
    enums: Number,
    defaults: true,
    oneofs: true,
    includeDirs: [path.dirname(PROTO_PATH), GOOGLE_PROTO_DIR],
  });
  const grpcObject = grpc.loadPackageDefinition(packageDefinition) as {
    streaming?: { StreamingService?: grpc.ServiceClientConstructor };
  };
  const constructor = grpcObject.streaming?.StreamingService;
  if (!constructor) throw new Error("Unable to load Solstream StreamingService proto");
  streamingServiceConstructor = constructor;
  return constructor;
}

function normalizeSolstreamConfig(config: SolstreamConfig): NormalizedSolstreamConfig {
  const endpointWithProtocol = /^[a-z]+:\/\//i.test(config.endpoint) ? config.endpoint : `https://${config.endpoint}`;
  const parsed = new URL(endpointWithProtocol);
  const apiKey =
    config.apiKey ||
    parsed.searchParams.get("apiKey") ||
    parsed.searchParams.get("api_key") ||
    parsed.searchParams.get("apikey") ||
    undefined;
  const target = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  const secure = parsed.protocol === "https:" || parsed.protocol === "grpcs:";

  return {
    ...config,
    endpoint: `${parsed.protocol}//${target}`,
    target,
    secure,
    apiKey,
  };
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value.map(Number));
  return new Uint8Array();
}

function toBytesArray(value: unknown): Uint8Array[] {
  return Array.isArray(value) ? value.map((item) => toBytes(item)) : [];
}

function toBase58(value: unknown): string {
  const bytes = toBytes(value);
  return bytes.length ? bs58.encode(bytes) : "";
}

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" || typeof value === "string") return BigInt(value);
  return BigInt(0);
}

function toSafeNumber(value: unknown): number {
  const parsed = toBigInt(value);
  return parsed > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(parsed);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function isEmptyError(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  const err = (value as Record<string, unknown>).err;
  return !err || toBytes(err).length === 0;
}
