// forge-command.js
import { EmbedBuilder } from "discord.js";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// Keys
const RKEY = (uid) => `trial:result:${uid}`; // alignment result from !trial
const FKEY = (uid) => `forge:build:${uid}`;  // saved saber build

// ---- Local forge pools (no external import needed) ----
const FORGE_POOLS = {
  sith: {
    colors: ["Crimson", "Blood Red", "Dark Vermilion", "Black-Core Red"],
    forms: ["Single Blade", "Dualblade", "Crossguard", "Curved Hilt"],
    emitters: ["Forked Fang", "Razor Crown", "Obsidian Spike", "Storm Vane"],
    cores: ["Kyber—Fractured", "Kyber—Bleeding", "Shroud-Tuned Crystal", "Synth-Kyber"],
    adjectives: ["Jagged", "Serrated", "Scorched", "Warlord’s"],
    materials: ["Blacksteel", "Char-Onyx", "Bloodglass", "Hexed Alloy"],
  },
  jedi: {
    colors: ["Azure", "Emerald", "Gold", "White"],
    forms: ["Single Blade", "Shoto + Main", "Staff Saber", "Balanced Hilt"],
    emitters: ["Saint’s Ring", "Guardian Crown", "Polished Flare", "Seraph Halo"],
    cores: ["Kyber—Purified", "Twin-Kyber Harmony", "Sunglass Kyber", "Lumen Core"],
    adjectives: ["Refined", "Serene", "Vigilant", "Temple-Forged"],
    materials: ["Polished Durasteel", "Hallowed Brass", "Sun-Bronze", "Marbled Alloy"],
  },
  grey: {
    colors: ["Amethyst", "Silver", "Smoke-White", "Teal"],
    forms: ["Switch-Hilt", "Dualblade (Split)", "Chain-Linked Pair", "Offset Guard"],
    emitters: ["Mirror Crown", "Split Flare", "Dial Emitter", "Veil-Ring"],
    cores: ["Kyber—Untuned", "Rift-Cut Crystal", "Half-Bleed Stabilized", "Flux Core"],
    adjectives: ["Pragmatic", "Wanderer’s", "Balanced", "Ciphered"],
    materials: ["Gunmetal", "Slate Steel", "Veilglass", "Metacite"],
  },
  // ~1% Exotic roll (overrides the standard pools)
  exotics: {
    chance: 0.01,
    colors: ["Prismatic Rift", "Void-Black Core", "Starfire"],
    forms: ["Orbiting Shards", "Whip-Saber", "Segmented Arc"],
    emitters: ["Grav Halo", "Shroud Lantern", "Singularity Gate"],
    descriptions: [
      "A weapon that hums in reverse, its edge folding sound into the hilt.",
      "Segments orbit a silent core, aligning only when you command it.",
      "Light spills like liquid glass, reshaping to your intent.",
    ],
  },
};

// ------- Tiny helpers -------
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function forgePoolFor(alignment) {
  return FORGE_POOLS[alignment] || FORGE_POOLS.grey;
}

function buildSaberForAlignment(alignment) {
  // Exotic variant?
  if (Math.random() < (FORGE_POOLS.exotics.chance || 0)) {
    return {
      alignment,
      exotic: true,
      color: rand(FORGE_POOLS.exotics.colors),
      form: rand(FORGE_POOLS.exotics.forms),
      emitter: rand(FORGE_POOLS.exotics.emitters),
      core: "Exotic Core",
      hilt: "Otherworldly construction",
      description: rand(FORGE_POOLS.exotics.descriptions),
      rolledAt: Date.now(),
    };
  }

  const pool = forgePoolFor(alignment);
  return {
    alignment,
    exotic: false,
    color: rand(pool.colors),
    form: rand(pool.forms),
    emitter: rand(pool.emitters),
    core: rand(pool.cores),
    hilt: `${rand(pool.adjectives)} hilt of ${rand(pool.materials)}`,
    description:
      alignment === "sith"
        ? "A blade that drinks the room’s warmth. It wants a target."
        : alignment === "jedi"
        ? "Balanced weight, calm tone—answers to steady hands."
        : "Neither stiff nor savage; it listens only to intent.",
    rolledAt: Date.now(),
  };
}

function forgeEmbed(build, user) {
  const colorMap = { sith: "DarkRed", jedi: "Blue", grey: "Grey" };
  const title = build.exotic ? "⚡ Exotic Saber Forged" : "🛠️ Saber Forged";
  const footer = build.exotic
    ? "You have forged an EXOTIC variant."
    : "A weapon in balance with your path.";

  const e = new EmbedBuilder()
    .setTitle(title)
    .setDescription(build.description)
    .addFields(
      { name: "Alignment", value: build.alignment.toUpperCase(), inline: true },
      { name: "Color", value: build.color, inline: true },
      { name: "Form", value: build.form, inline: true },
      { name: "Emitter", value: build.emitter, inline: true },
      { name: "Core", value: build.core, inline: true },
      { name: "Hilt", value: build.hilt, inline: true },
    )
    .setFooter({ text: footer })
    .setColor(colorMap[build.alignment] || "Purple")
    .setTimestamp(new Date(build.rolledAt || Date.now()));

  if (user) e.setAuthor({ name: user.username });
  return e;
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

// ------- Command handler -------
export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const [cmd] = msg.content.trim().toLowerCase().split(/\s+/);

  // !forge — build from the saved trial alignment
  if (cmd === "!forge") {
    const r = await redis.get(RKEY(msg.author.id));
    if (!r) return void msg.reply("You must complete the Trial first. Run **!trial**.");

    const result = typeof r === "string" ? JSON.parse(r) : r;
    const alignment = (result.alignment || "grey").toLowerCase();

    const build = buildSaberForAlignment(alignment);
    await redis.set(FKEY(msg.author.id), JSON.stringify(build));

    // Optional: role assignment
    await applyAlignmentRole(msg.member, alignment);

    const e = forgeEmbed(build, msg.author);
    return void msg.channel.send({ embeds: [e] });
  }

  // !forgecard — DM the last forged card
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

  // !hallofforge — post to a showcase channel (or current if unset)
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
