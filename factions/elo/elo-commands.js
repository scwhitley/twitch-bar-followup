// /factions/elo/elo-commands.js
import { sanitizeOneLine } from "../core/faction-utils.js";
import { ensureElo } from "./elo-core.js";
import { getAlignment } from "../core/alignment-core.js";

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const [cmd, arg] = msg.content.trim().split(/\s+/, 2);
  if (!["!elo", "!points", "!factionpoints"].includes(cmd?.toLowerCase())) return;

  const whoMention = msg.mentions?.users?.first();
  const who = sanitizeOneLine((whoMention?.username || arg || msg.author.username) || "")
    .replace(/^@+/, "").toLowerCase();

  const [elo, align] = await Promise.all([ensureElo(who), getAlignment(who)]);
  const side = align ? align[0].toUpperCase() + align.slice(1) : "Unaligned";
  return void msg.reply(`@${who} — ELO **${elo}** (${side})`);
}
