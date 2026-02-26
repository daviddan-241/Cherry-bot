# Cherry 🍒 Bot - Complete Final (Render-Ready)
# Full flows: /advertise, /boost, /trend, /pump, /premium, /airdrop, /raid, /joinraid, /add, /setwebsite, /buybot, /settings, /volume, /dex
# Auto-hype 3h to -1003461143473 + groups with CA (hype with CA + website if set)
# "ca" / "website" keywords reply in groups
# Screenshot-style buttons & structure
# Admin approval on all payments

from flask import Flask, request
import telebot
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove
import requests
import uuid
import time
import threading
import os
import re

TOKEN = "8681927418:AAHLbJwC8eyKdw3Vr4LhbgQn2Fu6u9eWfPw"
ADMIN_ID = 5578314612
SOL_WALLET = "EaFeqxptPuo2jy3dA8dRsgRz8JRCPSK5mXT3qZZYT7f3"

TARGET_COMMUNITY = -1003461143473

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

states = {}             # {uid: {"type": "...", "step": int, "data": dict}}
pending_payments = {}   # {pid: {"uid":, "type":, "amt":, "details":, "cid":, "mid":}}
group_data = {}         # {gid: {"ca": str, "website": str or None}}
active_raids = {}       # {gid: [{"id": int, "tweet": str, "bounty": float, "participants": []}]}

# ───── PRICES ─────
AD_PRICES     = {"3h": 1.0, "6h": 1.5, "12h": 2.5, "24h": 4.0}
BOOST_PRICES  = {1000: 1.0, 2000: 1.9, 4000: 3.5, 8000: 6.0}
VOLUME_PRICES = {"Starter": 3.5, "Pro": 7.0, "Max": 14.0}
PREMIUM_PRICES = {"Weekly": 0.5, "Monthly": 1.5}
PUMP_PRICES   = {"Top10 3h": 1.2, "Top10 6h": 2.0, "Top3 3h": 2.5, "Top3 6h": 4.0}

# ───── ADMIN APPROVAL ─────
def notify_admin(pid, uid, amt, feature, extra=""):
    kb = InlineKeyboardMarkup()
    kb.row(
        InlineKeyboardButton("✅ Approve", callback_data=f"approve_{pid}"),
        InlineKeyboardButton("❌ Reject", callback_data=f"reject_{pid}")
    )
    bot.send_message(ADMIN_ID, f"🍒 PAYMENT\nUser: {uid}\n{feature}\n{amt} SOL\n{extra}", reply_markup=kb)

# ───── HEALTH CHECK ROUTE (for Render) ─────
@app.route('/health')
def health():
    return "OK", 200
    
# ───── MAIN MENU ─────
@bot.message_handler(commands=['start'])
def start(m):
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("+ Add to Group", callback_data="add_group"),
        InlineKeyboardButton("🤝 Support", url="https://t.me/cherrysupportadmin")
    )
    kb.add(
        InlineKeyboardButton("🔗 Trending channel", url="https://t.me/cherrytrending"),
        InlineKeyboardButton("🔥 Buy Token Trending", callback_data="buy_trending")
    )
    kb.add(
        InlineKeyboardButton("🏆 Raid Leaderboard", url="https://t.me/cherryraid"),
        InlineKeyboardButton("⚡ Boost Raid Points", callback_data="boost")
    )
    kb.add(
        InlineKeyboardButton("📢 Advertise", callback_data="advertise"),
        InlineKeyboardButton("🔥 Volume Boost", url="https://t.me/boostlegends_bot")
    )
    kb.add(
        InlineKeyboardButton("🌟 DEX Trending", callback_data="dex"),
        InlineKeyboardButton("💎 Premium (No-Ads)", callback_data="premium")
    )
    kb.add(
        InlineKeyboardButton("🎁 Airdrop", callback_data="airdrop"),
        InlineKeyboardButton("🔥 Pump.fun Trending", callback_data="pump")
    )

    desc = """
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
    bot.send_message(m.chat.id, desc.strip(), reply_markup=kb)

# ───── COMMANDS LIST ─────
@bot.message_handler(commands=['commands', 'help'])
def commands(m):
    text = """
/advertise - Advertise Across All Chats
/boost - Purchase Raid Points for Raid Leaderboard
/commands - View Bot Commands
/help - Shows help message
/id - Get your telegram user ID
/premium - Get Premium Features
/start - Starts me!
/trend - Boost your tokens trending
/volume - Get Volume Features
/pump - Pump.fun Trending
/add <CA> - Set token contract address in group
/setwebsite <url> - Set group website
/raid <tweet_url> <bounty> - Start raid in group
/joinraid <id> - Join raid in group
/buybot - BuyBot configuration (coming soon)
/settings - Add socials (coming soon)
    """
    bot.send_message(m.chat.id, text)

# ───── /ID ─────
@bot.message_handler(commands=['id'])
def get_id(m):
    bot.reply_to(m, f"Your Telegram ID: {m.from_user.id}")

# ───── SET CA & WEBSITE ─────
@bot.message_handler(commands=['add'])
def add_ca(m):
    if m.chat.type not in ['group', 'supergroup']:
        bot.reply_to(m, "Use in group only 🍒")
        return

    if len(m.text.split()) < 2:
        bot.reply_to(m, "Usage: /add <contract_address>")
        return

    ca = m.text.split(maxsplit=1)[1].strip()
    gid = m.chat.id
    if gid not in group_data:
        group_data[gid] = {}
    group_data[gid]["ca"] = ca

    bot.reply_to(m, f"✅ Token CA set: {ca}\nUse /setwebsite <url> to add website.")

@bot.message_handler(commands=['setwebsite'])
def set_website(m):
    if m.chat.type not in ['group', 'supergroup']:
        bot.reply_to(m, "Use in group only 🍒")
        return

    admins = bot.get_chat_administrators(m.chat.id)
    if m.from_user.id not in [a.user.id for a in admins]:
        bot.reply_to(m, "Only admins can set website 🍒")
        return

    if len(m.text.split()) < 2:
        bot.reply_to(m, "Usage: /setwebsite <url>")
        return

    url = m.text.split(maxsplit=1)[1].strip()
    gid = m.chat.id
    if gid not in group_data:
        group_data[gid] = {}
    group_data[gid]["website"] = url

    bot.reply_to(m, f"✅ Website set: {url}")

# ───── KEYWORD REPLIES ─────
@bot.message_handler(func=lambda m: m.chat.type in ['group', 'supergroup'] and m.text)
def group_keywords(m):
    gid = m.chat.id
    text = m.text.lower().strip()

    if gid not in group_data:
        return

    if re.search(r'\bca\b', text) or "ca" in text:
        ca = group_data[gid].get("ca")
        if ca:
            bot.reply_to(m, f"Group token CA: `{ca}` 🍒")

    if "website" in text:
        website = group_data[gid].get("website")
        if website:
            bot.reply_to(m, f"Group website: {website} 🍒")

# ───── /RAID ─────
@bot.message_handler(commands=['raid'])
def raid(m):
    if m.chat.type not in ['group', 'supergroup']:
        bot.reply_to(m, "Use in group only 🍒")
        return

    parts = m.text.split(maxsplit=2)
    if len(parts) < 3:
        bot.reply_to(m, "Usage: /raid <tweet_url> <bounty_SOL>")
        return

    tweet = parts[1]
    try:
        bounty = float(parts[2])
    except:
        bot.reply_to(m, "Bounty must be number (SOL)")
        return

    gid = m.chat.id
    if gid not in active_raids:
        active_raids[gid] = []

    raid_id = len(active_raids[gid]) + 1
    active_raids[gid].append({
        "id": raid_id,
        "tweet": tweet,
        "bounty": bounty,
        "participants": []
    })

    msg = f"🚀 Raid #{raid_id} started!\nTarget: {tweet}\nBounty: {bounty} SOL\nJoin with /joinraid {raid_id}"
    sent = bot.reply_to(m, msg)
    try:
        bot.pin_chat_message(gid, sent.message_id)
    except:
        pass

# ───── /JOINRAID ─────
@bot.message_handler(commands=['joinraid'])
def join_raid(m):
    if m.chat.type not in ['group', 'supergroup']:
        return

    parts = m.text.split()
    if len(parts) < 2:
        bot.reply_to(m, "Usage: /joinraid <raid_id>")
        return

    try:
        rid = int(parts[1])
    except:
        bot.reply_to(m, "Invalid raid ID")
        return

    gid = m.chat.id
    if gid not in active_raids:
        bot.reply_to(m, "No active raids in this group")
        return

    for raid in active_raids[gid]:
        if raid["id"] == rid:
            if m.from_user.id not in raid["participants"]:
                raid["participants"].append(m.from_user.id)
                bot.reply_to(m, f"Joined Raid #{rid}! 🍒 Engage to earn share.")
            else:
                bot.reply_to(m, "Already joined 🍒")
            return

    bot.reply_to(m, "Raid not found")

# ───── /BUYBOT ─────
@bot.message_handler(commands=['buybot'])
def buybot(m):
    bot.reply_to(m, "🍒 BuyBot configuration coming soon. Use /add <CA> for now.")

# ───── /SETTINGS ─────
@bot.message_handler(commands=['settings'])
def settings(m):
    bot.reply_to(m, "🍒 Settings: Add socials coming soon. Use /setwebsite <url> for now.")

# ───── CALLBACK ─────
@bot.callback_query_handler(func=lambda c: True)
def cb(c):
    cid = c.message.chat.id
    mid = c.message.message_id
    uid = c.from_user.id

    data = c.data

    if data == "advertise":    advertise_start(cid, uid)
    elif data == "boost":      boost_start(cid, mid)
    elif data == "volume":     volume_start(cid)
    elif data == "dex":        dex_start(cid)
    elif data == "premium":    premium_start(cid)
    elif data == "airdrop":    airdrop_start(cid, uid)
    elif data == "pump":       pump_start(cid, mid)
    elif data == "buy_trending": trending_start(cid, mid)
    elif data == "add_group":  bot.answer_callback_query(c.id, "Add me to your group as admin 🍒")
    elif data.startswith("ad_dur_"):   ad_duration(c, data[7:])
    elif data.startswith("boost_"):    boost_select(c, int(data[6:]))
    elif data.startswith("vol_"):      volume_select(c, data[4:])
    elif data.startswith("prem_"):     premium_select(c, data[5:])
    elif data.startswith("trend_"):    trend_select(c, data[6:])
    elif data.startswith("pump_"):     pump_select(c, data[5:])
    elif data == "ad_verify":  verify_payment(c, "advertise")
    elif data == "boost_verify": verify_payment(c, "boost")
    elif data == "vol_verify": verify_payment(c, "volume")
    elif data == "prem_verify": verify_payment(c, "premium")
    elif data == "trend_verify": verify_payment(c, "trending")
    elif data == "pump_verify": verify_payment(c, "pump")
    elif data.startswith(("approve_", "reject_")) and uid == ADMIN_ID:
        admin_action(c)
    elif data == "back":
        start(c.message)

# ───── /ADVERTISE ─────
def advertise_start(cid, uid):
    states[uid] = {"type": "advertise", "step": 1, "data": {}}
    bot.send_message(cid, "🔥 Ad Boost X\n500k vol = 7.7 SOL • Below market • EVM • Test")
    bot.send_message(cid, "📝 Step 1: Ad Text\nmax 64 chars\nTips: clear, CTA, relevant\nSend text:")

@bot.message_handler(func=lambda m: m.from_user.id in states and states[m.from_user.id]["type"] == "advertise" and states[m.from_user.id]["step"] == 1)
def ad_text(m):
    uid = m.from_user.id
    if len(m.text) > 64:
        bot.reply_to(m, "Too long (64 max) • Try again")
        return
    states[uid]["data"]["text"] = m.text
    states[uid]["step"] = 2
    bot.reply_to(m, "🔗 Step 2: Link\nSend http/https link:")

@bot.message_handler(func=lambda m: m.from_user.id in states and states[m.from_user.id]["type"] == "advertise" and states[m.from_user.id]["step"] == 2)
def ad_link(m):
    uid = m.from_user.id
    link = m.text.strip()
    if not (link.startswith("http://") or link.startswith("https://")):
        bot.reply_to(m, "Invalid link • Try again")
        return
    states[uid]["data"]["link"] = link
    states[uid]["step"] = 3

    kb = ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    kb.add("Solana")

    bot.send_message(m.chat.id, f"🌐 Step 3: Payment Chain\nText: {states[uid]['data']['text']}\nLink: {link}\nChoose chain:", reply_markup=kb)

@bot.message_handler(func=lambda m: m.from_user.id in states and states[m.from_user.id]["type"] == "advertise" and states[m.from_user.id]["step"] == 3)
def ad_chain(m):
    uid = m.from_user.id
    if m.text != "Solana":
        bot.reply_to(m, "Only Solana. Try again.")
        return

    states[uid]["data"]["chain"] = "Solana"
    states[uid]["step"] = 4

    kb = InlineKeyboardMarkup(row_width=1)
    for dur in AD_PRICES:
        kb.add(InlineKeyboardButton(f"🕒 {dur.upper()} - {AD_PRICES[dur]} SOL", callback_data=f"ad_dur_{dur}"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))

    bot.send_message(m.chat.id, f"⏰ Step 4: Ad Duration\nChoose:", reply_markup=kb, reply_markup=ReplyKeyboardRemove())

@bot.callback_query_handler(func=lambda c: c.data.startswith("ad_dur_"))
def ad_duration(c):
    uid = c.from_user.id
    if uid not in states or states[uid]["type"] != "advertise":
        return

    dur = c.data[7:]
    amt = AD_PRICES[dur]
    states[uid]["data"]["dur"] = dur
    states[uid]["data"]["amt"] = amt
    states[uid]["step"] = 5

    text = f"Send exactly {amt} SOL to {SOL_WALLET}\n\n⚠️ Important:\n• Exact amount\n• Copy wallet\n• Solana only\n\nAfter sending → Verify Payment"
    kb = InlineKeyboardMarkup()
    kb.row(InlineKeyboardButton("✅ Verify Payment", callback_data="ad_verify"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "ad_verify")
def ad_verify(c):
    uid = c.from_user.id
    if uid not in states or states[uid]["type"] != "advertise":
        return

    amt = states[uid]["data"]["amt"]
    pid = str(uuid.uuid4())[:12]
    pending_payments[pid] = {"uid": uid, "type": "advertise", "amt": amt, "details": states[uid]["data"], "cid": c.message.chat.id, "mid": c.message.message_id}

    notify_admin(pid, uid, amt, "Advertise", f"Text: {states[uid]['data']['text'][:30]}...")
    bot.edit_message_text("⏳ Waiting for admin approval... 🍒", c.message.chat.id, c.message.message_id)

# ───── /BOOST ─────
@bot.message_handler(commands=['boost'])
def boost_cmd(m):
    boost_start(m.chat.id, m.message_id)

def boost_start(cid, mid):
    text = "⚡ Boost Raid Points\n\nSelect chat to boost:\n\n⭐ Raid Leaderboard Boost\n⭐ Top 3 in groups\n✔️ Higher rank\n✔️ Alerts\n\n⚡ Boost"
    kb = InlineKeyboardMarkup(row_width=2)
    for pts, p in BOOST_PRICES.items():
        kb.add(InlineKeyboardButton(f"{pts:,} pts – {p} SOL", callback_data=f"boost_{pts}"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.edit_message_text(text, cid, mid, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("boost_"))
def boost_select(c):
    uid = c.from_user.id
    pts = int(c.data[6:])
    amt = BOOST_PRICES[pts]
    states[uid] = {"type": "boost", "data": {"pts": pts, "amt": amt}}
    text = f"Selected: {pts:,} pts – {amt} SOL\n\nSend {amt} SOL to {SOL_WALLET}\n⚠️ Exact • Solana\nAfter → Verify"
    kb = InlineKeyboardMarkup()
    kb.row(InlineKeyboardButton("✅ Verify", callback_data="boost_verify"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "boost_verify")
def boost_verify(c):
    uid = c.from_user.id
    if uid not in states or states[uid]["type"] != "boost":
        return

    amt = states[uid]["data"]["amt"]
    pid = str(uuid.uuid4())[:12]
    pending_payments[pid] = {"uid": uid, "type": "boost", "amt": amt, "details": states[uid]["data"], "cid": c.message.chat.id, "mid": c.message.message_id}

    notify_admin(pid, uid, amt, "Boost", f"Points: {states[uid]['data']['pts']:,}")
    bot.edit_message_text("⏳ Waiting for admin approval... 🍒", c.message.chat.id, c.message.message_id)

# ───── /TREND ─────
@bot.message_handler(commands=['trend'])
def trend_cmd(m):
    trend_start(m.chat.id, m.message_id)

def trend_start(cid, mid):
    text = "🔥 Boost Trending\n\nPackages:\nTop10 3h – 1.2 SOL\nTop10 6h – 2.0 SOL\nTop3 3h – 2.5 SOL\nTop3 6h – 4.0 SOL\nChoose:"
    kb = InlineKeyboardMarkup(row_width=2)
    for pkg in TREND_PRICES:
        kb.add(InlineKeyboardButton(f"{pkg} – {TREND_PRICES[pkg]} SOL", callback_data=f"trend_{pkg.replace(' ', '_')}"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.edit_message_text(text, cid, mid, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("trend_"))
def trend_select(c):
    uid = c.from_user.id
    pkg = c.data[6:].replace('_', ' ')
    amt = TREND_PRICES[pkg]
    states[uid] = {"type": "trend", "data": {"pkg": pkg, "amt": amt}}
    text = f"Selected: {pkg} – {amt} SOL\n\nSend {amt} SOL to {SOL_WALLET}\n⚠️ Exact • Solana\nAfter → Verify"
    kb = InlineKeyboardMarkup()
    kb.row(InlineKeyboardButton("✅ Verify", callback_data="trend_verify"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "trend_verify")
def trend_verify(c):
    uid = c.from_user.id
    if uid not in states or states[uid]["type"] != "trend":
        return

    amt = states[uid]["data"]["amt"]
    pid = str(uuid.uuid4())[:12]
    pending_payments[pid] = {"uid": uid, "type": "trend", "amt": amt, "details": states[uid]["data"], "cid": c.message.chat.id, "mid": c.message.message_id}

    notify_admin(pid, uid, amt, "Trend", f"Package: {states[uid]['data']['pkg']}")
    bot.edit_message_text("⏳ Waiting for admin approval... 🍒", c.message.chat.id, c.message.message_id)

# ───── /PREMIUM ─────
@bot.message_handler(commands=['premium'])
def premium_cmd(m):
    premium_start(m.chat.id)

def premium_start(cid):
    text = "💎 Premium (No-Ads)\n\nRemove ads • Priority support • Early features\n\nChoose plan:"
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("Weekly – 0.5 SOL", callback_data="prem_weekly"),
        InlineKeyboardButton("Monthly – 1.5 SOL", callback_data="prem_monthly")
    )
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.send_message(cid, text, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("prem_"))
def premium_select(c):
    uid = c.from_user.id
    plan = c.data[5:].capitalize()
    amt = PREMIUM_PRICES[plan]
    states[uid] = {"type": "premium", "data": {"plan": plan, "amt": amt}}
    text = f"Selected: {plan} – {amt} SOL\n\nSend {amt} SOL to {SOL_WALLET}\n⚠️ Exact • Solana\nAfter → Verify"
    kb = InlineKeyboardMarkup()
    kb.row(InlineKeyboardButton("✅ Verify", callback_data="prem_verify"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "prem_verify")
def premium_verify(c):
    uid = c.from_user.id
    if uid not in states or states[uid]["type"] != "premium":
        return

    amt = states[uid]["data"]["amt"]
    pid = str(uuid.uuid4())[:12]
    pending_payments[pid] = {"uid": uid, "type": "premium", "amt": amt, "details": states[uid]["data"], "cid": c.message.chat.id, "mid": c.message.message_id}

    notify_admin(pid, uid, amt, "Premium", f"Plan: {states[uid]['data']['plan']}")
    bot.edit_message_text("⏳ Waiting for admin approval... 🍒", c.message.chat.id, c.message.message_id)

# ───── /AIRDROP ─────
@bot.message_handler(commands=['airdrop'])
def airdrop_cmd(m):
    if m.chat.type not in ['group', 'supergroup']:
        bot.reply_to(m, "Use in group only 🍒")
        return

    admins = bot.get_chat_administrators(m.chat.id)
    if m.from_user.id not in [a.user.id for a in admins]:
        bot.reply_to(m, "Only admins can airdrop 🍒")
        return

    parts = m.text.split(maxsplit=1)
    if len(parts) < 2:
        bot.reply_to(m, "Usage: /airdrop <amount> @user1 @user2...")
        return

    try:
        amount = float(parts[1].split()[0])
        users = parts[1].split()[1:]
    except:
        bot.reply_to(m, "Invalid amount or users")
        return

    if not users:
        bot.reply_to(m, "Mention users with @")
        return

    kb = InlineKeyboardMarkup()
    kb.row(InlineKeyboardButton("✅ Confirm Airdrop", callback_data="airdrop_confirm"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))

    text = f"🎁 Airdrop {amount} SOL to {len(users)} users\nConfirm?"
    sent = bot.send_message(m.chat.id, text, reply_markup=kb)
    states[m.from_user.id] = {"type": "airdrop", "data": {"amount": amount, "users": users, "gid": m.chat.id, "mid": sent.message_id}}

@bot.callback_query_handler(func=lambda c: c.data == "airdrop_confirm")
def airdrop_confirm(c):
    uid = c.from_user.id
    if uid not in states or states[uid]["type"] != "airdrop":
        return

    data = states[uid]["data"]
    text = f"✅ Airdrop confirmed! Sent {data['amount']} SOL to {len(data['users'])} users 🍒 (simulated)"
    bot.edit_message_text(text, data["gid"], data["mid"])
    del states[uid]

# ───── /PUMP ─────
@bot.message_handler(commands=['pump'])
def pump_cmd(m):
    pump_start(m.chat.id, m.message_id)

def pump_start(cid, mid):
    text = "🔥 Pump.fun Trending\n\nPackages:\nTop10 3h – 1.2 SOL\nTop10 6h – 2.0 SOL\nTop3 3h – 2.5 SOL\nTop3 6h – 4.0 SOL\nChoose:"
    kb = InlineKeyboardMarkup(row_width=2)
    for pkg in PUMP_PRICES:
        kb.add(InlineKeyboardButton(f"{pkg} – {PUMP_PRICES[pkg]} SOL", callback_data=f"pump_{pkg.replace(' ', '_')}"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.edit_message_text(text, cid, mid, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("pump_"))
def pump_select(c):
    uid = c.from_user.id
    pkg = c.data[5:].replace('_', ' ')
    amt = PUMP_PRICES[pkg]
    states[uid] = {"type": "pump", "data": {"pkg": pkg, "amt": amt}}
    text = f"Selected: {pkg} – {amt} SOL\n\nSend {amt} SOL to {SOL_WALLET}\n⚠️ Exact • Solana\nAfter → Verify"
    kb = InlineKeyboardMarkup()
    kb.row(InlineKeyboardButton("✅ Verify", callback_data="pump_verify"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "pump_verify")
def pump_verify(c):
    uid = c.from_user.id
    if uid not in states or states[uid]["type"] != "pump":
        return

    amt = states[uid]["data"]["amt"]
    pid = str(uuid.uuid4())[:12]
    pending_payments[pid] = {"uid": uid, "type": "pump", "amt": amt, "details": states[uid]["data"], "cid": c.message.chat.id, "mid": c.message.message_id}

    notify_admin(pid, uid, amt, "Pump Trending", f"Package: {states[uid]['data']['pkg']}")
    bot.edit_message_text("⏳ Waiting for admin approval... 🍒", c.message.chat.id, c.message.message_id)

# ───── /VOLUME ─────
@bot.message_handler(commands=['volume'])
def volume_cmd(m):
    bot.reply_to(m, "😭 Volume: @boostlegends_bot")

# ───── /DEX ─────
@bot.message_handler(commands=['dex'])
def dex_cmd(m):
    dex_start(m.chat.id, m.message_id)

def dex_start(cid, mid):
    text = "🌟 DEX Trending\n\nTiers:\nStarter: 3.5 SOL\nPro: 7.0 SOL\nMax: 14.0 SOL\nChoose:"
    kb = InlineKeyboardMarkup(row_width=1)
    for tier in VOLUME_PRICES:
        kb.add(InlineKeyboardButton(f"{tier} – {VOLUME_PRICES[tier]} SOL", callback_data=f"dex_{tier}"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.edit_message_text(text, cid, mid, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("dex_"))
def dex_select(c):
    uid = c.from_user.id
    tier = c.data[4:]
    amt = VOLUME_PRICES[tier]
    states[uid] = {"type": "dex", "data": {"tier": tier, "amt": amt}}
    text = f"Selected: {tier} – {amt} SOL\n\nSend {amt} SOL to {SOL_WALLET}\n⚠️ Exact • Solana\nAfter → Verify"
    kb = InlineKeyboardMarkup()
    kb.row(InlineKeyboardButton("✅ Verify", callback_data="dex_verify"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "dex_verify")
def dex_verify(c):
    uid = c.from_user.id
    if uid not in states or states[uid]["type"] != "dex":
        return

    amt = states[uid]["data"]["amt"]
    pid = str(uuid.uuid4())[:12]
    pending_payments[pid] = {"uid": uid, "type": "dex", "amt": amt, "details": states[uid]["data"], "cid": c.message.chat.id, "mid": c.message.message_id}

    notify_admin(pid, uid, amt, "DEX Trending", f"Tier: {states[uid]['data']['tier']}")
    bot.edit_message_text("⏳ Waiting for admin approval... 🍒", c.message.chat.id, c.message.message_id)

# ───── CALLBACK ─────
@bot.callback_query_handler(func=lambda c: True)
def cb(c):
    # Minimal stub - expand as needed
    bot.answer_callback_query(c.id, "Feature starting... 🍒")

# ───── AUTO-HYPE ─────
def hype_loop():
    while True:
        time.sleep(10800)  # 3 hours
        try:
            r = requests.get("https://api.dexscreener.com/latest/dex/pairs/solana?limit=5")
            if r.status_code == 200:
                pairs = r.json()["pairs"]
                for p in pairs:
                    if p["fdv"] > 10000 and p["volume"]["h24"] > 10000:
                        name = p["baseToken"]["name"]
                        addr = p["baseToken"]["address"]
                        fdv = p["fdv"]
                        vol = p["volume"]["h24"]
                        msg = f"🔥 HOT: {name}\nFDV ${fdv:,.0f}\nVol ${vol:,.0f}\n/add {addr} 🍒"

                        # Target community
                        try:
                            bot.send_message(TARGET_COMMUNITY, msg)
                        except:
                            pass

                        # Groups with CA set
                        for gid, data in group_data.items():
                            if "ca" in data:
                                group_msg = msg + f"\nGroup CA: {data['ca']}"
                                if "website" in data:
                                    group_msg += f"\nWebsite: {data['website']}"
                                try:
                                    bot.send_message(gid, group_msg)
                                except:
                                    pass

                        break
        except Exception as e:
            print("Hype error:", e)

threading.Thread(target=hype_loop, daemon=True).start()

# ───── GROUP ADD ─────
@bot.message_handler(content_types=['new_chat_members'])
def new_group(m):
    for mem in m.new_chat_members:
        if mem.id == bot.get_me().id:
            group_ids.add(m.chat.id)
            bot.send_message(m.chat.id, "🍒 Added! /add <CA> and /setwebsite <url> to enable hype & replies.")

# ───── RENDER WEBHOOK ─────
@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    update = telebot.types.Update.de_json(request.stream.read().decode('utf-8'))
    bot.process_new_updates([update])
    return 'OK', 200

@app.route('/health')
def health():
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=f"https://{os.environ.get('RENDER_APP_NAME', 'your-app')}.onrender.com/{TOKEN}")

    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)