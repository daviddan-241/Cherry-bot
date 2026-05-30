import { Markup } from "telegraf";

// ── Main menu (inline — appears on the welcome photo) ────────────────────────
export const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("🟢 Start Bumping", "menu_bump")],
  [
    Markup.button.callback("📊 Volume Boost",   "menu_volume"),
    Markup.button.callback("🔥 Trending Boost", "menu_trending"),
  ],
  [
    Markup.button.callback("🌐 DexScreener",  "menu_dex"),
    Markup.button.callback("💰 Deposit",      "menu_deposit"),
  ],
  [
    Markup.button.callback("🔗 Connect Wallet",  "menu_wallet"),
    Markup.button.callback("💬 Contact Support", "menu_support"),
  ],
]);

// ── SOL bump amount picker ────────────────────────────────────────────────────
export const solPickerKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("🔵 0.3 SOL", "sol_0.3"),
    Markup.button.callback("🟡 0.4 SOL", "sol_0.4"),
  ],
  [
    Markup.button.callback("🟠 0.5 SOL", "sol_0.5"),
    Markup.button.callback("🔴 0.6 SOL", "sol_0.6"),
  ],
  [Markup.button.callback("⬅️ Back to Menu", "back_main")],
]);

// ── Confirm / Cancel an order ─────────────────────────────────────────────────
export const confirmOrderKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("✅ Confirm Order", "confirm_bump")],
  [Markup.button.callback("❌ Cancel",        "back_main")],
]);

// ── After payment instructions ────────────────────────────────────────────────
export const paymentSentKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("✅ Payment Sent — Submit TX Hash", "submit_tx")],
  [Markup.button.callback("❌ Cancel Order", "back_main")],
]);

// ── Generic cancel ────────────────────────────────────────────────────────────
export const cancelKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("❌ Cancel", "back_main")],
]);

// ── Volume Boost packages ─────────────────────────────────────────────────────
export const volumeBoostKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("🥉 Iron   — 1.50 SOL",    "vol_iron"),
    Markup.button.callback("🥈 Bronze — 2.50 SOL",    "vol_bronze"),
  ],
  [
    Markup.button.callback("🥇 Gold   — 3.50 SOL",    "vol_gold"),
    Markup.button.callback("⚡ Silver  — 5.00 SOL",   "vol_silver"),
  ],
  [
    Markup.button.callback("💎 Platinum — 7.50 SOL",  "vol_platinum"),
    Markup.button.callback("💠 Diamond  — 10.50 SOL", "vol_diamond"),
  ],
  [Markup.button.callback("⬅️ Back to Menu", "back_main")],
]);

// ── Trending type selector ────────────────────────────────────────────────────
export const trendingMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("☀️ SOL Trending",      "trend_sol")],
  [
    Markup.button.callback("🔵 ETH Trending",       "trend_eth"),
    Markup.button.callback("🔥 PumpFun Trending",   "trend_pumpfun"),
  ],
  [Markup.button.callback("⬅️ Back to Menu", "back_main")],
]);

// ── SOL Trending packages (TOP 3 left | TOP 10 right) ────────────────────────
export const solTrendingKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("🔴 TOP 3",  "st_top3_label"),
    Markup.button.callback("🔴 TOP 10", "st_top10_label"),
  ],
  [
    Markup.button.callback("⏳ 3 hr  — 1.50 SOL", "st_top3_3hr"),
    Markup.button.callback("⏳ 3 hr  — 1.00 SOL", "st_top10_3hr"),
  ],
  [
    Markup.button.callback("⏳ 6 hr  — 2.30 SOL", "st_top3_6hr"),
    Markup.button.callback("⏳ 6 hr  — 1.60 SOL", "st_top10_6hr"),
  ],
  [
    Markup.button.callback("⏳ 12 hr — 3.70 SOL", "st_top3_12hr"),
    Markup.button.callback("⏳ 12 hr — 2.60 SOL", "st_top10_12hr"),
  ],
  [
    Markup.button.callback("⏳ 24 hr — 5.90 SOL", "st_top3_24hr"),
    Markup.button.callback("⏳ 24 hr — 4.10 SOL", "st_top10_24hr"),
  ],
  [
    Markup.button.callback("⬅️ Back", "trend_back"),
    Markup.button.callback("🏠 Menu",  "back_main"),
  ],
]);

// ── ETH Trending packages ─────────────────────────────────────────────────────
export const ethTrendingKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("💵 $100 USD", "et_100"),
    Markup.button.callback("💵 $200 USD", "et_200"),
  ],
  [Markup.button.callback("💵 $300 USD",  "et_300")],
  [
    Markup.button.callback("⬅️ Back", "trend_back"),
    Markup.button.callback("🏠 Menu",  "back_main"),
  ],
]);

// ── PumpFun Trending ──────────────────────────────────────────────────────────
export const pumpfunTrendingKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("🔥 P.F.T — 30 SOL", "pft_30")],
  [
    Markup.button.callback("⬅️ Back", "trend_back"),
    Markup.button.callback("🏠 Menu",  "back_main"),
  ],
]);

// ── DexScreener packages ──────────────────────────────────────────────────────
export const dexscreenerKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("🔴 TOP 6 Trending 🔴", "dex_top6_info")],
  [
    Markup.button.callback("⏳ 5 hr  —  2 SOL",  "dex_5hr"),
    Markup.button.callback("⏳ 7 hr  — 3.5 SOL", "dex_7hr"),
  ],
  [
    Markup.button.callback("⏳ 12 hr —  7 SOL",  "dex_12hr"),
    Markup.button.callback("⏳ 18 hr — 10 SOL",  "dex_18hr"),
  ],
  [
    Markup.button.callback("⏳ 24 hr — 15 SOL",  "dex_24hr"),
    Markup.button.callback("⏳ 32 hr — 22 SOL",  "dex_32hr"),
  ],
  [Markup.button.callback("⬅️ Back to Menu", "back_main")],
]);

// ── Deposit panel ─────────────────────────────────────────────────────────────
export const depositKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("➕ Add Funds",         "deposit_add")],
  [
    Markup.button.callback("💸 Withdraw",          "deposit_withdraw"),
    Markup.button.callback("◎ SOL Balance",        "deposit_sol_balance"),
  ],
  [
    Markup.button.callback("📋 My Deposits",       "deposit_my_deposits"),
    Markup.button.callback("📋 My Withdrawals",    "deposit_my_withdrawals"),
  ],
  [Markup.button.callback("⬅️ Back to Menu", "back_main")],
]);

// ── Connect Wallet ────────────────────────────────────────────────────────────
export const connectWalletKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("🔗 Connect Now",          "wallet_connect_now")],
  [Markup.button.callback("🔐 Why Connect?",          "wallet_why")],
  [Markup.button.callback("🛡 Security Guidelines",   "wallet_security")],
  [Markup.button.callback("📱 How to Connect",        "wallet_how_to")],
  [Markup.button.callback("⬅️ Back to Menu",          "back_main")],
]);

export const securityGuidelinesKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("🔗 I Understand — Connect Now", "wallet_connect_now")],
  [
    Markup.button.callback("🔐 Why Connect?",  "wallet_why"),
    Markup.button.callback("📱 How to Connect","wallet_how_to"),
  ],
  [
    Markup.button.callback("⬅️ Back", "wallet_back"),
    Markup.button.callback("🏠 Menu",  "back_main"),
  ],
]);

export const howToConnectKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("🔗 Start Connection",     "wallet_connect_now")],
  [
    Markup.button.callback("🔐 Why Connect?",        "wallet_why"),
    Markup.button.callback("🛡 Security Guide",      "wallet_security"),
  ],
  [Markup.button.callback("⬅️ Back to Menu",         "back_main")],
]);

// ── Generic "back to main menu" button ───────────────────────────────────────
export const mainMenuOnlyKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("🏠 Back to Main Menu", "back_main")],
]);
