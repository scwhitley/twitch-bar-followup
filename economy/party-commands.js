// party-commands.js
import { EmbedBuilder } from "discord.js";
import { getPartySnapshot } from "./economy/party-core.js";

function corBar(v) {
  const val = Math.max(0, Math.min(10, v|0));
  return "▰".repeat(val) + "▱".repeat(10 - val);
}
function corColor(v) {
  if (v <= 3) return "Green";
  if (v <= 6) return "Orange";
  if (v <= 8) return "Red";
  return "DarkRed";
}

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const cmd = (msg.content || "").trim().toLowerCase();
  if (cmd !== "!party" && cmd !== "!party all") return;

  const g = msg.guild?.id || "global";
  const snap = await getPartySnapshot(g);

  const act = snap.members.filter(m => m.active);
  const rest = cmd === "!party all" ? snap.members.filter(m => !m.active) : [];

  const e = new EmbedBuilder()
    .setTitle(`🛡️ Party: ${snap.meta.name}`)
    .setDescription(`Active: **${act.length}** / Total: **${snap.members.length}**`)
    .setColor("Blue");

  if (act.length) {
    const lines = act
      .sort((a,b) => b.corruption - a.corruption || a.name.localeCompare(b.name))
      .map(m => `• **${m.name}** (<@${m.userId}>) — ${m.race} ${m.clazz}\n  Corruption: ${m.corruption}/10  ${corBar(m.corruption)}\n  Wallet: ${m.wallet} DD • Bank: ${m.bank} DD`);
    e.addFields({ name: "— ACTIVE —", value: lines.join("\n") });
  } else {
    e.addFields({ name: "— ACTIVE —", value: "_No active travelers._" });
  }

  if (rest.length) {
    const lines = rest
      .sort((a,b) => a.name.localeCompare(b.name))
      .map(m => `• **${m.name}** (<@${m.userId}>) — ${m.status === "pending" ? "Pending confirmation (use !confirmchar)" : "Benched"}`);
    e.addFields({ name: "— PENDING / BENCHED —", value: lines.join("\n") });
  }

  return void msg.channel.send({ embeds: [e] });
}
