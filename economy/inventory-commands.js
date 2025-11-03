// economy/inventory-commands.js
import { getInventory } from "./econ-core.js";
import { EmbedBuilder } from "discord.js";

export async function onMessageCreate(msg) {
  // single-response guard
  if (msg.author.bot || msg.__handled) return;

  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  if (cmd !== "!inventory" && cmd !== "!inv") return;

  const inv = await getInventory(msg.author.id);

  if (!inv || !Object.keys(inv).length) {
    await msg.reply("Your inventory is empty. Go shopping!");
    msg.__handled = true; 
    return;
  }

  // Format items; Discord embeds cap description length, so chunk if needed.
  const lines = Object.entries(inv).map(([name, qty]) => `• **${name}** × ${qty}`);
  const MAX_DESC = 4000; // safe headroom under embed limits
  let desc = "";
  const pages = [];
  for (const line of lines) {
    if ((desc + line + "\n").length > MAX_DESC) {
      pages.push(desc);
      desc = "";
    }
    desc += line + "\n";
  }
  if (desc) pages.push(desc);

  // Send one or multiple embeds depending on size
  for (let i = 0; i < pages.length; i++) {
    const e = new EmbedBuilder()
      .setTitle(`🎒 ${msg.author.username}'s Inventory${pages.length > 1 ? ` (Page ${i + 1}/${pages.length})` : ""}`)
      .setDescription(pages[i])
      .setColor("Blue");
    // eslint-disable-next-line no-await-in-loop
    await msg.channel.send({ embeds: [e] });
  }

  msg.__handled = true;
  return;
}
