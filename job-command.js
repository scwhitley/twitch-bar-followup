// job-command.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { COMPANIES, QUIRKS } from "./jobs.js";
import { seedFrom, makeRng, pick } from "./rng.js";

const JOB_COOLDOWN_S = 15;
const REROLL_COOLDOWN_S = 5;
const jobCooldown = new Map();
const rerollCooldown = new Map();

function coolDownCheck(map, userId, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const until = map.get(userId) || 0;
  const left = until - now;
  if (left > 0) return left;
  map.set(userId, now + windowSec);
  return 0;
}

function makeId(kind, data = {}) {
  const parts = Object.entries(data)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("|");
  return `job:${kind}${parts ? "|" + parts : ""}`;
}

function parseId(customId) {
  if (!customId?.startsWith("job:")) return null;
  const [head, ...rest] = customId.split("|");
  const kind = head.slice(4);
  const kv = {};
  for (const pair of rest) {
    const [k, v] = pair.split("=");
    kv[k] = decodeURIComponent(v ?? "");
  }
  return { kind, kv };
}

function generateJob(userId) {
  const rng = makeRng(seedFrom(userId, Date.now().toString()));
  const company = pick(rng, COMPANIES);
  const role = pick(rng, company.roles);
  const quirk = pick(rng, QUIRKS);

  return {
    company: company.name,
    title: role.title,
    description: role.description,
    quirk,
  };
}

function buildJobEmbed(user, job) {
  return new EmbedBuilder()
    .setTitle(`🎯 Job Assignment for ${user.displayName || user.username}`)
    .setDescription(`Welcome to **${job.company}!**`)
    .addFields(
      { name: "Position", value: job.title, inline: true },
      { name: "Role Summary", value: job.description, inline: false },
      { name: "Bonus Perk", value: job.quirk, inline: false }
    )
    .setColor("Red")
    .setFooter({ text: "You may reroll once if you dare..." });
}

function buildJobButtons(seed) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId("reroll", { s: seed }))
      .setLabel("🎲 Reroll Job")
      .setStyle(ButtonStyle.Secondary)
  );
  return [row];
}

export async function onMessageCreate(message) {
  if (message.author.bot) return;
  const content = message.content?.trim();
  if (!content || !content.toLowerCase().startsWith("!job")) return;

  const cd = coolDownCheck(jobCooldown, message.author.id, JOB_COOLDOWN_S);
  if (cd > 0)
    return void message.reply(`⏳ Cooldown — try again in **${cd}s**.`);

  const job = generateJob(message.author.id);
  const embed = buildJobEmbed(message.member ?? message.author, job);
  const components = buildJobButtons(seedFrom(message.author.id, "first"));

  await message.channel.send({ embeds: [embed], components });
}

export async function onInteractionCreate(interaction) {
  if (!interaction.isButton()) return;
  const parsed = parseId(interaction.customId);
  if (!parsed) return;

  if (parsed.kind === "reroll") {
    const cd = coolDownCheck(
      rerollCooldown,
      interaction.user.id,
      REROLL_COOLDOWN_S
    );
    if (cd > 0)
      return void interaction.reply({
        content: `🕓 You already rerolled recently — wait ${cd}s.`,
        ephemeral: true,
      });

    const job = generateJob(interaction.user.id);
    const embed = buildJobEmbed(interaction.member ?? interaction.user, job);

    // Disable reroll after use
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("🎲 Reroll Used")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    try {
      await interaction.update({ embeds: [embed], components: [row] });
    } catch {
      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: false,
      });
    }
  }
}
