// economy/econ-core.js
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

// -------- Basic getters --------
export async function getWallet(userId) {
  return parseInt(await redis.get(`wallet:${userId}`)) || 0;
}
export async function getBank(userId) {
  return parseInt(await redis.get(`bank:${userId}`)) || 0;
}

// -------- Internal helpers --------
async function setWallet(userId, v) {
  if (v < 0) throw new Error("Wallet would go negative");
  await redis.set(`wallet:${userId}`, v);
}
async function setBank(userId, v) {
  if (v < 0) throw new Error("Bank would go negative");
  await redis.set(`bank:${userId}`, v);
}

async function withLock(key, ttlSec, fn) {
  const ok = await redis.set(key, "1", { nx: true, ex: ttlSec });
  if (!ok) throw new Error("Busy, try again");
  try { return await fn(); } finally { await redis.del(key); }
}

export async function deDupeGuard(id, ttlSec = 60) {
  if (!id) return false;
  const ok = await redis.set(`seen:${id}`, "1", { nx: true, ex: ttlSec });
  return !!ok; // true if first time
}

// -------- Safe credits/debits (wallet only) --------
export async function addBalance(userId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid amount");
  const key = `lock:user:${userId}`;
  return await withLock(key, 5, async () => {
    const before = await getWallet(userId);
    const after = before + amount;
    await setWallet(userId, after);
    return after;
  });
}

export async function subBalance(userId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid amount");
  const key = `lock:user:${userId}`;
  return await withLock(key, 5, async () => {
    const before = await getWallet(userId);
    if (before < amount) throw new Error("Insufficient wallet funds");
    const after = before - amount;
    await setWallet(userId, after);
    return after;
  });
}

// -------- Atomic transfers: wallet <-> bank --------
export async function deposit(userId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid amount");
  const key = `lock:user:${userId}`;
  return await withLock(key, 5, async () => {
    const w = await getWallet(userId);
    const b = await getBank(userId);
    if (w < amount) throw new Error("Insufficient wallet funds");
    await setWallet(userId, w - amount);
    await setBank(userId, b + amount);
    return { wallet: w - amount, bank: b + amount };
  });
}

export async function withdraw(userId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid amount");
  const key = `lock:user:${userId}`;
  return await withLock(key, 5, async () => {
    const w = await getWallet(userId);
    const b = await getBank(userId);
    if (b < amount) throw new Error("Insufficient bank funds");
    await setBank(userId, b - amount);
    await setWallet(userId, w + amount);
    return { wallet: w + amount, bank: b - amount };
  });
}
