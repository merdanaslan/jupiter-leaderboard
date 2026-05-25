# Solana Summit Germany Trading Cup Leaderboard

Mock-data-first leaderboard for the Solana Summit Germany Trading Cup powered by Jupiter Perps.

The public leaderboard never requires wallet connection and must not expose participant wallet addresses.

## Routes

- `/qualifier`: public read-only qualifier leaderboard with 25 mock traders, timer, Top 4 Zone, and locked standings.
- `/final`: public read-only final display with 4 finalist cards, large PnL, gap to leader, and winner state after lock.
- `/display`: public read-only display that follows the active operator mode.
- `/operator`: protected event controls for mode, start, lock, reset, mock scenarios, and finalist selection.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The operator route uses HTTP Basic Auth. The username can be any value; the password must match `OPERATOR_PASSWORD`.
Put local RPC endpoints and the operator password in `.env.local`. Put real test wallets in `config/test-wallets.local.txt`, one owner wallet per line. Both files are ignored and should not be committed.

## Persistence

V1 state is stored in `storage/leaderboard-state.json` through an abstract state-store interface and atomic local-file writes. The `storage/` directory is ignored so local event state is not committed. The store can later be replaced with Redis, Supabase, Postgres, or another hosted persistence layer.

## Real Data Adapter

The real-data path is built around on-chain Jupiter Perps account/event parsing via the Anchor IDL-derived approach. It intentionally does not use a Jupiter Perps API as leaderboard source of truth. Use these environment variables when wiring real providers:

```bash
SOLANA_RPC_URL=
SOLANA_GRPC_URL=
SOLANA_GRPC_API_KEY=
SOLANA_STREAM_URL=
```

The current adapter can:

- fetch Jupiter Perps `Position` accounts for specific whitelisted wallets with deterministic Position PDAs derived from owner wallet, JLP pool, custody, collateral custody, and side
- parse Jupiter Perps Anchor CPI trade events from the program event authority
- subscribe to new event-authority logs over WebSocket, fetch confirmed transactions, and filter parsed trade events to whitelisted wallets
- subscribe to Solstream gRPC account and transaction streams for live derived Position updates and Jupiter Perps trade events
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
npm run jupiter:grpc-watch -- --trader-config-file config/traders.local.csv --mode qualifier --terminal-leaderboard --include-oracle-prices
npm run jupiter:grpc-watch -- --trader-config-file config/traders.local.csv --mode qualifier --public-scores --include-oracle-prices
```

The adapter includes the Doves oracle accounts and the position PnL formula from the Jupiter Perps IDL parsing repo, so `includeOraclePrices:true` adds mark-to-market unrealized PnL for open SOL/ETH/BTC positions. This still needs validation against active Jupiter Perps wallets before enabling the real source for the public display.

The gRPC path uses `SOLANA_GRPC_URL` and optional `SOLANA_GRPC_API_KEY`. It vendors the Solstream protobuf definition and keeps the parser source-of-truth in the Jupiter Perps Anchor IDL. Trade streaming subscribes to Jupiter Perps event-authority transactions, decodes Anchor events, and then filters by the whitelisted event owner instead of relying on the wallet being a required transaction account. Use `jupiter:grpc-watch` for combined live wallet snapshots from Solstream trades, derived Position account updates, and Doves oracle updates.

When `jupiter:grpc-watch` is run with `--trader-config-file` and `--public-scores`, it maps the live IDL-derived wallet snapshots into ranked trader scores and omits wallet addresses from the emitted leaderboard payload. If no `--wallet` or `--wallet-file` is provided, the watcher derives its wallet filter from active traders in the config file and optional `--mode`.

For CLI validation, use `--terminal-leaderboard` with `jupiter:grpc-watch` to render a readable live table with rank, trader, net PnL, competition PnL %, position PnL %, equity, volume, collateral, leverage, estimated open/borrow/close fees, gross PnL, current position value, open trade, size, entry price, and latest parsed trade. With `--trader-config-file`, trader names and starting equity come from the CSV. Without config, add `--starting-equity` to test a single wallet against a competition-style starting equity; otherwise equity is estimated from open-position collateral plus PnL and fees.

The operator SSE watch endpoint can use the same gRPC-backed tracker with `transport=solstream`, for example `/api/operator/jupiter-perps/watch?transport=solstream&walletAddresses=<WALLET>&includeOraclePrices=true`. Solstream watch defaults to `signatureLimit=0` unless explicitly provided, so a provider without transaction-history RPC can still stream live round data from `fromSlot`.

Do not commit real wallet addresses, secrets, RPC URLs, or event state.
