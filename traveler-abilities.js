// traveler-abilities.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} from "discord.js";
import { Redis } from "@upstash/redis";
import {
  resetAbilities,
  makeRng,
  rollAbilityArray,
  modsFrom,
} from "./abilities-core.js";

const redis = Redis.fromEnv();

const A_KEY   = (uid) => `trav:${uid}:abilities`;
const M_KEY   = (uid) => `trav:${uid}:mods`;
const R_KEY   = (uid) => `trav:${uid}:rerolls:abilities`;
const LOCK_KEY= (uid) => `trav:${uid}:abilities:locked`;

function fmt(scores) {
  const mods = modsFrom(scores);
  const mk = (abbr, label = abbr) => {
    const m = mods[abbr.toLowerCase()] ?? 0;
    const sign = m >= 0 ? "+" : "−";
    return `**${label}** ${scores[abbr]} (${sign}${Math.abs(m)})`;
  };
  return [
    mk("STR", "STR"),
    mk("DEX", "DEX"),
    mk("CON", "CON"),
    mk("INT", "INT"),
    mk("WIS", "WIS"),
    mk("CHA", "CHA"),
  ].join("  •  ");
}

async function getRerolls(uid) {
  return parseInt(await redis.get(R_KEY(uid))) || 0;
}

function rows(locked, rerollsUsed) {
  const left = Math.max(0, 2 - (rerollsUsed || 0));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("trav:abil:reroll")
      .setLabel(`🎲 Reroll (${left} left)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(locked || left <= 0),
    new ButtonBuilder()
      .setCustomId("trav:abil:lock")
      .setLabel("🔒 Lock Scores")
      .setStyle(ButtonStyle.Success)
      .setDisabled(locked)
  );
  return [row];
}

// Try to update the original interaction message; otherwise reply/followUp;
// finally, fall back to channel send so users still see output.
async function safeUpdate(ix, payload) {
  try {
    if (ix.isRepliable()) {
      if (ix.isButton()) {
        try {
          await ix.update(payload);
          return;
        } catch {/* fall through */}
      }
      if (ix.deferred || ix.replied) {
        await ix.followUp(payload);
      } else {
        await ix.reply(payload);
      }
      return;
    }
  } catch { /* ignore */ }
  try {
    await ix.channel?.send(payload);
  } catch { /* noop */ }
}

// ---------------------- MESSAGE COMMANDS ----------------------
export async function onMessageCreate(msg) {
  if (msg.author.bot) return;

  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  const uid = msg.author.id;

  // Roll abilities + show UI
  if (cmd === "!rollabilities" || cmd === "!abilities" || cmd === "!abilroll") {
    const locked = !!(await redis.get(LOCK_KEY(uid)));
    const rngSeed = `${uid}:${Date.now()}`;
    const rng = makeRng(rngSeed);
    const scores = rollAbilityArray(rng);

    await redis.set(A_KEY(uid), JSON.stringify(scores));
    await redis.set(M_KEY(uid), JSON.stringify(modsFrom(scores)));
    // Only increment rerolls via the button; do not here.
    const rer = await getRerolls(uid);

    const e = new EmbedBuilder()
      .setTitle("🧬 Ability Scores (4d6 drop lowest)")
      .setDescription(fmt(scores))
      .setFooter({
        text: locked
          ? "Locked — rerolls disabled"
          : "You may reroll up to 2 times before locking",
      })
      .setColor(locked ? "Grey" : "Green");

    return void msg.channel.send({ embeds: [e], components: rows(locked, rer) });
  }

  // Reset abilities (self or @target if admin)
  if (cmd === "!abilreset") {
    const target = msg.mentions.users.first() || msg.author;
    const isAdmin = msg.member?.permissions?.has?.(PermissionsBitField.Flags.Administrator);

    if (target.id !== uid && !isAdmin) {
      return void msg.reply("🚫 You can only reset **your own** abilities. Admins may target others with a mention.");
    }

    const wiped = await resetAbilities(target.id);
    const who = target.id === uid ? "your" : `<@${target.id}>'s`;

    const e = new EmbedBuilder()
      .setTitle("♻️ Ability Scores Reset")
      .setDescription(
        `Cleared ${who} ability scores, modifiers, locks, and reroll counters.\n` +
        `Use **!rollabilities** to generate fresh scores.`
      )
      .setFooter({ text: `Cleared ${wiped} key${wiped === 1 ? "" : "s"}` })
      .setColor("Blue");

    return void msg.channel.send({ embeds: [e] });
  }
}

// ---------------------- BUTTON INTERACTIONS ----------------------
export async function onInteractionCreate(ix) {
  if (!ix.isButton()) return;
  if (!ix.customId?.startsWith("trav:abil:")) return;

  const uid = ix.user.id;
  const locked = !!(await redis.get(LOCK_KEY(uid)));
  let rer = await getRerolls(uid);

  // Ensure scores exist
  const raw = await redis.get(A_KEY(uid));
  let scores = raw ? JSON.parse(raw) : null;
  if (!scores) {
    return void safeUpdate(ix, {
      content: "You haven’t rolled abilities yet. Run `!rollabilities` first.",
      ephemeral: true,
    });
  }

  // Lock
  if (ix.customId === "trav:abil:lock") {
    if (locked) {
      return void safeUpdate(ix, {
        content: "Your abilities are already locked.",
        ephemeral: true,
      });
    }
    await redis.set(LOCK_KEY(uid), "1");
    // refresh to be safe
    scores = JSON.parse((await redis.get(A_KEY(uid))) || "{}");

    const e = new EmbedBuilder()
      .setTitle("🔒 Abilities Locked")
      .setDescription(fmt(scores))
      .setColor("Blue");

    return void safeUpdate(ix, {
      embeds: [e],
      components: rows(true, rer),
    });
  }

  // Reroll
  if (ix.customId === "trav:abil:reroll") {
    if (locked) {
      return void safeUpdate(ix, {
        content: "Already locked — rerolls disabled.",
        ephemeral: true,
      });
    }
    if (rer >= 2) {
      return void safeUpdate(ix, {
        content: "You’ve used both rerolls.",
        ephemeral: true,
      });
    }

    const rng = makeRng(`${uid}:${Date.now()}`);
    const newScores = rollAbilityArray(rng);
    await redis.set(A_KEY(uid), JSON.stringify(newScores));
    await redis.set(M_KEY(uid), JSON.stringify(modsFrom(newScores)));
    await redis.set(R_KEY(uid), rer + 1);
    rer = rer + 1;

    const e = new EmbedBuilder()
      .setTitle(`🎲 Reroll #${rer}`)
      .setDescription(fmt(newScores))
      .setFooter({ text: `${2 - rer} reroll(s) remaining` })
      .setColor("Orange");

    return void safeUpdate(ix, {
      embeds: [e],
      components: rows(false, rer),
    });
  }
}
