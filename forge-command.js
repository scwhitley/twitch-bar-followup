// forge-command.js
import { EmbedBuilder } from "discord.js";
import { Redis } from "@upstash/redis";
import { FORGE_MATRIX } from "./trial-data.js";

const redis = Redis.fromEnv();

const RKEY = (uid) => `trial:result:${uid}`;
const FKEY = (uid) => `forge:build:${uid}`;

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function forgeFromAlignment(alignment) {
  const m = FORGE_MATRIX;
  // Exotic roll
  const exotic = Math.random() < (m.exotics.chance ?? 0.01);
  if (exotic) {
    return {
      alignment,
      exotic: true,
      color: pick(m.exotics.colors),
      form: pick(m.exotics.forms),
      description: pick(m.exotics.descriptions),
    };
  }
  return {
    alignment,
    exotic: false,
    color: pick(m.colors[alignment]),
    form: pick(m.forms[alignment]),
    description: pick(m.descriptions[alignment]),
  };
}

function forgeEmbed(build, user) {
  const colorMap = {
    sith: "DarkRed",
    jedi: "Blue",
    grey: "Grey",
  };
  const title = build.exotic ? "⚡ Exotic Saber Forged" : "🛠️ Saber Forged";
  const footer = build.exotic ? "You have forged an EXOTIC variant." : "A weapon in balance with your path.";
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(build.description)
    .addFields(
      { name: "Alignment", value: build.alignment.toUpperCase(), inline: true },
      { name: "Color", value: build.color, inline: true },
      { name: "Form", value: build.form, inline: true },
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
  const wanted = map[alignment];
  if (!wanted) return;

  try {
    // remove others, add wanted
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
    const result = typeof r === "string" ? JSON.parse(r) : r;

    const build = forgeFromAlignment(result.alignment);
    build.rolledAt = Date.now();

    await redis.set(FKEY(msg.author.id), JSON.stringify(build));

    // (Optional) apply a Discord role based on alignment
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
