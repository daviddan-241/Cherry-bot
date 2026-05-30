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
  app.listen(port, () => logger.info({ port }, "Server listening (no bot)"));
} else {
  const bot = createBot();

  const renderHostname = process.env["RENDER_EXTERNAL_HOSTNAME"];
  const webhookDomain = renderHostname
    ? `https://${renderHostname}`
    : process.env["WEBHOOK_DOMAIN"] ?? null;

  if (webhookDomain) {
    // ── Webhook mode (Render production) ─────────────────────────────────
    const secretPath = `/telegraf/${bot.secretPathComponent()}`;
    app.use(bot.webhookCallback(secretPath));

    app.listen(port, () => {
      logger.info({ port, mode: "webhook", webhookDomain }, "Server listening");
      bot.telegram
        .setWebhook(`${webhookDomain}${secretPath}`)
        .then(() => logger.info({ webhookDomain }, "Webhook registered"))
        .catch((err) => logger.error({ err }, "Failed to set webhook"));
    });
  } else {
    // ── Long-poll mode (local / Replit dev) ───────────────────────────────
    bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});

    app.listen(port, () => {
      logger.info({ port, mode: "long-poll" }, "Server listening");
      bot
        .launch({ dropPendingUpdates: true })
        .then(() => logger.info("Bot launched (long-poll)"))
        .catch((err: unknown) => logger.error({ err }, "Bot launch failed"));
    });
  }

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
