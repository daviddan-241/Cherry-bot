# Cherry Bot (@Boost_onDex_bot)

A Telegram bot for Solana/Ethereum token services: volume boosting, SOL/ETH trending boosts, DexScreener visibility, and Pump.fun trending — all with per-user HD wallet payment addresses.

## Architecture

- **Runtime**: Node.js 20 + TypeScript (esbuild bundled)
- **Package manager**: pnpm (workspace monorepo)
- **Bot framework**: Telegraf 4 (long-poll in dev, webhook on Render)
- **Web server**: Express 5 (health endpoint on port 5000)
- **Blockchain**: Solana (@solana/web3.js) — HD wallet derivation per user (BIP39 → ed25519)
- **Data**: DexScreener API + Pump.fun API for live token info

## Workspace structure

```
artifacts/api-server/   # Main TypeScript bot + Express server
  src/
    index.ts            # Entry point — webhook or long-poll depending on env
    app.ts              # Express app (health + root endpoints)
    lib/logger.ts       # Pino logger
    bot/
      index.ts          # All Telegraf handlers
      admin.ts          # Admin notifications
      keyboards.ts      # All inline/reply keyboards
      sessions.ts       # In-memory per-user session store
      tokenInfo.ts      # DexScreener + Pump.fun token fetch
      wallet.ts         # HD wallet derivation per user ID
      images/           # welcome / volume / trending / walletconnect JPEGs
lib/api-zod/            # Stub workspace package
lib/db/                 # Stub workspace package
render.yaml             # Render.com deployment config
```

## Environment variables required

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `MASTER_SEED` | BIP39 mnemonic — derives unique payment wallets per user |
| `ADMIN_TELEGRAM_ID` | Your Telegram user ID — receives order notifications |
| `PAYMENT_SOL_ADDRESS` | SOL wallet for payment display |
| `PAYMENT_ETH_ADDRESS` | ETH wallet for payment display |
| `PORT` | HTTP port (default 5000 in dev, 10000 on Render) |

## How modes work

- **Dev (Replit)**: Long-poll mode — no webhook needed, bot polls Telegram directly
- **Production (Render)**: Webhook mode — Render sets `RENDER_EXTERNAL_HOSTNAME`, bot auto-registers webhook

## Running locally

```bash
pnpm install --no-frozen-lockfile
cd artifacts/api-server && pnpm run build && PORT=5000 pnpm run start
```

## Deploying to Render

1. Push to GitHub
2. Create a new Web Service on Render, connect the repo
3. Build command: `npm install -g pnpm && pnpm install --no-frozen-lockfile && pnpm --filter @workspace/api-server run build`
4. Start command: `pnpm --filter @workspace/api-server run start`
5. Set environment variables: `TELEGRAM_BOT_TOKEN`, `MASTER_SEED`, `ADMIN_TELEGRAM_ID`, `PAYMENT_SOL_ADDRESS`, `PAYMENT_ETH_ADDRESS`
6. Render auto-provides `RENDER_EXTERNAL_HOSTNAME` → webhook mode activates automatically

## User preferences

- Keep workspace monorepo structure (artifacts/, lib/)
- Use pnpm as package manager
- ESM output format for the built bundle
- Webhook mode on Render, long-poll in dev — automatic via RENDER_EXTERNAL_HOSTNAME
