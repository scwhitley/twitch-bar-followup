// economy/dice-commands.js
import { EmbedBuilder } from "discord.js";
import crypto from "crypto";

const roll = (sides) => crypto.randomInt(1, sides + 1);

function d20Embed(val) {
  const e = new EmbedBuilder()
    .setTitle("🎲 d20 Roll")
    .setDescription(`You rolled: **${val}**`)
    .setColor(val === 20 ? "Green" : val === 1 ? "DarkRed" : "Blue");
  if (val === 20) e.addFields({ name: "Critical Success!", value: "Nat 20 — pop off ✨" });
  if (val === 1)  e.addFields({ name: "Critical Fail!",    value: "Nat 1 — the dice said nope 💀" });
  return e;
}
const simple = (s, v, label) => new EmbedBuilder().setTitle(`🎲 d${s} ${label}`).setDescription(`You rolled: **${v}**`).setColor("Blue");

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const cmd = (msg.content || "").trim().toLowerCase();

  if (cmd === "!roll20") return void msg.channel.send({ embeds: [d20Embed(roll(20))] });
  if (cmd === "!roll10") return void msg.channel.send({ embeds: [simple(10, roll(10), "Damage / Healing")] });
  if (cmd === "!roll6")  return void msg.channel.send({ embeds: [simple(6, roll(6), "Events / Corruption / NPC")] });
}
