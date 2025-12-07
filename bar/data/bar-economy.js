// /bar/data/bar-economy.js

// Simple in-memory balances for demo.
// Later you can hook this into your real loyalty points system.
const balances = {};

export function getBalance(user) {
  if (!balances[user]) balances[user] = 100; // default starting balance
  return balances[user];
}

export function deductBalance(user, amount) {
  if (!balances[user]) balances[user] = 100;
  balances[user] = Math.max(0, balances[user] - amount);
  return balances[user];
}
