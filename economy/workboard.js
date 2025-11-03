// economy/workboard.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { addPartyFunds, getParty } from "./party-core.js";

// Payout & time helpers
const roll = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const minsToHuman = (m) => (m < 60 ? `${m} minutes` : `${Math.floor(m/60)}h ${m%60}m`);

// Pools: title, blurb, [min,max]
const JOBS = {
  bar: [
    ["Quiet the Table", "A rowdy merc crew is tanking vibes. De-escalate without a bar brawl.", [150, 600]],
    ["Rare Bottle Hunt", "Owner lost a vintage ‘Distorted Sunset’ bottle in storage catacombs.", [300, 900]],
    ["VIP Escort", "Famous DJ needs a subtle escort to a back door. Paparazzi everywhere.", [500, 1200]],
  ],
  hotel: [
    ["Ghosted Suite", "Suite 1312 hums with Shroud static. Clean it out without guests noticing.", [400, 1200]],
    ["Missing Luggage", "A courier’s case vanished mid-elevator. Track the thief in-house.", [250, 800]],
    ["Chef’s Emergency", "Sous chef bailed; special banquet needs fast hands and faster thinking.", [500, 1500]],
  ],
  casino: [
    ["Card Shark", "Someone’s skimming via micro-tells. Catch them without spooking the table.", [600, 2000]],
    ["Rigged Drone", "A tourist’s bet-drone is cheating the roulette. Prove it.", [300, 1200]],
    ["VIP Credit Line", "A High-Roller is about to default. Recover collateral discreetly.", [800, 2500]],
  ],
  vault: [
    ["Silent Alarm", "Vault 7 triggered a phantom alarm chain. Trace & purge the ghost signal.", [500, 1800]],
    ["Identity Spoof", "A client’s prints were cloned. Identify the tap and secure their box.", [700, 2200]],
    ["Armored Route", "Guard an emergency transfer through a Shadow Market zone.", [900, 3000]],
  ],
  market: [
    ["Hot Cargo", "A stolen crate might implode morale (and walls). Fence or return it?", [400, 1500]],
    ["Debt Mediation", "Broker vs. client in a spiraling dispute. Resolve without violence.", [250, 900]],
    ["Counterfeit Sweep", "Sniff out fake kyber-wire among the stalls. Replace with real stock.", [500, 2000]],
  ],
  side: [
    ["Lost Kid", "A child wandered into Shroud fog pockets. Bring ‘em back.", [100, 500]],
    ["Beacon Relay", "A broken relay is stalling rescue ops. Repair under fire.", [350, 1200]],
    ["Warden Hunt", "A rogue Warden patrol is extorting travelers. End that.", [800, 2200]],
  ],
};

// NPC quips on decline/timeout
const QUIPS = [
  "“Figures. Should've asked the Chorus.”",
  "“Thanks for nothing — may your drinks be full-price.”",
  "“Another hero with stage fright.”",
  "“I’ll just… do it myself then.”",
];

// Render a job card
function jobEmbed(placeLabel, job, payout, durationMin) {
  const e = new EmbedBuilder()
    .setTitle(`🧾 ${placeLabel} — Contract Offer`)
    .setDescription(`**${job[0]}**\n${job[1]}`)
    .addFields(
      { name: "Reward", value: `${payout} DD`, inline: true },
      { name: "Est. Time", value: minsToHuman(durationMin), inline: true },
      { name: "Expires", value: "2 minutes", inline: true },
    )
    .setColor("DarkGold")
    .setFooter({ text: "Accept or Deny below." });
  return e;
}

// Entry point command helper
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

  if (cmd === "!workbar")   return startWork(msg, "bar", "Stirred Veil");
  if (cmd === "!workhotel") return startWork(msg, "hotel", "Hotel Luxorion");
  if (cmd === "!workcasino")return startWork(msg, "casino", "Distorted Casino");
  if (cmd === "!workvault") return startWork(msg, "vault", "Vault 7");
  if (cmd === "!workmarket")return startWork(msg, "market", "Shadow Market");
  if (cmd === "!sidequest") return startWork(msg, "side", "World Side Quest");
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

    // Award to party balance immediately (we're simulating completion; your IRL pacing stays up to you)
    const pBefore = await getParty(g);
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
    return;
  }
}
