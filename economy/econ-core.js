import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

// Keys
const BAL = (id) => `econ:balance:${id}`;
const BANK = (id) => `econ:bank:${id}`;
const INV = (id) => `econ:inv:${id}`;

export async function getBalance(id) {
  return parseInt(await redis.get(BAL(id))) || 0;
}
export async function addBalance(id, amt) {
  return await redis.incrby(BAL(id), amt);
}
export async function subBalance(id, amt) {
  const bal = await getBalance(id);
  if (bal < amt) throw new Error("Insufficient funds");
  return await redis.decrby(BAL(id), amt);
}

export async function getBank(id) {
  return parseInt(await redis.get(BANK(id))) || 0;
}
export async function deposit(id, amt) {
  await subBalance(id, amt);
  await redis.incrby(BANK(id), amt);
}
export async function withdraw(id, amt) {
  const b = await getBank(id);
  if (b < amt) throw new Error("Insufficient bank funds");
  await redis.decrby(BANK(id), amt);
  await addBalance(id, amt);
}

// inventory helpers
export async function addItem(id, item, qty = 1) {
  await redis.hincrby(INV(id), item, qty);
}
export async function subItem(id, item, qty = 1) {
  const cur = parseInt(await redis.hget(INV(id), item)) || 0;
  if (cur < qty) throw new Error("Not enough items");
  if (cur === qty) await redis.hdel(INV(id), item);
  else await redis.hincrby(INV(id), item, -qty);
}
export async function listInventory(id) {
  return (await redis.hgetall(INV(id))) || {};
}
