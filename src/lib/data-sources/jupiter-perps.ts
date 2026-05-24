import { Connection } from "@solana/web3.js";
import { createInitialRoundState } from "./mock";
import { parseTraderConfig } from "../trader-config";
import type { CompetitionMode, RoundState, TraderConfig, TraderScore } from "../types";
import {
  JupiterPerpsOnChainClient,
  type FetchPerpsWalletResult,
} from "./jupiter-perps-client";
import { scoreJupiterPerpsSnapshots, startedAtUnixSeconds } from "./jupiter-perps-score";
import {
  JLP_POOL_ACCOUNT,
  JUPITER_PERPS_EVENT_AUTHORITY,
  JUPITER_PERPS_PROGRAM_ID,
} from "./jupiter-perps-normalize";
import type { LeaderboardDataSource } from "./types";

export { JLP_POOL_ACCOUNT, JUPITER_PERPS_EVENT_AUTHORITY, JUPITER_PERPS_PROGRAM_ID };

export interface JupiterPerpsDataSourceConfig {
  rpcUrl?: string;
  grpcUrl?: string;
  streamUrl?: string;
  traders?: TraderConfig[];
  roundStartUnixSeconds?: number;
  signatureLimit?: number;
  client?: JupiterPerpsOnChainClient;
}

export interface JupiterPerpsAdapterPlan {
  sourceOfTruth: "on-chain-idl";
  usesJupiterPerpsApi: false;
  programId: string;
  accounts: string[];
  events: string[];
  envVars: string[];
}

export class JupiterPerpsDataSource implements LeaderboardDataSource {
  readonly id = "jupiter-perps";
  private readonly client: JupiterPerpsOnChainClient | null;
  private readonly traders: TraderConfig[];

  constructor(private readonly config: JupiterPerpsDataSourceConfig) {
    this.client = config.client ?? createClientFromConfig(config);
    this.traders = config.traders ?? [];
  }

  describePlan(): JupiterPerpsAdapterPlan {
    return {
      sourceOfTruth: "on-chain-idl",
      usesJupiterPerpsApi: false,
      programId: JUPITER_PERPS_PROGRAM_ID,
      accounts: ["Position", "PositionRequest", "Custody", "Pool"],
      events: [
        "IncreasePositionEvent",
        "InstantIncreasePositionEvent",
        "DecreasePositionEvent",
        "InstantDecreasePositionEvent",
        "LiquidateFullPositionEvent",
      ],
      envVars: ["SOLANA_RPC_URL", "SOLANA_GRPC_URL", "SOLANA_STREAM_URL"],
    };
  }

  getInitialState(): RoundState {
    return {
      ...createInitialRoundState(),
      dataSource: "jupiter-perps",
      mockTraders: [],
    };
  }

  async getTraders(mode: CompetitionMode, state: RoundState): Promise<TraderScore[]> {
    const traderConfigs = this.traders.filter(
      (trader) => trader.mode === mode && trader.status === "active",
    );
    if (traderConfigs.length === 0) return [];

    const snapshots = await this.fetchWalletSnapshots({
      walletAddresses: traderConfigs.map((trader) => trader.walletAddress),
      sinceUnixSeconds: this.config.roundStartUnixSeconds ?? startedAtUnixSeconds(state.startedAt),
    });
    return scoreJupiterPerpsSnapshots({
      traders: traderConfigs,
      snapshots: snapshots.wallets,
      mode,
    });
  }

  async fetchWalletSnapshots(input: {
    walletAddresses: string[];
    sinceUnixSeconds?: number;
    includeClosedPositions?: boolean;
    signatureLimit?: number;
  }): Promise<FetchPerpsWalletResult> {
    if (!this.client) {
      throw new Error("Missing SOLANA_RPC_URL or JupiterPerpsOnChainClient");
    }

    return this.client.fetchWalletSnapshots({
      walletAddresses: input.walletAddresses,
      sinceUnixSeconds: input.sinceUnixSeconds,
      includeClosedPositions: input.includeClosedPositions,
      signatureLimit: input.signatureLimit ?? this.config.signatureLimit,
    });
  }

  loadTraderConfig(input: string): TraderConfig[] {
    return parseTraderConfig(input);
  }

  getConfiguredEndpoints(): JupiterPerpsDataSourceConfig {
    const { client: _client, ...safeConfig } = this.config;
    return { ...safeConfig };
  }
}

function createClientFromConfig(config: JupiterPerpsDataSourceConfig): JupiterPerpsOnChainClient | null {
  if (!config.rpcUrl) return null;

  return new JupiterPerpsOnChainClient(
    new Connection(config.rpcUrl, {
      commitment: "confirmed",
      wsEndpoint: config.streamUrl || undefined,
    }),
  );
}
