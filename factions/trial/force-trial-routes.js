// /factions/trial/force-trial-routes.js
// Self-contained legacy Force Trial (HTTP endpoints) with 3-choice questions.
// Router-based export so factions/index.js can `import { forceTrialRouter } ...`

import express from "express";
import { setUserAlignmentRedis, getFactionCountsRedis } from "../core/alignment-core.js";
import { sanitizeOneLine } from "../core/faction-utils.js";

const router = express.Router();

// --- Config
const FORCE_TIMEOUT_MS = 90 * 1000;              // 90s to answer before session expires
const FORCE_COOLDOWN_AFTER_FINISH_MS = 5 * 1000; // small buffer after finishing

// --- In-memory session (one-at-a-time, legacy behavior)
let FORCE_ACTIVE = null;            // { user, step, startedAt, lastTouch, score }
let FORCE_LAST_FINISHED_AT = 0;

// --- Questions (3 choices each, ASCII-safe)
const FORCE_QUESTIONS = [
  { q: "Q1 — Choose your path: 1) Peace  2) Power  3) Balance", w: [ { jedi: 2 }, { sith: 2 }, { gray: 2 } ] },
  { q: "Q2 — What matters more: 1) Order  2) Freedom  3) Chaos", w: [ { jedi: 1 }, { gray: 1 }, { sith: 1 } ] },
  { q: "Q3 — Guide your heart: 1) Serenity  2) Passion  3) The Force", w: [ { jedi: 2 }, { sith: 2 }, { gray: 2 } ] }
];

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
}
];

// --- Helpers
function forceCleanupIfExpired() {
  if (!FORCE_ACTIVE) return;
  const now = Date.now();
  if (now - FORCE_ACTIVE.lastTouch > FORCE_TIMEOUT_MS) {
    FORCE_ACTIVE = null;
  }
}

function forceCanStart(user) {
  const now = Date.now();
  if (FORCE_ACTIVE && FORCE_ACTIVE.user !== user) {
    return { ok: false, msg: `A trial is in progress for @${FORCE_ACTIVE.user}. Please wait.` };
  }
  if (FORCE_ACTIVE && FORCE_ACTIVE.user === user) return { ok: true }; // allow resume
  if (now - FORCE_LAST_FINISHED_AT < FORCE_COOLDOWN_AFTER_FINISH_MS) {
    return { ok: false, msg: "The Force is catching its breath. Try again in a moment." };
  }
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
  const q = FORCE_QUESTIONS[FORCE_ACTIVE.step];
  const weights = q.w[choiceIdx];
  Object.entries(weights).forEach(([k, v]) => {
    FORCE_ACTIVE.score[k] = (FORCE_ACTIVE.score[k] || 0) + v;
  });
  FORCE_ACTIVE.step += 1;
  FORCE_ACTIVE.lastTouch = Date.now();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function forceResult(publishUser) {
  const s = FORCE_ACTIVE.score;

  // Decide alignment by max score; ties allow Gray to win if tied at top
  let alignment = "gray";
  if (s.jedi >= s.sith && s.jedi >= s.gray) alignment = "jedi";
  else if (s.sith >= s.jedi && s.sith >= s.gray) alignment = "sith";
  if (s.gray >= s.jedi && s.gray >= s.sith) alignment = "gray";

  if (publishUser) await setUserAlignmentRedis(publishUser, alignment);

  const line = pick(FORCE_RESULT_LINES[alignment]) || `Verdict: ${alignment.toUpperCase()}`;
  FORCE_ACTIVE = null;
  FORCE_LAST_FINISHED_AT = Date.now();
  return line;
}

// --- Routes (router pattern) ---

// GET /force/start?user=NAME
router.get("/force/start", (req, res) => {
  forceCleanupIfExpired();
  const user = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
  if (!user) return res.type("text/plain").send("Usage: /force/start?user=NAME");

  const can = forceCanStart(user);
  if (!can.ok) return res.type("text/plain").send(can.msg);

  if (!FORCE_ACTIVE) forceStart(user);

  const q = FORCE_QUESTIONS[FORCE_ACTIVE.step].q;
  res.set("Cache-Control", "no-store");
  res.type("text/plain").send(`@${user}, your Force Trial begins. Reply with !pick 1, 2, or 3. ${q}`);
});

// GET /force/answer?user=NAME&choice=1..3
router.get("/force/answer", async (req, res) => {
  forceCleanupIfExpired();

  const user = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
  const choiceStr = String(req.query.choice || "").trim();
  if (!user || !choiceStr) {
    return res.type("text/plain").send("Usage: /force/answer?user=NAME&choice=1..3");
  }
  if (!FORCE_ACTIVE) {
    return res.type("text/plain").send("No active trial. Use !force to begin.");
  }
  if (FORCE_ACTIVE.user !== user) {
    return res.type("text/plain").send(`A trial is running for @${FORCE_ACTIVE.user}. Please wait.`);
  }

  const q = FORCE_QUESTIONS[FORCE_ACTIVE.step];
  const maxChoices = q?.w?.length || 0;
  const choiceIdx = parseInt(choiceStr, 10) - 1;
  if (!(choiceIdx >= 0 && choiceIdx < maxChoices)) {
    return res.type("text/plain").send(`@${user} choose 1, 2, or 3.`);
  }

  forceApplyChoice(choiceIdx);

  if (FORCE_ACTIVE.step >= FORCE_QUESTIONS.length) {
    const verdict = await forceResult(user);
    return res.type("text/plain").send(`@${user} ${verdict}`);
  } else {
    const nextQ = FORCE_QUESTIONS[FORCE_ACTIVE.step].q;
    return res.type("text/plain").send(`@${user}, next: ${nextQ} (reply !pick 1, 2, or 3)`);
  }
});

// GET /force/cancel?user=NAME
router.get("/force/cancel", (req, res) => {
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

// GET /force/factions
router.get("/force/factions", async (_req, res) => {
  const { jedi, sith, gray, total } = await getFactionCountsRedis();
  const line = `Factions — Jedi: ${jedi} | Sith: ${sith} | Gray: ${gray} | Total: ${total}`;
  res.set("Cache-Control", "no-store");
  res.type("text/plain; charset=utf-8").status(200).send(line);
});

export const forceTrialRouter = router;
export default router;

