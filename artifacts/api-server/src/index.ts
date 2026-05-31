import app from "./app.js";
import { logger } from "./lib/logger.js";
import { createBot } from "./bot/index.js";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

const token = process.env["TELEGRAM_BOT_TOKEN"];
if (!token) {
  logger.warn("TELEGRAM_BOT_TOKEN not set — starting HTTP server only");
  app.listen(port, "0.0.0.0", () => logger.info({ port }, "Server listening (no bot)"));
} else {
  const bot = createBot();

  // Set bot profile on startup from env vars
  const botDisplayName = process.env["BOT_DISPLAY_NAME"] ?? "Pump.fun Booster Bot";
  bot.telegram.setMyName(botDisplayName).catch(() => {});
  bot.telegram.setMyDescription(
    "🚀 #1 Pump.fun Booster Bot — Volume Boosting, SOL/ETH Trending, DexScreener & PumpFun Trending.\n\n" +
    "240,981+ monthly users. Fast, cheap, real results.\n\n" +
    "Start with /start"
  ).catch(() => {});
  bot.telegram.setMyShortDescription(
    "Volume Boost • SOL/ETH Trending • DexScreener • Pump.fun Trending"
  ).catch(() => {});

  const renderHostname = process.env["RENDER_EXTERNAL_HOSTNAME"];
  const webhookDomain = renderHostname
    ? `https://${renderHostname}`
    : process.env["WEBHOOK_DOMAIN"] ?? null;

  if (webhookDomain) {
    // ── Webhook mode (Render production) ─────────────────────────────────────
    const secretPath = `/telegraf/${bot.secretPathComponent()}`;

    // Mount Telegraf BEFORE any body-parsing middleware so it reads raw body
    app.use(bot.webhookCallback(secretPath));

    const server = app.listen(port, "0.0.0.0", () => {
      logger.info({ port, mode: "webhook", webhookDomain }, "Server listening");

      // Register webhook with Telegram
      bot.telegram
        .setWebhook(`${webhookDomain}${secretPath}`, {
          allowed_updates: ["message", "callback_query"],
        })
        .then(() => logger.info({ webhookDomain, secretPath }, "Webhook registered"))
        .catch((err) => logger.error({ err }, "Failed to set webhook"));
    });

    // Keep Render free tier alive — ping own health every 10 min
    const keepAliveInterval = setInterval(() => {
      fetch(`${webhookDomain}/health`)
        .then(() => logger.debug("Keep-alive ping OK"))
        .catch((err) => logger.debug({ err }, "Keep-alive ping failed"));
    }, 10 * 60 * 1000);

    // Graceful shutdown for Render SIGTERM
    const shutdown = (signal: string) => {
      logger.info({ signal }, "Shutting down gracefully");
      clearInterval(keepAliveInterval);
      bot.telegram.deleteWebhook().catch(() => {});
      server.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10_000);
    };

    process.once("SIGINT",  () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

  } else {
    // ── Long-poll mode (Replit dev / local) ──────────────────────────────────
    bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});

    const server = app.listen(port, "0.0.0.0", () => {
      logger.info({ port, mode: "long-poll" }, "Server listening");
      bot
        .launch({ dropPendingUpdates: true })
        .catch((err: unknown) => logger.error({ err }, "Bot launch failed"));
    });

    const shutdown = (signal: string) => {
      logger.info({ signal }, "Shutting down");
      bot.stop(signal);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 5_000);
    };

    process.once("SIGINT",  () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  }
}
