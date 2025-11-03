// economy/party-core.js
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

const G = (guildId) => guildId || "global";

// Keys (scoped by guild)
const PARTY_SIZE = (g) => `party:${g}:size`;         // int (1..4)
const PARTY_BAL  = (g) => `party:${g}:balance`;      // int DD
const PARTY_SEED = (g) => `party:${g}:seed`;         // any string for simple signing if you want

export async function getParty(guildId) {
  const g = G(guildId);
  const size = parseInt(await redis.get(PARTY_SIZE(g))) || 0;
  const balance = parseInt(await redis.get(PARTY_BAL(g))) || 0;
  return { size, balance };
}

export async function setPartySize(guildId, n) {
  const g = G(guildId);
  const v = Math.max(0, Math.min(4, parseInt(n || 0)));
  await redis.set(PARTY_SIZE(g), v);
  return v;
}

export async function addTraveler(guildId, delta = 1) {
  const g = G(guildId);
  const now = parseInt(await redis.get(PARTY_SIZE(g))) || 0;
  const next = Math.max(0, Math.min(4, now + delta));
  await redis.set(PARTY_SIZE(g), next);
  return next;
}

export async function addPartyFunds(guildId, amt) {
  const g = G(guildId);
  const cur = parseInt(await redis.get(PARTY_BAL(g))) || 0;
  const next = Math.max(0, cur + Math.floor(amt || 0));
  await redis.set(PARTY_BAL(g), next);
  return next;
}

export async function subPartyFunds(guildId, amt) {
  const g = G(guildId);
  const cur = parseInt(await redis.get(PARTY_BAL(g))) || 0;
  const next = Math.max(0, cur - Math.floor(amt || 0));
  await redis.set(PARTY_BAL(g), next);
  return next;
}

export async function setPartyFunds(guildId, val) {
  const g = G(guildId);
  const next = Math.max(0, Math.floor(val || 0));
  await redis.set(PARTY_BAL(g), next);
  return next;
}
