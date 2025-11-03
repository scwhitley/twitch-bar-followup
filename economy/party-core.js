// economy/party-core.js
import { Redis } from "@upstash/redis";
import { addBalance, subBalance, getWallet, getBank, deDupeGuard } from "./econ-core.js";
const redis = Redis.fromEnv();

// -------- Keys --------
const PARTY_META   = (g) => `party:${g}`;
const PARTY_MEMBERS= (g) => `party:${g}:members`;
const PARTY_ACTIVE = (g) => `party:${g}:active`;
const TRAVELER     = (g,u) => `traveler:${g}:${u}`; // JSON: { name, race, class, corruption(0-10), status: pending|confirmed }
const GRANT_JOIN   = (g,u) => `grant:join:${g}:${u}`;
const PLOCK        = (g)   => `lock:party:${g}`;

// -------- Party meta --------
export async function ensureParty(guildId, leaderId) {
  const meta = await redis.get(PARTY_META(guildId));
  if (meta) return JSON.parse(typeof meta === "string" ? meta : JSON.stringify(meta));
  const obj = { id: guildId, name: "Distortia Drifters", leaderId };
  await redis.set(PARTY_META(guildId), JSON.stringify(obj));
  return obj;
}

export async function addTravelerPending(guildId, userId) {
  await ensureParty(guildId, userId);
  await redis.sadd(PARTY_MEMBERS(guildId), userId);
  // traveler record bootstrap if missing
  const t = await redis.get(TRAVELER(guildId, userId));
  if (!t) {
    await redis.set(TRAVELER(guildId, userId), JSON.stringify({
      name: `Traveler ${userId.slice(-4)}`,
      race: "Unknown",
      class: "Unassigned",
      corruption: 0,
      status: "pending",
    }));
  }
}

export async function confirmTraveler(guildId, userId, messageIdForDedup) {
  // de-dupe confirm bonuses
  const first = await deDupeGuard(`confirm:${guildId}:${userId}:${messageIdForDedup || "manual"}`, 300);
  if (!first) return { already: true };

  // set status confirmed + add to active
  const blob = await redis.get(TRAVELER(guildId, userId));
  const base = blob ? (typeof blob === "string" ? JSON.parse(blob) : blob) : {};
  base.status = "confirmed";
  await redis.set(TRAVELER(guildId, userId), JSON.stringify(base));
  await redis.sadd(PARTY_ACTIVE(guildId), userId);
  await redis.sadd(PARTY_MEMBERS(guildId), userId);

  // one-time 1000 DD if not already granted in this party
  const ok = await redis.set(GRANT_JOIN(guildId, userId), "1", { nx: true, ex: 31536000 });
  let afterWallet = await getWallet(userId);
  if (ok) {
    afterWallet = await addBalance(userId, 1000);
  }
  return { granted: !!ok, afterWallet };
}

export async function getPartySnapshot(guildId) {
  const meta = await redis.get(PARTY_META(guildId));
  const members = await redis.smembers(PARTY_MEMBERS(guildId));
  const active = new Set(await redis.smembers(PARTY_ACTIVE(guildId)));
  const list = [];
  for (const uid of members) {
    const blob = await redis.get(TRAVELER(guildId, uid));
    const t = blob ? (typeof blob === "string" ? JSON.parse(blob) : blob) : { name: "Unknown", status: "pending", corruption: 0, race: "?", class: "?" };
    const wallet = await getWallet(uid);
    const bank = await getBank(uid);
    list.push({
      userId: uid,
      name: t.name || `Traveler ${uid.slice(-4)}`,
      race: t.race || "?",
      clazz: t.class || "?",
      corruption: Number.isFinite(t.corruption) ? Math.max(0, Math.min(10, t.corruption)) : 0,
      status: t.status || (active.has(uid) ? "confirmed" : "pending"),
      active: active.has(uid),
      wallet,
      bank,
    });
  }
  return {
    meta: meta ? (typeof meta === "string" ? JSON.parse(meta) : meta) : { id: guildId, name: "Distortia Drifters" },
    members: list,
  };
}

// -------- Splits (Largest Remainder, strict integer) --------
function lrSplit(total, userIds) {
  const n = userIds.length;
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  let rem = total % n;
  const sorted = [...userIds].sort(); // deterministic
  return sorted.map((uid, i) => ({ userId: uid, share: base + (i < rem ? 1 : 0) }));
}

async function withPartyLock(guildId, fn) {
  const ok = await redis.set(PLOCK(guildId), "1", { nx: true, ex: 5 });
  if (!ok) throw new Error("Party busy, try again");
  try { return await fn(); } finally { await redis.del(PLOCK(guildId)); }
}

// Quest payout → credit wallets of active members
export async function splitCreditActive(guildId, total, dedupeKey) {
  if (!Number.isInteger(total) || total <= 0) throw new Error("Invalid total");
  const first = await deDupeGuard(`payout:${guildId}:${dedupeKey || Date.now()}`, 30);
  if (!first) return { skipped: true };

  return await withPartyLock(guildId, async () => {
    const act = await redis.smembers(PARTY_ACTIVE(guildId));
    if (!act.length) throw new Error("No active travelers");
    const parts = lrSplit(total, act);
    const results = [];
    for (const p of parts) {
      const after = await addBalance(p.userId, p.share);
      results.push({ ...p, after });
    }
    return { parts: results };
  });
}

// Group cost → debit wallets of active members (strict policy)
export async function splitDebitActive(guildId, total, dedupeKey) {
  if (!Number.isInteger(total) || total <= 0) throw new Error("Invalid total");
  const first = await deDupeGuard(`partypay:${guildId}:${dedupeKey || Date.now()}`, 30);
  if (!first) return { skipped: true };

  return await withPartyLock(guildId, async () => {
    const act = await redis.smembers(PARTY_ACTIVE(guildId));
    if (!act.length) throw new Error("No active travelers");
    const parts = lrSplit(total, act);

    // Pre-check funds (strict)
    const shortages = [];
    for (const p of parts) {
      const w = await getWallet(p.userId);
      if (w < p.share) shortages.push({ userId: p.userId, need: p.share - w });
    }
    if (shortages.length) {
      return { aborted: true, shortages };
    }

    // Apply debits
    const results = [];
    for (const p of parts) {
      const after = await subBalance(p.userId, p.share);
      results.push({ ...p, after });
    }
    return { parts: results };
  });
}
