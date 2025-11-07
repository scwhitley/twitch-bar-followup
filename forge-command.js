// forge-command.js
import { EmbedBuilder } from "discord.js";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// Keys
const RKEY = (uid) => `trial:result:${uid}`;   // from !trial
const FKEY = (uid) => `forge:build:${uid}`;    // saved saber build

// Simple random picker
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Local pools (no external imports)
const FORGE_POOLS = {
  sith: {
    colors: ["Crimson", "Blood Red", "Dark Amethyst", "Inferno Red"],
    forms: ["Single Blade", "Crossguard", "Curved-Hilt Saber", "Dual Short Sabers"],
    emitters: ["Vented Emitter", "Aggressor Socket", "Shroud-Cut Emitter", "Tri-Vent Crown"],
    cores: ["Kyber (Corrupted)", "Synthetic Kyber", "Shroud-Infused Core"],
    adjectives: ["Jagged", "Barbed", "Obsidian-plated", "Scorched"],
    materials: ["Obsidian Alloy", "Onyx Steel", "Nightglass", "Sith Forgebone"],
  },
  jedi: {
    colors: ["Azure Blue", "Verdant Green", "Celestial Cyan", "Sunlit Gold"],
    forms: ["Single Blade", "Double-Bladed Staff", "Defender Guard", "Sleek Saber Pike"],
    emitters: ["Focus Crown", "Harmony Socket", "Saint’s Ring", "Calm Notch"],
    cores: ["Kyber (Attuned)", "Refined Kyber Matrix"],
    adjectives: ["Polished", "Balanced", "Temple-forged", "Grace-etched"],
    materials: ["Templesteel", "Auralite", "Sunsilver", "Serenite Alloy"],
  },
  grey: {
    colors: ["Silver", "White", "Amethyst", "Smoke Violet"],
    forms: ["Single Blade", "Split Saber Pair", "Collapsible Staff", "Switch-Hilt Modular"],
    emitters: ["Neutral Ring", "Wanderer’s Vent", "Twin Notch", "Quiet Crown"],
    cores: ["Kyber (Neutral)", "Dual-Core Balance Matrix"],
    adjectives: ["Weathered", "Nomad-forged", "Mirror-etched", "Scarred"],
    materials: ["Starsteel", "Void Nickel", "Traveler’s Alloy", "Shardglass"],
  },
  exotics: {
    chance: 0.04, // 4% bonus roll to spice things up
    colors: ["Blackcore Crimson", "Prismatic White", "Ultraviolet"],
    forms: ["Chain-Saber", "Segmented Whip-Saber", "Phase-Shift Blade"],
    descriptions: [
      "A phase-skipping blade that hums in echoing intervals.",
      "A prismatic edge that drinks the light before returning it tenfold.",
      "A whip-linked saber that can hard-lock into a straight blade mid-strike."
    ],
  }
};

function forgePoolFor(alignment) {
  return FORGE_POOLS[alignment] || FORGE_POOLS.grey;
}

function buildSaberForAlignment(alignment) {
  // Exotic proc first
  if (Math.random() < (FORGE_POOLS.exotics.chance || 0)) {
    return {
      alignment,
      exotic: true,
      color: pick(FORGE_POOLS.exotics.colors),
      form: pick(FORGE_POOLS.exotics.forms),
      emitter: "Arcane Variant",
      core: "Unknown Matrix",
      hilt: "Eldritch chassis of unmarked alloy",
      description: pick(FORGE_POOLS.exotics.descriptions),
      rolledAt: Date.now(),
    };
  }

  const pool = forgePoolFor(alignment);
  const build = {
    alignment,
    exotic: false,
    color: pick(pool.colors),
    form: pick(pool.forms),
    emitter: pick(pool.emitters),
    core: pick(pool.cores),
    hilt: `${pick(pool.adjectives)} hilt of ${pick(pool.materials)}`,
    description: "", // we’ll synthesize below
    rolledAt: Date.now(),
  };

  // Light flavor line
  build.description =
    alignment === "sith"
      ? "Forged in hunger and intent—the blade answers only to will."
      : alignment === "jedi"
      ? "Honed through discipline—the blade becomes an extension of peace."
      : "Balanced on the edge of dusk and dawn—neither doctrine holds its leash.";

  return build;
}

function forgeEmbed(build, user) {
  const colorMap = { sith: "DarkRed", jedi: "Blue", grey: "Grey" };
  const title = build.exotic ? "⚡ Exotic Saber Forged" : "🛠️ Saber Forged";
  const lines = [
    `**Color:** ${build.color}`,
    `**Form:** ${build.form}`,
    `**Emitter:** ${build.emitter}`,
    `**Core:** ${build.core}`,
    `**Hilt:** ${build.hilt}`,
  ].join("\n");

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(build.description)
    .addFields(
      { name: "Alignment", value: build.alignment.toUpperCase(), inline: true },
      { name: "Details", value: lines, inline: false },
    )
    .setFooter({ text: build.exotic ? "You’ve rolled an EXOTIC variant." : "Attuned to your Trial outcome." })
    .setColor(colorMap[build.alignment] || "Purple")
    .setTimestamp(build.rolledAt || Date.now());
}

async function applyAlignmentRole(member, alignment) {
  const sithId = process.env.SITH_ROLE_ID || "";
  const jediId = process.env.JEDI_ROLE_ID || "";
  const greyId = process.env.GREY_ROLE_ID || "";
  const map = { sith: sithId, jedi: jediId, grey: greyId };
  const wanted = map[alignment];
  if (!wanted || !member) return;
  try {
    // remove others, add wanted
    const toRemove = Object.values(map).filter((id) => id && id !== wanted);
    if (toRemove.length) await member.roles.remove(toRemove).catch(() => {});
    await member.roles.add(wanted).catch(() => {});
  } catch {
    // non-fatal
  }
}

// --------------- Commands ---------------
export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  if (cmd === "!forgedebug") {
    const r = await redis.get(RKEY(msg.author.id));
    const f = await redis.get(FKEY(msg.author.id));
    const result = r ? (typeof r === "string" ? JSON.parse(r) : r) : null;
    const build  = f ? (typeof f === "string" ? JSON.parse(f) : f) : null;

    const desc = [
      `**Trial alignment:** ${result?.alignment ?? "—"}`,
      `**Has build saved:** ${build ? "yes" : "no"}`,
      build
        ? `**Build:** ${build.color} • ${build.form} • ${build.emitter} • ${build.core}`
        : "",
    ].filter(Boolean).join("\n");

    const e = new EmbedBuilder()
      .setTitle("Forge Debug")
      .setDescription(desc || "No data found.")
      .setColor("Grey");

    return void msg.channel.send({ embeds: [e] });
  }

  if (cmd === "!forge") {
    const r = await redis.get(RKEY(msg.author.id));
    if (!r) {
      return void msg.reply("Finish the Trial first. Run **!trial**.");
    }
    const result = typeof r === "string" ? JSON.parse(r) : r;

    const build = buildSaberForAlignment(result.alignment);
    await redis.set(FKEY(msg.author.id), JSON.stringify(build));
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

  if (cmd === "!forgereset") {
    await redis.del(FKEY(msg.author.id));
    return void msg.reply("Your saved forge build has been cleared.");
  }
}
