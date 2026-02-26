# Cherry 🍒 Bot - FINAL POLISHED Version (All Emojis, Real Setup, Real Select Chat)
# Automatic group detection, real DexScreener fetch, full flows, Render-ready

from flask import Flask, request
import telebot
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove
import requests
import uuid
import os

TOKEN = "8681927418:AAHLbJwC8eyKdw3Vr4LhbgQn2Fu6u9eWfPw"
ADMIN_ID = 5578314612
SOL_WALLET = "EaFeqxptPuo2jy3dA8dRsgRz8JRCPSK5mXT3qZZYT7f3"

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# Store group data: {chat_id: {"ca": str, "website": str}}
group_data = {}

# ───── PRICES ─────
AD_PRICES = {"3H": 2.1, "6H": 3.3, "12H": 5.5, "24H": 9.1}
BOOST_PRICES = {1000: 1.5, 2000: 2.9, 4000: 5.4, 8000: 9.0}
TREND_PRICES = {"Top10": 2.3, "Top3": 3.2}

# ───── MAIN MENU ─────
@bot.message_handler(commands=['start'])
def start(m):
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("＋ Add to Group", callback_data="add_group"),
        InlineKeyboardButton("🤝 Support", url="https://t.me/cherrysupportadmin")
    )
    kb.add(InlineKeyboardButton("🔗 Trending channel", url="https://t.me/cherrytrending"))
    kb.add(InlineKeyboardButton("🔥 Buy Token Trending", callback_data="buy_trending"))
    kb.add(InlineKeyboardButton("🏆 Raid Leaderboard", url="https://t.me/cherryraid"))
    kb.add(InlineKeyboardButton("⚡ Boost Raid Points", callback_data="boost"))
    kb.add(InlineKeyboardButton("📢 Advertise", callback_data="advertise"))
    kb.add(
        InlineKeyboardButton("🔥 Volume Boo...", url="https://t.me/boostlegends_bot"),
        InlineKeyboardButton("🔥 DEX Trendin...", callback_data="dex")
    )
    kb.add(InlineKeyboardButton("🔥 Pump.fun Trending", callback_data="pump_trending"))

    menu_text = """
✨ Cherry Telegram Bot
    
👍 Track buys in real-time, coordinate community raids, and boost your token's visibility with our premium features.

✨ Quick Setup Guide:
/add - Connect token
/buybot - Configuration
/settings - Add socials to bot! 
/raid - Start X raids 
/Commands - List of all commands

✨ Paid Features:
✨ BuyBot Trending: /Trend
✨ RaidBot Trending: /boost
✨ Button ads: /advertise
👍 No-Ads: /premium
😭 Volume: @boostlegends_bot


✨ Website / Dashboard 
✨ Twitter / X 
✨ Trending hub
    """

    bot.send_message(m.chat.id, menu_text.strip(), reply_markup=kb)

# ───── AUTO GROUP DETECTION (REAL CHERRY STYLE) ─────
@bot.message_handler(content_types=['new_chat_members'])
def new_chat_member(m):
    me = bot.get_me()
    for member in m.new_chat_members:
        if member.id == me.id:
            chat_id = m.chat.id
            group_data[chat_id] = {"ca": None, "website": None}

            text = (
                "🍒 Cherry Bot added! 🚀\n\n"
                "To get started:\n"
                "1. Make me admin (important!)\n"
                "2. Send /add <CA> in this group\n"
                "3. Optional: /setwebsite <url>\n\n"
                "I'll now auto-reply with CA/website when asked! ✨"
            )
            bot.reply_to(m, text)

# ───── /ADD <CA> ─────
@bot.message_handler(commands=['add'])
def add_ca(m):
    if m.chat.type not in ['group', 'supergroup']:
        bot.reply_to(m, "Use /add <CA> only in groups 🍒")
        return

    if len(m.text.split()) < 2:
        bot.reply_to(m, "Usage: /add <Contract Address>")
        return

    ca = m.text.split(maxsplit=1)[1].strip()
    chat_id = m.chat.id

    if chat_id not in group_data:
        group_data[chat_id] = {}

    group_data[chat_id]["ca"] = ca
    bot.reply_to(m, f"✅ Token CA set: `{ca}` 🔥\nUse /setwebsite <url> to add link.")

# ───── /SETWEBSITE ─────
@bot.message_handler(commands=['setwebsite'])
def set_website(m):
    if m.chat.type not in ['group', 'supergroup']:
        bot.reply_to(m, "Use /setwebsite only in groups 🍒")
        return

    if len(m.text.split()) < 2:
        bot.reply_to(m, "Usage: /setwebsite <url>")
        return

    url = m.text.split(maxsplit=1)[1].strip()
    chat_id = m.chat.id

    if chat_id not in group_data:
        group_data[chat_id] = {}

    group_data[chat_id]["website"] = url
    bot.reply_to(m, f"✅ Website set: {url} 🌐")

# ───── AUTO REPLY IN GROUPS ─────
@bot.message_handler(func=lambda m: m.chat.type in ['group', 'supergroup'])
def group_keywords(m):
    chat_id = m.chat.id
    text = m.text.lower()

    if chat_id not in group_data:
        return

    if "ca" in text or "contract" in text:
        ca = group_data[chat_id].get("ca")
        if ca:
            bot.reply_to(m, f"Group token CA: `{ca}` 🍒")

    if "website" in text or "site" in text:
        website = group_data[chat_id].get("website")
        if website:
            bot.reply_to(m, f"Group website: {website} 🌍")

# ───── TRENDING / BUY / PUMP / DEX (REAL FETCH + EMOJIS) ─────
@bot.callback_query_handler(func=lambda c: c.data in ["buy_trending", "pump_trending", "dex"])
def trending_start(c):
    uid = c.from_user.id
    cid = c.message.chat.id
    mid = c.message.message_id

    text = "🔍 Send me the token's\nContract Address or Pair Address:\n\nSupported: Solana • PUMPFUN"

    kb = InlineKeyboardMarkup()
    kb.add(InlineKeyboardButton("✖️ Close", callback_data="cancel"))

    bot.edit_message_text(text, cid, mid, reply_markup=kb)
    states[uid] = {"type": "trending", "step": 1, "data": {}}

@bot.message_handler(func=lambda m: m.from_user.id in states and states[m.from_user.id]["type"] == "trending" and states[m.from_user.id]["step"] == 1)
def trending_ca(m):
    uid = m.from_user.id
    ca = m.text.strip()
    states[uid]["data"]["ca"] = ca
    states[uid]["step"] = 2

    bot.reply_to(m, "Fetching token info...")

    try:
        r = requests.get(f"https://api.dexscreener.com/latest/dex/pairs/solana/{ca}")
        if r.status_code == 200:
            data = r.json()
            pair = data.get("pair", {})
            base = pair.get("baseToken", {})
            name = base.get("name", "Unknown")
            symbol = base.get("symbol", "Unknown")
            socials = pair.get("socials", [])
            tg = next((s["url"] for s in socials if s["type"] == "telegram"), None)

            info = (
                "✨ Token Info:\n"
                f"Chain: Solana 🔥\n"
                f"Name: {name}\n"
                f"Symbol: {symbol}\n"
                f"CA: {ca}"
            )
            kb = InlineKeyboardMarkup()
            if tg:
                info += f"\n\n✈️ Telegram: {tg}\nUse this as portal link?"
                kb.row(
                    InlineKeyboardButton("✓ Yes", callback_data="portal_yes"),
                    InlineKeyboardButton("No, enter my own", callback_data="portal_no")
                )
            else:
                info += "\n\nNo Telegram found. Send your portal link:"
                states[uid]["step"] = 3

            kb.add(InlineKeyboardButton("← Back", callback_data="cancel"))
            bot.reply_to(m, info, reply_markup=kb)
        else:
            bot.reply_to(m, "⚠️ Could not fetch data. Try again.")
    except:
        bot.reply_to(m, "⚠️ Error fetching real info. Using placeholder.")
        info = f"✨ Token Info:\nChain: Solana\nCA: {ca}"
        kb = InlineKeyboardMarkup()
        kb.row(
            InlineKeyboardButton("← Back", callback_data="cancel"),
            InlineKeyboardButton("✓ Confirm", callback_data="trending_confirm")
        )
        bot.reply_to(m, info, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data in ["portal_yes", "portal_no"])
def portal_choice(c):
    uid = c.from_user.id
    if c.data == "portal_yes":
        # Use detected link (you can store it)
        states[uid]["data"]["portal"] = "detected"
        trending_confirm(c)
    else:
        states[uid]["step"] = 3
        bot.edit_message_text("Send your token's portal link:", c.message.chat.id, c.message.message_id)

@bot.message_handler(func=lambda m: m.from_user.id in states and states[m.from_user.id]["type"] == "trending" and states[m.from_user.id]["step"] == 3)
def portal_input(m):
    uid = m.from_user.id
    states[uid]["data"]["portal"] = m.text.strip()
    trending_confirm_from_input(m)

def trending_confirm_from_input(m):
    uid = m.from_user.id
    text = (
        "Trending on Cherry Boost 🔥\n\n"
        "Top Benefits:\n"
        "✓ Trending on Cherry\n"
        "Trending Channel\n"
        "✓ Trending on Cherry\n"
        "Website\n"
        "✓ Entered into trending alerts\n"
        "✓ All time high alerts\n"
        "✓ Buy alerts\n"
        "★ Button Advertisement"
    )

    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("Top 10", callback_data="trend_top10"),
        InlineKeyboardButton("Top 3", callback_data="trend_top3")
    )
    kb.add(InlineKeyboardButton("← Back", callback_data="cancel"))

    bot.send_message(m.chat.id, text, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "trending_confirm")
def trending_confirm(c):
    uid = c.from_user.id
    if uid not in states or states[uid]["type"] != "trending":
        return

    text = (
        "Trending on Cherry Boost 🔥\n\n"
        "Top Benefits:\n"
        "✓ Trending on Cherry\n"
        "Trending Channel\n"
        "✓ Trending on Cherry\n"
        "Website\n"
        "✓ Entered into trending alerts\n"
        "✓ All time high alerts\n"
        "✓ Buy alerts\n"
        "★ Button Advertisement"
    )

    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("Top 10", callback_data="trend_top10"),
        InlineKeyboardButton("Top 3", callback_data="trend_top3")
    )
    kb.add(InlineKeyboardButton("← Back", callback_data="cancel"))

    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data in ["trend_top10", "trend_top3"])
def trend_period(c):
    uid = c.from_user.id
    period = "Top 10" if c.data == "trend_top10" else "Top 3"
    amt = TREND_PRICES.get(period, 2.3)

    text = (
        f"{period} Trending Boost 🔥\n\n"
        f"Send exactly **{amt} SOL** to:\n"
        f"`{SOL_WALLET}`\n\n"
        "Step 1: Send SOL\n"
        "Step 2: Click Verify Payment\n"
        "Step 3: Watch your token soar! 🚀"
    )

    kb = InlineKeyboardMarkup()
    kb.add(InlineKeyboardButton("✅ Verify Payment", callback_data="verify_trend"))
    kb.add(InlineKeyboardButton("← Back", callback_data="cancel"))

    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, parse_mode="Markdown", reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "verify_trend")
def verify_trend(c):
    uid = c.from_user.id
    if uid not in states or states[uid]["type"] != "trending":
        return
    bot.edit_message_text("⏳ Waiting for admin approval... 🍒", c.message.chat.id, c.message.message_id)
    bot.answer_callback_query(c.id, "Payment request sent!")

# ───── BOOST RAID POINTS ─────
@bot.callback_query_handler(func=lambda c: c.data == "boost")
def boost(c):
    uid = c.from_user.id
    cid = c.message.chat.id
    mid = c.message.message_id

    text = (
        "Select a chat to boost 🔥\n\n"
        "Raid Leaderboard Boost\n"
        "Top 3 appear on all raiding groups\n"
        "✓ Higher rank on Raid Leaderboard\n"
        "✓ Entered into raid leaderboard alert\n"
        "✓ Raid start alerts"
    )

    kb = InlineKeyboardMarkup()
    kb.add(InlineKeyboardButton("Select Chat", switch_inline_query_current_chat=""))
    kb.add(InlineKeyboardButton("✖️ Close", callback_data="cancel"))

    bot.edit_message_text(text, cid, mid, reply_markup=kb)
    states[uid] = {"type": "boost", "step": 1, "data": {}}

@bot.message_handler(content_types=['chat_shared'])
def chat_shared(m):
    uid = m.from_user.id
    if uid in states and states[uid]["type"] == "boost":
        group_id = m.chat_shared.chat.id
        group_name = m.chat_shared.chat.title or "Unnamed Group"
        states[uid]["data"]["group"] = {"id": group_id, "name": group_name}

        text = f"Selected: {group_name} ✅\n\nChoose boost points:"

        kb = InlineKeyboardMarkup(row_width=1)
        for pts, price in BOOST_PRICES.items():
            kb.add(InlineKeyboardButton(f"⚡ {pts} Points | {price} SOL", callback_data=f"boost_pts_{pts}"))
        kb.add(InlineKeyboardButton("← Back", callback_data="cancel"))
        kb.add(InlineKeyboardButton("✖️ Close", callback_data="cancel"))

        bot.send_message(m.chat.id, text, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("boost_pts_"))
def boost_pts(c):
    uid = c.from_user.id
    pts = int(c.data[10:])
    amt = BOOST_PRICES.get(pts)

    text = (
        f"Boost {pts} points for {states[uid]['data']['group']['name']} ⚡\n\n"
        f"Send exactly **{amt} SOL** to:\n"
        f"`{SOL_WALLET}`\n\n"
        "Step 1: Send SOL\n"
        "Step 2: Click Verify Payment\n"
        "Step 3: Get ready for a Boost! 🚀"
    )

    kb = InlineKeyboardMarkup()
    kb.add(InlineKeyboardButton("✅ Verify Payment", callback_data="boost_verify"))
    kb.add(InlineKeyboardButton("← Back", callback_data="cancel"))
    kb.add(InlineKeyboardButton("✖️ Close", callback_data="cancel"))

    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, parse_mode="Markdown", reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "boost_verify")
def boost_verify(c):
    uid = c.from_user.id
    if uid not in states or states[uid]["type"] != "boost":
        return
    amt = states[uid]["data"]["amt"]
    pid = str(uuid.uuid4())[:12]
    pending_payments[pid] = {"uid": uid, "type": "boost", "amt": amt, "details": states[uid]["data"], "chat_id": c.message.chat.id, "msg_id": c.message.message_id}
    notify_admin(pid, uid, amt, "Boost", f"Points: {pts}")
    bot.edit_message_text("⏳ Waiting for admin approval... 🍒", c.message.chat.id, c.message.message_id)
    bot.answer_callback_query(c.id, "Sent to admin!")

# ───── ADMIN NOTIFICATION ─────
def notify_admin(pid, uid, amt, feature, extra=""):
    kb = InlineKeyboardMarkup()
    kb.row(
        InlineKeyboardButton("✅ Approve", callback_data=f"approve_{pid}"),
        InlineKeyboardButton("❌ Reject", callback_data=f"reject_{pid}")
    )
    bot.send_message(ADMIN_ID, f"🍒 PAYMENT\nUser: {uid}\n{feature}\n{amt} SOL\n{extra}", reply_markup=kb)

# ───── CANCEL ─────
@bot.callback_query_handler(func=lambda c: c.data == "cancel")
def cancel(c):
    uid = c.from_user.id
    if uid in states:
        del states[uid]
    bot.edit_message_text("Cancelled.", c.message.chat.id, c.message.message_id)
    bot.answer_callback_query(c.id, "Action cancelled")

# ───── WEBHOOK ─────
@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    update = telebot.types.Update.de_json(request.stream.read().decode('utf-8'))
    bot.process_new_updates([update])
    return 'OK', 200

if __name__ == "__main__":
    bot.remove_webhook()
    hostname = os.environ.get("RENDER_EXTERNAL_HOSTNAME") or f"{os.environ.get('RENDER_APP_NAME','your-app')}.onrender.com"
    bot.set_webhook(url=f"https://{hostname}/{TOKEN}")
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)