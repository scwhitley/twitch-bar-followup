import { redis } from "../../index.js"; // adjust path if needed

export async function getBalance(user) {
  const key = `balance:${user}`;
  const balance = await redis.get(key);
  return balance ? parseInt(balance) : 0;
}

export async function deductBalance(user, amount) {
  const key = `balance:${user}`;
  const current = await getBalance(user);
  const newBalance = Math.max(0, current - amount);
  await redis.set(key, newBalance);
  return newBalance;
}
