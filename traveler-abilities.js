// traveler-abilities.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { Redis } from "@upstash/redis";
import { makeRng, rollAbilityArray, modsFrom } from "./abilities-core.js";

const redis = Redis.fromEnv();
const A_KEY = (uid) => `trav:${uid}:abilities`;
const M_KEY = (uid) => `trav:${uid}:mods`;
const R_KEY = (uid) => `trav:${uid}:rerolls:abilities`;
const LOCK_KEY = (uid) => `trav:${uid}:abilities:locked`;

function fmt(scores) {
  const mods = modsFrom(scores);
  const mk = (k) => {
    const m = mods[k.toLowerCase()];
    const sign = m >= 0 ? "+" : "−";
    return `**${k}** ${scores[k]} (${sign}${Math.abs(m)})`;
  };
  return ["STR","DEX","CON","INT","WIS","CHA"].map(mk).join("  •  ");
}

async function getRerolls(uid) {
  return parseInt(await redis.get(R_KEY(uid))) || 0;
}

function rowButtons(locked, rerollsLeft) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("trav:abil:reroll")
      .setLabel(`🎲 Reroll (${Math.max(0, 2 - rerollsLeft)} left)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(locked || rerollsLeft >= 2),
    new ButtonBuilder()
      .setCustomId("trav:abil:lock")
      .setLabel("🔒 Lock Scores")
      .setStyle(ButtonStyle.Success)
      .setDisabled(locked)
  );
  return [row];
}

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const content = (msg.content||"").trim().toLowerCase();
  if (content !== "!rollabilities") return;

  const locked = !!(await redis.get(LOCK_KEY(msg.author.id)));
  const seed = `${msg.author.id}:${Date.now()}`;
  const rng = makeRng(seed);
  const scores = rollAbilityArray(rng);

  await redis.set(A_KEY(msg.author.id), JSON.stringify(scores));
  await redis.set(M_KEY(msg.author.id), JSON.stringify(modsFrom(scores)));
  // do NOT increment rerolls on initial open; only on click
  const rer = await getRerolls(msg.author.id);

  const e = new EmbedBuilder()
    .setTitle("🧬 Ability Scores (4d6 drop lowest)")
    .setDescription(fmt(scores))
    .setFooter({ text: locked ? "Locked — rerolls disabled" : "You may reroll up to 2 times before locking" })
    .setColor(locked ? "Grey" : "Green");

  await msg.channel.send({ embeds: [e], components: rowButtons(locked, rer) });
}

export async function onInteractionCreate(ix) {
  if (!ix.isButton()) return;
  if (!ix.customId?.startsWith("trav:abil:")) return;

  const uid = ix.user.id;
  const locked = !!(await redis.get(LOCK_KEY(uid)));
  let rer = await getRerolls(uid);

  if (ix.customId === "trav:abil:lock") {
    await redis.set(LOCK_KEY(uid), "1");
    const scores = JSON.parse(await redis.get(A_KEY(uid)) || "{}");
    const e = new EmbedBuilder()
      .setTitle("🔒 Abilities Locked")
      .setDescription(fmt(scores))
      .setColor("Blue");
    return void ix.update({ embeds: [e], components: rowButtons(true, rer) });
  }

  if (ix.customId === "trav:abil:reroll") {
    if (locked) return void ix.reply({ content: "Already locked.", ephemeral: true });
    if (rer >= 2) return void ix.reply({ content: "You’ve used both rerolls.", ephemeral: true });

    const rng = makeRng(`${uid}:${Date.now()}`);
    const scores = rollAbilityArray(rng);
    await redis.set(A_KEY(uid), JSON.stringify(scores));
    await redis.set(M_KEY(uid), JSON.stringify(modsFrom(scores)));
    await redis.set(R_KEY(uid), rer + 1);
    rer = rer + 1;

    const e = new EmbedBuilder()
      .setTitle(`🎲 Reroll #${rer}`)
      .setDescription(fmt(scores))
      .setFooter({ text: `${2 - rer} reroll(s) remaining` })
      .setColor("Orange");

    try {
      await ix.update({ embeds: [e], components: rowButtons(false, rer) });
    } catch {
      await ix.reply({ embeds: [e], components: rowButtons(false, rer), ephemeral: false });
    }
  }
}
