# Solana Summit Germany Trading Cup Leaderboard

Live leaderboard for the Solana Summit Germany Trading Cup powered by Jupiter Perps.

The public leaderboard never requires wallet connection and must not expose participant wallet addresses.

## Routes

- `/qualifier`: public read-only qualifier leaderboard with timer, Top 4 Zone, dynamic rankings, and locked standings.
- `/final`: public read-only final display with 4 finalist rows, large PnL, recent activity, and winner state after lock.
- `/display`: public read-only display that follows the active operator mode.
- `/operator`: protected event controls for mode, data source, start, lock, reset, mock scenarios, trader config import, and finalist selection.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The operator route uses HTTP Basic Auth. The username can be any value; the password must match `OPERATOR_PASSWORD`.
Put local RPC/API endpoints and the operator password in `.env.local`. Put real test wallets in `config/test-wallets.local.txt`, one owner wallet per line. Both files are ignored and should not be committed.

## Event Operation

Use `/operator` for event control:

1. Import trader config as CSV or JSON.
2. Choose `Mock data` for rehearsal or `Jupiter SDK` for live Jupiter Perps data.
3. Set mode to `Qualifier` or `Final`.
4. Press `Start` when the round begins.
5. Press `Lock` manually if needed, or let the timer reach zero. The public leaderboard freezes from the latest cached standings.
6. After qualifier lock, select the four finalists in `/operator`, switch to `Final`, and start the final round.

Trader config fields:

```csv
id,xHandle,displayName,walletAddress,status,mode,startingBalance,startingEquity,avatarUrl
q-01,@trader,Trader Name,11111111111111111111111111111111,active,qualifier,100,100,/avatars/trader.png
```

Use `mode=qualifier` for qualifier wallets. You may either import explicit `mode=final` rows for final wallets, or select the finalists from qualifier rows; selected finalists are promoted to final mode with 1,000 starting equity unless explicit final rows exist. `avatarUrl` is optional and should point at a committed public asset or stable hosted image.

## Persistence

By default, local state is stored in `storage/leaderboard-state.json` through an abstract state-store interface and atomic local-file writes. The `storage/` directory is ignored so local event state is not committed.

For Vercel, configure Supabase so all serverless invocations share the same state/cache:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
LEADERBOARD_STATE_ID=default
LEADERBOARD_STATE_TABLE=leaderboard_state
```

Apply `supabase/migrations/0001_leaderboard_state.sql` to create the minimal JSON state table. The app uses the service-role key only on server routes; do not expose it to client code. Set `LEADERBOARD_STATE_STORE=local` to force local JSON state during local development even when Supabase env vars exist.

## Active Data Source

The production-friendly live path is `Jupiter SDK` in `/operator`. It uses `jupiter-perps-api-sdk` read endpoints to reconstruct the round leaderboard from whitelisted wallets:

- open positions for live unrealized PnL, equity contribution, collateral, leverage, fees, and TP/SL requests
- round trades since `startedAt` for realized PnL, notional volume, and recent activity
- active limit orders for limit-order state and derived place/cancel activity

Polling cadence defaults:

```bash
QUALIFIER_REFRESH_MS=5000
FINAL_REFRESH_MS=2500
LEADERBOARD_RECENT_LIMIT=8
PERPS_SDK_API_URL=https://perps-api.jup.ag/v1
```

Public pages poll the app API; the app API refreshes the SDK cache only when stale. This keeps viewer devices from seeing wallet addresses and gives Vercel deployments a shared cache when Supabase is configured.

## Real Data Adapter

The real-data path is built around on-chain Jupiter Perps account/event parsing via the Anchor IDL-derived approach. It intentionally does not use a Jupiter Perps API as leaderboard source of truth. Use these environment variables when wiring real providers:

```bash
SOLANA_RPC_URL=
SOLANA_BACKFILL_RPC_URL=
SOLANA_GRPC_URL=
SOLANA_GRPC_API_KEY=
SOLANA_STREAM_URL=
```

The current adapter can:

- fetch Jupiter Perps `Position` accounts for specific whitelisted wallets with deterministic Position PDAs derived from owner wallet, JLP pool, custody, collateral custody, and side
- parse Jupiter Perps Anchor CPI trade events from the program event authority
- subscribe to new event-authority logs over WebSocket, fetch confirmed transactions, and filter parsed trade events to whitelisted wallets
- subscribe to Solstream gRPC account and transaction streams for live derived Position updates and Jupiter Perps trade events
- backfill already-created TP/SL request accounts from recent wallet request events using `SOLANA_BACKFILL_RPC_URL`, or a temporary public fallback while a dedicated history RPC is not configured
- compute round notional volume from parsed increase/decrease/liquidation events
- compute event-derived realized PnL and expose open-position hints for validation

Operator-only probe endpoint:

```bash
curl -u operator:$OPERATOR_PASSWORD \
  -X POST http://localhost:3000/api/operator/jupiter-perps/probe \
  -H 'Content-Type: application/json' \
  -d '{"walletAddresses":["11111111111111111111111111111111"],"signatureLimit":100,"includeOraclePrices":true}'
```

Operator-only recent event parser. Omit wallet filters to discover currently active Jupiter Perps wallets from recent trade events; include `walletAddresses` to filter:

```bash
curl -u operator:$OPERATOR_PASSWORD \
  'http://localhost:3000/api/operator/jupiter-perps/events?signatureLimit=100'
```

Operator-only live trade stream for specific wallets:

```bash
curl -N -u operator:$OPERATOR_PASSWORD \
  'http://localhost:3000/api/operator/jupiter-perps/stream?walletAddresses=11111111111111111111111111111111'
```

Operator-only live snapshot stream for specific wallets. This merges parsed trade events, `Position` account changes, and Doves oracle updates:

```bash
curl -N -u operator:$OPERATOR_PASSWORD \
  'http://localhost:3000/api/operator/jupiter-perps/watch?walletAddresses=11111111111111111111111111111111&includeOraclePrices=true'
```

Optional mainnet parser validation:

```bash
SOLANA_RPC_URL=... npm run test:jupiter-mainnet
```

Direct operator CLI for IDL parser debugging:

```bash
npm run jupiter:discover -- --signature-limit 25
npm run jupiter:events -- --wallet <WALLET> --signature-limit 100
npm run jupiter:snapshot -- --wallets <WALLET_A>,<WALLET_B> --include-oracle-prices
npm run jupiter:stream -- --wallet <WALLET>
npm run jupiter:watch -- --wallet <WALLET> --include-oracle-prices
npm run jupiter:watch -- --wallet-file config/test-wallets.local.txt --include-oracle-prices
npm run jupiter:tx -- --signature <TX_SIGNATURE>
npm run jupiter:grpc -- --grpc-mode slots --max-events 1
npm run jupiter:grpc -- --grpc-mode positions --wallet-file config/test-wallets.local.txt --timeout-ms 30000
npm run jupiter:grpc -- --grpc-mode trades --wallet-file config/test-wallets.local.txt --timeout-ms 0
npm run jupiter:grpc -- --grpc-mode oracle --timeout-ms 30000
npm run jupiter:grpc-watch -- --wallet-file config/test-wallets.local.txt --signature-limit 0 --include-oracle-prices
npm run jupiter:grpc-watch -- --wallet <WALLET> --include-oracle-prices --terminal-leaderboard --starting-equity 100
npm run jupiter:grpc-watch -- --wallet <WALLET> --include-oracle-prices --terminal-leaderboard --starting-equity 100 --trade-details
npm run jupiter:grpc-watch -- --wallet <WALLET> --include-oracle-prices --terminal-leaderboard --starting-equity 100 --trade-details --live-only
npm run jupiter:grpc-watch -- --trader-config-file config/traders.local.csv --mode qualifier --terminal-leaderboard --include-oracle-prices
npm run jupiter:grpc-watch -- --trader-config-file config/traders.local.csv --mode qualifier --public-scores --include-oracle-prices
```

The adapter includes the Doves oracle accounts and the position PnL formula from the Jupiter Perps IDL parsing repo, so `includeOraclePrices:true` adds mark-to-market unrealized PnL for open SOL/ETH/BTC positions. This still needs validation against active Jupiter Perps wallets before enabling the real source for the public display.

The gRPC path uses `SOLANA_GRPC_URL` and optional `SOLANA_GRPC_API_KEY`. It vendors the Solstream protobuf definition and keeps the parser source-of-truth in the Jupiter Perps Anchor IDL. Trade streaming subscribes to Jupiter Perps event-authority transactions, decodes Anchor events, and then filters by the whitelisted event owner instead of relying on the wallet being a required transaction account. Use `jupiter:grpc-watch` for combined live wallet snapshots from Solstream trades, derived Position account updates, and Doves oracle updates.

`jupiter:grpc-watch` has two intended operating modes:

- **Normal validation mode**: omit `--live-only`. The watcher attempts a startup RPC snapshot before it subscribes, using `SOLANA_RPC_URL` and optional `SOLANA_BACKFILL_RPC_URL` to inspect already-open positions, recent trade events, current TP/SL request accounts, and startup oracle prices. This is useful for debugging existing wallets. If the startup RPC/backfill read is unavailable, the CLI prints a warning and continues with live Solstream updates; pass `--strict-startup-snapshot` when you want startup RPC failure to abort the process.
- **Fresh round live mode**: add `--live-only`. The watcher skips all startup RPC snapshot reads and relies on Solstream live/startup gRPC updates. This is the preferred Trading Cup mode when the process starts before trading begins, because competition wallets should have no prior positions/orders to recover and the live feed becomes the source for the round.

`SOLANA_BACKFILL_RPC_URL` is optional but recommended when the primary live RPC does not support transaction history or broad program account scans. Until a dedicated history-capable RPC is configured, the adapter falls back to `https://solana-rpc.publicnode.com` for this narrow backfill path. The live tracker can use Solstice for gRPC/live account updates while using the backfill RPC only to find recent wallet TP/SL request keys, then it fetches the known request accounts directly.

When `jupiter:grpc-watch` is run with `--trader-config-file` and `--public-scores`, it maps the live IDL-derived wallet snapshots into ranked trader scores and omits wallet addresses from the emitted leaderboard payload. If no `--wallet` or `--wallet-file` is provided, the watcher derives its wallet filter from active traders in the config file and optional `--mode`.

For CLI validation, use `--terminal-leaderboard` with `jupiter:grpc-watch` to render a readable live table with rank, trader, net PnL, competition PnL %, position PnL %, equity, volume, collateral, leverage, estimated open/borrow/close fees, gross PnL, current position value, open trade, TP/SL trigger orders, size, entry price, and latest parsed trade. With `--trade-details` or `--history <N>`, the CLI also prints internal grouped trade lifecycle details below the table: one trade section per reconstructed lifecycle, with open/increase/decrease/close/liquidation executions, active TP/SL orders, leverage, size, volume, fees, gross PnL, and net PnL for that specific trade. With `--trader-config-file`, trader names and starting equity come from the CSV. Without config, add `--starting-equity` to test a single wallet against a competition-style starting equity; otherwise equity is estimated from open-position collateral plus PnL and fees.

Lifecycle reconstruction is best-effort over the data the watcher has seen. In normal validation mode it can include recent backfilled trade events plus current account state. In fresh round live mode it starts from the moment the watcher starts, which is the intended event setup. For the public cup display, keep the top-level leaderboard focused on total round PnL/equity/volume; use lifecycle details selectively for internal validation or a compact final-mode recent-trades panel.

## Jupiter Competition API Test

Jupiter shared a staging HTTP leaderboard endpoint for partner competitions. Test it separately from the Solstream/on-chain parser with:

```bash
npm run jupiter:api-leaderboard -- \
  --wallet 7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E \
  --starting-equity 100 \
  --max-polls 1
```

For a full event wallet file or trader config:

```bash
npm run jupiter:api-leaderboard -- --wallet-file config/test-wallets.local.txt --starting-equity 100
npm run jupiter:api-leaderboard -- --trader-config-file config/traders.local.csv --mode qualifier
```

The command defaults to the staging URL from Jupiter's gist, or override with `PERPS_COMPETITION_API_URL`, `PERPS_API_URL`, or `--base-url`. It polls `POST /competition-leaderboard`, converts raw `1e6`-scaled USD strings into display values, and computes display equity as `startingEquity + livePnl`.

Each poll retries transient failures by default with `--retries 2 --retry-delay-ms 1000`. For example, a 12s timeout can take about 39s before that poll reports failure. Use `--retries 0` for fast fail, or increase `--request-timeout-ms` for a one-off staging test:

```bash
npm run jupiter:api-leaderboard -- \
  --wallet 7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E \
  --starting-equity 100 \
  --max-polls 1 \
  --request-timeout-ms 60000 \
  --retries 1
```

Use this path for side-by-side validation only until the endpoint is stable and production-hosted. The staging API may return transient `503 leaderboard_live_data_unavailable` or time out while its live cache is unavailable. If it becomes reliable, the HTTP API can be wrapped behind the same leaderboard data interface and is easier to deploy from Vercel than a long-running gRPC watcher.

## Jupiter Perps SDK Leaderboard Test

The SDK path is tested separately from the raw HTTP helper so the three data-source tracks stay clear:

- `jupiter:api-leaderboard`: direct HTTP call to the competition endpoint.
- `jupiter:sdk-leaderboard`: `jupiter-perps-api-sdk` client calling the same competition endpoint.
- `jupiter:grpc-watch`: our Solstream/on-chain IDL-derived watcher.

Run the SDK leaderboard with:

```bash
npm run jupiter:sdk-leaderboard -- \
  --wallet 7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E \
  --starting-equity 100 \
  --max-polls 1
```

For live polling:

```bash
START_TS=$(date +%s)

npm run jupiter:sdk-leaderboard -- \
  --wallet 7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E \
  --starting-equity 100 \
  --start-timestamp "$START_TS" \
  --interval-ms 3000 \
  --request-timeout-ms 12000 \
  --retries 2
```

The SDK is Vercel-friendly if Jupiter's hosted endpoint is reliable, because it uses short-lived HTTP requests. It does not bypass `/competition-leaderboard`; if that backend is down or timing out, the SDK path is expected to fail the same way as the raw HTTP path.

## Jupiter SDK Reconstruction Test

If the dedicated competition endpoint is unavailable, `jupiter:sdk-reconstruct` rebuilds a leaderboard from the SDK read endpoints instead of calling `/competition-leaderboard`:

- `positions.get({ walletAddress })` for open positions, live unrealized PnL, equity contribution, fees, leverage, collateral, TP/SL requests.
- `positions.getTrades({ walletAddress, createdAtAfter })` for round volume, realized PnL events, and final-mode recent activity.
- `orders.getLimitOrders({ walletAddress })` only when `--include-limit-orders` is passed.

Run a one-off SDK reconstruction poll:

```bash
START_TS=$(date +%s)

npm run jupiter:sdk-reconstruct -- \
  --wallet 7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E \
  --starting-equity 100 \
  --start-timestamp "$START_TS" \
  --max-polls 1
```

Run a 2-3 second polling test:

```bash
START_TS=$(date +%s)

npm run jupiter:sdk-reconstruct -- \
  --wallet-file config/test-wallets.local.txt \
  --starting-equity 100 \
  --start-timestamp "$START_TS" \
  --interval-ms 2000 \
  --trade-limit 100 \
  --max-trade-pages 5 \
  --concurrency 8
```

For a terminal leaderboard similar to the Solstream CLI, keep the default table output and add recent activity rows:

```bash
START_TS=$(date +%s)

npm run jupiter:sdk-reconstruct -- \
  --wallet-file config/test-wallets.local.txt \
  --starting-equity 100 \
  --start-timestamp "$START_TS" \
  --interval-ms 2000 \
  --recent-limit 3 \
  --include-limit-orders
```

The SDK reconstruction table shows rank, trader, net PnL, cup %, open-position %, equity, round volume, collateral, leverage, current open position, fee breakdown, active TP/SL details, active limit-order details, and recent activity. The recent activity section is intended for internal testing and final-mode display experiments: action, market, side, realized PnL for close/decrease/liquidation actions, size, token amount, execution price, fee, execution type, and shortened transaction signature. For live polling runs, it also derives TP/SL and limit-order place/cancel activity by comparing active order state between polls.

Use a fixed `START_TS` for competition tests. If omitted, the script uses a rolling `now - --since-minutes` window, which is useful for inspection but not correct for an official round.

This path is Vercel-friendly because it uses normal HTTP reads, but it makes per-wallet calls. For 25 qualifier wallets, expect one positions request plus one or more paged trades requests per wallet per poll. The script fetches trades in pages and marks a wallet partial if the round has more trades than `--trade-limit * --max-trade-pages`. This is the current primary app data source, but 25-wallet latency and rate limits should still be rehearsed before the event.

For the public qualifier/final leaderboards, the SDK reconstruction path covers the required fields: rank, trader display name from local config, PnL, PnL %, equity, notional volume, final gap-to-leader, current open position data, and recent activity. Timer, lock/freeze behavior, selected finalists, and Top 4 display rules remain app state/UI concerns.

Known SDK reconstruction limits:

- It does not call the dedicated competition endpoint, so it reconstructs round state from per-wallet position and trade reads.
- Filled TP/SL trades are exposed as trigger executions. The adapter suppresses nearby synthetic TP/SL cancel activity when a trigger fill removes the order, so the recent feed does not imply the trader manually canceled a filled TP/SL.
- Active TP/SL requests are available from open positions, and active limit orders are available only when `--include-limit-orders` is used. TP/SL and limit-order create/cancel recent activity is derived from polling state changes, so it starts after the first observed poll and is approximate to the poll timestamp.
- Trade rows include timestamps and transaction hashes but not Solana slots.
- `trade.pnl` fee semantics should still be confirmed with Jupiter before final prize settlement rules are locked.

The operator SSE watch endpoint can use the same gRPC-backed tracker with `transport=solstream`, for example `/api/operator/jupiter-perps/watch?transport=solstream&walletAddresses=<WALLET>&includeOraclePrices=true`. Solstream watch defaults to `signatureLimit=0` unless explicitly provided, so a provider without transaction-history RPC can still stream live round data from `fromSlot`.

Do not commit real wallet addresses, secrets, RPC URLs, or event state.
