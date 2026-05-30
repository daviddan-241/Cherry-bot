import app from "./app.js";
import { logger } from "./lib/logger.js";
import { createBot } from "./bot/index.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Start Telegram bot with auto-retry on 409 conflict
function launchBot(retryCount = 0) {
  try {
    const bot = createBot();

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));

    bot.launch({ dropPendingUpdates: true })
      .then(() => {
        logger.info("Telegram bot started successfully");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("409") && retryCount < 5) {
          const delay = (retryCount + 1) * 5000;
          logger.warn({ retryCount, delay }, "Bot 409 conflict — another instance running, retrying...");
          setTimeout(() => launchBot(retryCount + 1), delay);
        } else {
          logger.error({ err }, "Telegram bot launch failed permanently");
        }
      });
  } catch (err) {
    logger.error({ err }, "Failed to create bot");
  }
}

launchBot();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
