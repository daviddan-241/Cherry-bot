import type { Telegraf } from "telegraf";
import { logger } from "../lib/logger.js";

let botRef: Telegraf | null = null;

export function setBot(bot: Telegraf) {
  botRef = bot;
}

export async function notifyAdmin(message: string, photoUrl?: string) {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId || !botRef) {
    logger.warn("notifyAdmin: ADMIN_TELEGRAM_ID not set or bot not ready");
    return;
  }
  try {
    if (photoUrl) {
      try {
        await botRef.telegram.sendPhoto(adminId, photoUrl, {
          caption:    message,
          parse_mode: "HTML",
        });
        return;
      } catch (photoErr) {
        logger.warn({ photoErr }, "notifyAdmin: photo send failed, falling back to text");
      }
    }
    await botRef.telegram.sendMessage(adminId, message, { parse_mode: "HTML" });
  } catch (err: any) {
    const detail = err?.response?.description ?? err?.message ?? String(err);
    logger.error(
      { err, adminId, detail },
      `notifyAdmin FAILED — chat: ${adminId} | reason: ${detail}. ` +
      `If using a group, make sure the bot is added as a member and the group ID is correct (supergroups start with -100...).`
    );
  }
}
