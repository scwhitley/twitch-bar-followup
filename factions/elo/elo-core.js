// /factions/elo/elo-core.js
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

const E_KEY = (u) => `elo:${String(u).toLowerCase()}`;

export async function getElo(user) {
  return parseInt(await redis.get(E_KEY(user))) || 0;
}
export async function setElo(user, value) {
  await redis.set(E_KEY(user), value);
}
export async function addElo(user, delta) {
  const cur = await getElo(user);
  const next = cur + delta;
  await setElo(user, next);
  return next;
}

/**
 * Adjust a base convert chance using target’s ELO.
 * Bands:
 *   ≤4  → +15%
 *   5–9 → +5%
 *   10–14 → −5%
 *   ≥15 → −15%
 * Then clamp to [5%, 95%].
 */
export function eloAdjustChance(base, targetElo) {
  let mod = 0;
  if (targetElo <= 4)       mod += 0.15;
  else if (targetElo <= 9)  mod += 0.05;
  else if (targetElo <= 14) mod -= 0.05;
  else                      mod -= 0.15;

  const p = Math.max(0.05, Math.min(0.95, base + mod));
  return p;
}
