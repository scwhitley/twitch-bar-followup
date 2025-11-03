// economy/partypay-commands.js
import { EmbedBuilder } from "discord.js";
import { splitDebitActive } from "./party-core.js";

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const parts = (msg.content || "").trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  if (cmd !== "!partypay") return;

  const amt = parseInt(parts[1], 10);
  if (!Number.isInteger(amt) || amt <= 0) return void msg.reply("Usage: `!partypay <amount> [reason]`");

  const reason = parts.slice(2).join(" ").trim();
  const guildId = msg.guild?.id || "global";

  try {
    const res = await splitDebitActive(guildId, amt, msg.id);
    if (res?.skipped) return;

    if (res?.aborted) {
      const lines = res.shortages.map(s => `<@${s.userId}> needs ${s.need} DD more`);
      return void msg.reply(`🚫 Party payment failed:\n${lines.join("\n")}`);
    }

    const e = new EmbedBuilder()
      .setTitle("🧾 Party Payment")
      .setDescription(`Charged **${amt} DD** ${reason ? `for _${reason}_` : ""}`.trim())
      .setColor("DarkRed");

    const lines = res.parts.map(p => `<@${p.userId}> −${p.share} DD`);
    e.addFields({ name: "Split", value: lines.join("\n") });

    return void msg.channel.send({ embeds: [e] });
  } catch (err) {
    return void msg.reply(`❌ ${err.message || "Party pay failed."}`);
  }
}
