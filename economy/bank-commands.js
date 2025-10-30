import { deposit, withdraw, getBalance, getBank } from "./econ-core.js";
import { EmbedBuilder } from "discord.js";


export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const [cmd, arg] = msg.content.trim().split(/\s+/);

  if (cmd === "!balance") {
    const [wallet, bank] = await Promise.all([
      getBalance(msg.author.id),
      getBank(msg.author.id),
    ]);
    const e = new EmbedBuilder()
      .setTitle(`💳 ${msg.author.username}'s Balances`)
      .addFields(
        { name: "Wallet", value: `${wallet} DD`, inline: true },
        { name: "Bank", value: `${bank} DD`, inline: true },
        { name: "Total", value: `${wallet + bank} DD`, inline: false }
      )
      .setColor("Green");
    return msg.channel.send({ embeds: [e] });
  }

  if (cmd === "!deposit" || cmd === "!withdraw") {
    const amt = parseInt(arg);
    if (isNaN(amt) || amt <= 0) return msg.reply("Enter a valid amount.");
    try {
      if (cmd === "!deposit") await deposit(msg.author.id, amt);
      else await withdraw(msg.author.id, amt);
      const wallet = await getBalance(msg.author.id);
      const bank = await getBank(msg.author.id);
      return msg.reply(
        `✅ Transaction complete. Wallet: ${wallet} DD | Bank: ${bank} DD`
      );
    } catch (e) {
      return msg.reply(`❌ ${e.message}`);
    }
  }
}
