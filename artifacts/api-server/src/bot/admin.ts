import type { Telegraf } from "telegraf";
import { logger } from "../lib/logger.js";

let botRef: Telegraf | null = null;

export function setBot(bot: Telegraf) {
  botRef = bot;
}

export async function notifyAdmin(message: string, photoUrl?: string) {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId || !botRef) return;
  try {
    if (photoUrl) {
      try {
        await botRef.telegram.sendPhoto(adminId, photoUrl, {
          caption:    message,
          parse_mode: "HTML",
        });
        return;
      } catch {
        // photo send failed — fall through to text-only
      }
    }
    await botRef.telegram.sendMessage(adminId, message, { parse_mode: "HTML" });
  } catch (err) {
    logger.warn({ err }, "Failed to notify admin");
  }
}
