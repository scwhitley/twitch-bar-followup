// traveler-skills.js
import { Redis } from "@upstash/redis";
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { SKILLS } from "../skills-data.js";

const redis = Redis.fromEnv();
const CONFIRM_KEY = (uid) => `trav:${uid}:confirmed`;     // set by your existing !confirmchar flow
const SKILLS_KEY  = (uid) => `trav:${uid}:skills`;        // store as JSON array
const LOCK_KEY    = (uid) => `trav:${uid}:skills:locked`;

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const content = (msg.content||"").trim().toLowerCase();
  if (content !== "!pickskills") return;

  const confirmed = !!(await redis.get(CONFIRM_KEY(msg.author.id)));
  if (!confirmed) return void msg.reply("Confirm your character first with `!confirmchar`.");

  const locked = !!(await redis.get(LOCK_KEY(msg.author.id)));
  const current = JSON.parse(await redis.get(SKILLS_KEY(msg.author.id)) || "[]");

  const menu = new StringSelectMenuBuilder()
    .setCustomId("trav:skills:select")
    .setPlaceholder("Pick exactly 2 skills")
    .setMinValues(2)
    .setMaxValues(2)
    .setDisabled(locked);

  for (const s of SKILLS) {
    menu.addOptions({ label: `${s.key} (${s.ability})`, value: s.key });
  }

  const row1 = new ActionRowBuilder().addComponents(menu);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("trav:skills:lock").setLabel("🔒 Lock Skills").setStyle(ButtonStyle.Success).setDisabled(locked || current.length !== 2)
  );

  const e = new EmbedBuilder()
    .setTitle("🎓 Choose Your Proficiencies")
    .setDescription(current.length ? `Selected: **${current.join(", ")}**` : "Pick exactly two skills from the menu.")
    .setColor(locked ? "Grey" : "Green");

  await msg.channel.send({ embeds: [e], components: [row1, row2] });
}

export async function onInteractionCreate(ix) {
  if (ix.customId === "trav:skills:select" && ix.isStringSelectMenu()) {
    const locked = !!(await redis.get(LOCK_KEY(ix.user.id)));
    if (locked) return void ix.reply({ content: "Skills already locked.", ephemeral: true });

    const selection = ix.values || [];
    if (selection.length !== 2) {
      return void ix.reply({ content: "Pick exactly 2 skills.", ephemeral: true });
    }
    await redis.set(SKILLS_KEY(ix.user.id), JSON.stringify(selection));

    const e = new EmbedBuilder()
      .setTitle("🎓 Skills Selected")
      .setDescription(`Selected: **${selection.join(", ")}** — click Lock when ready.`)
      .setColor("Orange");

    const lockBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("trav:skills:lock").setLabel("🔒 Lock Skills").setStyle(ButtonStyle.Success).setDisabled(false)
    );

    try {
      await ix.update({ embeds: [e], components: [ix.message.components[0], lockBtn] });
    } catch {
      await ix.reply({ embeds: [e], components: [lockBtn], ephemeral: false });
    }
  }

  if (ix.customId === "trav:skills:lock" && ix.isButton()) {
    const current = JSON.parse(await redis.get(SKILLS_KEY(ix.user.id)) || "[]");
    if (current.length !== 2) return void ix.reply({ content: "Pick exactly 2 skills before locking.", ephemeral: true });
    await redis.set(LOCK_KEY(ix.user.id), "1");

    const e = new EmbedBuilder()
      .setTitle("🔒 Skills Locked")
      .setDescription(`Final proficiencies: **${current.join(", ")}** (+2)`)
      .setColor("Blue");
    return void ix.update({ embeds: [e], components: [] });
  }
}
