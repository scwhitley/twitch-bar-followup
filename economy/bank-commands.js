// economy/bank-commands.js
import { EmbedBuilder } from "discord.js";
import { getWallet, getBank, deposit, withdraw, deDupeGuard } from "./econ-core.js";

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const parts = (msg.content || "").trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  if (cmd !== "!deposit" && cmd !== "!withdraw" && cmd !== "!wallet" && cmd !== "!bank") return;

  if (cmd === "!wallet" || cmd === "!bank") {
    const w = await getWallet(msg.author.id);
    const b = await getBank(msg.author.id);
    const e = new EmbedBuilder()
      .setTitle(`${msg.author.username}'s Accounts`)
      .addFields(
        { name: "Wallet", value: `${w} DD`, inline: true },
        { name: "Bank", value: `${b} DD`, inline: true },
      )
      .setColor("Blue");
    return void msg.channel.send({ embeds: [e] });
  }

  const amt = parseInt(parts[1], 10);
  if (!Number.isInteger(amt) || amt <= 0) return void msg.reply("Enter a positive whole amount.");

  // de-dupe by message id
  const first = await deDupeGuard(`bank:${msg.id}`, 60);
  if (!first) return;

  try {
    if (cmd === "!deposit") {
      const { wallet, bank } = await deposit(msg.author.id, amt);
      const e = new EmbedBuilder().setTitle("🏦 Deposit")
        .setDescription(`Moved **${amt} DD** to bank.`)
        .addFields(
          { name: "Wallet", value: `${wallet} DD`, inline: true },
          { name: "Bank", value: `${bank} DD`, inline: true },
        ).setColor("Green");
      return void msg.channel.send({ embeds: [e] });
    }

    if (cmd === "!withdraw") {
      const { wallet, bank } = await withdraw(msg.author.id, amt);
      const e = new EmbedBuilder().setTitle("🏧 Withdraw")
        .setDescription(`Pulled **${amt} DD** from bank.`)
        .addFields(
          { name: "Wallet", value: `${wallet} DD`, inline: true },
          { name: "Bank", value: `${bank} DD`, inline: true },
        ).setColor("Orange");
      return void msg.channel.send({ embeds: [e] });
    }
  } catch (err) {
    return void msg.reply(`❌ ${err.message || "Operation failed."}`);
  }
}
