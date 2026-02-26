# Complete Cherry 🍒 Bot clone - best effort with pyTelegramBotAPI
# Very heavy emoji usage, step-by-step editing, inline + reply keyboards
# Volume / DEX buttons only link to @PF_raiders_bot (no "open" text)
# Admin approval on every payment (advertise / boost / etc.)
# Auto-hype new coins in channels (simulated polling)
# Ready for Render deployment

# requirements.txt content:
# pyTelegramBotAPI==4.22.1
# requests==2.32.3
# python-dotenv (optional)

import telebot
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove
import requests
import uuid
import time
import threading
from datetime import datetime

# ────────────────────────────────────────────────
# CONFIG - CHANGE THESE
# ────────────────────────────────────────────────

TOKEN = "8681927418:AAHLbJwC8eyKdw3Vr4LhbgQn2Fu6u9eWfPw"
ADMIN_ID = 5578314612
SOL_WALLET = "EaFeqxptPuo2jy3dA8dRsgRz8JRCPSK5mXT3qZZYT7f3"

RAID_CHANNEL     = "@cherryraid"
TRENDING_CHANNEL = "@cherrytrending"

bot = telebot.TeleBot(TOKEN)

# States
ad_states       = {}
boost_states    = {}
pending_payments = {}

# Prices (exact from your screenshots)
AD_PRICES = {"3h": 2.1, "6h": 3.3, "12h": 5.5, "24h": 9.1}
BOOST_PRICES = {1000: 1.5, 2000: 2.9, 4000: 5.4, 8000: 9.0}

# ────────────────────────────────────────────────
# ADMIN APPROVAL HELPER
# ────────────────────────────────────────────────

def notify_admin(payment_id, user_id, amount_sol, feature, extra_info=""):
    kb = InlineKeyboardMarkup()
    kb.row(
        InlineKeyboardButton("✅ Approve", callback_data=f"admin_approve_{payment_id}"),
        InlineKeyboardButton("❌ Reject",  callback_data=f"admin_reject_{payment_id}")
    )

    msg = (
        f"🍒 <b>PAYMENT APPROVAL REQUEST</b>\n\n"
        f"👤 User: {user_id}\n"
        f"💎 Feature: {feature}\n"
        f"💰 Amount: {amount_sol} SOL\n"
        f"{extra_info}\n\n"
        f"Approve or Reject?"
    )

    bot.send_message(ADMIN_ID, msg, parse_mode="HTML", reply_markup=kb)

# ────────────────────────────────────────────────
# START + MAIN SCREEN (closest to screenshot style)
# ────────────────────────────────────────────────

@bot.message_handler(commands=['start'])
def start(message):
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("🔥 Buy Token Trending", callback_data="menu_buy_trending"),
        InlineKeyboardButton("🏆 Raid Leaderboard",   callback_data="menu_raid_leaderboard")
    )
    kb.row(
        InlineKeyboardButton("⚡ Boost Raid Points",   callback_data="boost"),
        InlineKeyboardButton("📢 Advertise",           callback_data="advertise")
    )
    kb.row(
        InlineKeyboardButton("🔥 Volume Boost",        callback_data="volume"),
        InlineKeyboardButton("🌟 DEX Trending",        callback_data="dex")
    )

    text = (
        "🍒 <b>Cherry Bot</b>\n"
        "43,003 monthly users 🔥\n\n"
        "Track buys • Run raids • Boost trending • Advertise\n\n"
        "<i>Choose action below 🍒</i>"
    )

    bot.send_message(message.chat.id, text, parse_mode="HTML", reply_markup=kb)

# ────────────────────────────────────────────────
# MENU CALLBACKS
# ────────────────────────────────────────────────

@bot.callback_query_handler(func=lambda c: True)
def callback(call):
    cid = call.message.chat.id
    mid = call.message.message_id
    uid = call.from_user.id

    if call.data == "advertise":
        start_advertise(call.message)

    elif call.data == "boost":
        start_boost(call.message)

    elif call.data == "volume" or call.data == "dex":
        volume_boost(call.message)

    elif call.data == "menu_buy_trending":
        bot.answer_callback_query(call.id, "Use /checktrending or /booktrending 🍒")

    elif call.data == "menu_raid_leaderboard":
        bot.answer_callback_query(call.id, "Check @cherryraid leaderboard 🍒")

    elif call.data.startswith("ad_dur_"):
        dur = call.data.split("_")[-1]
        if dur in AD_PRICES:
            ad_states[uid]["duration"] = dur
            ad_states[uid]["amount"] = AD_PRICES[dur]
            show_ad_payment(cid, mid, uid)

    elif call.data == "ad_verify":
        handle_ad_verify(call)

    elif call.data == "boost_verify":
        handle_boost_verify(call)

    elif call.data.startswith("admin_approve_") or call.data.startswith("admin_reject_"):
        if uid != ADMIN_ID:
            bot.answer_callback_query(call.id, "Not authorized", show_alert=True)
            return
        handle_admin_decision(call)

    bot.answer_callback_query(call.id)

# ────────────────────────────────────────────────
# ADVERTISE FLOW ────────────────────────────────
# ────────────────────────────────────────────────

def start_advertise(message):
    uid = message.from_user.id
    cid = message.chat.id

    ad_states[uid] = {"step": 1, "attempt": 0}

    promo = (
        "🔥 <b>Ad Boost X — Crypto Volume</b> 🔥\n\n"
        "500.000 volume = 7.7 SOL\n"
        "Below-market • EVM support • All pools\n"
        "Free test • Stable execution 🍒"
    )
    bot.send_message(cid, promo, parse_mode="HTML")

    step1 = (
        "📝 <b>Step 1: Ad Text</b>\n\n"
        "Send your ad text\n"
        "<i>max 64 characters</i>\n\n"
        "Tips:\n"
        "• Clear & engaging\n"
        "• Call-to-action\n"
        "• Relevant"
    )
    bot.send_message(cid, step1, parse_mode="HTML")

@bot.message_handler(func=lambda m: m.from_user.id in ad_states and ad_states[m.from_user.id]["step"] == 1)
def ad_text(m):
    uid = m.from_user.id
    txt = m.text.strip()

    if len(txt) > 64:
        ad_states[uid]["attempt"] += 1
        if ad_states[uid]["attempt"] >= 3:
            del ad_states[uid]
            bot.reply_to(m, "Too many invalid attempts • Cancelled 🍒")
            return
        bot.reply_to(m, f"Text too long ({len(txt)}/64) • Try again")
        return

    ad_states[uid]["text"] = txt
    ad_states[uid]["step"] = 2

    step2 = (
        f"🔗 <b>Step 2: Ad Link</b>\n\n"
        f"Your text: {txt}\n\n"
        "Send link\n"
        "<i>must start with http:// or https://</i>"
    )
    bot.reply_to(m, step2, parse_mode="HTML")

@bot.message_handler(func=lambda m: m.from_user.id in ad_states and ad_states[m.from_user.id]["step"] == 2)
def ad_link(m):
    uid = m.from_user.id
    link = m.text.strip()

    if not (link.startswith("http://") or link.startswith("https://")):
        ad_states[uid]["attempt"] += 1
        if ad_states[uid]["attempt"] >= 3:
            del ad_states[uid]
            bot.reply_to(m, "Too many invalid attempts • Cancelled 🍒")
            return
        bot.reply_to(m, f"Invalid address: {link}\nMust start with http(s):// • Try again")
        return

    ad_states[uid]["link"] = link
    ad_states[uid]["step"] = 3

    kb = ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    kb.add(KeyboardButton("Solana"))

    step3 = (
        f"🌐 <b>Step 3: Payment Chain</b>\n\n"
        f"Text: {ad_states[uid]['text']}\n"
        f"Link: {link}\n\n"
        "Choose chain:"
    )
    bot.send_message(m.chat.id, step3, parse_mode="HTML", reply_markup=kb)

@bot.message_handler(func=lambda m: m.from_user.id in ad_states and ad_states[m.from_user.id]["step"] == 3 and m.text == "Solana")
def ad_chain(m):
    uid = m.from_user.id
    ad_states[uid]["chain"] = "Solana"
    ad_states[uid]["step"] = 4

    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(InlineKeyboardButton("🕒 3H - 2.1 SOL", callback_data="ad_dur_3h"))
    kb.add(InlineKeyboardButton("🕒 6H - 3.3 SOL", callback_data="ad_dur_6h"))
    kb.add(InlineKeyboardButton("🕒 12H - 5.5 SOL", callback_data="ad_dur_12h"))
    kb.add(InlineKeyboardButton("🕒 24H - 9.1 SOL", callback_data="ad_dur_24h"))
    kb.add(InlineKeyboardButton("❌ Cancel", callback_data="cancel"))

    step4 = (
        f"⏰ <b>Step 4: Ad Duration</b>\n\n"
        f"Text: {ad_states[uid]['text']}\n"
        f"Link: {ad_states[uid]['link']}\n"
        f"Chain: Solana\n\n"
        "Choose duration:"
    )
    bot.send_message(m.chat.id, step4, parse_mode="HTML", reply_markup=kb)

def show_ad_payment(cid, mid, uid):
    amount = ad_states[uid]["amount"]
    dur = ad_states[uid]["duration"].upper()

    text = (
        f"Send exactly: <b>{amount} SOL</b>\n"
        f"To wallet:\n<code>{SOL_WALLET}</code>\n\n"
        f"⚠️ <b>Important:</b>\n"
        f"• Exact amount only\n"
        f"• Copy-paste wallet\n"
        f"• Solana network only\n\n"
        f"After sending → click Verify Payment"
    )

    kb = InlineKeyboardMarkup()
    kb.row(
        InlineKeyboardButton("✅ Verify Payment", callback_data="ad_verify"),
        InlineKeyboardButton("❌ Cancel", callback_data="cancel")
    )

    bot.edit_message_text(text, cid, mid, parse_mode="HTML", reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "ad_verify")
def handle_ad_verify(c):
    uid = c.from_user.id
    if uid not in ad_states:
        return

    amount = ad_states[uid]["amount"]
    pid = str(uuid.uuid4())[:12]

    pending_payments[pid] = {
        "user_id": uid,
        "type": "advertise",
        "amount": amount,
        "details": ad_states[uid],
        "chat_id": c.message.chat.id,
        "msg_id": c.message.message_id
    }

    extra = f"Duration: {ad_states[uid]['duration']}h | Text: {ad_states[uid]['text'][:30]}..."
    notify_admin(pid, uid, amount, "Advertise", extra)

    bot.edit_message_text("Waiting for admin approval... ⏳ 🍒", c.message.chat.id, c.message.message_id)

# ────────────────────────────────────────────────
# BOOST FLOW ─────────────────────────────────────
# ────────────────────────────────────────────────

def start_boost(message):
    uid = message.from_user.id
    cid = message.chat.id

    boost_states[uid] = {}

    text = (
        "⚡ <b>Boost Raid Leaderboard Points</b> ⚡\n\n"
        "Boost your rank on @cherryraid!\n\n"
        "Benefits:\n"
        "• Top 3 appear in all raiding groups\n"
        "• Higher leaderboard rank\n"
        "• Raid leaderboard alerts\n"
        "• Raid start alerts\n\n"
        "Choose points package:"
    )

    kb = InlineKeyboardMarkup(row_width=2)
    for pts, price in BOOST_PRICES.items():
        kb.add(InlineKeyboardButton(f"{pts:,} pts – {price} SOL", callback_data=f"boost_{pts}"))
    kb.add(InlineKeyboardButton("❌ Cancel", callback_data="cancel"))

    bot.send_message(cid, text, parse_mode="HTML", reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("boost_"))
def boost_select(c):
    uid = c.from_user.id
    pts = int(c.data.split("_")[1])
    amount = BOOST_PRICES[pts]

    boost_states[uid] = {"points": pts, "amount": amount}

    text = (
        f"Selected: <b>{pts:,} points</b> for <b>{amount} SOL</b>\n\n"
        f"Send exactly <b>{amount} SOL</b>\n"
        f"To: <code>{SOL_WALLET}</code>\n\n"
        f"⚠️ <b>Important:</b>\n"
        f"• Exact amount\n"
        f"• Copy wallet\n"
        f"• Solana only\n\n"
        f"After send → Verify Payment"
    )

    kb = InlineKeyboardMarkup()
    kb.row(
        InlineKeyboardButton("✅ Verify Payment", callback_data="boost_verify"),
        InlineKeyboardButton("❌ Cancel", callback_data="cancel")
    )

    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, parse_mode="HTML", reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "boost_verify")
def handle_boost_verify(c):
    uid = c.from_user.id
    if uid not in boost_states:
        return

    amount = boost_states[uid]["amount"]
    pid = str(uuid.uuid4())[:12]

    pending_payments[pid] = {
        "user_id": uid,
        "type": "boost",
        "amount": amount,
        "details": boost_states[uid],
        "chat_id": c.message.chat.id,
        "msg_id": c.message.message_id
    }

    extra = f"{boost_states[uid]['points']:,} points"
    notify_admin(pid, uid, amount, "Raid Boost", extra)

    bot.edit_message_text("Waiting for admin approval... ⏳ 🍒", c.message.chat.id, c.message.message_id)

# ────────────────────────────────────────────────
# ADMIN APPROVE / REJECT
# ────────────────────────────────────────────────

@bot.callback_query_handler(func=lambda c: c.from_user.id == ADMIN_ID and c.data.startswith(("admin_approve_", "admin_reject_")))
def handle_admin_decision(c):
    action, pid = c.data.split("_", 2)[1:]
    if pid not in pending_payments:
        bot.answer_callback_query(c.id, "Expired", show_alert=True)
        return

    p = pending_payments.pop(pid)
    uid = p["user_id"]
    cid = p["chat_id"]
    mid = p["msg_id"]

    if action == "approve":
        if p["type"] == "advertise":
            d = p["details"]
            bot.send_message(TRENDING_CHANNEL, f"New approved ad 🍒\n{d['text']}\n{d['link']}")
            result = "✅ Approved! Your ad is live 🍒"
        elif p["type"] == "boost":
            result = f"✅ Approved! {p['details']['points']:,} points added 🍒"

        bot.send_message(uid, result)
        bot.edit_message_text(result, cid, mid)

    else:
        bot.send_message(uid, "❌ Payment rejected by admin 🍒\nContact support if needed.")
        bot.edit_message_text("Rejected by admin 🍒", cid, mid)

    bot.answer_callback_query(c.id, f"{action.title()}d")

# ────────────────────────────────────────────────
# VOLUME BOOST ───────────────────────────────────
# ────────────────────────────────────────────────

def volume_boost(message):
    text = (
        "🔥 <b>Volume Boost & DEX Trending</b> 🔥\n\n"
        "Powered by\n"
        "@PF_raiders_bot\n\n"
        "Click button below:"
    )

    kb = InlineKeyboardMarkup()
    kb.add(InlineKeyboardButton("@PF_raiders_bot", url="https://t.me/PF_raiders_bot"))

    bot.send_message(message.chat.id, text, parse_mode="HTML", reply_markup=kb)

# ────────────────────────────────────────────────
# AUTO HYPE THREAD (simulated)
# ────────────────────────────────────────────────

def auto_hype():
    while True:
        time.sleep(3600)  # 1 hour
        try:
            msg = (
                "🚀 <b>HOT NEW COIN DETECTED</b> 🚀\n\n"
                "Fast rising MC • Strong volume\n"
                "Add now → /add <CA>\n"
                "Then raid • boost • advertise 🍒"
            )
            bot.send_message(TRENDING_CHANNEL, msg, parse_mode="HTML")
            bot.send_message(RAID_CHANNEL, msg, parse_mode="HTML")
        except:
            pass

threading.Thread(target=auto_hype, daemon=True).start()

# ────────────────────────────────────────────────
# RUN
# ────────────────────────────────────────────────

print("🍒 Cherry Bot running...")
bot.infinity_polling(timeout=10)
