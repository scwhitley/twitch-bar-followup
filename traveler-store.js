// traveler-store.js
import { Redis } from "@upstash/redis";
import crypto from "crypto";
const redis = Redis.fromEnv();

// Keys
const PROF = (uid) => `traveler:profile:${uid}`;
const AUD  = (uid) => `traveler:audit:${uid}`;
const CD   = (uid) => `traveler:cd:${uid}`; // interaction cooldown

export async function getProfile(userId) {
  const raw = await redis.get(PROF(userId));
  return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
}
export async function saveProfile(userId, doc) {
  await redis.set(PROF(userId), JSON.stringify({ ...doc, updatedAt: Date.now() }));
}
export async function wipeProfile(userId) {
  await redis.del(PROF(userId));
  await redis.del(AUD(userId));
}
export async function audit(userId, entry) {
  await redis.rpush(AUD(userId), JSON.stringify({ ts: Date.now(), ...entry }));
}
export async function shortCooldown(userId, seconds = 3) {
  const now = Math.floor(Date.now()/1000);
  const until = await redis.get(CD(userId));
  if (until && parseInt(until,10) > now) return parseInt(until,10) - now;
  await redis.set(CD(userId), now + seconds, { ex: seconds });
  return 0;
}

// HMAC signature for button integrity
const SECRET = process.env.TRAVELER_SIG_SECRET || process.env.BOT_TOKEN || "distortia";
export function sign(data) {
  return crypto.createHmac("sha256", SECRET).update(data).digest("hex").slice(0,16);
}
export function verify(data, sig) {
  try {
    const want = sign(data);
    return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
  } catch { return false; }
}
