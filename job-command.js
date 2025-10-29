// job-command.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} from "discord.js";
import { COMPANIES, QUIRKS, QUIT_QUOTES, FIRE_QUOTES } from "./jobs.js";
import { seedFrom, makeRng, pick } from "./rng.js";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// cooldown maps
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

// Redis helpers
async function getUserJob(userId) {
  return await redis.get(`job:assigned:${userId}`);
}

async function assignJob(userId, company, title) {
  await redis.set(`job:assigned:${userId}`, JSON.stringify({ company, title }));
  await redis.set(`job:slots:${company}:${title}`, "taken");
}

async function releaseJob(userId) {
  const record = await getUserJob(userId);
  if (!record) return null;
  const { company, title } = typeof record === "string" ? JSON.parse(record) : record;
  await redis.del(`job:assigned:${userId}`);
  await redis.del(`job:slots:${company}:${title}`);
  return { company, title };
}

async function isJobTaken(company, title) {
  return Boolean(await redis.get(`job:slots:${company}:${title}`));
}

// main generator
async function generateJob(userId) {
  const rng = makeRng(seedFrom(userId, Date.now().toString()));
  let company, role;
  let attempts = 0;

  while (attempts < 20) {
    const comp = pick(rng, COMPANIES);
    const candidate = pick(rng, comp.roles);
    const taken = await isJobTaken(comp.name, candidate.title);
    if (!taken) {
      company = comp;
      role = candidate;
      break;
    }
    attempts++;
  }

  if (!company || !role) return null; // no jobs open

  const quirk = pick(rng, QUIRKS);
  return { company: company.name, title: role.title, description: role.description, quirk };
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

// ---------------------- COMMANDS --------------------------

export async function onMessageCreate(message) {
  if (message.author.bot) return;
  const content = message.content?.trim().toLowerCase();
  if (!content) return;

  // ----- !job -----
  if (content.startsWith("!job")) {
    const cd = coolDownCheck(jobCooldown, message.author.id, JOB_COOLDOWN_S);
    if (cd > 0)
      return void message.reply(`⏳ Cooldown — try again in **${cd}s**.`);

    const existing = await getUserJob(message.author.id);
    if (existing) {
      const job = JSON.parse(existing);
      return void message.reply(
        `You already work at **${job.company}** as **${job.title}**! Use \`!quit\` if you want to leave.`
      );
    }

    const job = await generateJob(message.author.id);
    if (!job)
      return void message.reply(`😔 All positions are filled right now! Check back later.`);

    await assignJob(message.author.id, job.company, job.title);

    const embed = buildJobEmbed(message.member ?? message.author, job);
    const components = buildJobButtons(seedFrom(message.author.id, "first"));

    await message.channel.send({ embeds: [embed], components });
  }

  // ----- !quit -----
  if (content.startsWith("!quit")) {
    const released = await releaseJob(message.author.id);
    if (!released)
      return void message.reply(`You don't currently have a job to quit.`);
    const line = pick(makeRng(seedFrom(Date.now().toString())), QUIT_QUOTES);
    return void message.reply(
      `🧾 You left your job at **${released.company}** as **${released.title}**. ${line}`
    );
  }

  // ----- !fire @user -----
  if (content.startsWith("!fire")) {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.KickMembers)
    ) {
      return void message.reply("You don't have permission to fire anyone!");
    }

    const target = message.mentions.users.first();
    if (!target)
      return void message.reply("You need to mention someone to fire.");

    const released = await releaseJob(target.id);
    if (!released)
      return void message.reply(`${target.username} doesn’t currently have a job.`);
    const line = pick(makeRng(seedFrom(Date.now().toString())), FIRE_QUOTES);
    return void message.channel.send(
      `📉 **${target.username}** was fired from **${released.company}** as **${released.title}**. ${line}`
    );
  }
}

// ---------------------- BUTTON HANDLER --------------------

export async function onInteractionCreate(interaction) {
  if (!interaction.isButton()) return;
  const parsed = parseId(interaction.customId);
  if (!parsed) return;

  if (parsed.kind === "reroll") {
    const cd = coolDownCheck(rerollCooldown, interaction.user.id, REROLL_COOLDOWN_S);
    if (cd > 0)
      return void interaction.reply({
        content: `🕓 You already rerolled recently — wait ${cd}s.`,
        ephemeral: true,
      });

    const current = await getUserJob(interaction.user.id);
    if (current) {
      const { company, title } = JSON.parse(current);
      await redis.del(`job:slots:${company}:${title}`);
    }

    const job = await generateJob(interaction.user.id);
    if (!job)
      return void interaction.reply({
        content: `😔 All positions are filled right now!`,
        ephemeral: true,
      });

    await assignJob(interaction.user.id, job.company, job.title);

    const embed = buildJobEmbed(interaction.member ?? interaction.user, job);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("🎲 Reroll Used")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    try {
      await interaction.update({ embeds: [embed], components: [row] });
    } catch {
      await interaction.reply({ embeds: [embed], components: [row] });
    }
  }
}
