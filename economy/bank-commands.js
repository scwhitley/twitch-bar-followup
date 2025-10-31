// economy/bank-commands.js
import { EmbedBuilder } from "discord.js";
import { getBalance, addBalance, subBalance } from "./econ-core.js";
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

// Local bank helpers (so we don't depend on econ-core exports)
const BANK_KEY = (uid) => `econ:bank:${uid}`;

async function getBank(uid) {
  const v = await redis.get(BANK_KEY(uid));
  return v ? parseInt(v, 10) : 0;
}
async function addBank(uid, amt) {
  const after = await redis.incrby(BANK_KEY(uid), amt);
  return parseInt(after, 10);
}
async function subBank(uid, amt) {
  // Ensure we don't go negative
  const current = await getBank(uid);
  if (amt > current) throw new Error("Insufficient bank funds.");
  const after = await redis.incrby(BANK_KEY(uid), -amt);
  return parseInt(after, 10);
}

export async function onMessageCreate(msg) {
  // single-response guard to prevent doubles
  if (msg.author.bot || msg.__handled) return;

  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  // ---- !balance / !bal
  if (cmd === "!balance" || cmd === "!bal") {
    const [wallet, bank] = await Promise.all([
      getBalance(msg.author.id),
      getBank(msg.author.id),
    ]);

    const e = new EmbedBuilder()
      .setTitle(`🏦 ${msg.author.username} — Balance`)
      .addFields(
        { name: "Wallet", value: `${wallet} DD`, inline: true },
        { name: "Bank", value: `${bank} DD`, inline: true },
        { name: "Total", value: `${wallet + bank} DD`, inline: true },
      )
      .setColor("Blue");

    await msg.channel.send({ embeds: [e] });
    msg.__handled = true; return;
  }

  // ---- !deposit <amount>
  if (cmd === "!deposit") {
    const amt = Math.max(0, parseInt(parts[1] || "0", 10));
    if (!amt) { await msg.reply("Usage: `!deposit <amount>`"); msg.__handled = true; return; }

    try {
      await subBalance(msg.author.id, amt);      // take from wallet
      const after = await addBank(msg.author.id, amt); // add to bank
      await msg.reply(`Deposited **${amt} DD**. Bank: **${after} DD**`);
    } catch (e) {
      await msg.reply(`❌ ${e?.message || "Deposit failed."}`);
    }
    msg.__handled = true; return;
  }

  // ---- !withdraw <amount>
  if (cmd === "!withdraw") {
    const amt = Math.max(0, parseInt(parts[1] || "0", 10));
    if (!amt) { await msg.reply("Usage: `!withdraw <amount>`"); msg.__handled = true; return; }

    try {
      const after = await subBank(msg.author.id, amt); // take from bank
      await addBalance(msg.author.id, amt);            // add to wallet
      await msg.reply(`Withdrew **${amt} DD**. Bank: **${after} DD**`);
    } catch (e) {
      await msg.reply(`❌ ${e?.message || "Withdraw failed."}`);
    }
    msg.__handled = true; return;
  }
}
