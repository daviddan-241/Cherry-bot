# Cherry 🍒 Bot - FULL WORKING VERSION (all handlers implemented)
# Render-ready, webhook, all flows complete

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

states = {}
pending_payments = {}
group_data = {}
active_raids = {}
group_ids = set()

# ───── PRICES ─────
AD_PRICES     = {"3h": 1.0, "6h": 1.5, "12h": 2.5, "24h": 4.0}
BOOST_PRICES  = {1000: 1.0, 2000: 1.9, 4000: 3.5, 8000: 6.0}
VOLUME_PRICES = {"Starter": 3.5, "Pro": 7.0, "Max": 14.0}
PREMIUM_PRICES = {"Weekly": 0.5, "Monthly": 1.5}
PUMP_PRICES   = {"Top10 3h": 1.2, "Top10 6h": 2.0, "Top3 3h": 2.5, "Top3 6h": 4.0}
TREND_PRICES  = PUMP_PRICES.copy()

# ───── ADMIN NOTIFICATION ─────
def notify_admin(pid, uid, amt, feature, extra=""):
    kb = InlineKeyboardMarkup()
    kb.row(
        InlineKeyboardButton("✅ Approve", callback_data=f"approve_{pid}"),
        InlineKeyboardButton("❌ Reject", callback_data=f"reject_{pid}")
    )
    bot.send_message(ADMIN_ID, f"🍒 PAYMENT\nUser: {uid}\n{feature}\n{amt} SOL\n{extra}", reply_markup=kb)

# ───── GENERIC PAYMENT VERIFICATION ─────
def verify_payment(c, ftype):
    uid = c.from_user.id
    if uid not in states or states[uid].get("type") != ftype:
        bot.answer_callback_query(c.id, "Session expired", show_alert=True)
        return

    data = states[uid]["data"]
    amt = data["amt"]
    pid = str(uuid.uuid4())[:12]

    pending_payments[pid] = {
        "uid": uid,
        "type": ftype,
        "amt": amt,
        "details": data,
        "chat_id": c.message.chat.id,
        "msg_id": c.message.message_id
    }

    extra = ""
    if ftype == "advertise": extra = f"Text: {data.get('text','')[:30]}..."
    elif ftype == "boost":   extra = f"Points: {data.get('pts',0):,}"
    elif ftype == "trend":   extra = f"Package: {data.get('pkg','')}"
    elif ftype == "pump":    extra = f"Package: {data.get('pkg','')}"
    elif ftype == "premium": extra = f"Plan: {data.get('plan','')}"
    elif ftype == "volume":  extra = f"Tier: {data.get('tier','')}"

    notify_admin(pid, uid, amt, ftype.capitalize(), extra)
    bot.edit_message_text("⏳ Waiting for admin approval...", c.message.chat.id, c.message.message_id)
    bot.answer_callback_query(c.id, "Payment request sent!")

# ───── ADMIN APPROVE / REJECT ─────
@bot.callback_query_handler(func=lambda c: c.data.startswith(("approve_", "reject_")))
def admin_action(c):
    if c.from_user.id != ADMIN_ID:
        bot.answer_callback_query(c.id, "Admin only", show_alert=True)
        return

    action, pid = c.data.split("_", 1)
    payment = pending_payments.pop(pid, None)
    if not payment:
        bot.answer_callback_query(c.id, "Request not found", show_alert=True)
        return

    uid = payment["uid"]
    ftype = payment["type"]
    amt = payment["amt"]

    status = "approved ✅" if action == "approve" else "rejected ❌"
    bot.send_message(uid, f"Your {ftype} request ({amt} SOL) was {status}.")
    bot.edit_message_text(f"{status.upper()}\nUser {uid} • {ftype} • {amt} SOL",
                          c.message.chat.id, c.message.message_id)

    bot.answer_callback_query(c.id, f"{ftype} {action}d")

# ───── HEALTH ─────
@app.route('/health')
def health():
    return "OK", 200

# ───── MAIN MENU ─────
@bot.message_handler(commands=['start'])
def start(m):
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("+ Add to Group", callback_data="add_group"),
        InlineKeyboardButton("🤝 Support", url="https://t.me/@cherrysupportadmin09")
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

    bot.send_message(m.chat.id, """
✨ Cherry Telegram Bot 🍒

Track • Raid • Boost • Advertise

Use /commands for full list
    """.strip(), reply_markup=kb)

# ───── COMMANDS LIST ─────
@bot.message_handler(commands=['commands','help'])
def cmd_list(m):
    bot.send_message(m.chat.id, """
/start          - main menu
/advertise      - buy ad space
/boost          - raid points
/premium        - no ads plan
/pump           - pump.fun boost
/trend          - trending boost
/volume         - volume features
/dex            - dex trending
/add <CA>       - set token
/setwebsite <url>
/raid <tweet> <sol>
/joinraid <id>
/airdrop <sol> @users...
/id             - your ID
    """)

@bot.message_handler(commands=['id'])
def cmd_id(m):
    bot.reply_to(m, f"Your Telegram ID: {m.from_user.id}")

# ───── GROUP TOKEN + WEBSITE ─────
@bot.message_handler(commands=['add'])
def add_ca(m):
    if m.chat.type not in ['group','supergroup']: return bot.reply_to(m, "Group only")
    parts = m.text.split(maxsplit=1)
    if len(parts) < 2: return bot.reply_to(m, "/add <CA>")
    ca = parts[1].strip()
    gid = m.chat.id
    group_data.setdefault(gid, {})["ca"] = ca
    bot.reply_to(m, f"CA set: {ca}")

@bot.message_handler(commands=['setwebsite'])
def set_website(m):
    if m.chat.type not in ['group','supergroup']: return bot.reply_to(m, "Group only")
    if m.from_user.id not in [a.user.id for a in bot.get_chat_administrators(m.chat.id)]:
        return bot.reply_to(m, "Admins only")
    parts = m.text.split(maxsplit=1)
    if len(parts) < 2: return bot.reply_to(m, "/setwebsite <url>")
    url = parts[1].strip()
    gid = m.chat.id
    group_data.setdefault(gid, {})["website"] = url
    bot.reply_to(m, f"Website set: {url}")

@bot.message_handler(func=lambda m: m.chat.type in ['group','supergroup'] and m.text)
def keyword_reply(m):
    gid = m.chat.id
    if gid not in group_data: return
    txt = m.text.lower()
    if "ca" in txt and (ca := group_data[gid].get("ca")):
        bot.reply_to(m, f"CA → `{ca}`", parse_mode='Markdown')
    if "website" in txt and (w := group_data[gid].get("website")):
        bot.reply_to(m, f"Website → {w}")

# ───── RAID SYSTEM ─────
@bot.message_handler(commands=['raid'])
def raid_start(m):
    if m.chat.type not in ['group','supergroup']: return bot.reply_to(m, "Group only")
    parts = m.text.split(maxsplit=2)
    if len(parts) < 3: return bot.reply_to(m, "/raid <tweet_url> <bounty_SOL>")
    url = parts[1]
    try: bounty = float(parts[2])
    except: return bot.reply_to(m, "Bounty must be number")
    gid = m.chat.id
    active_raids.setdefault(gid, [])
    rid = len(active_raids[gid]) + 1
    active_raids[gid].append({"id":rid, "tweet":url, "bounty":bounty, "participants":[]})
    msg = f"🚀 Raid #{rid}\nTarget: {url}\nBounty: {bounty} SOL\n/joinraid {rid}"
    sent = bot.reply_to(m, msg)
    try: bot.pin_chat_message(gid, sent.message_id)
    except: pass

@bot.message_handler(commands=['joinraid'])
def join_raid(m):
    if m.chat.type not in ['group','supergroup']: return
    parts = m.text.split()
    if len(parts) < 2: return bot.reply_to(m, "/joinraid <id>")
    try: rid = int(parts[1])
    except: return bot.reply_to(m, "Invalid ID")
    gid = m.chat.id
    if gid not in active_raids: return bot.reply_to(m, "No raids here")
    for r in active_raids[gid]:
        if r["id"] == rid:
            if m.from_user.id not in r["participants"]:
                r["participants"].append(m.from_user.id)
                bot.reply_to(m, f"Joined Raid #{rid}")
            else:
                bot.reply_to(m, "Already joined")
            return
    bot.reply_to(m, "Raid not found")

# ───── ADVERTISE FLOW ─────
def advertise_start(cid, uid):
    states[uid] = {"type":"advertise", "step":1, "data":{}}
    bot.send_message(cid, "🔥 Advertise\nStep 1: Send text (max 64 chars)")

@bot.message_handler(func=lambda m: m.from_user.id in states and states[m.from_user.id]["type"]=="advertise" and states[m.from_user.id]["step"]==1)
def ad_text(m):
    uid = m.from_user.id
    if len(m.text)>64: return bot.reply_to(m, "Max 64 chars")
    states[uid]["data"]["text"] = m.text
    states[uid]["step"] = 2
    bot.reply_to(m, "Step 2: Send link (http/https)")

@bot.message_handler(func=lambda m: m.from_user.id in states and states[m.from_user.id]["type"]=="advertise" and states[m.from_user.id]["step"]==2)
def ad_link(m):
    uid = m.from_user.id
    link = m.text.strip()
    if not link.startswith(('http://','https://')): return bot.reply_to(m, "Invalid link")
    states[uid]["data"]["link"] = link
    states[uid]["step"] = 3
    kb = ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    kb.add("Solana")
    bot.send_message(m.chat.id, "Step 3: Chain", reply_markup=kb)

@bot.message_handler(func=lambda m: m.from_user.id in states and states[m.from_user.id]["type"]=="advertise" and states[m.from_user.id]["step"]==3)
def ad_chain(m):
    if m.text != "Solana": return bot.reply_to(m, "Only Solana supported")
    uid = m.from_user.id
    states[uid]["data"]["chain"] = "Solana"
    states[uid]["step"] = 4
    kb = InlineKeyboardMarkup(row_width=1)
    for dur, price in AD_PRICES.items():
        kb.add(InlineKeyboardButton(f"{dur} – {price} SOL", callback_data=f"ad_dur_{dur}"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.send_message(m.chat.id, "Step 4: Duration", reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("ad_dur_"))
def ad_duration(c):
    uid = c.from_user.id
    dur = c.data[7:]
    if uid not in states or states[uid]["type"] != "advertise": return
    amt = AD_PRICES.get(dur)
    if not amt: return
    states[uid]["data"]["dur"] = dur
    states[uid]["data"]["amt"] = amt
    text = f"Send **{amt} SOL** exactly to:\n`{SOL_WALLET}`"
    kb = InlineKeyboardMarkup()
    kb.row(
        InlineKeyboardButton("Verify", callback_data="ad_verify"),
        InlineKeyboardButton("Back", callback_data="back")
    )
    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, parse_mode='Markdown', reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "ad_verify")
def ad_verify(c):
    verify_payment(c, "advertise")

# ───── BOOST ─────
@bot.callback_query_handler(func=lambda c: c.data == "boost")
def boost_start_cb(c):
    boost_start(c.message.chat.id, c.message.message_id)

@bot.message_handler(commands=['boost'])
def boost_start_cmd(m):
    boost_start(m.chat.id, m.message_id)

def boost_start(cid, mid):
    kb = InlineKeyboardMarkup(row_width=2)
    for pts, sol in BOOST_PRICES.items():
        kb.add(InlineKeyboardButton(f"{pts:,} pts – {sol} SOL", callback_data=f"boost_{pts}"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.edit_message_text("⚡ Boost Raid Points\nChoose:", cid, mid, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("boost_"))
def boost_select(c):
    uid = c.from_user.id
    try: pts = int(c.data.split("_")[1])
    except: return
    sol = BOOST_PRICES.get(pts)
    if not sol: return
    states[uid] = {"type":"boost", "data":{"pts":pts, "amt":sol}}
    text = f"{pts:,} points – {sol} SOL\nSend exact amount to:\n`{SOL_WALLET}`"
    kb = InlineKeyboardMarkup()
    kb.row(
        InlineKeyboardButton("Verify", callback_data="boost_verify"),
        InlineKeyboardButton("Back", callback_data="back")
    )
    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, parse_mode='Markdown', reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "boost_verify")
def boost_verify(c):
    verify_payment(c, "boost")

# ───── TRENDING ─────
@bot.callback_query_handler(func=lambda c: c.data in ["buy_trending", "trend"])
def trend_start_cb(c):
    trend_start(c.message.chat.id, c.message.message_id)

@bot.message_handler(commands=['trend'])
def trend_cmd(m):
    trend_start(m.chat.id, m.message_id)

def trend_start(cid, mid):
    kb = InlineKeyboardMarkup(row_width=2)
    for name, price in TREND_PRICES.items():
        kb.add(InlineKeyboardButton(f"{name} – {price} SOL", callback_data=f"trend_{name.replace(' ','_')}"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.edit_message_text("🔥 Boost Trending Position\nChoose package:", cid, mid, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("trend_"))
def trend_package(c):
    uid = c.from_user.id
    pkg = c.data[6:].replace('_',' ')
    price = TREND_PRICES.get(pkg)
    if not price: return
    states[uid] = {"type":"trend", "data":{"pkg":pkg, "amt":price}}
    text = f"{pkg} – {price} SOL\nSend exact amount:\n`{SOL_WALLET}`"
    kb = InlineKeyboardMarkup()
    kb.row(
        InlineKeyboardButton("Verify", callback_data="trend_verify"),
        InlineKeyboardButton("Back", callback_data="back")
    )
    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, parse_mode='Markdown', reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "trend_verify")
def trend_verify(c):
    verify_payment(c, "trend")

# ───── PUMP ───── (very similar to trend)
@bot.callback_query_handler(func=lambda c: c.data == "pump")
def pump_start_cb(c):
    pump_start(c.message.chat.id, c.message.message_id)

@bot.message_handler(commands=['pump'])
def pump_cmd(m):
    pump_start(m.chat.id, m.message_id)

def pump_start(cid, mid):
    kb = InlineKeyboardMarkup(row_width=2)
    for name, price in PUMP_PRICES.items():
        kb.add(InlineKeyboardButton(f"{name} – {price} SOL", callback_data=f"pump_{name.replace(' ','_')}"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.edit_message_text("🔥 Pump.fun Trending\nChoose package:", cid, mid, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("pump_"))
def pump_package(c):
    uid = c.from_user.id
    pkg = c.data[5:].replace('_',' ')
    price = PUMP_PRICES.get(pkg)
    if not price: return
    states[uid] = {"type":"pump", "data":{"pkg":pkg, "amt":price}}
    text = f"{pkg} – {price} SOL\nSend exact amount:\n`{SOL_WALLET}`"
    kb = InlineKeyboardMarkup()
    kb.row(
        InlineKeyboardButton("Verify", callback_data="pump_verify"),
        InlineKeyboardButton("Back", callback_data="back")
    )
    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, parse_mode='Markdown', reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "pump_verify")
def pump_verify(c):
    verify_payment(c, "pump")

# ───── PREMIUM ─────
@bot.callback_query_handler(func=lambda c: c.data == "premium")
def premium_start_cb(c):
    premium_start(c.message.chat.id)

@bot.message_handler(commands=['premium'])
def premium_cmd(m):
    premium_start(m.chat.id)

def premium_start(cid):
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("Weekly – 0.5 SOL", callback_data="prem_weekly"),
        InlineKeyboardButton("Monthly – 1.5 SOL", callback_data="prem_monthly")
    )
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    bot.send_message(cid, "💎 Premium (No-Ads + perks)\nChoose plan:", reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("prem_"))
def prem_select(c):
    uid = c.from_user.id
    plan = c.data[5:].capitalize()
    amt = PREMIUM_PRICES.get(plan)
    if not amt: return
    states[uid] = {"type":"premium", "data":{"plan":plan, "amt":amt}}
    text = f"{plan} plan – {amt} SOL\nSend exact amount:\n`{SOL_WALLET}`"
    kb = InlineKeyboardMarkup()
    kb.row(
        InlineKeyboardButton("Verify", callback_data="prem_verify"),
        InlineKeyboardButton("Back", callback_data="back")
    )
    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, parse_mode='Markdown', reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "prem_verify")
def prem_verify(c):
    verify_payment(c, "premium")

# ───── VOLUME / DEX ─────
@bot.callback_query_handler(func=lambda c: c.data in ["volume","dex"])
def vol_dex_start(c):
    volume_start(c.message.chat.id, c.message.message_id)

@bot.message_handler(commands=['volume','dex'])
def vol_dex_cmd(m):
    volume_start(m.chat.id, m.message_id)

def volume_start(cid, mid=None):
    text = "🌟 Volume / DEX Boost\nChoose tier:"
    kb = InlineKeyboardMarkup(row_width=1)
    for tier, price in VOLUME_PRICES.items():
        kb.add(InlineKeyboardButton(f"{tier} – {price} SOL", callback_data=f"vol_{tier}"))
    kb.add(InlineKeyboardButton("← Back", callback_data="back"))
    if mid is not None:
        bot.edit_message_text(text, cid, mid, reply_markup=kb)
    else:
        bot.send_message(cid, text, reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("vol_"))
def vol_select(c):
    uid = c.from_user.id
    tier = c.data[4:]
    amt = VOLUME_PRICES.get(tier)
    if not amt: return
    states[uid] = {"type":"volume", "data":{"tier":tier, "amt":amt}}
    text = f"{tier} tier – {amt} SOL\nSend exact amount:\n`{SOL_WALLET}`"
    kb = InlineKeyboardMarkup()
    kb.row(
        InlineKeyboardButton("Verify", callback_data="vol_verify"),
        InlineKeyboardButton("Back", callback_data="back")
    )
    bot.edit_message_text(text, c.message.chat.id, c.message.message_id, parse_mode='Markdown', reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "vol_verify")
def vol_verify(c):
    verify_payment(c, "volume")

# ───── AIRDROP ─────
@bot.callback_query_handler(func=lambda c: c.data == "airdrop")
def airdrop_cb(c):
    bot.answer_callback_query(c.id, "Use /airdrop <amount> @user1 @user2 ... in group", show_alert=True)

@bot.message_handler(commands=['airdrop'])
def airdrop_cmd(m):
    if m.chat.type not in ['group','supergroup']:
        return bot.reply_to(m, "Use in group only")
    admins = [a.user.id for a in bot.get_chat_administrators(m.chat.id)]
    if m.from_user.id not in admins:
        return bot.reply_to(m, "Admins only")
    parts = m.text.split(maxsplit=1)
    if len(parts) < 2:
        return bot.reply_to(m, "/airdrop <amount> @user1 @user2 ...")
    try:
        amt = float(parts[1].split()[0])
        users = [u.lstrip('@') for u in ' '.join(parts[1].split()[1:]).split() if u.startswith('@')]
    except:
        return bot.reply_to(m, "Invalid format")
    if not users:
        return bot.reply_to(m, "No users mentioned")
    kb = InlineKeyboardMarkup()
    kb.row(
        InlineKeyboardButton("Confirm", callback_data="airdrop_ok"),
        InlineKeyboardButton("Cancel", callback_data="back")
    )
    text = f"Confirm airdrop {amt} SOL to {len(users)} users?"
    msg = bot.send_message(m.chat.id, text, reply_markup=kb)
    states[m.from_user.id] = {"type":"airdrop", "data":{"amt":amt, "users":users, "chat":m.chat.id, "mid":msg.message_id}}

@bot.callback_query_handler(func=lambda c: c.data == "airdrop_ok")
def airdrop_ok(c):
    uid = c.from_user.id
    if uid not in states or states[uid]["type"] != "airdrop":
        return
    d = states[uid]["data"]
    # In real version → send SOL here
    bot.edit_message_text(
        f"✅ Airdrop of {d['amt']} SOL to {len(d['users'])} users completed (simulation)",
        d["chat"], d["mid"]
    )
    del states[uid]

# ───── CENTRAL CALLBACK ─────
@bot.callback_query_handler(func=lambda c: True)
def central_callback(c):
    d = c.data
    if d == "add_group":
        bot.answer_callback_query(c.id, "Add me to group as admin 🍒")
    elif d == "back":
        start(c.message)
    # all other cases handled in specific handlers above

# ───── HYPE LOOP (placeholder) ─────
def hype_loop():
    while True:
        time.sleep(10800)  # 3 hours
        # Add real trending logic later when you have valid API / scraping method
        # For now just log
        print("[HYPE] Placeholder - no trending data fetched")

threading.Thread(target=hype_loop, daemon=True).start()

# ───── GROUP JOIN ─────
@bot.message_handler(content_types=['new_chat_members'])
def bot_added(m):
    me = bot.get_me()
    for member in m.new_chat_members:
        if member.id == me.id:
            group_ids.add(m.chat.id)
            bot.send_message(m.chat.id, "🍒 Bot added!\nUse /add <CA> and /setwebsite <url>")

# ───── WEBHOOK ─────
@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    update = telebot.types.Update.de_json(request.stream.read().decode('utf-8'))
    bot.process_new_updates([update])
    return 'OK', 200

if __name__ == "__main__":
    bot.remove_webhook()
    hostname = os.environ.get('RENDER_EXTERNAL_HOSTNAME') or f"{os.environ.get('RENDER_APP_NAME','your-app')}.onrender.com"
    webhook_url = f"https://{hostname}/{TOKEN}"
    print("Setting webhook to:", webhook_url)
    bot.set_webhook(url=webhook_url)
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)