#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { Connection } from "@solana/web3.js";
import { publicLeaderboardView } from "../src/lib/leaderboard";
import { parseTraderConfig } from "../src/lib/trader-config";
import {
  createJupiterPerpsClientFromEnv,
  JupiterPerpsOnChainClient,
} from "../src/lib/data-sources/jupiter-perps-client";
import { scoreJupiterPerpsSnapshots } from "../src/lib/data-sources/jupiter-perps-score";
import {
  normalizeSolanaPublicKeys,
  parseWalletAddressList,
} from "../src/lib/data-sources/jupiter-perps-request";
import { JupiterPerpsLiveTracker } from "../src/lib/data-sources/jupiter-perps-live-tracker";
import { JupiterPerpsSolstreamLiveTracker } from "../src/lib/data-sources/jupiter-perps-solstream-live-tracker";
import { JupiterPerpsSolstreamAdapter } from "../src/lib/data-sources/jupiter-perps-solstream";
import { formatTriggerOrdersForTerminal } from "../src/lib/data-sources/jupiter-perps-terminal-format";
import type {
  JupiterPerpsTradeEvent,
  JupiterPerpsWalletSnapshot,
} from "../src/lib/data-sources/jupiter-perps-normalize";
import type { CompetitionMode, TraderConfig, TraderScore } from "../src/lib/types";

loadEnvConfig(process.cwd());

type Command = "discover" | "events" | "snapshot" | "stream" | "watch" | "tx" | "grpc" | "grpc-watch";
type GrpcMode = "slots" | "positions" | "trades" | "oracle" | "all";

interface CliOptions {
  command: Command;
  walletAddresses: string[];
  signatureLimit: number;
  sinceUnixSeconds?: number;
  includeOraclePrices: boolean;
  includeClosedPositions: boolean;
  json: boolean;
  logFilter: "event-authority" | "program";
  signatures: string[];
  walletFile?: string;
  traderConfigFile?: string;
  signatureLimitExplicit: boolean;
  competitionMode?: CompetitionMode;
  publicScores: boolean;
  terminalLeaderboard: boolean;
  startingEquity?: number;
  grpcMode: GrpcMode;
  maxEvents: number;
  timeoutMs: number;
  fromSlot?: number;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "grpc") {
    await watchSolstream(options);
    return;
  }

  if (!process.env.SOLANA_RPC_URL) {
    throw new Error("Missing SOLANA_RPC_URL");
  }

  const client = createJupiterPerpsClientFromEnv();

  switch (options.command) {
    case "discover":
      await discoverRecentWallets(client, options);
      return;
    case "events":
      await printRecentEvents(client, options);
      return;
    case "snapshot":
      await printWalletSnapshots(client, options);
      return;
    case "stream":
      await streamWalletTrades(client, options);
      return;
    case "watch":
      await watchWalletSnapshots(client, options);
      return;
    case "grpc-watch":
      await watchSolstreamWalletSnapshots(client, options);
      return;
    case "tx":
      await printEventsForSignatures(client, options);
      return;
    default:
      exhaustive(options.command);
  }
}

async function discoverRecentWallets(
  client: ReturnType<typeof createJupiterPerpsClientFromEnv>,
  options: CliOptions,
) {
  const result = await client.fetchRecentTradeEvents({
    signatureLimit: options.signatureLimit,
    sinceUnixSeconds: options.sinceUnixSeconds,
  });
  const wallets = new Map<string, { tradeCount: number; latestTrade: JupiterPerpsTradeEvent }>();

  for (const event of result.events) {
    const current = wallets.get(event.owner);
    if (!current || event.slot > current.latestTrade.slot) {
      wallets.set(event.owner, {
        tradeCount: (current?.tradeCount ?? 0) + 1,
        latestTrade: event,
      });
    } else {
      current.tradeCount += 1;
    }
  }

  const rows = [...wallets.entries()]
    .map(([walletAddress, data]) => ({
      walletAddress,
      tradeCount: data.tradeCount,
      latestTrade: data.latestTrade,
    }))
    .sort((a, b) => b.latestTrade.slot - a.latestTrade.slot);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          fetchedSignatureCount: result.signatures.length,
          parsedEventCount: result.events.length,
          walletCount: rows.length,
          wallets: rows,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Fetched ${result.signatures.length} signatures, parsed ${result.events.length} trade events.`);
  console.log("Recent Jupiter Perps wallets:");
  for (const row of rows.slice(0, 25)) {
    console.log(
      [
        row.walletAddress,
        `trades=${row.tradeCount}`,
        `latest=${row.latestTrade.name}`,
        `market=${row.latestTrade.market}`,
        `notional=$${formatNumber(row.latestTrade.notionalUsd)}`,
        `slot=${row.latestTrade.slot}`,
      ].join(" "),
    );
  }
}

async function printRecentEvents(
  client: ReturnType<typeof createJupiterPerpsClientFromEnv>,
  options: CliOptions,
) {
  const walletAddresses = normalizeRequiredWallets(options, "events");
  const result = await client.fetchRecentTradeEvents({
    walletAddresses: walletAddresses.length ? walletAddresses : undefined,
    signatureLimit: options.signatureLimit,
    sinceUnixSeconds: options.sinceUnixSeconds,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Fetched ${result.signatures.length} signatures, matched ${result.events.length} trade events.`);
  for (const event of result.events) {
    console.log(formatTradeEvent(event));
  }
}

async function printWalletSnapshots(
  client: ReturnType<typeof createJupiterPerpsClientFromEnv>,
  options: CliOptions,
) {
  const walletAddresses = normalizeRequiredWallets(options, "snapshot");
  const result = await client.fetchWalletSnapshots({
    walletAddresses,
    signatureLimit: options.signatureLimit,
    sinceUnixSeconds: options.sinceUnixSeconds,
    includeClosedPositions: options.includeClosedPositions,
    includeOraclePrices: options.includeOraclePrices,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Fetched ${result.fetchedSignatureCount} signatures, parsed ${result.parsedEventCount} events.`);
  for (const wallet of result.wallets) {
    console.log(
      [
        wallet.walletAddress,
        `positions=${wallet.positions.length}`,
        `volume=$${formatNumber(wallet.notionalVolumeUsd)}`,
        `realized=$${formatSigned(wallet.realizedPnlUsd)}`,
        `unrealized=$${formatSigned(wallet.unrealizedPnlUsd)}`,
        `total=$${formatSigned(wallet.totalPnlUsd)}`,
      ].join(" "),
    );
  }
}

async function streamWalletTrades(
  client: ReturnType<typeof createJupiterPerpsClientFromEnv>,
  options: CliOptions,
) {
  const walletAddresses = normalizeRequiredWallets(options, "stream");
  console.log(`Listening for Jupiter Perps trades for ${walletAddresses.length} wallet(s).`);
  console.log(`Program: ${client.programId.toBase58()}`);
  console.log(`Event authority: ${client.eventAuthority.toBase58()}`);
  console.log("Press Ctrl+C to stop.");

  const subscriptionId = client.subscribeTradeEventsForWallets(
    walletAddresses,
    (trade) => {
      if (options.json) {
        console.log(JSON.stringify({ type: "trade", trade, receivedAt: new Date().toISOString() }));
        return;
      }

      console.log(formatTradeEvent(trade));
    },
    {
      logFilter: options.logFilter,
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Stream parser error: ${message}`);
      },
    },
  );

  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => resolve());
    process.once("SIGTERM", () => resolve());
  });
  await client.connection.removeOnLogsListener(subscriptionId);
}

async function watchWalletSnapshots(
  client: ReturnType<typeof createJupiterPerpsClientFromEnv>,
  options: CliOptions,
) {
  const walletAddresses = normalizeRequiredWallets(options, "watch");
  const tracker = new JupiterPerpsLiveTracker(client, {
    walletAddresses,
    signatureLimit: options.signatureLimit,
    sinceUnixSeconds: options.sinceUnixSeconds,
    includeClosedPositions: options.includeClosedPositions,
    includeOraclePrices: options.includeOraclePrices,
    logFilter: options.logFilter,
  });
  const stop = await tracker.start((update) => {
    if (options.json) {
      console.log(JSON.stringify(update));
      return;
    }

    console.log(
      [
        update.receivedAt,
        update.reason,
        update.walletAddress ?? "all-wallets",
        update.snapshot ? formatSnapshotSummary(update.snapshot) : `wallets=${update.snapshots.length}`,
      ].join(" "),
    );
  });

  console.log(`Watching Jupiter Perps snapshots for ${walletAddresses.length} wallet(s).`);
  console.log("Press Ctrl+C to stop.");
  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => resolve());
    process.once("SIGTERM", () => resolve());
  });
  await stop();
}

async function watchSolstreamWalletSnapshots(
  client: ReturnType<typeof createJupiterPerpsClientFromEnv>,
  options: CliOptions,
) {
  if (!process.env.SOLANA_GRPC_URL) {
    throw new Error("Missing SOLANA_GRPC_URL");
  }

  const walletAddresses = normalizeRequiredWallets(options, "grpc-watch");
  let updateCount = 0;
  let stopped = false;
  let stopping = false;
  let timeout: NodeJS.Timeout | undefined;
  let resolveDone: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const traderConfigs = options.traderConfigFile ? readTraderConfigFile(options.traderConfigFile) : [];
  const tracker = new JupiterPerpsSolstreamLiveTracker(client, {
    walletAddresses,
    fromSlot: options.fromSlot,
    sinceUnixSeconds: options.sinceUnixSeconds,
    signatureLimit: options.signatureLimitExplicit ? options.signatureLimit : 0,
    includeClosedPositions: options.includeClosedPositions,
    includeOraclePrices: options.includeOraclePrices,
    onError: (error) => {
      if (stopping) return;
      const message = error instanceof Error ? error.message : String(error);
      if (options.json) {
        console.log(JSON.stringify({ type: "error", message, receivedAt: new Date().toISOString() }));
      } else {
        console.error(`Solstream snapshot error: ${message}`);
      }
    },
  });
  const stop = await tracker.start((update) => {
    updateCount += 1;
    const scores = traderConfigs.length
      ? scoreJupiterPerpsSnapshots({
          traders: traderConfigs,
          snapshots: update.snapshots,
          mode: options.competitionMode,
          now: update.receivedAt,
        })
      : null;
    if (options.json) {
      if (options.publicScores && scores) {
        console.log(
          JSON.stringify({
            type: "leaderboard",
            data: {
              reason: update.reason,
              receivedAt: update.receivedAt,
              slot: update.slot,
              mode: options.competitionMode,
              traders: publicLeaderboardView(scores),
            },
          }),
        );
      } else {
        console.log(JSON.stringify({ type: "snapshot", data: scores ? { ...update, scores } : update }));
      }
    } else {
      if (options.terminalLeaderboard) {
        renderTerminalLeaderboard({
          update,
          scores,
          startingEquity: options.startingEquity,
          equityBasis: traderConfigs.length
            ? "trader config"
            : options.startingEquity !== undefined
              ? `starting equity ${formatUsd(options.startingEquity)}`
              : "open-position collateral",
        });
      } else {
        console.log(
          [
            update.receivedAt,
            update.reason,
            update.walletAddress ?? "all-wallets",
            scores
              ? formatScoreSummary(scores)
              : update.snapshot
                ? formatSnapshotSummary(update.snapshot)
                : `wallets=${update.snapshots.length}`,
            update.slot ? `slot=${update.slot}` : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
    }

    if (options.maxEvents > 0 && updateCount >= options.maxEvents) {
      resolveDone?.();
    }
  });

  if (!options.json && !options.terminalLeaderboard) {
    console.log(`Watching Solstream Jupiter Perps snapshots for ${walletAddresses.length} wallet(s).`);
    console.log("Press Ctrl+C to stop.");
  }

  const stopAndResolve = () => {
    if (stopped) return;
    stopped = true;
    resolveDone?.();
  };
  process.once("SIGINT", stopAndResolve);
  process.once("SIGTERM", stopAndResolve);
  if (options.timeoutMs > 0) {
    timeout = setTimeout(stopAndResolve, options.timeoutMs);
  }

  await done;
  if (timeout) clearTimeout(timeout);
  stopping = true;
  await stop();
}

async function printEventsForSignatures(
  client: ReturnType<typeof createJupiterPerpsClientFromEnv>,
  options: CliOptions,
) {
  if (options.signatures.length === 0) {
    throw new Error("The tx command requires --signature or --signatures");
  }
  const walletAddresses = normalizeSolanaPublicKeys(options.walletAddresses);
  const result = await client.fetchTradeEventsForSignatures({
    signatures: options.signatures,
    walletAddresses: walletAddresses.length ? walletAddresses : undefined,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Fetched ${result.signatures.length} transaction(s), decoded ${result.events.length} trade event(s).`);
  for (const event of result.events) {
    console.log(formatTradeEvent(event));
  }
}

async function watchSolstream(options: CliOptions) {
  if (!process.env.SOLANA_GRPC_URL) {
    throw new Error("Missing SOLANA_GRPC_URL");
  }
  const walletAddresses =
    options.grpcMode === "slots" ||
    options.grpcMode === "oracle" ||
    (options.grpcMode === "trades" && options.walletAddresses.length === 0)
      ? []
      : normalizeRequiredWallets(options, "grpc");
  const adapter = new JupiterPerpsSolstreamAdapter(createJupiterPerpsDecodeClient());
  const subscriptions: { cancel: () => void }[] = [];
  let eventCount = 0;
  let stopped = false;
  let timeout: NodeJS.Timeout | undefined;

  const emit = (event: string, data: unknown) => {
    eventCount += event === "ready" ? 0 : 1;
    if (options.json) {
      console.log(JSON.stringify({ type: event, data, receivedAt: new Date().toISOString() }));
    } else if (event === "slot") {
      console.log(`${new Date().toISOString()} slot ${data}`);
    } else if (event === "position") {
      const position = data as { position: { owner: string; market: string; side: string; sizeUsd: number }; slot: number };
      console.log(
        [
          new Date().toISOString(),
          "position",
          position.position.owner,
          `market=${position.position.market}`,
          `side=${position.position.side}`,
          `size=$${formatNumber(position.position.sizeUsd)}`,
          `slot=${position.slot}`,
        ].join(" "),
      );
    } else if (event === "trade") {
      const trade = data as { trade: JupiterPerpsTradeEvent };
      console.log(formatTradeEvent(trade.trade));
    } else if (event === "oracle") {
      const oracle = data as { price: { market: string; priceUsd: number; timestamp: number }; slot: number };
      console.log(
        [
          new Date().toISOString(),
          "oracle",
          oracle.price.market,
          `price=$${formatNumber(oracle.price.priceUsd)}`,
          `timestamp=${oracle.price.timestamp}`,
          `slot=${oracle.slot}`,
        ].join(" "),
      );
    } else {
      console.log(`${event}: ${JSON.stringify(data)}`);
    }

    if (options.maxEvents > 0 && eventCount >= options.maxEvents) {
      stop();
    }
  };

  const onError = (error: Error) => {
    if (stopped) return;
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ type: "error", message, receivedAt: new Date().toISOString() }));
    } else {
      console.error(`Solstream error: ${message}`);
    }
    if (eventCount === 0) stop();
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timeout) clearTimeout(timeout);
    subscriptions.forEach((subscription) => subscription.cancel());
  };

  emit("ready", {
    mode: options.grpcMode,
    walletCount: walletAddresses.length,
    positionAccountCount:
      walletAddresses.length > 0 ? adapter.derivePositionAccountAddresses(walletAddresses).length : 0,
    fromSlot: options.fromSlot,
    timeoutMs: options.timeoutMs,
    maxEvents: options.maxEvents,
  });

  if (options.grpcMode === "slots" || options.grpcMode === "all") {
    subscriptions.push(
      adapter.subscribeSlots(
        (slot) => emit("slot", slot),
        onError,
        { fromSlot: options.fromSlot },
      ),
    );
  }

  if (options.grpcMode === "positions" || options.grpcMode === "all") {
    subscriptions.push(
      adapter.subscribePositionAccounts(
        walletAddresses,
        (position) => emit("position", position),
        onError,
        { fromSlot: options.fromSlot },
      ),
    );
  }

  if (options.grpcMode === "trades" || options.grpcMode === "all") {
    subscriptions.push(
      adapter.subscribeWalletTrades(
        walletAddresses,
        (trade) => emit("trade", trade),
        onError,
        { fromSlot: options.fromSlot },
      ),
    );
  }

  if (options.grpcMode === "oracle" || options.grpcMode === "all") {
    subscriptions.push(
      adapter.subscribeOraclePrices(
        (price) => emit("oracle", price),
        onError,
        { fromSlot: options.fromSlot },
      ),
    );
  }

  if (options.timeoutMs > 0) {
    timeout = setTimeout(() => {
      if (!options.json) console.error(`Solstream timeout after ${options.timeoutMs}ms`);
      stop();
    }, options.timeoutMs);
  }

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!stopped) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function parseArgs(args: string[]): CliOptions {
  const command = parseCommand(args[0]);
  const flags = args.slice(command ? 1 : 0);
  const walletInputs: string[] = [];
  const options: CliOptions = {
    command: command ?? "events",
    walletAddresses: [],
    signatureLimit: Number(process.env.JUPITER_SIGNATURE_LIMIT ?? 100),
    includeOraclePrices: false,
    includeClosedPositions: false,
    json: false,
    logFilter: "event-authority",
    signatures: [],
    signatureLimitExplicit: false,
    publicScores: false,
    terminalLeaderboard: false,
    grpcMode: "all",
    maxEvents: 0,
    timeoutMs: 30_000,
  };

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    const value = flags[index + 1];

    switch (flag) {
      case "--wallet":
        requireValue(flag, value);
        walletInputs.push(value);
        index += 1;
        break;
      case "--wallets":
        requireValue(flag, value);
        walletInputs.push(value);
        index += 1;
        break;
      case "--wallet-file":
        requireValue(flag, value);
        options.walletFile = value;
        index += 1;
        break;
      case "--trader-config-file":
        requireValue(flag, value);
        options.traderConfigFile = value;
        index += 1;
        break;
      case "--mode":
        requireValue(flag, value);
        if (value !== "qualifier" && value !== "final") {
          throw new Error("--mode must be qualifier or final");
        }
        options.competitionMode = value;
        index += 1;
        break;
      case "--public-scores":
        options.publicScores = true;
        break;
      case "--terminal-leaderboard":
        options.terminalLeaderboard = true;
        break;
      case "--starting-equity":
        requireValue(flag, value);
        options.startingEquity = Number(value);
        index += 1;
        break;
      case "--signature-limit":
        requireValue(flag, value);
        options.signatureLimit = Number(value);
        options.signatureLimitExplicit = true;
        index += 1;
        break;
      case "--signature":
        requireValue(flag, value);
        options.signatures.push(value);
        index += 1;
        break;
      case "--signatures":
        requireValue(flag, value);
        options.signatures.push(...value.split(/[,\s]+/).filter(Boolean));
        index += 1;
        break;
      case "--since-unix":
        requireValue(flag, value);
        options.sinceUnixSeconds = Number(value);
        index += 1;
        break;
      case "--include-oracle-prices":
        options.includeOraclePrices = true;
        break;
      case "--include-closed-positions":
        options.includeClosedPositions = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--log-filter":
        requireValue(flag, value);
        if (value !== "event-authority" && value !== "program") {
          throw new Error("--log-filter must be event-authority or program");
        }
        options.logFilter = value;
        index += 1;
        break;
      case "--grpc-mode":
        requireValue(flag, value);
        if (value !== "slots" && value !== "positions" && value !== "trades" && value !== "oracle" && value !== "all") {
          throw new Error("--grpc-mode must be slots, positions, trades, oracle, or all");
        }
        options.grpcMode = value;
        index += 1;
        break;
      case "--max-events":
        requireValue(flag, value);
        options.maxEvents = Number(value);
        index += 1;
        break;
      case "--timeout-ms":
        requireValue(flag, value);
        options.timeoutMs = Number(value);
        index += 1;
        break;
      case "--from-slot":
        requireValue(flag, value);
        options.fromSlot = Number(value);
        index += 1;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (!Number.isInteger(options.signatureLimit) || options.signatureLimit < 0) {
    throw new Error("--signature-limit must be a non-negative integer");
  }
  if (!Number.isInteger(options.maxEvents) || options.maxEvents < 0) {
    throw new Error("--max-events must be a non-negative integer");
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 0) {
    throw new Error("--timeout-ms must be a non-negative integer");
  }
  if (options.startingEquity !== undefined && (!Number.isFinite(options.startingEquity) || options.startingEquity < 0)) {
    throw new Error("--starting-equity must be a non-negative number");
  }
  if (options.fromSlot !== undefined && (!Number.isInteger(options.fromSlot) || options.fromSlot <= 0)) {
    throw new Error("--from-slot must be a positive integer");
  }
  if (
    options.sinceUnixSeconds !== undefined &&
    (!Number.isInteger(options.sinceUnixSeconds) || options.sinceUnixSeconds <= 0)
  ) {
    throw new Error("--since-unix must be a positive integer");
  }

  options.walletAddresses = parseWalletAddressList({
    combined: [...walletInputs, options.walletFile ? readWalletFile(options.walletFile) : ""].join(","),
  });
  if (options.walletAddresses.length === 0 && options.traderConfigFile) {
    options.walletAddresses = readTraderConfigFile(options.traderConfigFile)
      .filter((trader) => trader.status === "active" && (!options.competitionMode || trader.mode === options.competitionMode))
      .map((trader) => trader.walletAddress);
  }

  return options;
}

function parseCommand(value: string | undefined): Command | null {
  if (!value) return null;
  if (
    value === "discover" ||
    value === "events" ||
    value === "snapshot" ||
    value === "stream" ||
    value === "watch" ||
    value === "tx" ||
    value === "grpc" ||
    value === "grpc-watch"
  ) {
    return value;
  }
  if (value.startsWith("-")) return null;
  throw new Error(`Unknown command: ${value}`);
}

function normalizeRequiredWallets(options: CliOptions, command: Command): string[] {
  if (command !== "events" && options.walletAddresses.length === 0) {
    throw new Error(`The ${command} command requires --wallet or --wallets`);
  }

  return normalizeSolanaPublicKeys(options.walletAddresses);
}

function formatTradeEvent(event: JupiterPerpsTradeEvent): string {
  return [
    event.timestamp,
    event.name,
    event.owner,
    event.market,
    event.side,
    `notional=$${formatNumber(event.notionalUsd)}`,
    `pnl=$${formatSigned(event.pnlUsd)}`,
    `fee=$${formatNumber(event.feeUsd)}`,
    `sig=${event.signature}`,
  ].join(" ");
}

function formatSnapshotSummary(snapshot: JupiterPerpsWalletSnapshot): string {
  return [
    `positions=${snapshot.positions.length}`,
    `trades=${snapshot.trades.length}`,
    `volume=$${formatNumber(snapshot.notionalVolumeUsd)}`,
    `realized=$${formatSigned(snapshot.realizedPnlUsd)}`,
    `unrealized=$${formatSigned(snapshot.unrealizedPnlUsd)}`,
    `total=$${formatSigned(snapshot.totalPnlUsd)}`,
  ].join(" ");
}

function formatScoreSummary(scores: TraderScore[]): string {
  const leader = scores[0];
  if (!leader) return "scores=0";

  return [
    `scores=${scores.length}`,
    `leader=${leader.xHandle}`,
    `pnl=$${formatSigned(leader.pnlUsd)}`,
    `volume=$${formatNumber(leader.volume)}`,
  ].join(" ");
}

function renderTerminalLeaderboard(input: {
  update: {
    reason: string;
    receivedAt: string;
    slot?: number;
    snapshots: JupiterPerpsWalletSnapshot[];
  };
  scores: TraderScore[] | null;
  startingEquity?: number;
  equityBasis: string;
}) {
  const snapshotsByWallet = new Map(input.update.snapshots.map((snapshot) => [snapshot.walletAddress, snapshot]));
  const rows = input.scores
    ? input.scores.map((score) => {
        const snapshot = snapshotsByWallet.get(score.walletAddress);
        const collateralUsd = snapshot?.collateralUsd ?? 0;
        const grossPnlUsd = snapshot?.grossPnlUsd ?? snapshot?.totalPnlUsd ?? score.pnlUsd;
        const fees = snapshot?.fees;
        const feesUsd = fees?.totalFeesUsd ?? 0;
        return {
          rank: score.rank,
          trader: score.xHandle || score.displayName,
          pnlUsd: score.pnlUsd,
          pnlPercent: score.pnlPercent,
          positionPnlPercent: collateralUsd > 0 ? (grossPnlUsd / collateralUsd) * 100 : 0,
          equity: score.equity,
          positionValueUsd: collateralUsd + grossPnlUsd - feesUsd,
          volume: score.volume,
          collateralUsd,
          leverage: score.openTrade?.sizeUsd && collateralUsd > 0 ? score.openTrade.sizeUsd / collateralUsd : 0,
          openFeeUsd: fees?.estimatedOpenFeeUsd ?? 0,
          borrowFeeUsd: fees?.estimatedBorrowFeeUsd ?? 0,
          closeFeeUsd: fees?.estimatedCloseFeeUsd ?? 0,
          feesUsd,
          grossPnlUsd,
          open: score.openTrade ? formatOpenTrade(score.openTrade) : score.recentTrade ? "closed" : "--",
          triggerOrders: formatTriggerOrdersForTerminal(snapshot?.triggerOrders ?? [], snapshot?.triggerOrdersUnavailable),
          sizeUsd: score.openTrade?.sizeUsd,
          entryPrice: score.openTrade?.entryPrice,
          recent: score.recentTrade ? formatRecentTrade(score.recentTrade) : "--",
        };
      })
    : input.update.snapshots
        .map((snapshot) => {
          const collateralUsd = snapshot.collateralUsd ?? snapshot.positions.reduce((sum, position) => sum + position.collateralUsd, 0);
          const equityBase = input.startingEquity ?? collateralUsd;
          const grossPnlUsd = snapshot.grossPnlUsd ?? snapshot.totalPnlUsd;
          const fees = snapshot.fees;
          const feesUsd = fees?.totalFeesUsd ?? 0;
          const pnlUsd = snapshot.netPnlUsd ?? grossPnlUsd - feesUsd;
          const positionValueUsd = collateralUsd + grossPnlUsd - feesUsd;
          const openSizeUsd = snapshot.openTrade?.sizeUsd;

          return {
            rank: 0,
            trader: shortAddress(snapshot.walletAddress),
            pnlUsd,
            pnlPercent: equityBase > 0 ? (pnlUsd / equityBase) * 100 : 0,
            positionPnlPercent: collateralUsd > 0 ? (grossPnlUsd / collateralUsd) * 100 : 0,
            equity: Number(((input.startingEquity ?? 0) > 0 ? equityBase + pnlUsd : positionValueUsd).toFixed(2)),
            positionValueUsd,
            volume: snapshot.notionalVolumeUsd,
            collateralUsd,
            leverage: openSizeUsd && collateralUsd > 0 ? openSizeUsd / collateralUsd : 0,
            openFeeUsd: fees?.estimatedOpenFeeUsd ?? 0,
            borrowFeeUsd: fees?.estimatedBorrowFeeUsd ?? 0,
            closeFeeUsd: fees?.estimatedCloseFeeUsd ?? 0,
            feesUsd,
            grossPnlUsd,
            open: snapshot.openTrade ? formatOpenTrade(snapshot.openTrade) : snapshot.recentTrade ? "closed" : "--",
            triggerOrders: formatTriggerOrdersForTerminal(snapshot.triggerOrders ?? [], snapshot.triggerOrdersUnavailable),
            sizeUsd: snapshot.openTrade?.sizeUsd,
            entryPrice: snapshot.openTrade?.entryPrice,
            recent: snapshot.recentTrade ? formatRecentTrade(snapshot.recentTrade) : "--",
          };
        })
        .sort((a, b) => b.pnlUsd - a.pnlUsd || b.volume - a.volume)
        .map((row, index) => ({ ...row, rank: index + 1 }));

  const width = terminalWidth();
  const hasUnavailableTriggerOrders = rows.some((row) => row.triggerOrders === "unavailable");

  if (process.stdout.isTTY) console.clear();
  console.log("Jupiter Perps Live Leaderboard");
  console.log(
    [
      `updated=${input.update.receivedAt}`,
      `reason=${input.update.reason}`,
      input.update.slot ? `slot=${input.update.slot}` : "",
      `equity=${input.equityBasis}`,
    ]
      .filter(Boolean)
      .join(" | "),
  );
  console.log(separator(width));
  console.log(
    [
      pad("Rank", 4),
      pad("Trader", 16),
      pad("Net PnL", 11, "left"),
      pad("Cup %", 8, "left"),
      pad("Pos %", 8, "left"),
      pad("Equity", 10, "left"),
      pad("Volume", 10, "left"),
      pad("Collat", 9, "left"),
      pad("Lev", 6, "left"),
      pad("Open", 10, "left"),
      pad("Recent", 20, "left"),
    ].join(" "),
  );
  console.log(
    [
      pad("", 4),
      pad("", 16),
      pad("Size", 10, "left"),
      pad("Entry", 10, "left"),
      pad("Gross", 10, "left"),
      pad("Value", 10, "left"),
      pad("FeeTot", 8, "left"),
      pad("Fees", 24, "left"),
      pad("TP/SL", 36, "left"),
    ].join(" "),
  );
  console.log(separator(width));

  for (const row of rows) {
    console.log(
      [
        pad(String(row.rank), 4),
        pad(row.trader, 16),
        pad(formatSignedUsd(row.pnlUsd), 11, "left"),
        pad(formatPercent(row.pnlPercent), 8, "left"),
        pad(formatPercent(row.positionPnlPercent), 8, "left"),
        pad(formatUsd(row.equity), 10, "left"),
        pad(formatUsd(row.volume), 10, "left"),
        pad(formatUsd(row.collateralUsd), 9, "left"),
        pad(formatLeverage(row.leverage), 6, "left"),
        pad(row.open, 10, "left"),
        pad(row.recent, 20, "left"),
      ].join(" "),
    );
    console.log(
      [
        pad("", 4),
        pad("", 16),
        pad(row.sizeUsd === undefined ? "--" : formatUsd(row.sizeUsd), 10, "left"),
        pad(row.entryPrice === undefined ? "--" : formatPrice(row.entryPrice), 10, "left"),
        pad(formatSignedUsd(row.grossPnlUsd), 10, "left"),
        pad(formatUsd(row.positionValueUsd), 10, "left"),
        pad(formatUsd(row.feesUsd), 8, "left"),
        pad(formatFeeBreakdown(row), 24, "left"),
        pad(row.triggerOrders, 36, "left"),
      ].join(" "),
    );
    console.log(separator(width));
  }

  console.log("Ctrl+C to stop. Net PnL subtracts parsed/estimated fees; Pos % is gross PnL divided by collateral.");
  if (hasUnavailableTriggerOrders) {
    console.log("TP/SL unavailable: public backfill failed; set SOLANA_BACKFILL_RPC_URL to a history-capable RPC for startup recovery.");
  }
}

function formatOpenTrade(trade: NonNullable<TraderScore["openTrade"]>): string {
  return `${trade.market} ${trade.side}`;
}

function formatRecentTrade(trade: NonNullable<TraderScore["recentTrade"]>): string {
  const action = trade.action ?? "trade";
  const pnl = trade.pnlUsd === undefined ? "" : ` ${formatSignedUsd(trade.pnlUsd)}`;
  return `${action} ${trade.market} ${trade.side} ${formatUsd(trade.notionalUsd)}${pnl}`;
}

function terminalWidth(): number {
  return Math.max(122, Math.min(process.stdout.columns ?? 140, 160));
}

function separator(width: number): string {
  return "".padEnd(width, "-");
}

function pad(value: string, width: number, align: "left" | "right" = "right"): string {
  if (value.length >= width) return value;
  return align === "left" ? value.padEnd(width) : value.padStart(width);
}

function formatFeeBreakdown(row: {
  openFeeUsd: number;
  borrowFeeUsd: number;
  closeFeeUsd: number;
}): string {
  return `O ${formatUsd(row.openFeeUsd)} B ${formatUsd(row.borrowFeeUsd)} C ${formatUsd(row.closeFeeUsd)}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  return `$${formatNumber(normalized)}`;
}

function formatSignedUsd(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  const prefix = normalized > 0 ? "+" : normalized < 0 ? "-" : "";
  return `${prefix}$${formatNumber(Math.abs(normalized))}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  const prefix = normalized > 0 ? "+" : normalized < 0 ? "-" : "";
  return `${prefix}${formatNumber(Math.abs(normalized))}%`;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 100 ? 2 : 4,
    minimumFractionDigits: value >= 100 ? 2 : 4,
  })}`;
}

function formatLeverage(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "--";
  const truncated = Math.floor(value * 100) / 100;
  return `${truncated.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}x`;
}

function formatSigned(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  const prefix = normalized >= 0 ? "+" : "-";
  return `${prefix}${formatNumber(Math.abs(normalized))}`;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function requireValue(flag: string, value: string | undefined): asserts value is string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
}

function printHelp() {
  console.log(`Jupiter Perps IDL live parser

Commands:
  discover   Parse recent event-authority transactions and list active wallets
  events     Parse recent trade events, optionally filtered by wallet
  snapshot   Fetch wallet Position accounts plus round events
  stream     Subscribe to live trade events for specific wallets
  watch      Keep live wallet snapshots updated from trades, positions, and oracles
  tx         Decode specific transaction signatures
  grpc       Subscribe to raw Solstream gRPC slots, position accounts, oracle prices, and/or trade events
  grpc-watch Keep live wallet snapshots updated from Solstream gRPC trades, positions, and oracles

Examples:
  npm run jupiter:discover -- --signature-limit 25
  npm run jupiter:events -- --wallet <WALLET> --signature-limit 100
  npm run jupiter:snapshot -- --wallets <WALLET_A>,<WALLET_B> --include-oracle-prices
  npm run jupiter:watch -- --wallet-file config/test-wallets.local.txt --include-oracle-prices
  npm run jupiter:stream -- --wallet <WALLET>
  npm run jupiter:watch -- --wallet <WALLET> --include-oracle-prices
  npm run jupiter:tx -- --signature <TX_SIGNATURE>
  npm run jupiter:grpc -- --grpc-mode slots --max-events 1
  npm run jupiter:grpc -- --grpc-mode positions --wallet-file config/test-wallets.local.txt --timeout-ms 30000
  npm run jupiter:grpc -- --grpc-mode trades --wallet-file config/test-wallets.local.txt --timeout-ms 0
  npm run jupiter:grpc -- --grpc-mode oracle --timeout-ms 30000
  npm run jupiter:grpc-watch -- --wallet-file config/test-wallets.local.txt --signature-limit 0 --include-oracle-prices
  npm run jupiter:grpc-watch -- --wallet <WALLET> --include-oracle-prices --terminal-leaderboard --starting-equity 100
  npm run jupiter:grpc-watch -- --trader-config-file config/traders.local.csv --mode qualifier --terminal-leaderboard --include-oracle-prices
  npm run jupiter:grpc-watch -- --trader-config-file config/traders.local.csv --mode qualifier --public-scores --include-oracle-prices

Environment:
  SOLANA_RPC_URL        Required RPC URL for RPC commands
  SOLANA_BACKFILL_RPC_URL Optional history-capable RPC for TP/SL request backfill; public fallback is used when unset
  SOLANA_STREAM_URL     Optional WebSocket URL for live logs
  SOLANA_GRPC_URL       Required Solstream gRPC endpoint for grpc command
  SOLANA_GRPC_API_KEY   Optional Solstream API key metadata

Notes:
  Use --signature-limit 0 on snapshot/watch to skip event-history RPC calls and only read live Position accounts.
  Use --terminal-leaderboard on grpc-watch for a readable live CLI table instead of JSON or one-line logs.
  Use --starting-equity with --terminal-leaderboard when testing one wallet without trader config.
`);
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled command: ${value}`);
}

function readWalletFile(path: string): string {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean)
    .join(",");
}

function readTraderConfigFile(path: string): TraderConfig[] {
  return parseTraderConfig(readFileSync(path, "utf8"));
}

function createJupiterPerpsDecodeClient(): JupiterPerpsOnChainClient {
  return new JupiterPerpsOnChainClient(
    new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed"),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
