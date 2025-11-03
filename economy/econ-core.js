// economy/econ-core.js
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

// ---------- Key helpers ----------
const WALLET_KEY = (uid) => `wallet:${uid}`;
const BANK_KEY   = (uid) => `bank:${uid}`;
const INV_KEY    = (uid) => `econ:inv:${uid}`;

// ---------- Basic getters ----------
export async function getWallet(userId) {
  return parseInt(await redis.get(WALLET_KEY(userId))) || 0;
}
export async function getBank(userId) {
  return parseInt(await redis.get(BANK_KEY(userId))) || 0;
}
// Backward-compat alias (some files use getBalance):
export const getBalance = getWallet;

// ---------- Internal setters (non-negative) ----------
async function setWallet(userId, v) {
  if (v < 0) throw new Error("Wallet would go negative");
  await redis.set(WALLET_KEY(userId), v);
}
async function setBank(userId, v) {
  if (v < 0) throw new Error("Bank would go negative");
  await redis.set(BANK_KEY(userId), v);
}

// ---------- Locking + de-dupe ----------
async function withLock(key, ttlSec, fn) {
  const ok = await redis.set(key, "1", { nx: true, ex: ttlSec });
  if (!ok) throw new Error("Busy, try again");
  try {
    return await fn();
  } finally {
    await redis.del(key);
  }
}

export async function deDupeGuard(id, ttlSec = 60) {
  if (!id) return false;
  const ok = await redis.set(`seen:${id}`, "1", { nx: true, ex: ttlSec });
  return !!ok; // true if first time
}

// ---------- Safe credits/debits (wallet only) ----------
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

// ---------- Atomic transfers: wallet <-> bank ----------
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

// ---------- Inventory (hash per user) ----------
/** Returns { "Item Name": qty, ... } */
export async function getInventory(userId) {
  const raw = await redis.hgetall(INV_KEY(userId));
  if (!raw) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = Number(v) || 0;
  return out;
}

/** Increment an item (can be negative). Returns new qty; deletes on 0/neg. */
export async function addItem(userId, itemName, qty = 1) {
  if (!itemName || typeof itemName !== "string") throw new Error("Invalid item name");
  if (!Number.isInteger(qty) || qty === 0) throw new Error("Invalid quantity");
  const n = await redis.hincrby(INV_KEY(userId), itemName, qty);
  if (n <= 0) await redis.hdel(INV_KEY(userId), itemName);
  return n;
}

/** Backward-compat alias if any file still imports listInventory */
export async function listInventory(userId) {
  return getInventory(userId);
}
