// index.js
console.log("[BOOT] process.cwd() =", process.cwd());
import { reloadTrialData, getTrialStatus } from "./trial-data.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import "dotenv/config";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import fs from "fs";
import axios from "axios";
import { fetch as undiciFetch } from "undici";
import { Redis } from "@upstash/redis";
import { deDupeGuard } from "./economy/econ-core.js";

// ---------- Core / Shared (keep if you still use them elsewhere) ----------
import { maleFirst, femaleFirst, neutralFirst, lastNames } from "./names.js";
import { BARTENDER_FIRST, BARTENDER_LAST } from "./bartender-names.js";
import { LOVE_TIERS } from "./love-tiers.js";
import { DUEL_ROASTS, RALLY_LINES, BAR_EVENTS, INVASION_STARTS } from "./faction-text.js";

// --------- Traveler Creation (your sheet builder / rerolls) --------
import { onTravelerMsg, onTravelerInteraction } from "./traveler/index.js";

// --------- Send Drink Imports -----------
import { GIFT_QUIPS, THANKS } from "./bar-quips.js";


// --------- Traveler Confirm (+1000 DD once) --------
import { onTravelerConfirmMsg, onTravelerConfirmInt } from "./traveler/index.js";

// ---------- Forge ----------
import { onMessageCreate as onForgeMsg } from "./forge-command.js";

// ---------- Abilities + Skills ----------
import { onAbilitiesMsg, onAbilitiesIx } from "./traveler/index.js";
import { onSkillsMsg, onSkillsIx }       from "./traveler/index.js";

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

// ---------- Vendors (keep only the ones you use) ----------
import { onMessageCreate as onBarMsg } from "./economy/vendor-bar.js"; // Stirred Veil Bar

// ---------- Dice ----------
import { onMessageCreate as onDiceMsg } from "./economy/dice-commands.js";

// --- Sith Trial + Forge ---
import { onMessageCreate as onTrialMsg, onInteractionCreate as onTrialIx } from "./trial-command.js";


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

// messageCreate dispatcher
  await run(onTrialMsg);
  await run(onForgeMsg);
  
});

client.on("interactionCreate", async (ix) => {
  // Run a handler once per interaction per tag (30s TTL)
  const runI = async (fn, tag) => {
    if (!fn) return;
    try {
      const id = ix.id || `${ix.user?.id}:${ix.customId || "unknown"}`;
      const ok = await deDupeGuard(`i:${id}:${tag}`, 30);
      if (!ok) return; // already handled
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

// Login (keep your TOKEN definition above this)
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

// ===== Rally / Meditate / Seethe / Events / Invasion config =====
const RALLY_DAILY_LIMIT = 1;          // once/day per user
const RALLY_RECENT_TTL_SEC = 10 * 60; // for momentum bonus

const MEDITATE_DAILY_MAX = 5;
const SEETHE_DAILY_MAX   = 5;
const MEDITATE_CD_SEC    = 5 * 60;
const SEETHE_CD_SEC      = 5 * 60;
const DEFENSE_TTL_SEC    = 10 * 60;   // defend flags for convert modifiers

const ELO_BONUS_PER_USE  = 2;
const ELO_BONUS_DAILY_CAP= 5;         // max +5 ELO from meditate/seethe per day

const INVASION_DEFAULT_SEC = 180;     // 3 minutes double-points
const EVENT_MIN_GAP_SEC    = 20;      // small guard so timers don't spam if stacked

// day key
function dayKeyUTC() { return new Date().toISOString().slice(0, 10); }

// keys
function rallyDailyKey(user)     { return `rally:daily:${dayKeyUTC()}:${String(user).toLowerCase()}`; }
function meditateDailyKey(user)  { return `meditate:daily:${dayKeyUTC()}:${String(user).toLowerCase()}`; }
function meditateCdKey(user)     { return `meditate:cd:${String(user).toLowerCase()}`; }
function seetheDailyKey(user)    { return `seethe:daily:${dayKeyUTC()}:${String(user).toLowerCase()}`; }
function seetheCdKey(user)       { return `seethe:cd:${String(user).toLowerCase()}`; }
function eloDailyBonusKey(user)  { return `elo:bonus:${dayKeyUTC()}:${String(user).toLowerCase()}`; }

function invasionLockKey()       { return `war:event:invasion:lock:${dayKeyUTC()}`; } // once/day start allowed
function invasionEndsKey()       { return `war:event:invasion:endsAt`; }
function eventLastKey()          { return `bar:event:last`; }

// side helpers
function oppSide(side) { return side === "jedi" ? "sith" : side === "sith" ? "jedi" : null; }



// ===== Convert/Corrupt/Sway helpers (Redis) =====
const CONVERT_BASE = 0.35; // 35%
const CONVERT_MIN = 0.15;
const CONVERT_MAX = 0.75;

const CONVERT_COOLDOWN_SEC = 5 * 60;   // 5m per caster
const CONVERT_DAILY_LIMIT = 3;         // attempts per caster per day
const IMMUNITY_HOURS = 24;             // target immunity after success


function convertDailyKey(caster) {
  return `convert:daily:${dayKeyUTC()}:${String(caster).toLowerCase()}`;
}
function convertCooldownKey(caster) {
  return `convert:cd:${String(caster).toLowerCase()}`;
}
function convertImmunityKey(target) {
  return `convert:immune:${String(target).toLowerCase()}`;
}

function rallyRecentKey(side) {
  return `rally:recent:${side}`; // SET of users with TTL ~10m (will come from your !rally)
}
function defendMeditateKey(user) { return `defend:meditate:${String(user).toLowerCase()}`; } // 10m TTL
function defendSeetheKey(user)   { return `defend:seethe:${String(user).toLowerCase()}`; }   // 10m TTL
function lastWinKey(user)        { return `duel:lastwin:${String(user).toLowerCase()}`; }    // 15m TTL
function invasionActiveKey()     { return `war:event:invasion:active`; }

async function getElo(user) {
  const v = await redis.get(eloKey(user));
  return v == null ? ELO_START : Number(v);
}
async function setElo(user, newVal) { await redis.set(eloKey(user), Math.max(0, Number(newVal))); }

// success chance with modifiers
async function calcConvertChance({ caster, target, casterSide, targetSideForTeamBonus }) {
  let p = CONVERT_BASE;

  // ELO diff: +10% if caster >= target + 100
  const [ce, te] = await Promise.all([getElo(caster), getElo(target)]);
  if (ce >= te + 100) p += 0.10;

  // Recent duel win (15m): +5%
  const lastWin = await redis.get(lastWinKey(caster));
  if (lastWin) p += 0.05;

  // Team rally momentum (10m): +5% if >=3 unique on caster's team (or chosen side for Gray's sway)
  if (casterSide === "jedi" || casterSide === "sith") {
    const side = targetSideForTeamBonus || casterSide;
    const count = Number(await redis.scard(rallyRecentKey(side)) || 0);
    if (count >= 3) p += 0.05;
  }

  // Target defenses (10m): meditate = -10%, seethe = -10%
  const [med, see] = await Promise.all([
    redis.get(defendMeditateKey(target)),
    redis.get(defendSeetheKey(target)),
  ]);
  if (med) p -= 0.10;
  if (see) p -= 0.10;

  // Invasion bonus: +15%
  const invasion = await redis.get(invasionActiveKey());
  if (invasion) p += 0.15;

  // Clamp
  p = Math.max(CONVERT_MIN, Math.min(CONVERT_MAX, p));
  return p;
}

function rollSuccess(prob) { return Math.random() < prob; }

function niceSideLabel(side) {
  return side === "jedi" ? "Jedi" : side === "sith" ? "Sith" : "Gray";
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

function normSide(side) {
  const s = String(side || "").toLowerCase();
  return s === "jedi" || s === "sith" || s === "gray" ? s : null;
}

// Replace your setUserAlignmentRedis with this stricter one
async function setUserAlignmentRedis(user, newAlignment) {
  const key = `force:user:${String(user).toLowerCase()}`;
  const prev = await redis.get(key);
  const prevSide = normSide(prev);
  const nextSide = normSide(newAlignment);
  if (!nextSide) return; // ignore invalid

  // adjust counts if changing between valid sides
  if (prevSide && prevSide !== nextSide) {
    await redis.decr(`force:count:${prevSide}`);
  }
  if (!prevSide || prevSide !== nextSide) {
    await redis.incr(`force:count:${nextSide}`);
  }
  await redis.set(key, nextSide);
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

// ---------- /rally ----------
app.get("/rally", async (req, res) => {
  const rawUser = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
  const sideQ   = String(req.query.side || "").toLowerCase(); // used only for Gray
  if (!rawUser) return res.type("text/plain").send("Usage: /rally?user=NAME[&side=jedi|sith]");

  const align = await getAlignment(rawUser);
  if (!align) return res.type("text/plain").send(`@${rawUser} must take the Force Trial first: use !force`);

  // Limit once per day
  const dKey = rallyDailyKey(rawUser);
  if (await redis.get(dKey)) {
    return res.type("text/plain").send(`@${rawUser} has already rallied today.`);
  }

  // Determine scoring side
  let side = align;
  if (align === "gray") {
    if (!["jedi","sith"].includes(sideQ)) {
      return res.type("text/plain").send(`@${rawUser} (Gray) must pick a side: !rally jedi or !rally sith`);
    }
    side = sideQ;
  }
  if (!["jedi","sith"].includes(side)) {
    return res.type("text/plain").send(`Rally only affects Jedi or Sith.`);
  }

  // +1 to chosen side, record recent rally for momentum (10m)
  await Promise.all([
    addFactionPoints(side, 1),
    redis.sadd(rallyRecentKey(side), rawUser),
    redis.expire(rallyRecentKey(side), RALLY_RECENT_TTL_SEC),
    redis.set(dKey, 1, { ex: 24 * 3600 }),
  ]);

  // Flavor line
  const line = pick(RALLY_LINES[side]) || (side === "jedi" ? "bolsters the Jedi. +1 Jedi." : "feeds the Dark Side. +1 Sith.");
  return res.type("text/plain").send(`@${rawUser} ${line}`);
});

async function applyEloDailyBonus(user) {
  const key = eloDailyBonusKey(user);
  const used = Number((await redis.get(key)) || 0);
  if (used >= ELO_BONUS_DAILY_CAP) return null;
  const newUsed = used + 1;
  await redis.set(key, newUsed);
  const cur = await getElo(user);
  await setElo(user, cur + ELO_BONUS_PER_USE);
  return newUsed;
}

// ---------- /meditate ----------
app.get("/meditate", async (req, res) => {
  const user = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
  if (!user) return res.type("text/plain").send("Usage: /meditate?user=NAME");

  const align = await getAlignment(user);
  if (!align) return res.type("text/plain").send(`@${user} must take the Force Trial first: use !force`);

  // cooldown & daily
  if (await redis.get(meditateCdKey(user))) {
    return res.type("text/plain").send(`@${user} meditation cooldown active.`);
  }
  const count = Number((await redis.get(meditateDailyKey(user))) || 0);
  if (count >= MEDITATE_DAILY_MAX) {
    return res.type("text/plain").send(`@${user} reached today's meditate limit (${MEDITATE_DAILY_MAX}).`);
  }

  // set defend flag (10m), cd, daily++
  await Promise.all([
    redis.set(defendMeditateKey(user), 1, { ex: DEFENSE_TTL_SEC }),
    redis.set(meditateCdKey(user), 1, { ex: MEDITATE_CD_SEC }),
    redis.set(meditateDailyKey(user), count + 1),
  ]);

  // ELO bonus (cap +5/day)
  await applyEloDailyBonus(user);

  // procs (Jedi-leaning)
  const mySide = "jedi";
  const other  = oppSide(mySide);
  let deltaMsg = "";
  if (Math.random() < 0.10) { await addFactionPoints(mySide, 2); deltaMsg += " +2 Jedi"; }
  if (Math.random() < 0.05  && other) { await addFactionPoints(other, -1); deltaMsg += " (−1 Sith)"; }

  const base = `@${user} meditates. Mind steady, saber steadier.`;
  return res.type("text/plain").send(deltaMsg ? `${base}${deltaMsg}` : base);
});

// ---------- /seethe ----------
app.get("/seethe", async (req, res) => {
  const user = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
  if (!user) return res.type("text/plain").send("Usage: /seethe?user=NAME");

  const align = await getAlignment(user);
  if (!align) return res.type("text/plain").send(`@${user} must take the Force Trial first: use !force`);

  if (await redis.get(seetheCdKey(user))) {
    return res.type("text/plain").send(`@${user} seethe cooldown active.`);
  }
  const count = Number((await redis.get(seetheDailyKey(user))) || 0);
  if (count >= SEETHE_DAILY_MAX) {
    return res.type("text/plain").send(`@${user} reached today's seethe limit (${SEETHE_DAILY_MAX}).`);
  }

  await Promise.all([
    redis.set(defendSeetheKey(user), 1, { ex: DEFENSE_TTL_SEC }),
    redis.set(seetheCdKey(user), 1, { ex: SEETHE_CD_SEC }),
    redis.set(seetheDailyKey(user), count + 1),
  ]);

  await applyEloDailyBonus(user);

  // procs (Sith-leaning)
  const mySide = "sith";
  const other  = oppSide(mySide);
  let deltaMsg = "";
  if (Math.random() < 0.10) { await addFactionPoints(mySide, 2); deltaMsg += " +2 Sith"; }
  if (Math.random() < 0.05  && other) { await addFactionPoints(other, -1); deltaMsg += " (−1 Jedi)"; }

  const base = `@${user} seethes. Rage refined into focus.`;
  return res.type("text/plain").send(deltaMsg ? `${base}${deltaMsg}` : base);
});

// ---------- /event/random ----------
app.get("/event/random", async (_req, res) => {
  const last = Number((await redis.get(eventLastKey())) || 0);
  const now  = Date.now();
  if (now - last < EVENT_MIN_GAP_SEC * 1000) {
    return res.type("text/plain").send("Event cooling…");
  }
  await redis.set(eventLastKey(), now);

  const ev = pick(BAR_EVENTS);
  if (ev?.effect) {
    if (typeof ev.effect.jedi === "number") await addFactionPoints("jedi", ev.effect.jedi);
    if (typeof ev.effect.sith === "number") await addFactionPoints("sith", ev.effect.sith);
  }
  const text = ev?.text || "Strange vibes pass through the bar.";
  return res.type("text/plain").send(`Bar Event: ${text}`);
});

// ---------- /invasion/start (mods) ----------
// /invasion/start?by=${sender}[&seconds=180]
app.get("/invasion/start", async (req, res) => {
  const by = sanitizeOneLine(req.query.by || "").replace(/^@+/, "").toLowerCase();
  const sec = Math.max(30, Math.min(900, Number(req.query.seconds || INVASION_DEFAULT_SEC)));

  // allow once per day
  if (await redis.get(invasionLockKey())) {
    return res.type("text/plain").send("Invasion already triggered today.");
  }

  const endsAt = Date.now() + sec * 1000;
  await Promise.all([
    redis.set(invasionActiveKey(), 1, { ex: sec }),
    redis.set(invasionEndsKey(), String(endsAt), { ex: sec + 60 }),
    redis.set(invasionLockKey(), 1, { ex: 24 * 3600 }),
  ]);

  const line = pick(INVASION_STARTS) || "Invasion begins — double points!";
  return res.type("text/plain").send(`@${by} triggers an INVASION: ${line} (ends in ~${sec}s)`);
});

// ---------- /invasion/stop (mods) ----------
app.get("/invasion/stop", async (req, res) => {
  await Promise.all([
    redis.del(invasionActiveKey()),
    redis.del(invasionEndsKey()),
  ]);
  return res.type("text/plain").send("Invasion ended. Points return to normal.");
});


// ---------- /elo ----------
app.get("/elo", async (req, res) => {
  try {
    const whoRaw = sanitizeOneLine(
      req.query.user || req.query.name || req.query.target || req.query.sender || ""
    );
    const who = whoRaw.replace(/^@+/, "").toLowerCase();
    if (!who) return res.type("text/plain").send("Usage: /elo?user=NAME");

    // ensure ELO exists so it's never undefined
    const [elo, align] = await Promise.all([ensureElo(who), getAlignment(who)]);
    const side = align ? align.charAt(0).toUpperCase() + align.slice(1) : "Unaligned";
    return res.type("text/plain").send(`@${who} — ELO ${elo} (${side})`);
  } catch (err) {
    console.error("elo route error:", err);
    return res.type("text/plain").send("ELO: unavailable right now.");
  }
});


// ---------- /convert/cleanse (to Jedi) ----------
app.get("/convert/cleanse", async (req, res) => {
  const caster = sanitizeOneLine(req.query.caster || "").replace(/^@+/, "").toLowerCase();
  const target = sanitizeOneLine(req.query.target || "").replace(/^@+/, "").toLowerCase();
  if (!caster || !target) return res.type("text/plain").send("Usage: /convert/cleanse?caster=NAME&target=NAME");

  if (target === D4RTH_USERNAME) {
    return res.type("text/plain").send(`@${caster} attempts to cleanse @${target}. The cosmos replies: "No."`);
  }

  const casterSide = await getAlignment(caster);
  const targetSide = await getAlignment(target);
  if (casterSide !== "jedi") {
    return res.type("text/plain").send(`@${caster} must be aligned with the Jedi to use !cleanse. Use !force if unaligned.`);
  }
  if (!targetSide) {
    return res.type("text/plain").send(`@${target} must take the Force Trial first: use !force`);
  }

  // Cooldown
  const cdKey = convertCooldownKey(caster);
  if (await redis.get(cdKey)) {
    return res.type("text/plain").send(`@${caster} cleanse cooldown active. Try again soon.`);
  }
  // Daily limit
  const dKey = convertDailyKey(caster);
  const attempts = Number((await redis.get(dKey)) || 0);
  if (attempts >= CONVERT_DAILY_LIMIT) {
    return res.type("text/plain").send(`@${caster} reached today's cleanse attempts (${CONVERT_DAILY_LIMIT}).`);
  }
  // Target immunity
  const immKey = convertImmunityKey(target);
  if (await redis.get(immKey)) {
    return res.type("text/plain").send(`@${target} is temporarily immune to conversion.`);
  }

  // Chance
  const p = await calcConvertChance({ caster, target, casterSide: "jedi", targetSideForTeamBonus: "jedi" });
  const success = rollSuccess(p);

  // Apply cooldown + count now (attempt spent regardless)
  await Promise.all([
    redis.set(cdKey, 1, { ex: CONVERT_COOLDOWN_SEC }),
    redis.set(dKey, attempts + 1),
  ]);

  if (!success) {
    // fail: caster -5 ELO, target +5 ELO
    const [ce, te] = await Promise.all([getElo(caster), getElo(target)]);
    await Promise.all([ setElo(caster, ce - 5), setElo(target, te + 5) ]);
    return res.type("text/plain").send(`@${caster} reaches for the Light... @${target} resists. (${Math.round(p*100)}% chance)`);
  }

  // success
  await setUserAlignmentRedis(target, "jedi"); // updates !factions counters
  await redis.set(immKey, 1, { ex: IMMUNITY_HOURS * 3600 });
  // optional season point:
  await redis.incr(`war:season:jedi`);

  return res.type("text/plain").send(`@${caster} bends fate — @${target} joins the Jedi. (${Math.round(p*100)}% chance)`);
});


// ---------- /convert/corrupt (to Sith) ----------
app.get("/convert/corrupt", async (req, res) => {
  const caster = sanitizeOneLine(req.query.caster || "").replace(/^@+/, "").toLowerCase();
  const target = sanitizeOneLine(req.query.target || "").replace(/^@+/, "").toLowerCase();
  if (!caster || !target) return res.type("text/plain").send("Usage: /convert/corrupt?caster=NAME&target=NAME");

  if (target === D4RTH_USERNAME) {
    return res.type("text/plain").send(`@${caster} dares corrupt @${target}. Reality prevents the attempt.`);
  }

  const casterSide = await getAlignment(caster);
  const targetSide = await getAlignment(target);
  if (casterSide !== "sith") {
    return res.type("text/plain").send(`@${caster} must be aligned with the Sith to use !corrupt. Use !force if unaligned.`);
  }
  if (!targetSide) {
    return res.type("text/plain").send(`@${target} must take the Force Trial first: use !force`);
  }

  const cdKey = convertCooldownKey(caster);
  if (await redis.get(cdKey)) {
    return res.type("text/plain").send(`@${caster} corruption cooldown active. Try again soon.`);
  }
  const dKey = convertDailyKey(caster);
  const attempts = Number((await redis.get(dKey)) || 0);
  if (attempts >= CONVERT_DAILY_LIMIT) {
    return res.type("text/plain").send(`@${caster} reached today's corrupt attempts (${CONVERT_DAILY_LIMIT}).`);
  }
  const immKey = convertImmunityKey(target);
  if (await redis.get(immKey)) {
    return res.type("text/plain").send(`@${target} is temporarily immune to conversion.`);
  }

  const p = await calcConvertChance({ caster, target, casterSide: "sith", targetSideForTeamBonus: "sith" });
  const success = rollSuccess(p);

  await Promise.all([
    redis.set(cdKey, 1, { ex: CONVERT_COOLDOWN_SEC }),
    redis.set(dKey, attempts + 1),
  ]);

  if (!success) {
    const [ce, te] = await Promise.all([getElo(caster), getElo(target)]);
    await Promise.all([ setElo(caster, ce - 5), setElo(target, te + 5) ]);
    return res.type("text/plain").send(`@${caster} whispers power... @${target} refuses the Dark. (${Math.round(p*100)}% chance)`);
  }

  await setUserAlignmentRedis(target, "sith"); // updates !factions counters
  await redis.set(immKey, 1, { ex: IMMUNITY_HOURS * 3600 });
  await redis.incr(`war:season:sith`);

  return res.type("text/plain").send(`@${caster} corrupts @${target}. Welcome to the Sith. (${Math.round(p*100)}% chance)`);
});


// ---------- /convert/sway (Gray assists one side) ----------
// /convert/sway?caster=${sender}&target=${1}&side=${2} (side = jedi|sith)
app.get("/convert/sway", async (req, res) => {
  const caster = sanitizeOneLine(req.query.caster || "").replace(/^@+/, "").toLowerCase();
  const target = sanitizeOneLine(req.query.target || "").replace(/^@+/, "").toLowerCase();
  const side   = String(req.query.side || "").toLowerCase();
  if (!caster || !target || !["jedi", "sith"].includes(side)) {
    return res.type("text/plain").send("Usage: /convert/sway?caster=NAME&target=NAME&side=jedi|sith");
  }

  if (target === D4RTH_USERNAME) {
    return res.type("text/plain").send(`@${caster} tries to sway @${target}. The Force shakes its head.`);
  }

  const casterSide = await getAlignment(caster);
  const targetSide = await getAlignment(target);
  if (casterSide !== "gray") {
    return res.type("text/plain").send(`@${caster} must walk the Gray path to use !sway.`);
  }
  if (!targetSide) {
    return res.type("text/plain").send(`@${target} must take the Force Trial first: use !force`);
  }

  const cdKey = convertCooldownKey(caster);
  if (await redis.get(cdKey)) {
    return res.type("text/plain").send(`@${caster} sway cooldown active. Try again soon.`);
  }
  const dKey = convertDailyKey(caster);
  const attempts = Number((await redis.get(dKey)) || 0);
  if (attempts >= CONVERT_DAILY_LIMIT) {
    return res.type("text/plain").send(`@${caster} reached today's sway attempts (${CONVERT_DAILY_LIMIT}).`);
  }
  const immKey = convertImmunityKey(target);
  if (await redis.get(immKey)) {
    return res.type("text/plain").send(`@${target} is temporarily immune to conversion.`);
  }

  // For Gray, we use chosen side as the "team bonus" side
  const p = await calcConvertChance({ caster, target, casterSide: "gray", targetSideForTeamBonus: side });
  const success = rollSuccess(p);

  await Promise.all([
    redis.set(cdKey, 1, { ex: CONVERT_COOLDOWN_SEC }),
    redis.set(dKey, attempts + 1),
  ]);

  if (!success) {
    const [ce, te] = await Promise.all([getElo(caster), getElo(target)]);
    await Promise.all([ setElo(caster, ce - 5), setElo(target, te + 5) ]);
    return res.type("text/plain").send(`@${caster} nudges destiny... @${target} stands firm. (${Math.round(p*100)}% chance)`);
  }

  await setUserAlignmentRedis(target, side); // updates !factions counters
  await redis.set(immKey, 1, { ex: IMMUNITY_HOURS * 3600 });
  await redis.incr(`war:season:${side}`);

  return res.type("text/plain").send(`@${caster} sways @${target} toward the ${niceSideLabel(side)}. (${Math.round(p*100)}% chance)`);
});

// ---------- /war ----------
app.get("/war", async (_req, res) => {
  const [jp, sp] = await Promise.all([
    redis.get("war:points:jedi"),
    redis.get("war:points:sith"),
  ]);
  const jedi = Number(jp || 0);
  const sith = Number(sp || 0);
  return res.type("text/plain")
    .send(`War — Jedi: ${jedi} | Sith: ${sith}`);
});


// Summarize last 5 streams (or a specific one) for a user
// /lovelog?user=SomeUser            -> last 5 streams summary
// /lovelog?user=SomeUser&stream=ID  -> just that stream
// If ?user is missing, you can pass ?sender=NAME (SE can fill with ${sender})
// ---------- /lovelog (Redis) ----------
app.get("/lovelog", async (req, res) => {
  try {
    const who = normUser(
      req.query.user || req.query.name || req.query.target || req.query.sender
    );
    if (!who) {
      return res.type("text/plain").status(200).send("Usage: /lovelog?user=NAME");
    }

    const streamQ = sanitizeOneLine(req.query.stream || "");
    let streamsToCheck;
    if (streamQ) {
      streamsToCheck = [streamQ];
    } else {
      streamsToCheck = await loveLastNStreams(5); // newest first
    }

    if (!streamsToCheck || streamsToCheck.length === 0) {
      return res.type("text/plain").status(200).send(`No love data yet for @${who}.`);
    }

    // read all streams in parallel, keep only non-empty
    const statsList = await Promise.all(
      streamsToCheck.map(async (id) => {
        const s = await loveReadUserStream(who, id);
        return s && s.count > 0 ? { id, ...s } : null;
      })
    );
    const perStream = statsList.filter(Boolean);

    if (streamQ) {
      const s = perStream[0];
      const out = s
        ? `@${who} — Stream ${s.id}: avg ${s.avg}%, last ${s.last}% (${s.count} rolls)`
        : `@${who} — Stream ${streamQ}: no data.`;
      return res
        .type("text/plain")
        .status(200)
        .send(sanitizeOneLine(out));
    }

    if (perStream.length === 0) {
      return res
        .type("text/plain")
        .status(200)
        .send(`No love data yet for @${who}.`);
    }

    // weighted average across displayed streams
    const totalCount = perStream.reduce((a, s) => a + s.count, 0);
    const weighted =
      totalCount > 0
        ? Math.round(perStream.reduce((sum, s) => sum + s.avg * s.count, 0) / totalCount)
        : 0;

    const parts = perStream.map(
      (s) => `${s.id}:${s.avg}% (last ${s.last}%)`
    );

    const out = `@${who} — Last ${perStream.length} streams avg ${weighted}%. ${parts.join(" | ")}`;
    return res
      .set("Cache-Control", "no-store")
      .type("text/plain; charset=utf-8")
      .status(200)
      .send(sanitizeOneLine(out));
  } catch (err) {
    console.error("lovelog error:", err);
    return res
      .type("text/plain")
      .status(200)
      .send("No love data yet (backend busy).");
  }
});


// ---------- /duel (Redis) ----------
// Usage: /duel?challenger=${sender}&target=${1}
app.get("/duel", async (req, res) => {
  const challenger = sanitizeOneLine(req.query.challenger || "").replace(/^@+/, "").toLowerCase();
  const targetRaw  = sanitizeOneLine(req.query.target || "").replace(/^@+/, "").toLowerCase();

  if (!challenger || !targetRaw) {
    return res.type("text/plain").send("Usage: /duel?challenger=NAME&target=NAME");
  }
  if (challenger === targetRaw) {
    return res.type("text/plain").send(`@${challenger} cannot duel themself. Touch grass, not your reflection.`);
  }

  // Cooldown check (challenger only)
  const lastTs = Number(await redis.get(duelLastKey(challenger)) || 0);
  const now = Date.now();
  if (now - lastTs < DUEL_COOLDOWN_MS) {
    const secs = Math.ceil((DUEL_COOLDOWN_MS - (now - lastTs)) / 1000);
    return res.type("text/plain").send(`@${challenger} duel cooldown: ${secs}s.`);
  }

  // Alignment checks (anti-grief guardrail)
  const chalAlign = await getAlignment(challenger);
  const targAlign = await getAlignment(targetRaw);
  if (!chalAlign) {
    return res.type("text/plain").send(`@${challenger} must take the Force Trial first: use !force`);
  }
  if (!targAlign) {
    return res.type("text/plain").send(`@${targetRaw} is unaligned. They must use !force before dueling.`);
  }

  // Ensure ELO exists
  const chalElo = await ensureElo(challenger);
  const targElo = await ensureElo(targetRaw);

  // Special rule: challenging D4rth_Distortion is an autobonk
  if (targetRaw === D4RTH_USERNAME) {
    await addFactionPoints("sith", 2); // Sith gets +2
    const chalNew = Math.max(0, chalElo + ELO_LOSS_VS_D4RTH);
    await redis.set(eloKey(challenger), chalNew);
    await redis.set(duelLastKey(challenger), String(now));

    const quip = pick(D4RTH_ROASTS);
    const out = `@${challenger} challenged @${D4RTH_USERNAME} and instantly lost. +2 Sith. ${quip} (ELO now ${chalNew})`;
    return res.type("text/plain").send(out);
  }

  // Normal duel: simple 50/50 (we can weight by ELO later)
  const roll = Math.random();
  const winner = roll < 0.5 ? challenger : targetRaw;
  const loser  = winner === challenger ? targetRaw : challenger;

  const winnerAlign = winner === challenger ? chalAlign : targAlign;
  const loserAlign  = loser  === challenger ? chalAlign : targAlign;

  // ELO adjustments
  const winnerElo = await ensureElo(winner);
  const loserElo  = await ensureElo(loser);
  const newWinnerElo = winnerElo + ELO_WIN;
  const newLoserElo  = Math.max(0, loserElo + ELO_LOSS);
  await redis.set(eloKey(winner), newWinnerElo);
  await redis.set(eloKey(loser),  newLoserElo);

  // Faction points: +2 for winner's faction if Jedi/Sith. Gray win does not move meter (per current design).
  if (winnerAlign === "jedi" || winnerAlign === "sith") {
    await addFactionPoints(winnerAlign, 2);
  }

  // Loser roast (faction-specific)
  let roast;
  if (loser === D4RTH_USERNAME) {
    // This can't happen because D4rth isn’t allowed to lose, but guard anyway:
    roast = "The cosmos rejects that outcome.";
  } else {
    const pool =
      loserAlign === "jedi" ? DUEL_ROASTS.jedi :
      loserAlign === "sith" ? DUEL_ROASTS.sith :
      DUEL_ROASTS.gray;
    roast = pick(pool);
  }

  await redis.set(duelLastKey(challenger), String(now));

  const sideMsg =
    winnerAlign === "jedi" ? "+2 Jedi." :
    winnerAlign === "sith" ? "+2 Sith." :
    "(Gray victory — war meter unchanged.)";

  const out = `@${challenger} vs @${targetRaw} — Winner: @${winner} ${sideMsg} ${roast} (ELO @${winner}:${newWinnerElo} @${loser}:${newLoserElo})`;
  return res.type("text/plain").send(out);
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


await reloadTrialData();
const ts = getTrialStatus();
console.log("[TRIAL LOADER]", ts);


// ---------------- Start server ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('[ENTRY] backend main loaded');
  console.log('[LISTEN]', PORT);
});

