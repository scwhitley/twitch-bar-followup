// traveler-confirm.js
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { confirmTraveler } from "./economy/party-core.js";

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const cmd = (msg.content || "").trim().toLowerCase();
  if (cmd !== "!confirmchar") return;

  const g = msg.guild?.id || "global";
  const res = await confirmTraveler(g, msg.author.id, msg.id);

  const e = new EmbedBuilder()
    .setTitle("✅ Character Confirmed")
    .setDescription(res.already
      ? "You were already confirmed."
      : (res.granted ? "Welcome to the party! You received **1000 DD** starter funds." : "Welcome back — starter funds were already granted."))
    .addFields({ name: "Wallet", value: `${res.afterWallet || "—"} DD`, inline: true })
    .setColor("Green");

  return void msg.channel.send({ embeds: [e] });
}

// If your traveler sheet embed uses a Confirm button like travel:confirm:<userId>
export async function onInteractionCreate(interaction) {
  if (!interaction.isButton()) return;
  const id = interaction.customId || "";
  if (!id.startsWith("travel:confirm:")) return;

  const userId = id.split(":")[2];
  if (interaction.user.id !== userId) {
    return void interaction.reply({ content: "Only that traveler can confirm.", ephemeral: true });
  }

  const g = interaction.guild?.id || "global";
  const res = await confirmTraveler(g, userId, interaction.id);

  const e = new EmbedBuilder()
    .setTitle("✅ Character Confirmed")
    .setDescription(res.already
      ? "You were already confirmed."
      : (res.granted ? "Welcome to the party! You received **1000 DD** starter funds." : "Welcome back — starter funds were already granted."))
    .addFields({ name: "Wallet", value: `${res.afterWallet || "—"} DD`, inline: true })
    .setColor("Green");

  try {
    await interaction.update({ components: [], embeds: [e] });
  } catch {
    await interaction.reply({ embeds: [e], ephemeral: false });
  }
}
