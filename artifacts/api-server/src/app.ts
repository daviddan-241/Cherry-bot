import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const app = express();

app.use(cors());
// NOTE: express.json() is NOT applied globally here so Telegraf's webhook
// middleware can read the raw body itself (required for webhook mode on Render).
// It is added by individual routes that need it.
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

app.get("/", (_req, res) => {
  res.json({ name: "Cherry Bot", status: "running" });
});

export default app;
