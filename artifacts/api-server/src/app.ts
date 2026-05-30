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
// NOTE: express.json() NOT applied globally — Telegraf webhook reads raw body
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

// ── Auth guard ────────────────────────────────────────────────────────────────
function authGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
  const adminId = process.env.ADMIN_TELEGRAM_ID ?? "";
  const token   = (req.query.token as string) ?? "";
  if (!adminId || token !== adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ── Health / root ─────────────────────────────────────────────────────────────
// Suppress favicon 404
app.get("/favicon.ico", (_req, res) => { res.status(204).end(); });

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: Date.now(), uptime: formatUptime(Date.now() - startTime) });
});

app.get("/", (_req, res) => {
  res.json({ name: "Cherry Bot (@Boost_onDex_bot)", status: "running" });
});

// ── Admin dashboard (serves dashboard.html) ────────────────────────────────────
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// ── API: stats ────────────────────────────────────────────────────────────────
app.get("/api/stats", authGuard, (_req, res) => {
  const stats = getOrderStats();
  res.json({
    ...stats,
    activeSessions: getActiveSessionCount(),
    uptime: formatUptime(Date.now() - startTime),
  });
});

// ── API: all orders ───────────────────────────────────────────────────────────
app.get("/api/orders", authGuard, (_req, res) => {
  res.json(getAllOrders());
});

// ── API: all sessions ─────────────────────────────────────────────────────────
app.get("/api/sessions", authGuard, (_req, res) => {
  res.json(getAllSessions());
});

export default app;
