// index.js
console.log("[BOOT] process.cwd() =", process.cwd());

import "dotenv/config";

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";
import axios from "axios";
import { fetch as undiciFetch } from "undici";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { Redis } from "@upstash/redis";

// ------- Shared / Economy core -------
import { deDupeGuard } from "./economy/econ-core.js";

// ---------- Core / Shared (keep if still used elsewhere) ----------
import { maleFirst, femaleFirst, neutralFirst, lastNames } from "./names.js";
import { BARTENDER_FIRST, BARTENDER_LAST } from "./bartender-names.js";
import { LOVE_TIERS } from "./love-tiers.js";
import { DUEL_ROASTS, RALLY_LINES, BAR_EVENTS, INVASION_STARTS } from "./faction-text.js";

// --------- Traveler (facade from /traveler) ---------
import {
  onTravelerMsg,
  onTravelerInteraction,
  onTravelerConfirmMsg,
  onTravelerConfirmInt,
  onAbilitiesMsg,
  onAbilitiesIx,
  onSkillsMsg,
  onSkillsIx,
} from "./traveler/index.js";

// --------- Send Drink Imports -----------
import { GIFT_QUIPS, THANKS } from "./bar-quips.js";

// ---------- Forge ----------
import { onMessageCreate as onForgeMsg } from "./forge-command.js";

// ---------- Conditions & Checks ----------
import { onMessageCreate as onCondsMsg, onInteractionCreate as onCondsIx } from "./conditions-commands.js";
import { onMessageCreate as onChecksMsg, onInteractionCreate as onChecksIx } from "./checks-command.js";

// --------- Party + Workboard -------
import { onMessageCreate as onPartyMsg } from "./economy/party-commands.js";
import {
  onMessageCreate as onWorkboardMsg,
  onInteractionCreate as onWorkboardIx
} from "./economy/workboard.js";

// ---------- Economy Core ----------
import { onMessageCreate as onBankMsg } from "./economy/bank-commands.js";
import { onMessageCreate as onInventoryMsg } from "./economy/inventory-commands.js";
import { onMessageCreate as onAdminEconMsg } from "./economy/admin-commands.js";

// ---------- Vendors ----------
import { onMessageCreate as onBarMsg } from "./economy/vendor-bar.js"; // Stirred Veil Bar

// ---------- Dice ----------
import { onMessageCreate as onDiceMsg } from "./economy/dice-commands.js";

// --- Sith Trial ---
import { onMessageCreate as onTrialMsg, onInteractionCreate as onTrialIx } from "./trials/trial-command.js";

// --- Faction Folder Imports ---
import { factionsRouter } from "./factions/index.js";

//

// ---------- Redis / misc ----------
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const fetch = globalThis.fetch || undiciFetch;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOVE_DB_FILE = path.join(__dirname, "love-log.json");

const TOKEN = (process.env.DISCORD_TOKEN || "").trim(); // set in Render env vars
if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN env var.");
  process.exit(1);
}

// ---------- Twitch EventSub config (keep if you use) ----------
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || "";
const TWITCH_EVENTSUB_SECRET = process.env.TWITCH_EVENTSUB_SECRET || "";
const TWITCH_BROADCASTER_ID = process.env.TWITCH_BROADCASTER_ID || "";
const TWITCH_REWARD_ID = process.env.TWITCH_REWARD_ID || ""; // optional

// ---------- StreamElements Loyalty API (keep if you use) ----------
const SE_JWT = process.env.SE_JWT || "";
const SE_CHANNEL_ID = process.env.SE_CHANNEL_ID || "";

// ------ Global App ---------
const app = express();
app.use(express.json());
app.use(express.static("public")); // if you serve /public
app.use("/factions", factionsRouter);
// If you do this, update any Wizebot/overlay URLs accordingly.
app.locals.redis = redis;
app.use(factionsRouter);


// --- Discord client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,   // ← REQUIRED
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
});

// --- Unified dispatcher: route every message to each handler safely ---
const _seenLocal = new Set();
function seenOnce(key, ttlMs = 30000) {
  if (_seenLocal.has(key)) return false;
  _seenLocal.add(key);
  setTimeout(() => _seenLocal.delete(key), ttlMs).unref?.();
  return true;
}

client.on("messageCreate", async (msg) => {
  if (msg.author?.bot) return;

  const run = async (fn, tag) => {
    if (!fn) return;
    try {
      const ok = await deDupeGuard(`m:${msg.id}:${tag}`, 30);
      if (!ok) return;
      await fn(msg);
    } catch (e) {
      console.error("[handler error]", tag || fn?.name, e);
    }
  };

  // Traveler creation + confirm
  await run(onTravelerMsg,        "traveler");
  await run(onTravelerConfirmMsg, "traveler-confirm");

  // Party + Workboard
  await run(onPartyMsg,      "party");
  await run(onWorkboardMsg,  "workboard");

  // Economy
  await run(onBarMsg,        "vendor-bar");
  await run(onBankMsg,       "bank");
  await run(onInventoryMsg,  "inventory");
  await run(onAdminEconMsg,  "admin-econ");

  // Abilities + Skills + Conditions + Checks
  await run(onAbilitiesMsg,  "abilities");
  await run(onSkillsMsg,     "skills");
  await run(onCondsMsg,      "conditions");
  await run(onChecksMsg,     "checks");

  // Dice
  await run(onDiceMsg,       "dice");

  // Trials + Forge
  await run(onTrialMsg,      "trial");
  await run(onForgeMsg,      "forge");
});

client.on("interactionCreate", async (ix) => {
  const runI = async (fn, tag) => {
    if (!fn) return;
    try {
      const id = ix.id || `${ix.user?.id}:${ix.customId || "unknown"}`;
      const ok = await deDupeGuard(`i:${id}:${tag}`, 30);
      if (!ok) return;
      await fn(ix);
    } catch (e) {
      console.error("[interaction error]", tag || fn?.name, e);
    }
  };

  // Traveler interactions (sheet buttons + confirm button)
  await runI(onTravelerInteraction,  "traveler-int");
  await runI(onTravelerConfirmInt,   "traveler-confirm-int");

  // Party + Workboard interactions
  await runI(onWorkboardIx,         "workboard-int");

  // Abilities + Skills + Conditions + Checks interactions
  await runI(onAbilitiesIx,         "abilities-int");
  await runI(onSkillsIx,            "skills-int");
  await runI(onCondsIx,             "conditions-int");
  await runI(onChecksIx,            "checks-int");

  // Trial interactions
  await runI(onTrialIx,             "trial-int");
});

// One ready log (use once to avoid dupes on hot-reload)
client.once("ready", () => console.log(`Logged in as ${client.user.tag}`));

// ---- NO OTHER messageCreate / interactionCreate listeners below this ----

// Login
client.login(TOKEN).catch((err) => {
  console.error("Discord login failed:", err);
  process.exit(1);
});


// ---------- Award log (shared) ----------
const AWARD_LOG_FILE = "./award-log.json";

function logSpecialAward(entry) {
  try {
    const arr = fs.existsSync(AWARD_LOG_FILE)
      ? JSON.parse(fs.readFileSync(AWARD_LOG_FILE, "utf8"))
      : [];
    arr.push(entry);
    fs.writeFileSync(AWARD_LOG_FILE, JSON.stringify(arr.slice(-200), null, 2));
  } catch {}
}

/** Add (or deduct with negative) points to a user via SE */
async function seAddPoints(username, amount) {
  const cleanUser = String(username || "").replace(/^@/, "").trim().toLowerCase();
  if (!SE_JWT || !SE_CHANNEL_ID || !cleanUser || !Number.isInteger(amount) || amount === 0) {
    return { ok: false, status: 0, body: "missing params/env" };
  }
  const url = `https://api.streamelements.com/kappa/v2/points/${encodeURIComponent(
    SE_CHANNEL_ID
  )}/${encodeURIComponent(cleanUser)}/${amount}`;
  try {
    const resp = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${SE_JWT}`, Accept: "application/json" },
    });
    let bodyText = "";
    try { bodyText = await resp.text(); } catch {}
    return { ok: resp.ok, status: resp.status, body: bodyText?.slice(0, 300) || "" };
  } catch (err) {
    return { ok: false, status: -1, body: String(err).slice(0, 300) };
  }
}

// quick public ping (no auth) so we can prove we're in the right app
app.get('/discord/ping', (_req, res) => res.send('pong'));

/** Fetch a user's current SE points balance */
async function seGetPoints(username) {
  const cleanUser = String(username || "").replace(/^@/, "").trim().toLowerCase();
  if (!SE_JWT || !SE_CHANNEL_ID || !cleanUser) {
    return { ok: false, points: null, status: 0, body: "missing params/env" };
  }
  const url = `https://api.streamelements.com/kappa/v2/points/${encodeURIComponent(
    SE_CHANNEL_ID
  )}/${encodeURIComponent(cleanUser)}`;

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${SE_JWT}`, Accept: "application/json" },
    });
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    const points =
      (json && (json.points ?? json.total ?? json.current ?? json.amount)) ?? null;

    return { ok: resp.ok, points, status: resp.status, body: text.slice(0, 300) };
  } catch (err) {
    return { ok: false, points: null, status: -1, body: String(err).slice(0, 300) };
  }
}

/** Balance suffix helper (safe fallback to empty) */
async function balanceSuffix(username) {
  const r = await seGetPoints(username);
  if (r.ok && typeof r.points === "number") {
    return ` You now have ${r.points} Distortion Dollars.`;
  }
  return "";
}

/** Fire-and-forget SE award (used for daily special bonus logging) */
function awardAndLogLater(user, drink, date, amount) {
  setImmediate(async () => {
    const result = await seAddPoints(user, amount);
    try {
      logSpecialAward({
        user, drink, amount, date,
        time: new Date().toISOString(),
        awarded: result.ok, status: result.status, body: result.body,
      });
    } catch {}
  });
}

app.disable("x-powered-by");


// ---------------- love tier helpers -------------
function loadLoveDB() {
  try {
    if (!fs.existsSync(LOVE_DB_FILE)) return { streams: {}, order: [] }; // order: newest-first stream ids
    return JSON.parse(fs.readFileSync(LOVE_DB_FILE, "utf8"));
  } catch {
    return { streams: {}, order: [] };
  }
}
function saveLoveDB(db) {
  try {
    fs.writeFileSync(LOVE_DB_FILE, JSON.stringify(db, null, 2), "utf8");
  } catch { /* noop */ }
}
function ensureStream(db, streamId) {
  if (!db.streams[streamId]) {
    db.streams[streamId] = { createdAt: Date.now(), entries: [] };
    db.order = db.order.filter(id => id !== streamId);
    db.order.unshift(streamId);
    db.order = db.order.slice(0, 50); // cap to 50 recent streams
  }
}
function pickTier(pct) {
  if (pct <= 30) return "t1";
  if (pct <= 60) return "t2";
  if (pct <= 80) return "t3";
  if (pct <= 90) return "t4";
  return "t5";
}
function pickMessage(tierKey) {
  const arr = LOVE_TIERS[tierKey] || [];
  return arr[Math.floor(Math.random() * arr.length)] || "Feelings detected.";
}
function sanitizeOneLine(s) {
  return String(s).replace(/\s+/g, " ").trim();
}
function normUser(u) {
  return String(u || "").replace(/^@+/, "").trim().toLowerCase();
}

// Streams index (keep last many): ZSET of streamId with timestamp score
const LOVE_STREAMS = "love:streams";

function loveKeyUserStream(user, streamId) {
  return `love:user:${String(user).toLowerCase()}:${streamId}`; // HASH {sum, count, last}
}

// record one roll
async function loveRecordRoll({ target, streamId, pct }) {
  const key = loveKeyUserStream(target, streamId);
  const now = Date.now();
  // add stream to index
  await redis.zadd(LOVE_STREAMS, { score: now, member: streamId });

  // increment stats
  await redis.hincrby(key, { sum: pct, count: 1 });
  await redis.hset(key, { last: pct }); // update last
}

// read last N stream IDs (newest first)
async function loveLastNStreams(n = 5) {
  // Upstash client: use zrange with { rev: true } instead of zrevrange
  return await redis.zrange(LOVE_STREAMS, 0, n - 1, { rev: true });
}


async function loveReadUserStream(user, streamId) {
  const h = await redis.hgetall(loveKeyUserStream(user, streamId));
  if (!h || (!h.sum && !h.count)) return null;
  const sum = Number(h.sum || 0), count = Number(h.count || 0), last = Number(h.last || 0);
  if (!count) return { avg: null, last: null, count: 0 };
  const avg = Math.round(sum / count);
  return { avg, last, count };
}
 

// ---------------- Shared helpers ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomBartenderName = () => `${sample(BARTENDER_FIRST)} ${sample(BARTENDER_LAST)}`;

// -------- Daily Drink Special (bar side) --------
const DRINK_KEYS = ["vodka","whiskey","gin","rum","tequila","lightbeer","darkbeer","redwine","espresso","bourbon"];
const DAILY_BONUS = 1000;
const SPECIAL_SALT = process.env.SPECIAL_SALT || "distorted-realm-salt";

const dateKeyNY = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};
function hashToIndex(str, mod) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Number(h % mod);
}
function getTodaysSpecial() {
  const key = dateKeyNY();
  const idx = hashToIndex(`${key}:${SPECIAL_SALT}`, DRINK_KEYS.length);
  return { date: key, drink: DRINK_KEYS[idx] };
}

// Shared globals used by the route modules
const globals = {
  BARTENDER_FIRST,
  BARTENDER_LAST,
  DRINK_KEYS,      // ensure DRINK_KEYS is defined before this snippet
  SPECIAL_SALT,    // ensure SPECIAL_SALT is defined before this snippet
};

// Small config bag for constants expected by routes
const config = {
  DAILY_BONUS: typeof DAILY_BONUS !== "undefined" ? DAILY_BONUS : 1000,
  // add other small constants if needed
};


// ---------------- Quip pools (bar) ----------------
const LINES = [
  "Careful, that one's potent.",
  "Tip jar’s over there 👉 https://streamelements.com/d4rth_distortion/tip",
  "Another round already?",
  "I like the way you use that straw 😏",
  "This one’s made with love 😘",
  "Wish I could drink with you...",
  "This full glass is opposite of my empty life...",
  "You about to get cut off buddy!",
  "Ay lil shawty, can I have your number?",
  "We didn't have the liquor you wanted, so I substituted it with Everclear. It's all the same.",
  "Hell yeah I suck toes! *puts phone down* my bad, here’s your drink.",
  "Enjoy!",
  "*looks you up and down* that’s the outfit you chose tonight? *shrugs* couldn’t be me?",
  "Don’t spill it on the carpet.",
  "Here’s your drink, now get out my face.",
];

const COMPLAINTS = [
  (user, issue) => `Bartender to ${user}: “Oh, ${issue || "that drink"} not to your liking? Fine, but the jukebox still takes quarters.”`,
  (user, issue) => `Bartender to ${user}: “Not enough umbrella in your ${issue || "cocktail"}? We ran out after the last pirate convention.”`,
  (user, issue) => `Bartender to ${user}: “That ${issue || "drink"} comes with a free life lesson: don’t trust the specials board.”`,
  (user, issue) => `Bartender to ${user}: “Complain all you want, but my pour was measured by the gods themselves.”`,
  (user, issue) => `Bartender to ${user}: “Listen I literally don't get paid enough to deal. Take it up with D4rth Distortion.”`,
  (user, issue) => `Bartender to ${user}: “*crashes out* I DONT GIVE A DAMN ABOUT YOU OR THAT DRINK! FOH!”`,
  (user, issue) => `Bartender to ${user}: “Ah yes, ${issue || "your drink"}… we call that ‘house flavor’. It’s rustic.”`,
  (user, issue) => `Bartender to ${user}: “No refunds, but I’ll throw in an extra olive. That’s our version of customer service.”`,
  (user, issue) => `Bartender to ${user}: “If you wanted perfection, you should’ve gone to Hogwarts, not my bar.”`,
  (user, issue) => `Bartender to ${user}: “OMG I'm so sorry! Heres a new drink for you, please don't tell D4rth Distortion.”`,
  (user, issue) => `Bartender to ${user}: “Alright ${user}, I’ll remake it… but this time I’m charging you emotional labor.”`,
];


const STORM_OFF = [
  (user) => `The bartender glares at ${user}, rips off the apron, and storms out screaming “Y’all don’t deserve me!”`,
  (user) => `Bartender yeets the bar rag, mutters something unholy about ${user}, and moonwalks out the door.`,
  (user) => `“I’m unionized with the Sith now,” the bartender hisses at ${user} before force-sliding out.`,
  (user) => `The bartender flips a coaster at ${user} like a ninja star and vanishes into the night.`,
  (user) => `Keys slam. “I quit this pixel bar,” they snarl at ${user}, exiting stage left in dramatic fashion.`,
  (user) => `Bartender burst into teers. “Now my pet giraffe won't have any oranges to eat! ,” they give sad puppy eyes at ${user}, and skidaddles out of the bar.`,
  (user) => `They snicker. “Me? Fired? You know you done fucked up right? Huh? Thats cool, I"m finna get the toolie and air dis bitch out, hold tight.” they do the gun fingers at ${user}, and bop out the back door.`,
];

const CHEERS = [
  (user) => `Bartender to ${user}: “Appreciate you! May your ice always clink and your Wi-Fi never drop.”`,
  (user) => `Bartender to ${user}: “Cheers, legend. Next one comes with extra style points.”`,
  (user) => `Bartender to ${user}: “Verified: you have excellent taste and impeccable vibes.”`,
  (user) => `Bartender to ${user}: “Gratitude noted. Hydration and happiness incoming.”`,
  (user) => `Bartender to ${user}: “Thanks fam. Tip jar smiles upon you.”`,
  (user) => `Bartender to ${user}: “Can you tell D4rth Distortion I got a good review?”`,
  (user) => `Bartender to ${user}: “Gee wilikers pal thank you very much! That was a splendifurous thing to say! Neato dude!”`,
];




// ---------------- State counters ----------------
let firedCount = 0;
let drinksServedCount = 0;
let cheersCount = 0;
let fightsCount = 0;

const drinkCounts = new Map();
const keyUser = (u) => String(u || "").trim().toLowerCase();
const bumpDrinkCount = (u) => {
  const k = keyUser(u);
  if (!k) return 0;
  const next = (drinkCounts.get(k) || 0) + 1;
  drinkCounts.set(k, next);
  return next;
};

// --- Daily Special flag ---
let specialAward = { date: null, awarded: false };
function ensureSpecialFlagForToday() {
  const today = dateKeyNY();
  if (specialAward.date !== today) specialAward = { date: today, awarded: false };
  return specialAward;
}

// ---------------- Health routes ----------------
app.get("/", (_req, res) => res.type("text/plain").send("OK"));
app.get("/healthz", (_req, res) => res.type("text/plain").send("OK"));

// Daily special peek
app.get("/special", (_req, res) => {
  const { date, drink } = getTodaysSpecial();
  res.type("text/plain").send(`Today's special (${date}) is: ${drink} (+${DAILY_BONUS})`);
});

// ---------------- Routes for Love Tiers ------------

// Health (optional)
app.get("/health", (_req, res) => res.type("text/plain").send("OK"));

 function isValidStreamId(id) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(id)); // e.g., 2025-10-20 or 2025-10-20-2
}

// ---------- Routes for send drinks -----

function titleizeDrink(slug){
  const s = String(slug||"").trim();
  if (!s) return "a drink";
  const low = s.toLowerCase();
  const map = {
    vodka:"Vodka", whiskey:"Whiskey", gin:"Gin", rum:"Rum", tequila:"Tequila",
    lightbeer:"Light Beer", darkbeer:"Dark Beer", redwine:"Red Wine", espresso:"Espresso", bourbon:"Bourbon"
  };
  return map[low] || (s[0].toUpperCase() + s.slice(1));
}

app.get("/senddrink/quip", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }

  const from = String(req.query.from || "").replace(/^@/,"").trim() || "someone";
  const to   = String(req.query.to   || "").replace(/^@/,"").trim() || "you";
  const drinkTitle = titleizeDrink(req.query.drink || "drink");

  const pick = GIFT_QUIPS[Math.floor(Math.random() * GIFT_QUIPS.length)]
            || ((t,f,d)=>`“${f} bought ${t} a ${d}. I just pour.”`);
  const line = pick(`@${to}`, `@${from}`, drinkTitle);

  return res.type("text/plain").send(line);
});

// ---------- /love (Redis-backed) ----------
// Returns ONE love line and logs it under a stream bucket.
// Example (SE):
//   ${if ${1}==""}
//   ${urlfetch https://twitch-bar-followup.onrender.com/love?sender=${sender}&target=${sender}}
//   ${else}
//   ${urlfetch https://twitch-bar-followup.onrender.com/love?sender=${sender}&target=${1}}
//   ${endif}
app.get("/love", async (req, res) => {
  const sender = sanitizeOneLine(req.query.sender || "Someone");

  // Default to sender if no explicit target provided
  const rawTarget =
    req.query.target || req.query.user || req.query.name || req.query.touser || sender;
  const target = sanitizeOneLine(rawTarget).replace(/^@+/, "");
  const who = normUser(target);

  // Default stream bucket: YYYY-MM-DD (or pass ?stream=${channel} if you prefer per-channel)
  const streamId = sanitizeOneLine(
    req.query.stream || new Date().toISOString().slice(0, 10)
  );

  const pct  = Math.floor(Math.random() * 101); // 0..100
  const tier = pickTier(pct);
  const msg  = pickMessage(tier);
  const line = `${sender} loves @${who} ${pct}% — ${msg}`;

  // Respond immediately
  res
    .set("Cache-Control", "no-store")
    .type("text/plain; charset=utf-8")
    .status(200)
    .send(sanitizeOneLine(line));

  // Log to Redis (so /lovelog sees it). Fire-and-forget to avoid blocking chat.
  loveRecordRoll({ target: who, streamId, pct }).catch((e) =>
    console.error("loveRecordRoll failed:", e?.message || e)
  );
});


// ---------------- FOLLOWUP (drinks) ----------------
app.get("/followup", async (req, res) => {
  const bare = req.query.bare === "1";
  const user = (req.query.user || "").toString();
  const drink = (req.query.drink || "").toString().slice(0, 40);
  const delayMs = Math.min(parseInt(req.query.delayMs || "2500", 10) || 2500, 4500);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  if (!bare && !user) return res.status(400).type("text/plain").send("Missing ?user=");

  await sleep(delayMs);

  const base = sample(LINES);
  const line = typeof base === "string" && base.trim() ? base : "Enjoy!";

  let tail = "";
  if (user && drink) {
    const count = bumpDrinkCount(user);
    drinksServedCount += 1;
    tail = ` That’s drink #${count} tonight.`;
    if (count === 3) tail += " Remember to hydrate. 💧";
    if (count === 5) tail += " Easy there, champion. 🛑 Hydration check!";
    if (count === 7) tail += " Why are you crying and dancing on the table shirtless?";
    if (count === 10) tail += " 🚕 Call them an uber. Security get them out of here!";

    const { date, drink: todaySpecial } = getTodaysSpecial();
    const flag = ensureSpecialFlagForToday();
    if (drink.toLowerCase() === todaySpecial && !flag.awarded) {
      flag.awarded = true;
      tail += ` 🎯 Daily Special! +${DAILY_BONUS} Distortion Dollars`;
      awardAndLogLater(user, drink, date, DAILY_BONUS);
    }
  }

  const msg = bare ? `${line}${tail}` : `Bartender to ${user}: ${line}${tail}`;
  return res.type("text/plain").send(msg);
});

// ---------------- COMPLAINT / FIRE / CHEERS / FIGHTS ----------------
app.get("/complaint", async (req, res) => {
  const bare = req.query.bare === "1";
  const user = (req.query.user || "").toString();
  const issue = (req.query.issue || "").toString().slice(0, 120);
  const delayMs = Math.min(parseInt(req.query.delayMs || "2000", 10) || 2000, 4500);
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  await sleep(delayMs);
  const full = sample(COMPLAINTS)(user || "guest", issue);
  if (bare) return res.type("text/plain").send(full.replace(/^Bartender to .*?:\s*/, ""));
  return res.type("text/plain").send(full);
});
app.get("/firepack", async (req, res) => {
  const user = (req.query.user || "").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "5000", 10) || 5000, 8000);
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  await sleep(delayMs);
  const storm = sample(STORM_OFF)(user || "the Realm");
  firedCount += 1;
  const hire = `A new bartender, ${randomBartenderName()}, has now taken over the Distorted Realm bar to better serve the Realm. (Fired so far: ${firedCount})`;
  return res.type("text/plain").send(`${storm} ${hire}`);
});
app.get("/cheers", async (req, res) => {
  const bare = req.query.bare === "1";
  const user = (req.query.user || "").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "1500", 10) || 1500, 4500);
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  await sleep(delayMs);
  cheersCount += 1;
  const full = sample(CHEERS)(user || "friend");
  if (bare) return res.type("text/plain").send(full.replace(/^Bartender to .*?:\s*/, ""));
  return res.type("text/plain").send(full);
});
const trackFightHandler = (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  fightsCount += 1;
  return res.status(204).send();
};
app.get("/trackfight", trackFightHandler);
app.get("/trackfight2", trackFightHandler);
app.get("/track/fight", trackFightHandler);

// ---------------- Utility & Summary ----------------
app.get("/firedcount", (_req, res) => res.type("text/plain").send(`Bartenders fired so far: ${firedCount}`));
app.get("/drinks", (req, res) => {
  const user = (req.query.user || "").toString();
  const k = keyUser(user);
  const n = k ? drinkCounts.get(k) || 0 : 0;
  res.type("text/plain").send(`${user || "Guest"} has ${n} drink${n === 1 ? "" : "s"} tonight.`);
});
app.get("/fightscount", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  res.type("text/plain").send(`Fights so far: ${fightsCount}`);
});
app.get("/speciallast", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  try {
    if (!fs.existsSync(AWARD_LOG_FILE)) return res.type("text/plain").send("No awards logged yet.");
    const data = JSON.parse(fs.readFileSync(AWARD_LOG_FILE, "utf8"));
    const last = data[data.length - 1];
    if (!last) return res.type("text/plain").send("No awards logged yet.");
    const txt = `last award -> user: ${last.user}, drink: ${last.drink}, amount: ${last.amount}, ok: ${last.awarded}, status: ${last.status}`;
    return res.type("text/plain").send(txt);
  } catch {
    return res.status(500).type("text/plain").send("Error reading last award");
  }
});
app.get("/end", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const summary = `Session Summary: Bartenders fired: ${firedCount} | Drinks served: ${drinksServedCount} | Cheers given: ${cheersCount} | Fights broke out: ${fightsCount}`;
  res.type("text/plain").send(summary);
});
app.get("/resetdrinks", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  if (user) {
    drinkCounts.delete(keyUser(user));
    return res.type("text/plain").send(`Reset drink counter for ${user}.`);
  }
  drinkCounts.clear();
  res.type("text/plain").send("Reset all drink counters.");
});
app.get("/resetfired", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  firedCount = 0;
  res.type("text/plain").send("Fired counter reset to 0");
});
app.get("/resetall", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  firedCount = 0; drinksServedCount = 0; cheersCount = 0; fightsCount = 0; drinkCounts.clear();
  specialAward = { date: dateKeyNY(), awarded: false };
  res.type("text/plain").send("All counters reset.");
});
app.get("/debug/award", async (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  const amount = parseInt(req.query.amount || "0", 10);
  const result = await seAddPoints(user, amount);
  return res.type("text/plain").send(`award test -> ok: ${result.ok}, status: ${result.status}, body: ${result.body}`);
});

// ===================== GRASS ENTREPRENEUR =====================

// Costs (Distortion Dollars)
const COSTS = {
  flower: 20,
  brownies: 35,
  gummies: 30,
};

// Flowers (short slugs)
const FLOWER_LIST = [
  { slug:"haze",   name:"Acolyte Haze" },
  { slug:"og",     name:"Obsidian OG" },
  { slug:"kush",   name:"Crimson Kyber Kush" },
  { slug:"shade",  name:"Sithshade Indica" },
  { slug:"diesel", name:"Dark Side Diesel" },
  { slug:"breath", name:"Vader’s Breath" },
  { slug:"nebula", name:"Phantom Nebula" },
  { slug:"dream",  name:"Dathomir Dream" }
];

const PRODUCTS = {
  ...Object.fromEntries(
    FLOWER_LIST.map(f => [
      f.slug,
      { slug:f.slug, kind:"flower", unit:"oz", name:f.name, buyInc:8, consumeInc:2 }
    ])
  ),
  brownies: { slug:"brownies", kind:"brownies", unit:"pcs", name:"Night Market Brownies", buyInc:10, consumeInc:1 },
  gummies:  { slug:"gummies",  kind:"gummies",  unit:"pcs", name:"Crimson Citrus Gummies", buyInc:10, consumeInc:1 }
};

// Inventory: Map<userLower, Map<slug, qty>>
const grassInv = new Map();
const userKey = u => String(u || "").trim().toLowerCase();
const getProduct = slug => PRODUCTS[String(slug || "").trim().toLowerCase()] || null;

function addInv(user, slug, amount) {
  const u = userKey(user); if (!u) return 0;
  if (!grassInv.has(u)) grassInv.set(u, new Map());
  const bag = grassInv.get(u);
  const next = (bag.get(slug) || 0) + amount;
  bag.set(slug, next);
  return next;
}
function subInv(user, slug, amount) {
  const u = userKey(user); if (!u) return { ok:false, left:0 };
  const bag = grassInv.get(u); if (!bag) return { ok:false, left:0 };
  const have = bag.get(slug) || 0;
  if (have < amount) return { ok:false, left:have };
  const left = have - amount;
  if (left === 0) bag.delete(slug); else bag.set(slug, left);
  if (bag.size === 0) grassInv.delete(u);
  return { ok:true, left };
}
function biggestFlowerSlug(user) {
  const u = userKey(user);
  const bag = grassInv.get(u); if (!bag) return null;
  let best = null, max = -1;
  for (const [slug, qty] of bag.entries()) {
    const p = getProduct(slug);
    if (p?.kind === "flower" && qty > max) { best = slug; max = qty; }
  }
  return best;
}

const WEED_QUIPS = [
  (u,p) => `“Keep it discreet, ${u}. ${p} pairs with lo-fi beats and good vibes.”`,
  (u,p) => `“Shadow vendor nods. ${p} acquired; snacks recommended.”`,
  (u,p) => `“Be wise, ${u}. ${p} respects responsible chill.”`,
  (u,p) => `“Ay cuz, ${u} who sent you here????. you the feds?? nah you give good vibes. Heres the ${p}, now get outta here.”`,
  (u,p) => `“Be careful, ${u}. Too much of that ${p} will have buck naked in the middle of rush our traffic singing Celine Dion”`,
  (u,p) => `“Be wise, ${u}. ${p} respects responsible chill.”`,
  (u,p) => `“Stocked up. ${p} unlocks +2 Vibes.”`
];
const ROLLUP_EFFECTS = [
  "exhales a perfect ring and contemplates the galaxy.",
  "finds the overlay surprisingly profound.",
  "initiates Operation: Snack Run.",
  "laughs at a silent meme for 12 seconds.",
  "stares into the void of the realm.",
  "laughs at a silent meme for 12 seconds.",
  "starts to think very philosophical thoughts.",
  "nods to the beat like a sage."
];

function buildLinesForBuy({ user, product, newTotal, amount }) {
  const oz = product.unit === "oz" ? "oz" : "";
  const seLine = `${user} has bought ${amount}${oz} of ${product.name}, they now have ${newTotal}${oz}.`;
  const nbLine = WEED_QUIPS[Math.floor(Math.random() * WEED_QUIPS.length)](user, product.name);
  return { seLine, nbLine };
}
function buildLinesForConsume({ user, product, left, used, actionWord }) {
  const oz = product.unit === "oz" ? "oz" : "";
  const seLine = `${user} ${actionWord} ${product.name} (-${used}${oz}). They now have ${left}${oz}.`;
  const nbLine = `${user} ${actionWord} ${product.name}. ${ROLLUP_EFFECTS[Math.floor(Math.random()*ROLLUP_EFFECTS.length)]} Remaining: ${left}${oz}.`;
  return { seLine, nbLine };
}

// Health
app.get("/grass/health", (_req,res) => res.type("text/plain").send("grass: OK"));

// BUY flower: /grass/buy?user=&product=haze|...&mode=se|nb&key=SECRET
app.get("/grass/buy", async (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  const mode = (req.query.mode || "").toString().toLowerCase();
  const product = getProduct(req.query.product);
  if (!user || !product) return res.status(400).type("text/plain").send("Missing user or product");

  // Nightbot: quip only, no charge, no state change
  if (mode === "nb") {
    const { nbLine } = buildLinesForBuy({ user, product, newTotal: 0, amount: product.buyInc });
    return res.type("text/plain").send(nbLine);
  }

  // StreamElements: charge first
  const cost =
    product.kind === "flower" ? COSTS.flower :
    product.kind === "brownies" ? COSTS.brownies :
    product.kind === "gummies" ? COSTS.gummies : 0;

  const charge = await seAddPoints(user, -cost);
  if (!charge.ok) {
    return res
      .type("text/plain")
      .send(`${user} tried to buy ${product.name} for ${cost} Distortion Dollars, but the purchase failed.`);
  }

  // On success: add inventory and announce + balance
  const newTotal = addInv(user, product.slug, product.buyInc);
  const { seLine } = buildLinesForBuy({ user, product, newTotal, amount: product.buyInc });
  const balText = await balanceSuffix(user);
  return res.type("text/plain").send(seLine + balText);
});

// ROLLUP (flowers): /grass/rollup?user=&product=<opt>&mode=se|nb&key=SECRET
app.get("/grass/rollup", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  let slug = (req.query.product || "").toString().toLowerCase();
  const mode = (req.query.mode || "").toString().toLowerCase();
  if (!user) return res.status(400).type("text/plain").send("Missing user");

  let product = slug ? getProduct(slug) : null;
  if (!product) {
    const best = biggestFlowerSlug(user);
    if (!best) return res.type("text/plain").send(`${user} has no flower to roll up.`);
    product = getProduct(best);
    slug = best;
  }
  if (product.kind !== "flower") return res.type("text/plain").send("That item isn’t rollable flower.");

  const used = product.consumeInc; // 2oz
  const r = subInv(user, slug, used);
  if (!r.ok) return res.type("text/plain").send(`${user} doesn’t have enough ${product.name}. Need ${used}oz.`);

  const { seLine, nbLine } = buildLinesForConsume({ user, product, left: r.left, used, actionWord: "rolls up" });
  if (mode === "se") return res.type("text/plain").send(seLine);
  if (mode === "nb") return res.type("text/plain").send(nbLine);
  return res.type("text/plain").send(`${seLine} ${nbLine}`);
});

// EAT brownie: /grass/eat?user=&mode=se|nb&key=SECRET
app.get("/grass/eat", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  if (!user) return res.status(400).type("text/plain").send("Missing user");
  const product = PRODUCTS["brownies"];
  const r = subInv(user, "brownies", product.consumeInc);
  if (!r.ok) return res.type("text/plain").send(`${user} has no ${product.name} to eat.`);
  const { seLine, nbLine } = buildLinesForConsume({ user, product, left: r.left, used: product.consumeInc, actionWord: "eats" });
  const mode = (req.query.mode || "").toString().toLowerCase();
  if (mode === "se") return res.type("text/plain").send(seLine);
  if (mode === "nb") return res.type("text/plain").send(nbLine);
  return res.type("text/plain").send(`${seLine} ${nbLine}`);
});

// CHEW gummy: /grass/chew?user=&mode=se|nb&key=SECRET
app.get("/grass/chew", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  if (!user) return res.status(400).type("text/plain").send("Missing user");
  const product = PRODUCTS["gummies"];
  const r = subInv(user, "gummies", product.consumeInc);
  if (!r.ok) return res.type("text/plain").send(`${user} has no ${product.name} to chew.`);
  const { seLine, nbLine } = buildLinesForConsume({ user, product, left: r.left, used: product.consumeInc, actionWord: "chews" });
  const mode = (req.query.mode || "").toString().toLowerCase();
  if (mode === "se") return res.type("text/plain").send(seLine);
  if (mode === "nb") return res.type("text/plain").send(nbLine);
  return res.type("text/plain").send(`${seLine} ${nbLine}`);
});

// BUY edibles packs (SE only should charge)
app.get("/grass/buybrownies", async (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  const mode = (req.query.mode || "").toString().toLowerCase();
  if (!user) return res.status(400).type("text/plain").send("Missing user");
  const product = PRODUCTS["brownies"];

  
  if (mode === "nb") {
    const { nbLine } = buildLinesForBuy({ user, product, newTotal: 0, amount: product.buyInc });
    return res.type("text/plain").send(nbLine);
  }

  const charge = await seAddPoints(user, -COSTS.brownies);
  if (!charge.ok) return res.type("text/plain").send(`${user} tried to buy ${product.name} for ${COSTS.brownies}, but the purchase failed.`);

  const newTotal = addInv(user, "brownies", product.buyInc);
  const { seLine } = buildLinesForBuy({ user, product, newTotal, amount: product.buyInc });
  const balText = await balanceSuffix(user);
  return res.type("text/plain").send(seLine + balText);
});

app.get("/grass/buygummies", async (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  const mode = (req.query.mode || "").toString().toLowerCase();
  if (!user) return res.status(400).type("text/plain").send("Missing user");
  const product = PRODUCTS["gummies"];

  if (mode === "nb") {
    const { nbLine } = buildLinesForBuy({ user, product, newTotal: 0, amount: product.buyInc });
    return res.type("text/plain").send(nbLine);
  }

  const charge = await seAddPoints(user, -COSTS.gummies);
  if (!charge.ok) return res.type("text/plain").send(`${user} tried to buy ${product.name} for ${COSTS.gummies}, but the purchase failed.`);

  const newTotal = addInv(user, "gummies", product.buyInc);
  const { seLine } = buildLinesForBuy({ user, product, newTotal, amount: product.buyInc });
  const balText = await balanceSuffix(user);
  return res.type("text/plain").send(seLine + balText);
});

// Inventory view
app.get("/grass/inv", (req, res) => {
  const user = (req.query.user || "").toString();
  if (!user) return res.status(400).type("text/plain").send("Missing user");
  const bag = grassInv.get(userKey(user));
  if (!bag || bag.size === 0) return res.type("text/plain").send(`${user} has no stash.`);
  const parts = [];
  for (const [slug, qty] of bag.entries()) {
    const p = getProduct(slug) || { unit:"", name: slug };
    const unit = p.unit === "oz" ? "oz" : "pcs";
    parts.push(`${qty}${unit} ${p.name}`);
  }
  res.type("text/plain").send(`${user} stash: ${parts.join(" | ")}`);
});

// Admin: reset grass
app.get("/grass/reset", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  if (user) { grassInv.delete(userKey(user)); return res.type("text/plain").send(`Cleared stash for ${user}.`); }
  grassInv.clear();
  res.type("text/plain").send("Cleared all stashes.");
});


// Marvel Rivals tracker state
let marvelProgress = {
  goal: 1200,
  current: 120   // ⬅ start at 120 instead of 0
};

// Route for overlay to read the current progress
app.get("/marvel", (req, res) => {
  res.json(marvelProgress);
});

// Route for commands to add progress
app.get("/marvel/add/:num", (req, res) => {
  const amount = parseInt(req.params.num, 10) || 0;
  marvelProgress.current += amount;

  if (marvelProgress.current > marvelProgress.goal) {
    marvelProgress.current = marvelProgress.goal;
  }

  res.json(marvelProgress);
});


// ---------------- Twitch EventSub (webhook) ----------------
app.post("/twitch/eventsub", express.raw({ type: "application/json" }), async (req, res) => {
  const msgId = req.header("twitch-eventsub-message-id");
  const ts = req.header("twitch-eventsub-message-timestamp");
  const sig = req.header("twitch-eventsub-message-signature");
  if (!msgId || !ts || !sig) return res.status(400).send("missing headers");
  const age = Math.abs(Date.now() - Date.parse(ts));
  if (age > 10 * 60 * 1000) return res.status(403).send("stale");

  const hmac = crypto.createHmac("sha256", TWITCH_EVENTSUB_SECRET);
  hmac.update(msgId + ts + req.body);
  const expected = "sha256=" + hmac.digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return res.status(403).send("bad signature");
  } catch { return res.status(403).send("bad signature"); }

  const messageType = req.header("twitch-eventsub-message-type");
  const payload = JSON.parse(req.body.toString("utf8"));
  if (messageType === "webhook_callback_verification") return res.status(200).type("text/plain").send(payload.challenge);
  if (messageType === "revocation") { console.warn("EventSub revoked:", payload?.subscription?.status); return res.sendStatus(200); }
  if (messageType === "notification") {
    try {
      const subType = payload?.subscription?.type;
      const ev = payload?.event;
      if (subType === "channel.channel_points_custom_reward_redemption.add") {
        const title = (ev?.reward?.title || "").toLowerCase();
        const rewardId = ev?.reward?.id || "";
        const login = ev?.user_login || "";
        const matchesId = TWITCH_REWARD_ID && rewardId === TWITCH_REWARD_ID;
        const matchesTitle = title === "first";
        if ((matchesId || matchesTitle) && login) {
          const result = await seAddPoints(login, 200);
          logSpecialAward({
            user: login, drink: "channel-redeem:first", amount: 200,
            date: dateKeyNY(), time: new Date().toISOString(),
            awarded: result.ok, status: result.status, body: result.body,
          });
        }
      }
    } catch (e) { console.error("EventSub handler error:", e); }
    return res.sendStatus(200);
  }
  return res.sendStatus(200);
});


try {
  await reloadTrialData();
  console.log("[TRIAL] questions loaded at boot");
} catch (err) {
  console.warn("[TRIAL] failed to load questions at boot:", err?.message || err);
}


// ---------------- Start server ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('[ENTRY] backend main loaded');
  console.log('[LISTEN]', PORT);
});

