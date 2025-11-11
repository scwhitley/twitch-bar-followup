// /factions/elo/elo-core.js
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

import { eloDailyBonusKey } from "../core/faction-utils.js";
import { ELO_BONUS_DAILY_CAP, ELO_BONUS_PER_USE } from "../core/faction-constants.js";


// ----- Basic ELO helpers -----
const eloKey = (user) => `elo:${String(user).toLowerCase()}`;

export async function getElo(user) {
  return Number(await redis.get(eloKey(user))) || 0;
}

export async function setElo(user, value) {
  const v = Math.max(0, Math.floor(Number(value) || 0));
  await redis.set(eloKey(user), v);
  return v;
}

export async function ensureElo(user) {
  const cur = await redis.get(eloKey(user));
  if (cur === null || cur === undefined) {
    await redis.set(eloKey(user), 0);
    return 0;
  }
  return Number(cur) || 0;
}

export async function addElo(user, delta) {
  const cur = await ensureElo(user);
  return setElo(user, cur + Number(delta || 0));
}


// Grant a small daily ELO bonus when actions like meditate/seethe are used.
// Capped per user per day by ELO_BONUS_DAILY_CAP.
export async function applyEloDailyBonus(user) {
  const key = eloDailyBonusKey(user);
  const used = Number((await redis.get(key)) || 0);
  if (used >= ELO_BONUS_DAILY_CAP) return null;

  const newUsed = used + 1;
  await redis.set(key, newUsed);

  const cur = await getElo(user);       // uses your existing getter
  await setElo(user, cur + ELO_BONUS_PER_USE);

  return newUsed; // return how many times they've claimed today (optional)
}


// ----- Conversion math -----
// Returns a probability 0..1 that a convert attempt succeeds.
// Inputs:
//   caster: string username
//   target: string username
//   casterSide: "jedi" | "sith" | "gray"
//   targetSideForTeamBonus: optional "jedi" | "sith" used by sway() to pick which side’s flavor applies
export async function calcConvertChance({
  caster,
  target,
  casterSide,
  targetSideForTeamBonus, // currently not used in math; kept for signature compatibility
}) {
  // Base chance — fair coin flip
  let p = 0.50;

  // Pull ELOs
  const [casterElo, targetElo] = await Promise.all([
    ensureElo(caster),
    ensureElo(target),
  ]);

  // 1) Target ELO threshold scaling (your request):
  //    - target < 5  → much easier
  //    - target < 10 → easier
  //    - target >=10 → harder; >=20 → even harder
  if (targetElo < 5) p += 0.20;
  else if (targetElo < 10) p += 0.10;
  else if (targetElo >= 20) p -= 0.15;
  else /* 10..19 */ p -= 0.08;

  // 2) Relative ELO difference adds a small edge
  //    +0.02 per 10 ELO in caster’s favor, capped at ±0.06
  const diff = casterElo - targetElo;
  const relAdj = Math.max(-0.06, Math.min(0.06, (diff / 10) * 0.02));
  p += relAdj;

  // 3) (Optional hooks left here for future momentum/defense modifiers.)
  //    Keep signature compatible; if you later add rally/defense flags, stack small ±0.03 style nudges here.

  // Clamp to sane bounds
  p = Math.max(0.05, Math.min(0.95, p));
  return p;
}

// Simple Bernoulli draw
export function rollSuccess(prob) {
  return Math.random() < (Number(prob) || 0);
}

// (named export in case other modules need the redis key)
export { eloKey };

