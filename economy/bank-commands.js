// economy/bank-commands.js
import { EmbedBuilder } from "discord.js";
import { getBalance, addBalance, subBalance, getBank, addBank, subBank } from "./econ-core.js";

export async function onMessageCreate(msg) {
  if (msg.author.bot || msg.__handled) return;

  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  if (cmd === "!balance" || cmd === "!bal") {
    const [wallet, bank] = await Promise.all([getBalance(msg.author.id), getBank(msg.author.id)]);
    const e = new EmbedBuilder()
      .setTitle(`🏦 ${msg.author.username} — Balance`)
      .addFields(
        { name: "Wallet", value: `${wallet} DD`, inline: true },
        { name: "Bank", value: `${bank} DD`, inline: true },
        { name: "Total", value: `${wallet + bank} DD`, inline: true },
      );
    await msg.channel.send({ embeds: [e] });
    msg.__handled = true;
    return;
  }

  if (cmd === "!deposit") {
    const n = Math.max(0, parseInt(parts[1] || "0", 10));
    if (!n) { await msg.reply("Usage: `!deposit <amount>`"); msg.__handled = true; return; }
    await subBalance(msg.author.id, n);
    await addBank(msg.author.id, n);
    await msg.reply(`Deposited **${n} DD**.`);
    msg.__handled = true;
    return;
  }

  if (cmd === "!withdraw") {
    const n = Math.max(0, parseInt(parts[1] || "0", 10));
    if (!n) { await msg.reply("Usage: `!withdraw <amount>`"); msg.__handled = true; return; }
    await subBank(msg.author.id, n);
    await addBalance(msg.author.id, n);
    await msg.reply(`Withdrew **${n} DD**.`);
    msg.__handled = true;
    return;
  }
}
