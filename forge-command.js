// forge-command.js (self-contained)
import { EmbedBuilder } from "discord.js";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// Keys
const RKEY = (uid) => `trial:result:${uid}`; // set by !trial on completion
const FKEY = (uid) => `forge:build:${uid}`;  // saved forge result

// Tiny pools by alignment + a small exotic chance
const FORGE_POOLS = {
  sith: {
    colors: ["Crimson", "Blood Red", "Black-Red Vein"],
    forms: ["Single Blade", "Crossguard", "Curved Hilt"],
    emitters: ["Forked Vent", "Razor Crown", "Howling Port"],
    cores: ["Kyber—Unstable", "Kyber—Overdriven", "Synthetic Kyber"],
    adjectives: ["Barbed", "Seared", "Wicked", "Scarred", "Abyssal"],
    materials: ["obsidian steel", "charred duraloy", "voidglass"],
  },
  jedi: {
    colors: ["Blue", "Green", "Amber"],
    forms: ["Single Blade", "Dual Saber", "Shoto + Main"],
    emitters: ["Temple Standard", "Calm Crown", "Whisper Port"],
    cores: ["Kyber—Attuned", "Kyber—Harmonic", "Crystal—Bonded"],
    adjectives: ["Balanced", "Harmonic", "Serene", "Gleaming", "Aegis-forged"],
    materials: ["polished durasteel", "songwood-inlaid alloy", "temple brass"],
  },
  grey: {
    colors: ["White", "Silver", "Amethyst"],
    forms: ["Single Blade", "Dual Phase", "Split Saber"],
    emitters: ["Vented Ring", "Silent Crown", "Axiom Port"],
    cores: ["Kyber—Neutral", "Prismatic Core", "Twin-bounded Kyber"],
    adjectives: ["Paradox", "Equilibrium", "Wandering", "Edge-bound", "Quiet"],
    materials: ["smokeglass alloy", "shroud-steel", "woven graphite"],
  },
  exotics: {
    chance: 0.03, // 3% spice
    colors: ["Darksable", "Iridescent Void", "Ultraviolet"],
    forms: ["Chain-saber", "Tonfa Pair", "Segemented Whip-saber"],
    descriptions: [
      "An impossible blade hums in anti-harmony, eating light at its edge.",
      "Segments link into a living ribbon of radiance and shadow.",
      "Its tone oscillates like a heartbeat—unsettling and enthralling.",
    ],
  },
};

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildSaberForAlignment(alignment) {
  const pools = FORGE_POOLS;
  const a = pools[alignment] || pools.grey;

  // Exotic roll
  if (Math.random() < (pools.exotics.chance || 0)) {
    return {
      alignment,
      exotic: true,
      color: rand(pools.exotics.colors),
      form: rand(pools.exotics.forms),
      emitter: "—",
      core: "—",
      hilt: "—",
      description: rand(pools.exotics.descriptions),
      rolledAt: Date.now(),
    };
  }

  const color = rand(a.colors);
  const form = rand(a.forms);
  const emitter = rand(a.emitters);
  const core = rand(a.cores);
  const hilt = `${rand(a.adjectives)} hilt of ${rand(a.materials)}`;

  return {
    alignment,
    exotic: false,
    color,
    form,
    emitter,
    core,
    hilt,
    description: `${color} ${form} with ${emitter} emitter and ${core}.`,
    rolledAt: Date.now(),
  };
}

function forgeEmbed(build, user) {
  const colorMap = { sith: "DarkRed", jedi: "Blue", grey: "Grey" };
  const title = build.exotic ? "⚡ Exotic Saber Forged" : "🛠️ Saber Forged";
  const footer = build.exotic
    ? "You have forged an EXOTIC variant."
    : "A weapon in balance with your path.";
  const lines = [
    `**Alignment:** ${build.alignment.toUpperCase()}`,
    `**Color:** ${build.color}`,
    `**Form:** ${build.form}`,
  ];
  if (!build.exotic) {
    lines.push(`**Emitter:** ${build.emitter}`);
    lines.push(`**Core:** ${build.core}`);
    lines.push(`**Hilt:** ${build.hilt}`);
  }

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(build.description)
    .addFields({ name: "Details", value: lines.join("\n") })
    .setFooter({ text: footer })
    .setColor(colorMap[build.alignment] || "Purple")
    .setTimestamp(new Date(build.rolledAt || Date.now()));
}

async function applyAlignmentRole(member, alignment) {
  const sithId = process.env.SITH_ROLE_ID || "";
  const jediId = process.env.JEDI_ROLE_ID || "";
  const greyId = process.env.GREY_ROLE_ID || "";
  const map = { sith: sithId, jedi: jediId, grey: greyId };
  const wanted = map[alignment];
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
      return void msg.reply("Couldn’t DM you. Use **!hallofforge** to post it here.");
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
    }
    return void msg.channel.send({ content: `🧰 **${msg.author.username}** forged a saber:`, embeds: [e] });
  }
}
