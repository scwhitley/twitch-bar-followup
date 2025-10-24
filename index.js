// index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import 'dotenv/config';
import fs from "fs";
import axios from "axios"
import { BARTENDER_FIRST, BARTENDER_LAST } from "./bartender-names.js";
import { fetch as undiciFetch } from "undici";
import { DUEL_ROASTS, RALLY_LINES, BAR_EVENTS, INVASION_STARTS } from "./faction-text.js";
import { Redis } from "@upstash/redis";
import { LOVE_TIERS } from "./love-tiers.js"; 
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const fetch = globalThis.fetch || undiciFetch;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOVE_DB_FILE = path.join(__dirname, "love-log.json");


// ---------- Twitch EventSub config ----------
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || "";
const TWITCH_EVENTSUB_SECRET = process.env.TWITCH_EVENTSUB_SECRET || "";
const TWITCH_BROADCASTER_ID = process.env.TWITCH_BROADCASTER_ID || "";
const TWITCH_REWARD_ID = process.env.TWITCH_REWARD_ID || ""; // optional

// ---------- StreamElements Loyalty API ----------
const SE_JWT = process.env.SE_JWT || "";
const SE_CHANNEL_ID = process.env.SE_CHANNEL_ID || "";


// ------ Global App ---------
const app = express();
app.use(express.json());
app.use(express.static("public")); // if you serve /public



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

// read last N stream IDs
async function loveLastNStreams(n = 5) {
  return await redis.zrevrange(LOVE_STREAMS, 0, n - 1); // newest first
}

async function loveReadUserStream(user, streamId) {
  const h = await redis.hgetall(loveKeyUserStream(user, streamId));
  if (!h || (!h.sum && !h.count)) return null;
  const sum = Number(h.sum || 0), count = Number(h.count || 0), last = Number(h.last || 0);
  if (!count) return { avg: null, last: null, count: 0 };
  const avg = Math.round(sum / count);
  return { avg, last, count };
}


// ----- Duel / ELO / Faction helpers (Redis) -----
function eloKey(user)          { return `duel:elo:${String(user).toLowerCase()}`; }
function duelLastKey(user)     { return `duel:last:${String(user).toLowerCase()}`; }
function warPointsKey(side)    { return `war:points:${side}`; } // side = "jedi" | "sith"

const DUEL_COOLDOWN_MS = 60 * 1000; // 60s cooldown per challenger
const ELO_START = 1000;
const ELO_WIN = 15;
const ELO_LOSS = -10;
const ELO_LOSS_VS_D4RTH = -10; // loser penalty vs boss
const D4RTH_USERNAME = "d4rth_distortion"; // case-insensitive match

async function getAlignment(user) {
  return (await redis.get(`force:user:${String(user).toLowerCase()}`)) || null; // "jedi"|"sith"|"gray"|null
}
async function ensureElo(user) {
  let cur = await redis.get(eloKey(user));
  if (cur == null) {
    await redis.set(eloKey(user), ELO_START);
    cur = ELO_START;
  }
  return Number(cur);
}
async function addFactionPoints(side, n) {
  // only Jedi/Sith count for war meter
  if (side !== "jedi" && side !== "sith") return;
  await redis.incrby(warPointsKey(side), n);
}
function sideLabel(side) {
  return side === "jedi" ? "Jedi" : side === "sith" ? "Sith" : "Gray";
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}



// ===== Force Trial (Jedi / Sith / Gray) =====

// Config
const FORCE_TIMEOUT_MS = 90 * 1000; // 90 seconds
const FORCE_COOLDOWN_AFTER_FINISH_MS = 5 * 1000; // tiny cooldown after a run (optional)

// State (in-memory)
let FORCE_ACTIVE = null; // { user, step, startedAt, lastTouch, score }
let FORCE_LAST_FINISHED_AT = 0;

// Questions (ASCII-safe)
const FORCE_QUESTIONS = [
  {
    q: "Q1 — Choose your path: 1) Peace  2) Power",
    w: [ { jedi: 2 }, { sith: 2 } ]
  },
  {
    q: "Q2 — What matters more: 1) Order  2) Freedom",
    w: [ { jedi: 1 }, { gray: 1 } ]
  },
  {
    q: "Q3 — Guide your heart: 1) Serenity  2) Passion",
    w: [ { jedi: 2 }, { sith: 2 } ]
  }
];

// Result quips
const FORCE_RESULT_LINES = {
  jedi: [
    "Verdict: JEDI — calm mind, sharp focus, blue glow.",
    "Verdict: JEDI — serenity over spice.",
    "Verdict: JEDI — your aura hums like a temple bell.",
    "Verdict: JEDI — peace is your power.",
    "Verdict: JEDI — discipline > dopamine.",
    "Verdict: JEDI — you resist the chaos (barely)."
  ],
  sith: [
    "Verdict: SITH — power sings in your veins. 🔥",
    "Verdict: SITH — passion ignites, caution exits.",
    "Verdict: SITH — unlimited power (terms apply).",
    "Verdict: SITH — mercy not found.",
    "Verdict: SITH — red saber, red flags, red everything.",
    "Verdict: SITH — the bar lights dim when you smile."
  ],
  gray: [
    "Verdict: GRAY — balance in the chaos. 🌓",
    "Verdict: GRAY — you walk between star and shadow.",
    "Verdict: GRAY — peace when needed, smoke when provoked.",
    "Verdict: GRAY — neither leash nor chain fits.",
    "Verdict: GRAY — you choose the moment, not the mantra.",
    "Verdict: GRAY — flexible, dangerous, interesting."
  ]
};

function forceCleanupIfExpired() {
  if (!FORCE_ACTIVE) return;
  const now = Date.now();
  if (now - FORCE_ACTIVE.lastTouch > FORCE_TIMEOUT_MS) {
    FORCE_ACTIVE = null;
  }
}

function forceCanStart(user) {
  const now = Date.now();
  if (FORCE_ACTIVE && FORCE_ACTIVE.user !== user) return { ok: false, msg: `A trial is in progress for @${FORCE_ACTIVE.user}. Please wait.` };
  if (FORCE_ACTIVE && FORCE_ACTIVE.user === user) return { ok: true }; // allow resume
  if (now - FORCE_LAST_FINISHED_AT < FORCE_COOLDOWN_AFTER_FINISH_MS) return { ok: false, msg: "The Force is catching its breath. Try again in a moment." };
  return { ok: true };
}

function forceStart(user) {
  FORCE_ACTIVE = {
    user,
    step: 0,
    startedAt: Date.now(),
    lastTouch: Date.now(),
    score: { jedi: 0, sith: 0, gray: 0 }
  };
}

function forceApplyChoice(choiceIdx) {
  const weights = FORCE_QUESTIONS[FORCE_ACTIVE.step].w[choiceIdx];
  Object.entries(weights).forEach(([k, v]) => {
    FORCE_ACTIVE.score[k] = (FORCE_ACTIVE.score[k] || 0) + v;
  });
  FORCE_ACTIVE.step += 1;
  FORCE_ACTIVE.lastTouch = Date.now();
}

async function forceResult(publishUser) {
  const s = FORCE_ACTIVE.score;
  let alignment = "gray";
  if (s.jedi >= s.sith && s.jedi >= s.gray) alignment = "jedi";
  else if (s.sith >= s.jedi && s.sith >= s.gray) alignment = "sith";
  if (s.gray >= s.jedi && s.gray >= s.sith) alignment = "gray";

  // Persist alignment
  if (publishUser) await setUserAlignmentRedis(publishUser, alignment);

  const pool = FORCE_RESULT_LINES[alignment];
  const line = pool[Math.floor(Math.random() * pool.length)] || `Verdict: ${alignment.toUpperCase()}`;


  // finalize
  FORCE_ACTIVE = null;
  FORCE_LAST_FINISHED_AT = Date.now();

  // No score in the public message (per your request)
  return line;
}

function forceKeyUser(user) {
  return `force:user:${String(user).toLowerCase()}`; // value: "jedi" | "sith" | "gray"
}
function forceKeyCount(side) {
  return `force:count:${side}`; // integer counters
}

// Set alignment, keeping counts accurate
async function setUserAlignmentRedis(user, newAlignment) {
  const key = forceKeyUser(user);
  const prev = await redis.get(key); // "jedi" | "sith" | "gray" | null

  if (prev && prev !== newAlignment) {
    await redis.decr(forceKeyCount(prev));
  }
  if (!prev || prev !== newAlignment) {
    await redis.incr(forceKeyCount(newAlignment));
  }
  await redis.set(key, newAlignment);
}

async function getFactionCountsRedis() {
  const [j, s, g] = await redis.mget(
    forceKeyCount("jedi"),
    forceKeyCount("sith"),
    forceKeyCount("gray")
  );
  const jedi = Number(j || 0), sith = Number(s || 0), gray = Number(g || 0);
  return { jedi, sith, gray, total: jedi + sith + gray };
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

// ---------------- Flight Attendant Complaint Quips ----------------
const FLIGHT_COMPLAINTS = [
  (user, issue) => `Flight Attendant to ${user}: “Oh, ${issue || "that snack"} not to your liking? I’ll alert the captain… to laugh at you.”`,
  (user, issue) => `Flight Attendant to ${user}: “We ran out of ${issue || "that drink"} after the turbulence party in row 12.”`,
  (user, issue) => `Flight Attendant to ${user}: “That ${issue || "meal"} was curated by Michelin-starred pigeons. Show some respect.”`,
  (user, issue) => `Flight Attendant to ${user}: “I’ll remake it… but this time I’m charging you emotional labor.”`,
  (user, issue) => `Flight Attendant to ${user}: “You want gourmet service in coach? That’s adorable.”`,
  (user, issue) => `Flight Attendant to ${user}: “I used to be a barista. Now I microwave pretzels for ${user}.”`,
  (user, issue) => `Flight Attendant to ${user}: “OMG I'm so sorry! Here’s a new snack. Please don’t tell D4rth Distortion.”`,
  (user, issue) => `Flight Attendant to ${user}: “We call that ‘airline flavor’. It’s rustic.”`,
  (user, issue) => `Flight Attendant to ${user}: “If you wanted perfection, you should’ve flown private.”`,
  (user, issue) => `Flight Attendant to ${user}: “I’ll fix it, but I’m writing a poem about this trauma later.”`,
  (user, issue) => `Flight Attendant to ${user}: “I don’t get paid enough to care. Take it up with the clouds.”`,
  (user, issue) => `Flight Attendant to ${user}: “I substituted your ${issue || "snack"} with vibes. Hope that’s okay.”`,
];

// ---------------- Flight Complaint Endpoint ----------------
app.get("/flightcomplaint", async (req, res) => {
  const bare = req.query.bare === "1";
  const user = (req.query.user || "").toString();
  const issue = (req.query.issue || "").toString().slice(0, 120);
  const delayMs = Math.min(parseInt(req.query.delayMs || "2000", 10) || 2000, 5000);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY)
    return res.status(401).type("text/plain").send("unauthorized");

  await sleep(delayMs);
  const full = sample(FLIGHT_COMPLAINTS)(user || "passenger", issue);
  if (bare) return res.type("text/plain").send(full.replace(/^Flight Attendant to .*?:\s*/, ""));
  return res.type("text/plain").send(full);
});


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

// ---------------- Flight Attendant Firepack ----------------
const FLIGHT_STORM_OFF = [
  (user) => `The flight attendant was mid-rant about ${user} asking for extra peanuts when D4rth Distortion grabbed them and yeeted them out the emergency exit.`,
  (user) => `Just as the flight attendant finished flipping off row 12 and calling ${user} “a snackless gremlin,” D4rth Distortion stormed in and launched them out the hatch.`,
  (user) => `The attendant was trying to unionize the snack cart when D4rth Distortion burst from the cockpit and sent them flying into the stratosphere.`,
  (user) => `They were composing a breakup haiku about ${user} on a napkin when D4rth Distortion snatched them and yeeted them into the clouds.`,
  (user) => `Right after they spilled cranberry juice on ${user} and said “Oops, turbulence,” D4rth Distortion came in hot and ejected them like a soda can.`,
  (user) => `They were halfway through a TikTok dance in the aisle when D4rth Distortion tackled them and yeeted them into orbit.`,
  (user) => `The attendant was trying to charge ${user} $50 for a warm Sprite when D4rth Distortion kicked open the hatch and sent them skydiving without a parachute.`,
  (user) => `They were whispering “I hate this airline” into the intercom when D4rth Distortion grabbed them by the collar and launched them into the jet stream.`,
  (user) => `They were about to serve ${user} a single pretzel and call it “gourmet” when D4rth Distortion intervened with a heroic yeet.`,
  (user) => `The attendant was arguing with the autopilot about snack distribution when D4rth Distortion emerged and flung them into the clouds like a paper plane.`,
];


const FLIGHT_CHEERS = [
  (user) => `Flight Attendant to ${user}: “Appreciate you! May your snacks be crunchy and your Wi-Fi never drop.”`,
  (user) => `Flight Attendant to ${user}: “Cheers, legend. Next snack comes with extra style points.”`,
  (user) => `Flight Attendant to ${user}: “Verified: you have excellent taste and impeccable vibes.”`,
  (user) => `Flight Attendant to ${user}: “Gratitude noted. Hydration and happiness incoming.”`,
  (user) => `Flight Attendant to ${user}: “Thanks fam. Snack cart smiles upon you.”`,
  (user) => `Flight Attendant to ${user}: “Can you tell D4rth Distortion I got a good review?”`,
  (user) => `Flight Attendant to ${user}: “Gee wilikers pal thank you very much! That was a splendiferous thing to say! Neato dude!”`,
];

// ---------------- State Counter ----------------
let flightFiredCount = 0;

// ---------------- Flight Firepack Endpoint ----------------
app.get("/flightfirepack", async (req, res) => {
  const user = (req.query.user || "").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "5000", 10) || 5000, 8000);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY)
    return res.status(401).type("text/plain").send("unauthorized");

  await sleep(delayMs);
  const storm = sample(FLIGHT_STORM_OFF)(user || "the Realm");
  flightFiredCount += 1;
  const hire = `A new flight attendant, ${randomBartenderName()}, has now taken over the Distorted Realm airline to better serve the skies. (Fired so far: ${flightFiredCount})`;
  return res.type("text/plain").send(`${storm} ${hire}`);
});

const randomFlightAttendantName = () =>
  `${sample(BARTENDER_FIRST)} ${sample(BARTENDER_LAST)}`;

app.get("/flightfirepack", async (req, res) => {
  const user = (req.query.user || "").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "5000", 10) || 5000, 8000);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY)
    return res.status(401).type("text/plain").send("unauthorized");

  await sleep(delayMs);
  const storm = sample(FLIGHT_STORM_OFF)(user || "the Realm");
  flightFiredCount += 1;

  // Send initial fire message
  res.type("text/plain").send(storm);

  // After 5 seconds, announce new hire
  setTimeout(() => {
    const newHire = randomFlightAttendantName();
    const msg = `A new flight attendant, ${newHire}, has teleported onto the plane to better serve the skies. (Fired so far: ${flightFiredCount})`;
    // You can log this, send to overlay, or trigger Nightbot externally
    console.log("[Nightbot follow-up]", msg);
    // Optional: expose via a shared queue or webhook if needed
  }, 5000);
});

// Serve /public if not already handled
app.use(express.static("public"));

// In-memory trigger flag for the overlay
let FOOD_TRIGGER_TS = 0;

// POST /trigger/food-command   -> flip the trigger flag
app.post("/trigger/food-command", express.json(), (req, res) => {
  FOOD_TRIGGER_TS = Date.now();
  res.json({ ok: true, at: FOOD_TRIGGER_TS });
});

// GET /api/food-command/next   -> overlay polls this; one-shot trigger
app.get("/api/food-command/next", (req, res) => {
  if (FOOD_TRIGGER_TS) {
    const at = FOOD_TRIGGER_TS;
    FOOD_TRIGGER_TS = 0;
    return res.json({ trigger: true, at });
  }
  res.json({ trigger: false });
});

// GET /food-command  -> serves the overlay page
app.get("/food-command", (req, res) => {
  const filePath = path.join(process.cwd(), "public", "food-command", "index.html");
  res.sendFile(filePath);
});

// ---------------- Flight Cheers Endpoint ----------------
app.get("/flightcheers", async (req, res) => {
  const bare = req.query.bare === "1";
  const user = (req.query.user || "").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "1500", 10) || 1500, 5000);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY)
    return res.status(401).type("text/plain").send("unauthorized");

  await sleep(delayMs);
  const full = sample(FLIGHT_CHEERS)(user || "passenger");
  if (bare) return res.type("text/plain").send(full.replace(/^Flight Attendant to .*?:\s*/, ""));
  return res.type("text/plain").send(full);
});


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

// Return ONE love line, and log it under a stream bucket
// Example call used by StreamElements:
// /love?sender=D4rth_Distortion&target=SomeUser&stream=CHANNEL_OR_DATE
app.get("/love", (req, res) => {
  const sender = sanitizeOneLine(req.query.sender || "Someone");
  const targetRaw = req.query.target || req.query.user || req.query.name || "chat";
  const target = sanitizeOneLine(targetRaw).replace(/^@+/, "");
  // Default stream bucket: YYYY-MM-DD (or pass ?stream=${channel} in SE if you prefer)
  const streamId = sanitizeOneLine(req.query.stream || new Date().toISOString().slice(0, 10));

  const pct = Math.floor(Math.random() * 101); // 0..100
  const tier = pickTier(pct);
  const msg = pickMessage(tier);
  const line = `${sender} loves @${target} ${pct}% — ${msg}`;

  // respond
  res.set("Cache-Control", "no-store");
  res.type("text/plain; charset=utf-8").status(200).send(sanitizeOneLine(line));

  // log
  const db = loadLoveDB();
  ensureStream(db, streamId);
  db.streams[streamId].entries.push({
    ts: Date.now(),
    sender,
    target: normUser(target),
    pct
  });
  // keep per-stream size reasonable
  if (db.streams[streamId].entries.length > 2000) {
    db.streams[streamId].entries = db.streams[streamId].entries.slice(-2000);
  }
  saveLoveDB(db);
});



// Summarize last 5 streams (or a specific one) for a user
// /lovelog?user=SomeUser            -> last 5 streams summary
// /lovelog?user=SomeUser&stream=ID  -> just that stream
// If ?user is missing, you can pass ?sender=NAME (SE can fill with ${sender})
// ---------- /lovelog (Redis) ----------
app.get("/lovelog", async (req, res) => {
  const who = normUser(req.query.user || req.query.name || req.query.target || req.query.sender);
  if (!who) {
    return res.type("text/plain").status(200).send("Usage: /lovelog?user=NAME");
  }

  const streamQ = sanitizeOneLine(req.query.stream || "");
  let streamsToCheck = [];

  if (streamQ) {
    streamsToCheck = [streamQ];
  } else {
    streamsToCheck = await loveLastNStreams(5); // newest first
  }

  // Build per-stream results, skip empties
  const perStream = [];
  for (const id of streamsToCheck) {
    const stats = await loveReadUserStream(who, id);
    if (stats && stats.count > 0) {
      perStream.push({ id, ...stats });
    }
  }

  if (streamQ) {
    const s = perStream[0];
    const out = s
      ? `@${who} — Stream ${s.id}: avg ${s.avg}%, last ${s.last}% (${s.count} rolls)`
      : `@${who} — Stream ${streamQ}: no data.`;
    return res
      .type("text/plain")
      .status(200)
      .send(sanitizeOneLine(out));
  } else {
    if (!perStream.length) {
      return res
        .type("text/plain")
        .status(200)
        .send(`No love data yet for @${who}.`);
    }

    // weighted average across displayed streams
    const totalCount = perStream.reduce((a, b) => a + b.count, 0);
    const weighted = Math.round(
      perStream.reduce((sum, s) => sum + s.avg * s.count, 0) / totalCount
    );

    const parts = perStream.map(s => `${s.id}:${s.avg}% (last ${s.last}%)`);
    const out = `@${who} — Last ${perStream.length} streams avg ${weighted}%. ${parts.join(" | ")}`;

    return res
      .set("Cache-Control", "no-store")
      .type("text/plain; charset=utf-8")
      .status(200)
      .send(sanitizeOneLine(out));
  }
});



// Start a trial
// GET /force/start?user=NAME
app.get("/force/start", (req, res) => {
  forceCleanupIfExpired();
  const user = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
  if (!user) return res.type("text/plain").send("Usage: /force/start?user=NAME");

  const can = forceCanStart(user);
  if (!can.ok) return res.type("text/plain").send(can.msg);

  if (!FORCE_ACTIVE) forceStart(user);

  const q = FORCE_QUESTIONS[FORCE_ACTIVE.step].q;
  res.set("Cache-Control", "no-store");
  res.type("text/plain").send(`@${user}, your Force Trial begins. Reply with !pick 1 or !pick 2. ${q}`);
});

// Answer a question
// GET /force/answer?user=NAME&choice=1
// ---------- /force/answer ----------
app.get("/force/answer", async (req, res) => {
  forceCleanupIfExpired();

  const user = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
  const choiceStr = String(req.query.choice || "").trim();

  if (!user || !choiceStr) {
    return res.type("text/plain").send("Usage: /force/answer?user=NAME&choice=1");
  }
  if (!FORCE_ACTIVE) {
    return res.type("text/plain").send("No active trial. Use !force to begin.");
  }
  if (FORCE_ACTIVE.user !== user) {
    return res.type("text/plain").send(`A trial is running for @${FORCE_ACTIVE.user}. Please wait.`);
  }

  const choiceIdx = parseInt(choiceStr, 10) - 1;
  if (!(choiceIdx === 0 || choiceIdx === 1)) {
    return res.type("text/plain").send(`@${user} choose 1 or 2.`);
  }

  forceApplyChoice(choiceIdx);

  if (FORCE_ACTIVE.step >= FORCE_QUESTIONS.length) {
    const verdict = await forceResult(user); // forceResult must be async
    return res.type("text/plain").send(`@${user} ${verdict}`);
  } else {
    const nextQ = FORCE_QUESTIONS[FORCE_ACTIVE.step].q;
    return res.type("text/plain").send(`@${user}, next: ${nextQ} (reply !pick 1 or !pick 2)`);
  }
});



// Cancel (owner only)
// GET /force/cancel?user=NAME
app.get("/force/cancel", (req, res) => {
  forceCleanupIfExpired();
  const user = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
  if (!user) return res.type("text/plain").send("Usage: /force/cancel?user=NAME");
  if (!FORCE_ACTIVE) return res.type("text/plain").send("No active trial.");

  if (FORCE_ACTIVE.user !== user) {
    return res.type("text/plain").send(`Only @${FORCE_ACTIVE.user} can cancel their trial.`);
  }
  FORCE_ACTIVE = null;
  FORCE_LAST_FINISHED_AT = Date.now();
  res.type("text/plain").send(`@${user} trial canceled.`);
});

// GET /force/factions  -> "Jedi: X | Sith: Y | Gray: Z | Total: N"
app.get("/force/factions", async (_req, res) => {
  const { jedi, sith, gray, total } = await getFactionCountsRedis();
  const line = `Factions — Jedi: ${jedi} | Sith: ${sith} | Gray: ${gray} | Total: ${total}`;
  res.set("Cache-Control", "no-store");
  res.type("text/plain; charset=utf-8").status(200).send(line);
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

// ---------------- Flight Snack Command Pools ----------------
const FLIGHT_SNACKS = {
  coach: {
    snacks: [
      "pretzels", "salted peanuts", "mini cookies", "trail mix", "granola bar",
      "cheese crackers", "popcorn", "fruit snacks", "rice cakes", "potato chips"
    ],
    drinks: [
      "water", "cola", "ginger ale", "lemonade", "iced tea",
      "apple juice", "orange juice", "Sprite", "root beer", "cranberry juice"
    ]
  },
  business: {
    snacks: [
      "hummus with pita chips", "cheese cubes", "mixed nuts", "chocolate truffles", "mini croissants",
      "dried mango slices", "Greek yogurt", "veggie sticks with ranch", "mini muffins", "smoked almonds"
    ],
    drinks: [
      "sparkling water", "cold brew coffee", "craft soda", "green tea", "coconut water",
      "Arnold Palmer", "cherry limeade", "kombucha", "espresso shot", "blackberry lemonade"
    ]
  },
  firstclass: {
    snacks: [
      "prosciutto-wrapped melon", "Brie with fig jam", "truffle popcorn", "ahi tuna bites", "mini charcuterie board",
      "Caprese skewers", "lobster sliders", "caviar on blinis", "macarons", "chocolate-dipped strawberries"
    ],
    drinks: [
      "champagne", "Pinot Noir", "matcha latte", "elderflower tonic", "craft cocktail (virgin)",
      "mango lassi", "hibiscus tea", "sparkling rosé", "cold-pressed juice", "saffron-infused lemonade"
    ]
  }
};

// ---------------- Flight Attendant Quips ----------------
const FLIGHT_ATTENDANT_QUIPS = [
  (user) => `“You're lucky I'm still sober, ${user}.”`,
  (user) => `“Enjoy your snack, ${user}. I microwaved it myself.”`,
  (user) => `“This is the best we could do at 30,000 feet, ${user}.”`,
  (user) => `“Don’t ask for seconds, ${user}. I’m not your personal chef.”`,
  (user) => `“Smile and chew, ${user}. That’s all we ask.”`,
  (user) => `“If you need anything else, press the button and pray.”`,
  (user) => `“You’re my favorite passenger today, ${user}. Don’t tell the others.”`,
  (user) => `“I spit in the champagne, ${user}. Just kidding. Or am I?”`,
  (user) => `“This snack pairs well with turbulence, ${user}.”`,
  (user) => `“You’re welcome, ${user}. I deserve a raise.”`,
  (user) => `“I used to dream of Broadway. Now I serve pretzels to ${user}.”`,
  (user) => `“You again, ${user}? Fine. Here’s your snack.”`,
  (user) => `“I’m not mad, ${user}. Just disappointed.”`,
  (user) => `“This snack is more gourmet than your outfit, ${user}.”`,
  (user) => `“I gave you the good stuff, ${user}. Don’t tell coach.”`
];

// ---------------- Helper: Build Snack Response ----------------
const getFlightSnackCombo = (tier, user) => {
  const pool = FLIGHT_SNACKS[tier];
  if (!pool) return `${user} requested a snack, but the galley is empty.`;

  const snack = pool.snacks[Math.floor(Math.random() * pool.snacks.length)];
  const drink = pool.drinks[Math.floor(Math.random() * pool.drinks.length)];
  const quip = FLIGHT_ATTENDANT_QUIPS[Math.floor(Math.random() * FLIGHT_ATTENDANT_QUIPS.length)](user);

  return `Here is your food, ${user}: ${snack} and ${drink}. ${quip}`;
};

// ---------------- Flight Snack Endpoints ----------------
app.get("/flight/coachsnacks", async (req, res) => {
  const user = (req.query.user || "Guest").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "2000", 10) || 2000, 5000);
  await sleep(delayMs);
  const msg = getFlightSnackCombo("coach", user);
  res.type("text/plain").send(msg);
});

app.get("/flight/business", async (req, res) => {
  const user = (req.query.user || "Guest").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "2000", 10) || 2000, 5000);
  await sleep(delayMs);
  const msg = getFlightSnackCombo("business", user);
  res.type("text/plain").send(msg);
});

app.get("/flight/firstclass", async (req, res) => {
  const user = (req.query.user || "Guest").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "2000", 10) || 2000, 5000);
  await sleep(delayMs);
  const msg = getFlightSnackCombo("firstclass", user);
  res.type("text/plain").send(msg);
});

// 🔊 Send message to StreamElements chat
const sendChatMessage = async (message) => {
  try {
    await axios.post('https://api.streamelements.com/kappa/v2/bot/message', {
      channel: 'd4rth_distortion', // Replace with your Twitch channel name
      message: message
    }, {
      headers: {
        Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjaXRhZGVsIiwiZXhwIjoxNzcyOTkyMDE0LCJqdGkiOiJmZDg3NjNhYS03NzljLTQzMjAtOTE5MS0wMTAwNmM4M2VhNTkiLCJjaGFubmVsIjoiNjhiYzI2ZWM2MjU0OWUwZTU0YTRjNzFmIiwicm9sZSI6Im93bmVyIiwiYXV0aFRva2VuIjoiWXRzbmpPa2VNak03WjJvX2llVTVUd0xQQmNqS3FtVkhtTkt3N0lPV2FlY0I3OTlnIiwidXNlciI6IjY4YmMyNmVjNjI1NDllMGU1NGE0YzcxZSIsInVzZXJfaWQiOiIyN2Y3NDkzYS1jMWMxLTRkODctYmFmYy05YjM1ZTQwMjBhMTQiLCJ1c2VyX3JvbGUiOiJjcmVhdG9yIiwicHJvdmlkZXIiOiJ0d2l0Y2giLCJwcm92aWRlcl9pZCI6IjEzNjM0MDg1NzEiLCJjaGFubmVsX2lkIjoiMzkyZTJlOWMtN2EyNC00ZDIzLWE5MWYtYjEwNWJhMGYyYTJmIiwiY3JlYXRvcl9pZCI6ImExODI5YzdmLTZjOWQtNDcyMi1hN2U3LWUxMWI5OTA4YTAxNiJ9.7qRNHBvVqFC-EvXazbKD4gYmWBjBc9nlfkwbT363Auk` // Replace with your StreamElements JWT token
      }
    });
  } catch (err) {
    console.error('Error sending chat message:', err.message);
  }
};

app.get('/diagnosis', async (req, res) => {
  const { user, key } = req.query;
  if (key !== 'd4rth-distortion') return res.status(403).send('Forbidden');

  const displayName = user || 'Guest';

  // Respond immediately to StreamElements
  res.type("text/plain").send(`${displayName} asked D4rth Distortion to run a deep diagnosis on them.`);

  // Nightbot will handle the follow-up message 6 seconds later
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




// ---------------- Start server ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('[ENTRY] backend main loaded');
  console.log('[LISTEN]', PORT);
});

