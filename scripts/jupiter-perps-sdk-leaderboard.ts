#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { PublicKey } from "@solana/web3.js";
import type {
  CompetitionLeaderboardRequest,
  CompetitionLeaderboardResponse,
  RankBy,
  SupportedMarketMint,
} from "../node_modules/jupiter-perps-api-sdk/dist/index.js";
import { parseTraderConfig } from "../src/lib/trader-config";
import type { CompetitionMode, TraderConfig } from "../src/lib/types";

loadEnvConfig(process.cwd());

type Market = "SOL" | "ETH" | "BTC";

const DEFAULT_STAGING_BASE_URL = "https://perps-api-v1.fly.dev/v1";
const MARKET_MINTS: Record<Market, SupportedMarketMint> = {
  SOL: "So11111111111111111111111111111111111111112",
  ETH: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
  BTC: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
};

type SdkModule = typeof import("../node_modules/jupiter-perps-api-sdk/dist/index.js");
let sdkModulePromise: Promise<SdkModule> | undefined;

interface CliOptions {
  baseUrl: string;
  walletAddresses: string[];
  walletFile?: string;
  traderConfigFile?: string;
  mode?: CompetitionMode;
  startTimestamp?: number;
  sinceMinutes: number;
  endTimestamp?: number;
  startingEquity: number;
  rankBy: RankBy;
  market?: Market;
  intervalMs: number;
  requestTimeoutMs: number;
  retries: number;
  retryDelayMs: number;
  maxPolls: number;
  json: boolean;
}

interface SdkLeaderboardRow {
  rank: number;
  trader: string;
  walletAddress: string;
  pnlUsd: number;
  pnlPercent: number;
  equityUsd: number;
  volumeUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  openPositionValueUsd: number;
}

interface SdkFetchResult {
  response: CompetitionLeaderboardResponse;
  attempts: number;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const traderConfig = loadTraderConfig(options);
  const walletAddresses = resolveWalletAddresses(options, traderConfig);

  if (walletAddresses.length === 0) {
    throw new Error("Provide --wallet, --wallets, --wallet-file, or --trader-config-file");
  }

  let polls = 0;
  while (true) {
    polls += 1;
    await pollOnce({ options, traderConfig, walletAddresses });

    if (options.maxPolls > 0 && polls >= options.maxPolls) break;
    if (options.intervalMs <= 0) break;

    await sleep(options.intervalMs);
  }
}

async function pollOnce(input: {
  options: CliOptions;
  traderConfig: TraderConfig[];
  walletAddresses: string[];
}) {
  const request = buildRequest(input.options, input.walletAddresses);
  const startedAt = Date.now();

  try {
    const { attempts, response } = await fetchSdkLeaderboard(input.options, request);
    const latencyMs = Date.now() - startedAt;
    const rows = buildRows(response, input.options, input.traderConfig);

    if (input.options.json) {
      console.log(JSON.stringify({ attempts, latencyMs, request, response, rows }, null, 2));
      return;
    }

    renderTerminalLeaderboard({
      attempts,
      baseUrl: input.options.baseUrl,
      latencyMs,
      request,
      response,
      rows,
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;

    if (input.options.json) {
      console.log(
        JSON.stringify(
          {
            error: formatUnknownError(error),
            latencyMs,
            request,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (process.stdout.isTTY) console.clear();
    console.log("Jupiter Perps SDK Leaderboard");
    console.log(`updated=${new Date().toISOString()} | latency=${latencyMs}ms | status=error`);
    console.log(
      `request start=${request.startTimestamp} end=${request.endTimestamp ?? "live"} wallets=${request.walletAddresses.length} attempts=${input.options.retries + 1}`,
    );
    console.log(`base=${input.options.baseUrl}`);
    console.log("");
    console.log(formatUnknownError(error));
    console.log("");
    console.log("This uses jupiter-perps-api-sdk against the configured Perps API base URL.");
  }
}

async function fetchSdkLeaderboard(
  options: CliOptions,
  request: CompetitionLeaderboardRequest,
): Promise<SdkFetchResult> {
  const maxAttempts = options.retries + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const sdk = await loadSdkModule();
      const perps = sdk.createPerpsClient({
        baseUrl: options.baseUrl,
        fetch: createTimeoutFetch(options.requestTimeoutMs),
      });
      const response = await perps.leaderboard.getCompetitionLeaderboard(request);
      return { attempts: attempt, response };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;

      const delayMs = options.retryDelayMs * 2 ** (attempt - 1);
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  throw new Error(
    `SDK leaderboard request failed after ${maxAttempts} attempt${maxAttempts === 1 ? "" : "s"}: ${formatUnknownError(lastError)}`,
  );
}

async function loadSdkModule(): Promise<SdkModule> {
  sdkModulePromise ??= import("../node_modules/jupiter-perps-api-sdk/dist/index.js");
  return sdkModulePromise;
}

function createTimeoutFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: init?.signal ?? controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`SDK request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}

function buildRequest(options: CliOptions, walletAddresses: string[]): CompetitionLeaderboardRequest {
  const startTimestamp = options.startTimestamp ?? Math.floor(Date.now() / 1000) - options.sinceMinutes * 60;
  return {
    walletAddresses,
    startTimestamp,
    ...(options.endTimestamp ? { endTimestamp: options.endTimestamp } : {}),
    ...(options.market ? { marketMint: MARKET_MINTS[options.market] } : {}),
    rankBy: options.rankBy,
  };
}

function buildRows(
  response: CompetitionLeaderboardResponse,
  options: CliOptions,
  traderConfig: TraderConfig[],
): SdkLeaderboardRow[] {
  const tradersByWallet = new Map(traderConfig.map((trader) => [normalizePublicKey(trader.walletAddress), trader]));

  return response.dataList.map((entry) => {
    const walletAddress = normalizePublicKey(entry.owner);
    const trader = tradersByWallet.get(walletAddress);
    const startingEquity = trader?.startingEquity ?? options.startingEquity;
    const pnlUsd = rawUsdToNumber(entry.livePnlUsd);
    const realizedPnlUsd = rawUsdToNumber(entry.realizedPnlUsd);
    const unrealizedPnlUsd = rawUsdToNumber(entry.unrealizedPnlUsd);
    const volumeUsd = rawUsdToNumber(entry.totalVolumeUsd);

    return {
      rank: entry.rank,
      trader: trader ? trader.xHandle || trader.displayName : shortAddress(walletAddress),
      walletAddress,
      pnlUsd,
      pnlPercent: startingEquity > 0 ? (pnlUsd / startingEquity) * 100 : 0,
      equityUsd: startingEquity + pnlUsd,
      volumeUsd,
      realizedPnlUsd,
      unrealizedPnlUsd,
      openPositionValueUsd: rawUsdToNumber(entry.openPositionValueUsd),
    };
  });
}

function renderTerminalLeaderboard(input: {
  attempts: number;
  baseUrl: string;
  latencyMs: number;
  request: CompetitionLeaderboardRequest;
  response: CompetitionLeaderboardResponse;
  rows: SdkLeaderboardRow[];
}) {
  const width = terminalWidth();
  if (process.stdout.isTTY) console.clear();

  console.log("Jupiter Perps SDK Leaderboard");
  console.log(
    [
      `updated=${new Date().toISOString()}`,
      `latency=${input.latencyMs}ms`,
      input.attempts > 1 ? `attempts=${input.attempts}` : "",
      `rankBy=${input.response.rankBy}`,
      `start=${input.response.startTimestamp}`,
      `end=${input.response.endTimestamp}`,
      input.response.marketMint ? `market=${input.response.marketMint}` : "",
      `wallets=${input.request.walletAddresses.length}`,
    ]
      .filter(Boolean)
      .join(" | "),
  );
  console.log(`base=${input.baseUrl}`);
  console.log(separator(width));
  console.log(
    [
      pad("Rank", 4),
      pad("Trader", 18, "left"),
      pad("Live PnL", 12, "left"),
      pad("Cup %", 9, "left"),
      pad("Equity", 12, "left"),
      pad("Volume", 12, "left"),
      pad("Realized", 12, "left"),
      pad("Unreal", 12, "left"),
      pad("Open Value", 12, "left"),
    ].join(" "),
  );
  console.log(separator(width));

  for (const row of input.rows) {
    console.log(
      [
        pad(String(row.rank), 4),
        pad(row.trader, 18, "left"),
        pad(formatSignedUsd(row.pnlUsd), 12, "left"),
        pad(formatPercent(row.pnlPercent), 9, "left"),
        pad(formatUsd(row.equityUsd), 12, "left"),
        pad(formatUsd(row.volumeUsd), 12, "left"),
        pad(formatSignedUsd(row.realizedPnlUsd), 12, "left"),
        pad(formatSignedUsd(row.unrealizedPnlUsd), 12, "left"),
        pad(formatUsd(row.openPositionValueUsd), 12, "left"),
      ].join(" "),
    );
  }

  console.log(separator(width));
  console.log("Ctrl+C to stop. Values come through jupiter-perps-api-sdk; equity is starting equity + live PnL.");
}

function loadTraderConfig(options: CliOptions): TraderConfig[] {
  if (!options.traderConfigFile) return [];
  const traders = parseTraderConfig(readFileSync(options.traderConfigFile, "utf8"));
  return options.mode ? traders.filter((trader) => trader.mode === options.mode && trader.status === "active") : traders;
}

function resolveWalletAddresses(options: CliOptions, traderConfig: TraderConfig[]): string[] {
  const walletAddresses = [...options.walletAddresses];

  if (options.walletFile) {
    walletAddresses.push(
      ...readFileSync(options.walletFile, "utf8")
        .split(/\r?\n/)
        .map((line) => line.replace(/#.*/, "").trim())
        .filter(Boolean),
    );
  }

  walletAddresses.push(...traderConfig.map((trader) => trader.walletAddress));

  return [...new Set(walletAddresses.map(normalizePublicKey))].sort();
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    baseUrl: process.env.PERPS_COMPETITION_API_URL || process.env.PERPS_API_URL || DEFAULT_STAGING_BASE_URL,
    walletAddresses: [],
    sinceMinutes: 60,
    startingEquity: 100,
    rankBy: "livePnl",
    intervalMs: 5_000,
    requestTimeoutMs: 12_000,
    retries: 2,
    retryDelayMs: 1_000,
    maxPolls: 0,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];

    switch (flag) {
      case "--base-url":
        requireValue(flag, value);
        options.baseUrl = value;
        index += 1;
        break;
      case "--wallet":
        requireValue(flag, value);
        options.walletAddresses.push(value);
        index += 1;
        break;
      case "--wallets":
        requireValue(flag, value);
        options.walletAddresses.push(...value.split(/[,\s]+/).filter(Boolean));
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
        if (value !== "qualifier" && value !== "final") throw new Error("--mode must be qualifier or final");
        options.mode = value;
        index += 1;
        break;
      case "--start-timestamp":
        requireValue(flag, value);
        options.startTimestamp = Number(value);
        index += 1;
        break;
      case "--since-minutes":
        requireValue(flag, value);
        options.sinceMinutes = Number(value);
        index += 1;
        break;
      case "--end-timestamp":
        requireValue(flag, value);
        options.endTimestamp = Number(value);
        index += 1;
        break;
      case "--starting-equity":
        requireValue(flag, value);
        options.startingEquity = Number(value);
        index += 1;
        break;
      case "--rank-by":
        requireValue(flag, value);
        if (value !== "livePnl" && value !== "realizedPnl" && value !== "volume" && value !== "positionValue") {
          throw new Error("--rank-by must be livePnl, realizedPnl, volume, or positionValue");
        }
        options.rankBy = value;
        index += 1;
        break;
      case "--market":
        requireValue(flag, value);
        if (value !== "SOL" && value !== "ETH" && value !== "BTC") throw new Error("--market must be SOL, ETH, or BTC");
        options.market = value;
        index += 1;
        break;
      case "--interval-ms":
        requireValue(flag, value);
        options.intervalMs = Number(value);
        index += 1;
        break;
      case "--request-timeout-ms":
        requireValue(flag, value);
        options.requestTimeoutMs = Number(value);
        index += 1;
        break;
      case "--retries":
        requireValue(flag, value);
        options.retries = Number(value);
        index += 1;
        break;
      case "--retry-delay-ms":
        requireValue(flag, value);
        options.retryDelayMs = Number(value);
        index += 1;
        break;
      case "--max-polls":
        requireValue(flag, value);
        options.maxPolls = Number(value);
        index += 1;
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  validateOptions(options);
  return options;
}

function validateOptions(options: CliOptions) {
  if (!Number.isInteger(options.sinceMinutes) || options.sinceMinutes <= 0) {
    throw new Error("--since-minutes must be a positive integer");
  }
  if (options.startTimestamp !== undefined && (!Number.isInteger(options.startTimestamp) || options.startTimestamp <= 0)) {
    throw new Error("--start-timestamp must be a positive Unix timestamp");
  }
  if (options.endTimestamp !== undefined && (!Number.isInteger(options.endTimestamp) || options.endTimestamp <= 0)) {
    throw new Error("--end-timestamp must be a positive Unix timestamp");
  }
  if (options.startingEquity < 0 || !Number.isFinite(options.startingEquity)) {
    throw new Error("--starting-equity must be a non-negative number");
  }
  if (!Number.isInteger(options.intervalMs) || options.intervalMs < 0) {
    throw new Error("--interval-ms must be a non-negative integer");
  }
  if (!Number.isInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
    throw new Error("--request-timeout-ms must be a positive integer");
  }
  if (!Number.isInteger(options.retries) || options.retries < 0) {
    throw new Error("--retries must be a non-negative integer");
  }
  if (!Number.isInteger(options.retryDelayMs) || options.retryDelayMs < 0) {
    throw new Error("--retry-delay-ms must be a non-negative integer");
  }
  if (!Number.isInteger(options.maxPolls) || options.maxPolls < 0) {
    throw new Error("--max-polls must be a non-negative integer");
  }
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.name === "PerpsApiError") {
    const apiError = error as Error & { code?: string; status?: number };
    const code = apiError.code ? ` ${apiError.code}` : "";
    return `Perps SDK/API returned ${apiError.status ?? "unknown"}${code}: ${apiError.message}`;
  }

  return error instanceof Error ? error.message : String(error);
}

function rawUsdToNumber(value: string | number | bigint): number {
  return Number(value) / 1_000_000;
}

function normalizePublicKey(address: string): string {
  return new PublicKey(address).toBase58();
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatSignedUsd(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${formatUsd(Math.abs(value))}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${Math.abs(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}%`;
}

function pad(value: string, width: number, align: "left" | "right" = "right"): string {
  if (value.length >= width) return value;
  return align === "left" ? value.padEnd(width) : value.padStart(width);
}

function separator(width: number): string {
  return "".padEnd(width, "-");
}

function terminalWidth(): number {
  return Math.max(126, Math.min(process.stdout.columns ?? 140, 160));
}

function requireValue(flag: string, value: string | undefined): asserts value is string {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  console.log(`
Usage:
  npm run jupiter:sdk-leaderboard -- [options]

Examples:
  npm run jupiter:sdk-leaderboard -- --wallet <WALLET> --starting-equity 100 --max-polls 1
  npm run jupiter:sdk-leaderboard -- --wallet-file config/test-wallets.local.txt --starting-equity 100
  npm run jupiter:sdk-leaderboard -- --trader-config-file config/traders.local.csv --mode qualifier

Options:
  --wallet <address>             Add a wallet. Repeatable.
  --wallets <a,b,c>              Add comma/space-separated wallets.
  --wallet-file <path>           Read wallets from a local ignored file.
  --trader-config-file <path>    Read wallet/display-name/starting-equity mapping from CSV/JSON.
  --mode qualifier|final         Filter trader config by competition mode.
  --starting-equity <usd>        Starting equity used when no trader config is provided. Default: 100.
  --start-timestamp <unix>       Competition start Unix seconds. Default: now - --since-minutes.
  --since-minutes <minutes>      Rolling start window if no explicit start is provided. Default: 60.
  --end-timestamp <unix>         Optional fixed end timestamp. For live polling, omit this.
  --rank-by <metric>             livePnl, realizedPnl, volume, or positionValue. Default: livePnl.
  --market SOL|ETH|BTC           Optional single-market filter.
  --interval-ms <ms>             Poll interval. Default: 5000. Use 0 for one request.
  --request-timeout-ms <ms>      Per-request timeout. Default: 12000.
  --retries <count>              Extra attempts per poll after the first request. Default: 2.
  --retry-delay-ms <ms>          Initial retry delay with exponential backoff. Default: 1000.
  --max-polls <count>            Stop after N polls. Default: 0 for infinite.
  --base-url <url>               API base URL. Default: PERPS_COMPETITION_API_URL, PERPS_API_URL, then staging gist URL.
  --json                         Print raw request/response/normalized rows.

Notes:
  This tests jupiter-perps-api-sdk, not our Solstream/on-chain parser.
  The SDK calls the same /competition-leaderboard backend as the HTTP API path.
`);
}

main().catch((error) => {
  console.error(formatUnknownError(error));
  process.exit(1);
});
