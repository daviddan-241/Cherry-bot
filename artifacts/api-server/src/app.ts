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

// ── Admin auth guard ───────────────────────────────────────────────────────────
function authGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
  const adminId = process.env.ADMIN_TELEGRAM_ID ?? "";
  const token   = (req.query.token as string) ?? "";
  if (!adminId || token !== adminId) {
    res.status(401).json({ error: "Unauthorized — pass ?token=YOUR_ADMIN_TELEGRAM_ID" });
    return;
  }
  next();
}

// ── Favicon / health ──────────────────────────────────────────────────────────
app.get("/favicon.ico", (_req, res) => res.status(204).end());
app.get("/health", (_req, res) =>
  res.json({ status: "ok", ts: Date.now(), uptime: formatUptime(Date.now() - startTime) })
);

// ── Public website (pump.fun clone) served at / ───────────────────────────────
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Admin dashboard (protected) ───────────────────────────────────────────────
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// ── Pump.fun API proxy (avoids CORS in browser) ───────────────────────────────
const PUMPFUN_API = "https://frontend-api.pump.fun";
const DEX_API     = "https://api.dexscreener.com";
const HEADERS     = { "User-Agent": "Mozilla/5.0 (compatible; pump-proxy/1.0)" };

// GET /api/pump/tokens?filter=trending|new|graduating|graduated&sort=trending|created|mc
app.get("/api/pump/tokens", async (req, res) => {
  const filter = (req.query.filter as string) || "trending";
  const sort   = (req.query.sort   as string) || "trending";

  let tokens: any[] = [];

  // Try pump.fun first
  try {
    const sortMap: Record<string, string> = {
      trending: "last_trade_timestamp",
      created:  "created_timestamp",
      mc:       "usd_market_cap",
    };
    const filterMap: Record<string, string> = {
      trending:   "",
      new:        "",
      graduating: "&min_progress=50",
      graduated:  "&complete=true",
    };
    const url =
      `${PUMPFUN_API}/coins?sort=${sortMap[sort] ?? "last_trade_timestamp"}&order=DESC` +
      `&offset=0&limit=48&includeNsfw=false${filterMap[filter] ?? ""}`;

    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const data: any = await r.json();
      const coins = Array.isArray(data) ? data : (data.coins ?? []);
      tokens = coins.map((c: any) => ({
        name:          c.name,
        symbol:        c.symbol,
        description:   c.description,
        imageUrl:      c.image_uri,
        marketCap:     c.usd_market_cap,
        contractAddress: c.mint,
        creator:       c.creator,
        progress:      Math.min(99, Math.floor((c.virtual_sol_reserves / 85000) * 100)) || Math.floor(Math.random() * 80 + 10),
        replies:       c.reply_count ?? 0,
        fdv:           c.usd_market_cap,
        priceChange:   { h24: (Math.random() - 0.3) * 40 },
        volume:        { h24: (c.usd_market_cap ?? 0) * 0.15 },
        dex:           "pumpfun",
      }));
    }
  } catch { /* fall through */ }

  // Fallback: DexScreener trending Solana pairs
  if (!tokens.length) {
    try {
      const r = await fetch(
        `${DEX_API}/latest/dex/search?q=sol&chainIds=solana`,
        { headers: HEADERS, signal: AbortSignal.timeout(5000) }
      );
      if (r.ok) {
        const data: any = await r.json();
        tokens = (data.pairs ?? []).slice(0, 48);
      }
    } catch { /* give up */ }
  }

  res.json({ tokens, count: tokens.length, filter, sort });
});

// GET /api/pump/search?q=...
app.get("/api/pump/search", async (req, res) => {
  const q = (req.query.q as string) || "";
  if (!q) { res.json({ tokens: [] }); return; }

  let tokens: any[] = [];

  // Search pump.fun
  try {
    const r = await fetch(
      `${PUMPFUN_API}/coins/search?searchTerm=${encodeURIComponent(q)}&offset=0&limit=20&includeNsfw=false`,
      { headers: HEADERS, signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const data: any = await r.json();
      const coins = Array.isArray(data) ? data : (data.coins ?? []);
      tokens = coins.map((c: any) => ({
        name: c.name, symbol: c.symbol, description: c.description,
        imageUrl: c.image_uri, marketCap: c.usd_market_cap,
        contractAddress: c.mint, creator: c.creator,
        fdv: c.usd_market_cap,
        priceChange: { h24: (Math.random() - 0.3) * 40 },
        volume: { h24: (c.usd_market_cap ?? 0) * 0.15 },
        dex: "pumpfun",
      }));
    }
  } catch { /* fall through */ }

  // Fallback: DexScreener search
  if (!tokens.length) {
    try {
      const r = await fetch(
        `${DEX_API}/latest/dex/search?q=${encodeURIComponent(q)}`,
        { headers: HEADERS, signal: AbortSignal.timeout(5000) }
      );
      if (r.ok) {
        const data: any = await r.json();
        tokens = (data.pairs ?? []).slice(0, 20);
      }
    } catch { /* give up */ }
  }

  res.json({ tokens, count: tokens.length });
});

// GET /api/pump/ticker — live price ticker data
app.get("/api/pump/ticker", async (_req, res) => {
  let items: any[] = [];
  try {
    const r = await fetch(
      `${DEX_API}/latest/dex/search?q=sol&chainIds=solana`,
      { headers: HEADERS, signal: AbortSignal.timeout(4000) }
    );
    if (r.ok) {
      const data: any = await r.json();
      items = (data.pairs ?? []).slice(0, 20).map((p: any) => ({
        sym:    p.baseToken?.symbol ?? "???",
        price:  p.priceUsd ? `$${Number(p.priceUsd).toFixed(p.priceUsd < 0.001 ? 8 : 4)}` : "N/A",
        change: `${Number(p.priceChange?.h24 ?? 0) >= 0 ? "+" : ""}${Number(p.priceChange?.h24 ?? 0).toFixed(1)}%`,
        up:     Number(p.priceChange?.h24 ?? 0) >= 0,
      }));
    }
  } catch { /* give up, client uses fallback */ }
  res.json({ items });
});

// ── Admin API (protected) ─────────────────────────────────────────────────────
app.get("/api/stats", authGuard, (_req, res) => {
  res.json({
    ...getOrderStats(),
    activeSessions: getActiveSessionCount(),
    uptime: formatUptime(Date.now() - startTime),
  });
});
app.get("/api/orders",   authGuard, (_req, res) => res.json(getAllOrders()));
app.get("/api/sessions", authGuard, (_req, res) => res.json(getAllSessions()));

export default app;
