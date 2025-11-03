// economy/workboard.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { addPartyFunds, getParty } from "./party-core.js";
import { JOBS } from "./workboard-tables.js";

const roll = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const minsToHuman = (m) => (m < 60 ? `${m} minutes` : `${Math.floor(m/60)}h ${m%60}m`);

const QUIPS = [
  "“Figures. Should've asked the Chorus.”",
  "“Thanks for nothing — may your drinks be full-price.”",
  "“Another hero with stage fright.”",
  "“I’ll just… do it myself then.”",
  "“Cool, I’ll just ask the Wardens… what could go wrong?”",
  "“Guess the Shadow Market will take this one. Again.”",
  "“No worries, I love wasting perfectly good exposition.”",
  "“I’ll mark you down as ‘hero-adjacent.’”",
  "“Huge help. Truly. The city will write songs about your… sitting.”",
  "“And here I thought we were speedrunning competence.”",
  "“It’s fine, the job will definitely solve itself in a pocket of yesterday.”",
  "“I’ll put your effort next to the neon ‘OPEN’ sign: for decoration.”",
  "“Chorus forbid we lift a finger without a montage.”",
  "“Aight, we’ll just pay full price for failure then.”",
  "“I’ll tell the client you were emotionally unavailable.”",
  "“Great plan: do nothing and pray to RNGesus.”",
  "“Nice—hard pass with the confidence of a Warden audit.”",
  "“I’ll invoice the Luminous Void for your time. Net-30 eternities.”",
  "“The Hollow Expanse called; it wants its excuses back.”",
  "“Put ‘Maybe Later’ on your gravestone. Looks clean.”",
  "“Heroism is a spectrum and you’re… infra-dim.”",
  "“If bravery were a currency, you’d still be overdrawn.”",
  "“I’ll just add this to the ‘Character Development Missed’ pile.”",
  "“Sick. Let’s circle back in an alternate timeline.”"

];

function jobEmbed(placeLabel, job, payout, durationMin) {
  return new EmbedBuilder()
    .setTitle(`🧾 ${placeLabel} — Contract Offer`)
    .setDescription(`**${job[0]}**\n${job[1]}`)
    .addFields(
      { name: "Reward", value: `${payout} DD`, inline: true },
      { name: "Est. Time", value: minsToHuman(durationMin), inline: true },
      { name: "Expires", value: "2 minutes", inline: true },
    )
    .setColor("DarkGold")
    .setFooter({ text: "Accept or Deny below." });
}

async function startWork(msg, poolKey, placeLabel) {
  const list = JOBS[poolKey] || [];
  if (!list.length) return msg.reply("No contracts available here right now.");
  const job = list[Math.floor(Math.random() * list.length)];
  const payout = roll(job[2][0], job[2][1]);
  const duration = roll(10, 120); // minutes

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`work:acc:${poolKey}:${payout}:${duration}`).setLabel("✅ Accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`work:deny:${poolKey}`).setLabel("❌ Deny").setStyle(ButtonStyle.Danger),
  );

  const e = jobEmbed(placeLabel, job, payout, duration);
  const m = await msg.channel.send({ embeds: [e], components: [row] });

  // 2-minute auto-cancel
  setTimeout(async () => {
    try {
      await m.edit({
        components: [],
        embeds: [
          EmbedBuilder.from(e)
            .setTitle(`⏳ ${placeLabel} — Offer Expired`)
            .setFooter({ text: QUIPS[Math.floor(Math.random() * QUIPS.length)] }),
        ],
      });
    } catch {}
  }, 2 * 60 * 1000);
}

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const cmd = (msg.content || "").trim().toLowerCase();

  // City
  if (cmd === "!workbar")     return startWork(msg, "bar", "Stirred Veil");
  if (cmd === "!workhotel")   return startWork(msg, "hotel", "Hotel Luxorion");
  if (cmd === "!workcasino")  return startWork(msg, "casino", "Distorted Casino");
  if (cmd === "!workvault")   return startWork(msg, "vault", "Vault 7");
  if (cmd === "!workmarket")  return startWork(msg, "market", "Shadow Market");
  if (cmd === "!sidequest")   return startWork(msg, "side", "World Side Quest");

  // Regions
  if (cmd === "!workhe")      return startWork(msg, "he", "Hollow Expanse");
  if (cmd === "!workvv")      return startWork(msg, "vv", "Verdant Verge");
  if (cmd === "!worklv")      return startWork(msg, "lv", "Luminous Void");
}

export async function onInteractionCreate(interaction) {
  if (!interaction.isButton()) return;
  const id = interaction.customId || "";
  if (!id.startsWith("work:")) return;

  const [_, kind, pool, payoutStr, durStr] = id.split(":");
  const g = interaction.guild?.id || "global";

  if (kind === "deny") {
    const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)];
    try {
      await interaction.update({
        components: [],
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Contract Declined")
            .setDescription(quip)
            .setColor("DarkGrey"),
        ],
      });
    } catch {
      await interaction.reply({ content: `❌ Declined. ${quip}`, ephemeral: false });
    }
    return;
  }

  if (kind === "acc") {
    const payout = parseInt(payoutStr, 10) || 0;
    const dur = parseInt(durStr, 10) || 30;
    await getParty(g); // fetched but unused here; keep if you later split per member

    const after = await addPartyFunds(g, payout);
    const e = new EmbedBuilder()
      .setTitle("✅ Contract Completed")
      .setDescription(`**Reward:** ${payout} DD\n**Time Elapsed:** ${minsToHuman(dur)}\n\n**Party Balance:** ${after} DD`)
      .setColor("Green");

    try {
      await interaction.update({ components: [], embeds: [e] });
    } catch {
      await interaction.reply({ embeds: [e], ephemeral: false });
    }
  }
}
