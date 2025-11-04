// conditions-commands.js
import { EmbedBuilder, PermissionsBitField } from "discord.js";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const COND_KEY = (uid) => `trav:${uid}:conditions`; // JSON object: { Poisoned:{ dc:13, untilTs:..., note:"..." }, ... }

const BASE_CONDITIONS = {
  Poisoned:  { note: "−2 to physical checks; CON save to end early" },
  Wounded:   { note: "−2 CON saves; some tasks restricted" },
  Exhausted: { note: "−1 to all checks; stacks up to 3" },
  Charmed:   { note: "+2 Persuasion by source; −2 hostile vs source" },
  Frightened:{ note: "−2 vs source; can’t move closer in encounters" },
  Stunned:   { note: "Skip next action / !work locked for one cycle" },
  Blessed:   { note: "+1 to all checks (short duration)" },
};

function isGM(member) {
  return !!member?.permissions?.has(PermissionsBitField.Flags.ManageGuild);
}

async function getConds(uid) {
  return JSON.parse(await redis.get(COND_KEY(uid)) || "{}");
}
async function setConds(uid, obj) {
  await redis.set(COND_KEY(uid), JSON.stringify(obj || {}));
}

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const parts = (msg.content||"").trim().split(/\s+/);
  const cmd = (parts[0]||"").toLowerCase();

  if (cmd === "!status") {
    const conds = await getConds(msg.author.id);
    if (!Object.keys(conds).length) return void msg.reply("No active conditions.");
    const lines = Object.entries(conds).map(([k,v]) => {
      const dc = v?.dc ? ` (DC ${v.dc})` : "";
      const note = v?.note ? ` — ${v.note}` : "";
      return `• **${k}**${dc}${note}`;
    });
    const e = new EmbedBuilder().setTitle("🩺 Current Conditions").setDescription(lines.join("\n")).setColor("Purple");
    return void msg.channel.send({ embeds: [e] });
  }

  if (cmd === "!save") {
    // usage: !save con 13
    const ability = (parts[1]||"").toUpperCase();
    const dc = parseInt(parts[2], 10) || 10;
    const modKey = `trav:${msg.author.id}:mods`;
    const mods = JSON.parse(await redis.get(modKey) || "{}");
    const mod = Number(mods[ability?.toLowerCase()] ?? 0);
    const roll = 1 + Math.floor(Math.random() * 20);
    const total = roll + mod;
    const pass = total >= dc;
    const e = new EmbedBuilder()
      .setTitle("🛡️ Saving Throw")
      .setDescription(`d20 (${roll}) + **${ability}** mod (${mod>=0?`+${mod}`:mod}) = **${total}** vs DC ${dc} → **${pass ? "PASS" : "FAIL"}**`)
      .setColor(pass ? "Green" : "Red");
    return void msg.channel.send({ embeds: [e] });
  }

  // GM: !applycond @user Poisoned 13 Optional note...
  if (cmd === "!applycond") {
    if (!isGM(msg.member)) return void msg.reply("GM only.");
    const target = msg.mentions.users.first();
    if (!target) return void msg.reply("Usage: `!applycond @user <Condition> [DC] [note...]`");
    const cond = parts[2];
    if (!cond) return void msg.reply("Specify a condition name.");
    const dc = parseInt(parts[3],10);
    const note = parts.slice(isNaN(dc) ? 3 : 4).join(" ");
    const conds = await getConds(target.id);
    conds[cond] = { ...(BASE_CONDITIONS[cond]||{}), ...(isNaN(dc)?{}:{dc}), ...(note?{note}:{}) };
    await setConds(target.id, conds);
    return void msg.channel.send(`Applied **${cond}** to <@${target.id}>${!isNaN(dc)?` (DC ${dc})`:``}.`);
  }

  // GM: !clearcond @user Poisoned
  if (cmd === "!clearcond") {
    if (!isGM(msg.member)) return void msg.reply("GM only.");
    const target = msg.mentions.users.first();
    const cond = parts[2];
    if (!target || !cond) return void msg.reply("Usage: `!clearcond @user <Condition>`");
    const conds = await getConds(target.id);
    delete conds[cond];
    await setConds(target.id, conds);
    return void msg.channel.send(`Cleared **${cond}** from <@${target.id}>.`);
  }
}

export async function onInteractionCreate() {
  // no interactive components yet
}
