import type { Telegraf } from "telegraf";

let botRef: Telegraf | null = null;

export function setBot(bot: Telegraf) {
  botRef = bot;
}

export async function notifyAdmin(message: string) {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId || !botRef) return;
  try {
    await botRef.telegram.sendMessage(adminId, message, { parse_mode: "HTML" });
  } catch (e) {
    // silent
  }
}
