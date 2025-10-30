import { listInventory } from "./econ-core.js";
import { EmbedBuilder } from "discord.js";


export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("!inventory")) return;
  const inv = await listInventory(msg.author.id);
  if (!Object.keys(inv).length)
    return msg.reply("Your inventory is empty. Go shopping!");
  const desc = Object.entries(inv)
    .map(([k, v]) => `• **${k}** ×${v}`)
    .join("\n");
  const e = new EmbedBuilder()
    .setTitle(`${msg.author.username}'s Inventory`)
    .setDescription(desc)
    .setColor("Blue");
  await msg.channel.send({ embeds: [e] });
}
