// abilities-core.js
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

/**
 * PRNG (mulberry32) seeded from a string
 */
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRng(seedStr = Date.now().toString()) {
  let a = hash32(String(seedStr)) || 1;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Roll 4d6, drop lowest, return total (3..18)
 */
export function roll4d6dropLowest(rng) {
  const rolls = [0, 0, 0, 0].map(() => 1 + Math.floor(rng() * 6));
  rolls.sort((a, b) => a - b); // ascending
  return rolls[1] + rolls[2] + rolls[3];
}

/**
 * Return an object of STR/DEX/CON/INT/WIS/CHA = score (3..18)
 */
export function rollAbilityArray(rng) {
  return {
    STR: roll4d6dropLowest(rng),
    DEX: roll4d6dropLowest(rng),
    CON: roll4d6dropLowest(rng),
    INT: roll4d6dropLowest(rng),
    WIS: roll4d6dropLowest(rng),
    CHA: roll4d6dropLowest(rng),
  };
}

/**
 * Standard D&D-style modifier: floor((score - 10)/2)
 */
export function modForScore(score) {
  return Math.floor((Number(score) - 10) / 2);
}

/**
 * Given {STR,DEX,CON,INT,WIS,CHA}, return lowercase mods {str, dex, ...}
 */
export function modsFrom(scores) {
  return {
    str: modForScore(scores.STR),
    dex: modForScore(scores.DEX),
    con: modForScore(scores.CON),
    int: modForScore(scores.INT),
    wis: modForScore(scores.WIS),
    cha: modForScore(scores.CHA),
  };
}

/**
 * Wipe all ability data for a user:
 * - scores / mods / lock flag
 * - reroll counters
 * - any trav:abilities:* variants we’ve used
 */
export async function resetAbilities(userId) {
  const candidates = [
    `trav:${userId}:abilities`,
    `trav:${userId}:mods`,
    `trav:${userId}:abilities:locked`,
    `trav:${userId}:rerolls:abilities`,
    `trav:abilities:${userId}`,
    `trav:abilities:scores:${userId}`,
    `trav:abilities:mods:${userId}`,
    `trav:abilities:locked:${userId}`,
    `trav:abilities:rr:${userId}`,
    `trav:abilities:per:${userId}`,
  ];

  // Try to find any stragglers by pattern (ignore if KEYS is restricted)
  const patterns = [
    `trav:${userId}:abilities:*`,
    `trav:abilities:*:${userId}`,
    `abilities:*:${userId}`,
  ];

  const toDelete = new Set(candidates);

  try {
    for (const p of patterns) {
      const keys = await redis.keys(p);
      for (const k of keys || []) toDelete.add(k);
    }
  } catch {
    // If KEYS is restricted on your plan, we’ll just delete known candidates
  }

  const list = [...toDelete].filter(Boolean);
  if (list.length) await redis.del(...list);
  return list.length;
}
