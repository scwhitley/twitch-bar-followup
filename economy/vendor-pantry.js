import {
  getBalance,
  subBalance,
  addItem,
  listInventory,
} from "./econ-core.js";
import { PANTRY_ITEMS } from "./catalog-pantry.js";
import { EmbedBuilder } from "discord.js";

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const args = msg.content.trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  if (cmd === "!shop" && args[0] === "pantry") {
    const e = new EmbedBuilder()
      .setTitle("🛒 Crimson Pantry Stock")
      .setDescription(
        PANTRY_ITEMS.map(
          (i) => `**${i.name}** — ${i.price} DD (${i.tag})`
        ).join("\n")
      )
      .setColor("Red");
    return msg.channel.send({ embeds: [e] });
  }

  if (cmd === "!buy" && args[0] === "pantry") {
    const itemName = args.slice(1, -1).join(" ") || args[1];
    const qty = parseInt(args.at(-1)) || 1;
    const item = PANTRY_ITEMS.find(
      (i) => i.name.toLowerCase() === itemName?.toLowerCase()
    );
    if (!item) return msg.reply("Item not found. Try `!shop pantry`.");
    const total = item.price * qty;
    const bal = await getBalance(msg.author.id);
    if (bal < total)
      return msg.reply(
        `You need ${total - bal} DD more to buy ${qty} × ${item.name}.`
      );

    await subBalance(msg.author.id, total);
    await addItem(msg.author.id, item.name, qty);
    const inv = await listInventory(msg.author.id);
    const e = new EmbedBuilder()
      .setTitle("🧾 Crimson Pantry Receipt")
      .setDescription(
        `**${msg.author.username}** bought ${qty} × ${item.name}\n` +
          `Total : ${total} DD\nRemaining : ${bal - total} DD`
      )
      .setFooter({ text: "Come again soon!" })
      .setColor("Red");
    return msg.channel.send({ embeds: [e] });
  }
}
