# Cherry Bot

A crypto-focused Telegram bot for Solana/Ethereum token services including volume boosting, trending boosts, and DexScreener visibility.

## Architecture

- **Runtime**: Node.js 20 + TypeScript
- **Package manager**: pnpm (workspace monorepo)
- **Bot framework**: Telegraf
- **Web server**: Express 5 (health endpoint on port 5000)
- **Blockchain**: Solana (@solana/web3.js) for HD wallet derivation

## Workspace structure

```
artifacts/api-server/   # Main TypeScript bot + Express server
lib/api-zod/            # Stub workspace package
lib/db/                 # Stub workspace package
bot.py                  # Legacy Python bot (not used in main workflow)
```

## Environment variables required

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token from @BotFather |
| `MASTER_SEED` | BIP39 mnemonic seed for HD wallet derivation |
| `ADMIN_TELEGRAM_ID` | Telegram user ID to receive admin notifications |
| `PAYMENT_SOL_ADDRESS` | Solana wallet address for payments |
| `PAYMENT_ETH_ADDRESS` | Ethereum wallet address for payments |
| `PORT` | Server port (default: 5000) |

## Running

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm --filter @workspace/api-server run build

# Start (requires PORT and TELEGRAM_BOT_TOKEN env vars)
PORT=5000 pnpm --filter @workspace/api-server run start
```

## User preferences

- Keep workspace monorepo structure (artifacts/, lib/)
- Use pnpm as package manager
- ESM output format for the built bundle
