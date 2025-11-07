// forge-command.js
import { EmbedBuilder } from "discord.js";
import { Redis } from "@upstash/redis";
import { FORGE_MATRIX } from "./trial-data.js";

const redis = Redis.fromEnv();

const RKEY = (uid) => `trial:result:${uid}`;
const FKEY = (uid) => `forge:build:${uid}`;

// --- helpers ---
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Build a saber for a given alignment.
 * - If FORGE_MATRIX.exotics is present, rolls for an exotic (keeps your old behavior).
 * - Otherwise uses forgePoolFor(alignment) to assemble color/form/emitter/core/hilt.
 */
function buildSaberForAlignment(alignment) {
  const a = String(alignment || "grey").toLowerCase();

  // Exotic support (from your existing FORGE_MATRIX shape)
  const ex = FORGE_MATRIX?.exotics;
  const chance = ex?.chance ?? 0.0;
  if (ex && Math.random() < chance) {
    return {
      alignment: a,
      exotic: true,
      // keep your legacy exotic fields (description) to stay compatible
      color: rand(ex.colors || ["Unstable Crimson"]),
      form: rand(ex.forms || ["Crossguard"]),
      description: rand(ex.descriptions || ["A volatile, legend-whispered relic of the Shroud."]),
    };
  }

  // Normal pool (richer parts)
  const pool = forgePoolFor(a); // returns alignment pool, falls back to grey
  const color   = rand(pool.colors || ["Purple"]);
  const form    = rand(pool.forms || ["Single Blade"]);
  const emitter = rand(pool.emitters || ["Channel-ring Emitter"]);
  const core    = rand(pool.cores || ["Attuned Kyber"]);
  const adj     = rand(pool.adjectives || ["echo-tuned"]);
  const mat     = rand(pool.materials || ["gunmetal mosaic"]);

  return {
    alignment: a,
    exotic: false,
    color,
    form,
    emitter,
    core,
    hilt: `${adj} hilt of ${mat}`,
  };
}

function forgeEmbed(build, user) {
  const colorMap = { sith: "DarkRed", jedi: "Blue", grey: "Grey" };
  const title = build.exotic ? "⚡ Exotic Saber Forged" : "🛠️ Saber Forged";
  const footer = build.exotic
    ? "You have forged an EXOTIC variant."
    : "A weapon in balance with your path.";

  // Prefer legacy .description if present (your old exotics path uses this),
  // otherwise describe the assembled parts.
  const desc =
    build.description ??
    [
      `**Hilt:** ${build.hilt || "standard forge hilt"}`,
      `**Emitter:** ${build.emitter || "standard emitter"}`,
      `**Core:** ${build.core || "standard kyber core"}`,
    ].join("\n");

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .addFields(
      { name: "Alignment", value: (build.alignment || "grey").toUpperCase(), inline: true },
      { name: "Color", value: build.color || "Unknown", inline: true },
      { name: "Form", value: build.form || "Unknown", inline: true },
    )
    .setFooter({ text: footer })
    .setColor(colorMap[build.alignment] || "Purple")
    .setTimestamp(new Date(build.rolledAt || Date.now()));
}

async function applyAlignmentRole(member, alignment) {
  const sithId = process.env.SITH_ROLE_ID || "";
  const jediId = process.env.JEDI_ROLE_ID || "";
  const greyId = process.env.GREY_ROLE_ID || "";

  const map = { sith: sithId, jedi: jediId, grey: greyId };
  const wanted = map[String(alignment || "grey").toLowerCase()];
  if (!wanted) return;

  try {
    const toRemove = Object.values(map).filter((id) => id && id !== wanted);
    if (toRemove.length) await member.roles.remove(toRemove).catch(() => {});
    await member.roles.add(wanted).catch(() => {});
  } catch {
    // non-fatal
  }
}

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  if (cmd === "!forge") {
    const r = await redis.get(RKEY(msg.author.id));
    if (!r) return void msg.reply("You must complete the Trial first. Run **!trial**.");

    const result = typeof r === "string" ? JSON.parse(r) : r; // { alignment: "sith"|"jedi"|"grey", ... }

    // Build saber using the new helper (handles exotics + normal)
    const build = buildSaberForAlignment(result.alignment);
    build.rolledAt = Date.now();

    await redis.set(FKEY(msg.author.id), JSON.stringify(build));

    // Optional: apply a Discord role based on alignment
    await applyAlignmentRole(msg.member, result.alignment);

    const e = forgeEmbed(build, msg.author);
    return void msg.channel.send({ embeds: [e] });
  }

  if (cmd === "!forgecard") {
    const raw = await redis.get(FKEY(msg.author.id));
    if (!raw) return void msg.reply("No forge result found. Run **!forge** first.");
    const build = typeof raw === "string" ? JSON.parse(raw) : raw;

    const e = forgeEmbed(build, msg.author);
    try {
      await msg.author.send({ embeds: [e] });
      return void msg.reply("Check your DMs for your Forge Card.");
    } catch {
      return void msg.reply("I couldn't DM you. Open your DMs or use **!hallofforge** to post it publicly.");
    }
  }

  if (cmd === "!hallofforge") {
    const raw = await redis.get(FKEY(msg.author.id));
    if (!raw) return void msg.reply("No forge result found. Run **!forge** first.");
    const build = typeof raw === "string" ? JSON.parse(raw) : raw;

    const e = forgeEmbed(build, msg.author);
    const targetId = process.env.HALL_OF_FORGE_CHANNEL_ID || "";
    const channel = targetId ? msg.client.channels.cache.get(targetId) : null;

    if (channel) {
      return void channel.send({ content: `🧰 **${msg.author.username}** forged a saber:`, embeds: [e] });
    } else {
      return void msg.channel.send({ content: `🧰 **${msg.author.username}** forged a saber:`, embeds: [e] });
    }
  }
}
