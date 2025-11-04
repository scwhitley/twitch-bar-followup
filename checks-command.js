// checks-command.js
import { EmbedBuilder } from "discord.js";
import { Redis } from "@upstash/redis";
import { SKILL_TO_ABILITY, PROF_BONUS, SKILLS } from "./skills-data.js";

const redis = Redis.fromEnv();
const MODS_KEY    = (uid) => `trav:${uid}:mods`;
const SKILLS_KEY  = (uid) => `trav:${uid}:skills`;
const CORRUPT_KEY = (uid) => `trav:${uid}:corruption`; // expected existing; default 0

const SKILL_SET = new Set(SKILLS.map(s => s.key.toLowerCase()));

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const parts = (msg.content||"").trim().split(/\s+/);
  const cmd = (parts[0]||"").toLowerCase();
  if (cmd !== "!check") return;

  // !check stealth 15
  const skillRaw = parts[1];
  if (!skillRaw) return void msg.reply("Usage: `!check <skill> [dc]` e.g. `!check Stealth 15`");
  const skillKey = SKILLS.find(s => s.key.toLowerCase() === skillRaw.toLowerCase())?.key;
  if (!skillKey || !SKILL_SET.has(skillKey.toLowerCase())) {
    return void msg.reply(`Unknown skill. Try one of: ${SKILLS.map(s=>s.key).join(", ")}`);
  }
  const dc = parseInt(parts[2], 10) || null;

  const ability = SKILL_TO_ABILITY[skillKey];        // e.g., DEX
  const mods = JSON.parse(await redis.get(MODS_KEY(msg.author.id)) || "{}");
  const abilMod = Number(mods[ability.toLowerCase()] ?? 0);

  const trained = JSON.parse(await redis.get(SKILLS_KEY(msg.author.id)) || "[]");
  const isTrained = trained.includes(skillKey);
  const prof = isTrained ? PROF_BONUS : 0;

  const corruption = parseInt(await redis.get(CORRUPT_KEY(msg.author.id))) || 0;
  // simple corruption impact: tiers 6/8 reduce social/resolve; here: general −Math.floor(corruption/5)
  const corrPenalty = Math.floor(corruption / 5) * -1; // 0 at 0-4, -1 at 5-9, -2 at 10, tweak as you wish

  const roll = 1 + Math.floor(Math.random() * 20);
  const total = roll + abilMod + prof + corrPenalty;

  const lines = [
    `**Skill:** ${skillKey} (${ability})`,
    `**Roll:** d20 = ${roll}`,
    `**Ability Mod:** ${abilMod >= 0 ? `+${abilMod}` : abilMod}`,
    `**Proficiency:** ${prof ? `+${prof}` : `+0 (untrained)`}`,
    `**Corruption Mod:** ${corrPenalty}`,
    `**Total:** **${total}**${dc ? ` vs **DC ${dc}** → **${total >= dc ? "PASS" : "FAIL"}**` : ""}`,
  ];

  const e = new EmbedBuilder()
    .setTitle("🎲 Skill Check")
    .setDescription(lines.join("\n"))
    .setColor(dc ? (total >= dc ? "Green" : "Red") : "Blue");

  return void msg.channel.send({ embeds: [e] });
}

export async function onInteractionCreate() { /* no-op */ }

