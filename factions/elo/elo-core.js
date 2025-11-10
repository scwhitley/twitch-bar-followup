// /factions/elo/elo-core.js
import { Redis } from "@upstash/redis";
import { ELO_BONUS_DAILY_CAP, ELO_BONUS_PER_USE } from "../core/faction-constants.js";
const redis = Redis.fromEnv();

const eloKey = (user) => `elo:${user}`;
const eloDailyBonusKey = (user) => `elo:bonus:daily:${user}`;

export async function getElo(user) {
  return Number((await redis.get(eloKey(user))) || 0);
}
export async function setElo(user, value) {
  await redis.set(eloKey(user), Math.max(0, Number(value || 0)));
}
export async function ensureElo(user) {
  const v = await redis.get(eloKey(user));
  if (v === null || v === undefined) {
    await setElo(user, 100); // seed rating
    return 100;
  }
  return Number(v);
}

export async function applyEloDailyBonus(user) {
  const used = Number((await redis.get(eloDailyBonusKey(user))) || 0);
  if (used >= ELO_BONUS_DAILY_CAP) return used;
  await redis.set(eloDailyBonusKey(user), used + 1);
  await setElo(user, (await getElo(user)) + ELO_BONUS_PER_USE);
  return used + 1;
}

/**
 * Adjust a base chance by the target's ELO (example scaling):
 * - ELO <= 5   : +10% absolute
 * - 6..9       : +5%
 * - 10..14     :  0%
 * - 15..19     : -5%
 * - >=20       : -10%
 * Floor at 0.01, cap at 0.99
 */
export function eloAdjustedChance(base, targetEloLike = 10) {
  let adj = 0;
  if (targetEloLike <= 5) adj = +0.10;
  else if (targetEloLike <= 9) adj = +0.05;
  else if (targetEloLike <= 14) adj = 0;
  else if (targetEloLike <= 19) adj = -0.05;
  else adj = -0.10;

  const out = Math.max(0.01, Math.min(0.99, (base || 0) + adj));
  return out;
}
