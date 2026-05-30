import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { getAllOrders, getOrderStats } from "./bot/orders.js";
import { getAllSessions, getActiveSessionCount } from "./bot/sessions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(cookieParser());

const startTime = Date.now();

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function authGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
  const adminId = process.env.ADMIN_TELEGRAM_ID ?? "";
  const token   = (req.query.token as string) ?? "";
  if (!adminId || token !== adminId) {
    res.status(401).json({ error: "Unauthorized — pass ?token=YOUR_ADMIN_TELEGRAM_ID" });
    return;
  }
  next();
}

const PUMPFUN_API = "https://frontend-api.pump.fun";
const DEX_API     = "https://api.dexscreener.com";
const UA          = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const HEADERS     = { "User-Agent": UA, "Accept": "application/json" };

// ── Static & health ───────────────────────────────────────────────────────────
app.get("/favicon.ico", (_req, res) => res.status(204).end());
app.get("/health", (_req, res) =>
  res.json({ status: "ok", ts: Date.now(), uptime: formatUptime(Date.now() - startTime) })
);

// ── Public config (bot username etc.) ────────────────────────────────────────
app.get("/api/config", (_req, res) => {
  const botUsername = process.env["BOT_USERNAME"] || "Boost_onDex_bot";
  res.json({
    botUsername,
    botUrl:          `https://t.me/${botUsername}`,
    supportUsername: process.env["SUPPORT_USERNAME"] || "mrpooh",
    trendChannel:    process.env["TREND_CHANNEL"]    || "pumpmints",
    alertsChannel:   process.env["ALERTS_CHANNEL"]   || "pumpswap_pools",
  });
});
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));

// ── Image proxy — fetches coin images server-side (bypasses CORS / IPFS issues)
app.get("/api/img", async (req, res) => {
  const rawUrl = (req.query.url as string) || "";
  if (!rawUrl) { res.status(400).end(); return; }
  try {
    const decoded = decodeURIComponent(rawUrl);
    const r = await fetch(decoded, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) { res.status(404).end(); return; }
    const ct  = r.headers.get("content-type") || "image/jpeg";
    const buf = await r.arrayBuffer();
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(Buffer.from(buf));
  } catch {
    res.status(502).end();
  }
});

// ── pump.fun token feed ───────────────────────────────────────────────────────
function normalizePumpCoin(c: any) {
  const rawImg = c.image_uri || c.image || "";
  return {
    name:            c.name ?? "Unknown",
    symbol:          c.symbol ?? "???",
    description:     c.description ?? "",
    imageUrl:        rawImg ? `/api/img?url=${encodeURIComponent(rawImg)}` : "",
    rawImageUrl:     rawImg,
    marketCap:       c.usd_market_cap ?? 0,
    contractAddress: c.mint ?? "",
    creator:         c.creator ?? "",
    progress:        Math.min(99, c.bonding_curve_progress ?? Math.floor(Math.random() * 80 + 5)),
    replies:         c.reply_count ?? 0,
    priceChange:     { h24: (Math.random() - 0.25) * 60 },
    volume:          { h24: (c.usd_market_cap ?? 0) * 0.2 },
    chain:           "sol",
    dex:             "pumpfun",
    pumpUrl:         `https://pump.fun/coin/${c.mint ?? ""}`,
  };
}

app.get("/api/pump/tokens", async (req, res) => {
  const filter = (req.query.filter as string) || "trending";
  const sort   = (req.query.sort   as string) || "trending";
  const chain  = (req.query.chain  as string) || "sol";

  // ── ETH path ─────────────────────────────────────────────────────────────
  if (chain === "eth") {
    try {
      const r = await fetch(
        `${DEX_API}/latest/dex/search?q=ethereum&chainIds=ethereum`,
        { headers: HEADERS, signal: AbortSignal.timeout(7000) }
      );
      if (r.ok) {
        const data: any = await r.json();
        const pairs = (data.pairs ?? []).slice(0, 48).map((p: any) => ({
          name:        p.baseToken?.name ?? "Unknown",
          symbol:      p.baseToken?.symbol ?? "???",
          description: `${p.baseToken?.name} trading on ${p.dexId} — ${p.chainId} chain.`,
          imageUrl:    p.info?.imageUrl ? `/api/img?url=${encodeURIComponent(p.info.imageUrl)}` : "",
          rawImageUrl: p.info?.imageUrl ?? "",
          marketCap:   p.fdv ?? p.marketCap ?? 0,
          contractAddress: p.baseToken?.address ?? "",
          creator:     p.pairAddress ?? "",
          progress:    Math.floor(Math.random() * 80 + 20),
          replies:     Math.floor(Math.random() * 500 + 10),
          priceChange: p.priceChange ?? { h24: 0 },
          volume:      p.volume ?? { h24: 0 },
          chain:       "eth",
          dex:         p.dexId ?? "uniswap",
          dexUrl:      p.url ?? `https://dexscreener.com/ethereum/${p.pairAddress}`,
        }));
        res.json({ tokens: pairs, count: pairs.length, filter, sort, chain });
        return;
      }
    } catch { /* fall through */ }
    res.json({ tokens: [], count: 0, filter, sort, chain });
    return;
  }

  // ── SOL / pump.fun path ───────────────────────────────────────────────────
  let tokens: any[] = [];

  const sortMap: Record<string, string> = {
    trending: "last_trade_timestamp",
    created:  "created_timestamp",
    mc:       "usd_market_cap",
  };
  const filterExtra: Record<string, string> = {
    trending:   "",
    new:        "&sort=created_timestamp",
    graduating: "&min_bonding_curve_progress=50",
    graduated:  "&complete=true",
  };

  try {
    const url =
      `${PUMPFUN_API}/coins?sort=${sortMap[sort] ?? "last_trade_timestamp"}&order=DESC` +
      `&offset=0&limit=48&includeNsfw=false${filterExtra[filter] ?? ""}`;
    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(7000) });
    if (r.ok) {
      const data: any = await r.json();
      const coins = Array.isArray(data) ? data : (data.coins ?? []);
      tokens = coins.map(normalizePumpCoin);
    }
  } catch { /* fall through */ }

  // Fallback: DexScreener Solana
  if (!tokens.length) {
    try {
      const r = await fetch(
        `${DEX_API}/latest/dex/search?q=sol&chainIds=solana`,
        { headers: HEADERS, signal: AbortSignal.timeout(7000) }
      );
      if (r.ok) {
        const data: any = await r.json();
        tokens = (data.pairs ?? []).slice(0, 48).map((p: any) => ({
          name:        p.baseToken?.name ?? "Unknown",
          symbol:      p.baseToken?.symbol ?? "???",
          description: `${p.baseToken?.name} trading on ${p.dexId}.`,
          imageUrl:    p.info?.imageUrl ? `/api/img?url=${encodeURIComponent(p.info.imageUrl)}` : "",
          rawImageUrl: p.info?.imageUrl ?? "",
          marketCap:   p.fdv ?? p.marketCap ?? 0,
          contractAddress: p.baseToken?.address ?? "",
          creator:     p.pairAddress ?? "",
          progress:    Math.floor(Math.random() * 80 + 10),
          replies:     Math.floor(Math.random() * 999 + 5),
          priceChange: p.priceChange ?? { h24: 0 },
          volume:      p.volume ?? { h24: 0 },
          chain:       "sol",
          dex:         p.dexId ?? "raydium",
          dexUrl:      p.url ?? `https://dexscreener.com/solana/${p.pairAddress}`,
        }));
      }
    } catch { /* give up */ }
  }

  res.json({ tokens, count: tokens.length, filter, sort, chain });
});

// ── Token search ──────────────────────────────────────────────────────────────
app.get("/api/pump/search", async (req, res) => {
  const q     = (req.query.q     as string) || "";
  const chain = (req.query.chain as string) || "sol";
  if (!q) { res.json({ tokens: [] }); return; }

  let tokens: any[] = [];

  if (chain === "sol") {
    try {
      const r = await fetch(
        `${PUMPFUN_API}/coins/search?searchTerm=${encodeURIComponent(q)}&offset=0&limit=20&includeNsfw=false`,
        { headers: HEADERS, signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const data: any = await r.json();
        const coins = Array.isArray(data) ? data : (data.coins ?? []);
        tokens = coins.map(normalizePumpCoin);
      }
    } catch { /* fall through */ }
  }

  if (!tokens.length) {
    try {
      const chainQ = chain === "eth" ? "&chainIds=ethereum" : "&chainIds=solana";
      const r = await fetch(
        `${DEX_API}/latest/dex/search?q=${encodeURIComponent(q)}${chainQ}`,
        { headers: HEADERS, signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const data: any = await r.json();
        tokens = (data.pairs ?? []).slice(0, 20).map((p: any) => ({
          name:        p.baseToken?.name ?? "Unknown",
          symbol:      p.baseToken?.symbol ?? "???",
          description: `${p.baseToken?.name ?? ""} on ${p.dexId ?? ""}.`,
          imageUrl:    p.info?.imageUrl ? `/api/img?url=${encodeURIComponent(p.info.imageUrl)}` : "",
          marketCap:   p.fdv ?? 0,
          contractAddress: p.baseToken?.address ?? "",
          creator:     p.pairAddress ?? "",
          progress:    Math.floor(Math.random() * 80 + 10),
          replies:     Math.floor(Math.random() * 200 + 5),
          priceChange: p.priceChange ?? { h24: 0 },
          volume:      p.volume ?? { h24: 0 },
          chain,
          dex:    p.dexId ?? "",
          dexUrl: p.url   ?? "",
        }));
      }
    } catch { /* give up */ }
  }

  res.json({ tokens, count: tokens.length });
});

// ── Live ticker ───────────────────────────────────────────────────────────────
app.get("/api/pump/ticker", async (_req, res) => {
  let items: any[] = [];
  try {
    const r = await fetch(
      `${DEX_API}/latest/dex/search?q=sol&chainIds=solana`,
      { headers: HEADERS, signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const data: any = await r.json();
      items = (data.pairs ?? []).slice(0, 24).map((p: any) => {
        const raw  = Number(p.priceUsd ?? 0);
        const chg  = Number(p.priceChange?.h24 ?? 0);
        const dec  = raw < 0.00001 ? 10 : raw < 0.001 ? 8 : raw < 1 ? 6 : 4;
        return {
          sym:    p.baseToken?.symbol ?? "???",
          price:  raw > 0 ? `$${raw.toFixed(dec)}` : "N/A",
          change: `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%`,
          up:     chg >= 0,
        };
      });
    }
  } catch { /* client uses static fallback */ }
  res.json({ items });
});

// ── KOTH (King of the Hill) — top pump.fun coin ───────────────────────────────
app.get("/api/pump/koth", async (_req, res) => {
  try {
    const r = await fetch(
      `${PUMPFUN_API}/coins?sort=usd_market_cap&order=DESC&offset=0&limit=1&includeNsfw=false`,
      { headers: HEADERS, signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const data: any = await r.json();
      const coins = Array.isArray(data) ? data : (data.coins ?? []);
      if (coins[0]) {
        res.json(normalizePumpCoin(coins[0]));
        return;
      }
    }
  } catch { /* fall through */ }
  res.json(null);
});

// ── Admin API ─────────────────────────────────────────────────────────────────
app.get("/api/stats",    authGuard, (_req, res) => res.json({ ...getOrderStats(), activeSessions: getActiveSessionCount(), uptime: formatUptime(Date.now() - startTime) }));
app.get("/api/orders",   authGuard, (_req, res) => res.json(getAllOrders()));
app.get("/api/sessions", authGuard, (_req, res) => res.json(getAllSessions()));

export default app;
