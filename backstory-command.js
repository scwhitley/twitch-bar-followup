import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { Gender, parseGender, genderLabel } from "./gender.js";
import { generateBackstory } from "./backstory.js";
import { seedFrom } from "./rng.js";

// Basic per-user cooldown (seconds)
const CMD_COOLDOWN_S = 15;
const BTN_COOLDOWN_S = 4;

// in-memory cooldown map: userId -> unix seconds
const cmdCooldown = new Map();
const btnCooldown = new Map();

const originValue = payload.origin.state && payload.origin.city
  ? `${payload.origin.planet} → ${payload.origin.state} > ${payload.origin.city}`
  : `${payload.origin.planet} → ${payload.origin.region}`;

.addFields(
  // ...
  { name: "Origin", value: originValue, inline: true },
  // ...
);


// CustomId helper (safe and short)
function makeId(kind, data = {}) {
  // e.g., bs:reroll:name|g=nb|s=12345
  const parts = Object.entries(data).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join("|");
  return `bs:${kind}${parts ? "|" + parts : ""}`;
}
function parseId(customId) {
  // returns { kind, kv:{...} }
  if (!customId?.startsWith("bs:")) return null;
  const [head, ...rest] = customId.split("|");
  const kind = head.slice(3); // after 'bs:'
  const kv = {};
  for (const pair of rest) {
    const [k, v] = pair.split("=");
    kv[k] = decodeURIComponent(v ?? "");
  }
  return { kind, kv };
}

function coolDownCheck(map, userId, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const until = map.get(userId) || 0;
  const left = until - now;
  if (left > 0) return left;
  map.set(userId, now + windowSec);
  return 0;
}

function buildEmbed(user, payload) {
  const title = `Backstory for ${user.displayName ?? user.username ?? user.tag ?? user.id}`;
  const e = new EmbedBuilder()
    .setTitle(title)
    .setDescription(payload.prose)
    .addFields(
      { name: "Name", value: payload.name, inline: true },
      { name: "Gender", value: genderLabel(payload.gender), inline: true },
      { name: "Age / Build", value: `${payload.age} • ${payload.heightBuild}`, inline: true },
      { name: "Origin", value: `${payload.origin.planet} → ${payload.origin.region}`, inline: true },
      { name: "Personality", value: payload.personality, inline: true },
      { name: "Goal", value: payload.goal, inline: true },
      { name: "Flaw", value: payload.flaw, inline: true },
      { name: "Quirk", value: payload.quirk, inline: true },
    )
    .setFooter({ text: `Seed ${payload.seed}` });
  return e;
}

function buildButtons(gender, seedBase) {
  // pass gender + a new seed base (so reroll all mutates more)
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId("reroll:name", { g: gender, s: seedBase }))
      .setLabel("Reroll Name")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(makeId("reroll:all", { g: gender, s: seedBase }))
      .setLabel("Reroll All")
      .setStyle(ButtonStyle.Primary),
  );
  return [row];
}

/**
 * Handle a message like: !backstory [m|f|nb]
 */
export async function onMessageCreate(message) {
  if (message.author.bot) return;
  const content = message.content?.trim();
  if (!content || !content.toLowerCase().startsWith("!backstory")) return;

  // Cooldown
  const cd = coolDownCheck(cmdCooldown, message.author.id, CMD_COOLDOWN_S);
  if (cd > 0) {
    return void message.reply(`⏳ Cooldown — try again in **${cd}s**.`);
  }

  // Parse first arg as gender
  const parts = content.split(/\s+/).slice(1);
  const gender = parseGender(parts[0]);
  const seedBase = seedFrom(message.author.id, Date.now().toString());
  const payload = generateBackstory({ userId: message.author.id, gender });

  const embed = buildEmbed(message.member ?? message.author, payload);
  const components = buildButtons(gender, seedBase);

  await message.channel.send({ embeds: [embed], components });
}

/**
 * Handle button interactions for rerolls.
 */
export async function onInteractionCreate(interaction) {
  if (!interaction.isButton()) return;
  const parsed = parseId(interaction.customId);
  if (!parsed) return;
  if (!parsed.kind.startsWith("reroll")) return;

  // Button cooldown (quicker)
  const cd = coolDownCheck(btnCooldown, interaction.user.id, BTN_COOLDOWN_S);
  if (cd > 0) {
    return void interaction.reply({ content: `⏳ Reroll cooldown **${cd}s**.`, ephemeral: true });
  }

  const g = parseGender(parsed.kv.g || ""); // keep original gender sticky
  // Nudge seed so rerolls actually change
  const seed = seedFrom(parsed.kv.s || "", interaction.user.id, Date.now().toString());

  // Generate a fresh payload
  const payload = generateBackstory({ userId: interaction.user.id, gender: g, overrideSeed: seed });

  // Edit the original message in place (cleaner than spamming channel)
  const embed = buildEmbed(interaction.member ?? interaction.user, payload);
  const components = buildButtons(g, seedFrom(seed.toString(), "btn"));

  try {
    await interaction.update({ embeds: [embed], components });
  } catch {
    // If original message vanished, just reply
    await interaction.reply({ embeds: [embed], components, ephemeral: false });
  }
}

