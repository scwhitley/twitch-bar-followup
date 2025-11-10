// /factions/elo/elo-commands.js
import { EmbedBuilder } from "discord.js";
import { getElo } from "./elo-core.js";

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const [cmd] = (msg.content || "").trim().toLowerCase().split(/\s+/);

  if (cmd !== "!elo" && cmd !== "!points" && cmd !== "!factionpoints") return;

  const target = msg.mentions.users.first() || msg.author;
  const username = target.username;
  const value = await getElo(username);

  const e = new EmbedBuilder()
    .setTitle("🧮 Faction ELO")
    .setDescription(`**${username}** has **${value}** faction points.`)
    .setColor("Purple");

  return void msg.channel.send({ embeds: [e] });
}
