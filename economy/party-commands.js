// economy/party-commands.js
import {
  getParty, setPartySize, addTraveler, addPartyFunds, subPartyFunds, setPartyFunds
} from "./party-core.js";
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField
} from "discord.js";

const isAdmin = (m) =>
  !!m?.permissions?.has(PermissionsBitField.Flags.Administrator) ||
  !!m?.permissions?.has(PermissionsBitField.Flags.ManageGuild);

// Pretty
const partyEmbed = (g, p) =>
  new EmbedBuilder()
    .setTitle("🎒 Party Status")
    .setDescription(`Travelers: **${p.size}** / 4\nParty Balance: **${p.balance} DD**`)
    .setColor("Purple");

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  const g = msg.guild?.id || "global";

  // !party (show)
  if (cmd === "!party") {
    const p = await getParty(g);
    return msg.channel.send({ embeds: [partyEmbed(g, p)] });
  }

  // !startcampaign
  if (cmd === "!startcampaign") {
    if (!isAdmin(msg.member)) return msg.reply("🚫 Admin only.");
    const row = new ActionRowBuilder().addComponents(
      [1,2,3,4].map(n =>
        new ButtonBuilder()
          .setCustomId(`party:start:${n}`)
          .setLabel(`${n} Traveler${n>1?"s":""}`)
          .setStyle(ButtonStyle.Primary)
      )
    );
    const e = new EmbedBuilder()
      .setTitle("📜 Start Campaign")
      .setDescription("Select starting party size.")
      .setColor("Purple");
    return msg.channel.send({ embeds: [e], components: [row] });
  }

  // !addtraveler
  if (cmd === "!addtraveler") {
    if (!isAdmin(msg.member)) return msg.reply("🚫 Admin only.");
    const next = await addTraveler(g, 1);
    const p = await getParty(g);
    return msg.channel.send({
      embeds: [partyEmbed(g, p).setFooter({ text: `Added one traveler (now ${next}).` })],
    });
  }

  // Optional admin econ for party pool
  if (cmd === "!partygrant" || cmd === "!partytake" || cmd === "!partyset") {
    if (!isAdmin(msg.member)) return msg.reply("🚫 Admin only.");
    const amt = parseInt(parts[1], 10);
    if (!Number.isFinite(amt) || amt < 0) return msg.reply("Usage: `!partygrant 500` / `!partytake 100` / `!partyset 2000`");
    if (cmd === "!partygrant") await addPartyFunds(g, amt);
    if (cmd === "!partytake")  await subPartyFunds(g, amt);
    if (cmd === "!partyset")   await setPartyFunds(g, amt);
    const p = await getParty(g);
    return msg.channel.send({ embeds: [partyEmbed(g, p)] });
  }
}

export async function onInteractionCreate(interaction) {
  if (!interaction.isButton()) return;
  const id = interaction.customId || "";
  if (!id.startsWith("party:start:")) return;
  if (!interaction.member?.permissions?.has?.("Administrator")) {
    return interaction.reply({ content: "🚫 Admin only.", ephemeral: true });
  }

  const n = parseInt(id.split(":")[2], 10);
  const g = interaction.guild?.id || "global";
  await setPartySize(g, n);
  const p = await getParty(g);
  const e = partyEmbed(g, p).setTitle("✅ Campaign Started");
  try {
    await interaction.update({ embeds: [e], components: [] });
  } catch {
    await interaction.reply({ embeds: [e], ephemeral: false });
  }
}
