// /factions/core/alignment-core.js
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

// ---- Keys
const alignKey      = (user) => `force:align:${user}`;
const warPointsKey  = (side) => `war:points:${side}`;
const countsKey     = () => `force:faction:counts`; // optional cached snapshot

// exposed for routes that need special keys:
export const rallyDailyKey   = (user) => `rally:daily:${user}`;
export const rallyRecentKey  = (side) => `rally:recent:${side}`;
export const eventLastKey    = () => `bar:event:last`;
export const invasionActiveKey = () => `invasion:active`;
export const invasionEndsKey   = () => `invasion:endsAt`;
export const invasionLockKey   = () => `invasion:daily:lock`;

export const convertCooldownKey = (user) => `convert:cd:${user}`;
export const convertDailyKey    = (user) => `convert:daily:${user}`;
export const convertImmunityKey = (user) => `convert:immune:${user}`;

export const defendMeditateKey  = (user) => `defend:meditate:${user}`;
export const defendSeetheKey    = (user) => `defend:seethe:${user}`;

export async function getAlignment(user) {
  const v = await redis.get(alignKey(user));
  return v ? String(v) : null; // "jedi" | "sith" | "gray" | null
}

export async function setUserAlignmentRedis(user, side) {
  // side should be "jedi"|"sith"|"gray"
  await redis.set(alignKey(user), side);
  // optionally track a total count per side if you want
  await redis.incrby(`force:counts:${side}`, 1);
}

export async function addFactionPoints(side, delta) {
  const key = warPointsKey(side);
  const cur = Number((await redis.get(key)) || 0);
  const next = cur + Number(delta || 0);
  await redis.set(key, next);
  return next;
}

export async function getFactionCountsRedis() {
  const [j, s, g, t] = await Promise.all([
    redis.get("force:counts:jedi"),
    redis.get("force:counts:sith"),
    redis.get("force:counts:gray"),
    redis.get("force:counts:total"),
  ]);
  const jedi = Number(j || 0);
  const sith = Number(s || 0);
  const gray = Number(g || 0);
  const total = Number(t || (jedi + sith + gray));
  return { jedi, sith, gray, total };
}
