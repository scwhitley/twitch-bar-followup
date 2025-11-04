// abilities-core.js
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

// ---- Redis keys used by the abilities UI ----
const A_KEY    = (uid) => `trav:${uid}:abilities`;
const M_KEY    = (uid) => `trav:${uid}:mods`;
const R_KEY    = (uid) => `trav:${uid}:rerolls:abilities`;
const LOCK_KEY = (uid) => `trav:${uid}:abilities:locked`;

/** Reset a user's abilities: scores, mods, rerolls, lock. Returns count of keys cleared. */
export async function resetAbilities(userId) {
  const keys = [A_KEY(userId), M_KEY(userId), R_KEY(userId), LOCK_KEY(userId)];
  let cleared = 0;
  for (const k of keys) {
    try {
      await redis.del(k);
      cleared++;
    } catch {
      // ignore per-key failure so one bad del doesn't nuke the whole call
    }
  }
  return cleared;
}

// ---- RNG helpers (xmur3 hash -> mulberry32 PRNG) ----
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Make a seeded RNG: rng() -> [0,1). */
export function makeRng(seedStr = Date.now().toString()) {
  const seed = xmur3(String(seedStr))();
  return mulberry32(seed);
}

// ---- Ability rolling (4d6 drop lowest) ----
function roll4d6DropLowest(rng) {
  const rolls = [0, 0, 0, 0].map(() => 1 + Math.floor(rng() * 6));
  rolls.sort((a, b) => a - b);
  return rolls[1] + rolls[2] + rolls[3];
}

/** Roll a full 6-ability array. Returns { STR, DEX, CON, INT, WIS, CHA } */
export function rollAbilityArray(rng) {
  return {
    STR: roll4d6DropLowest(rng),
    DEX: roll4d6DropLowest(rng),
    CON: roll4d6DropLowest(rng),
    INT: roll4d6DropLowest(rng),
    WIS: roll4d6DropLowest(rng),
    CHA: roll4d6DropLowest(rng),
  };
}

/** D&D-style modifier from a score. */
export function modFromScore(score) {
  return Math.floor((Number(score) - 10) / 2);
}

/** Mods object keyed in lowercase for UI: { str, dex, con, int, wis, cha } */
export function modsFrom(scores) {
  return {
    str: modFromScore(scores.STR),
    dex: modFromScore(scores.DEX),
    con: modFromScore(scores.CON),
    int: modFromScore(scores.INT),
    wis: modFromScore(scores.WIS),
    cha: modFromScore(scores.CHA),
  };
}
