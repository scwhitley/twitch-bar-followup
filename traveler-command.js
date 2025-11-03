// traveler-command.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { REROLLABLE_FIELDS } from "./traveler-tables.js";
import { getProfile, saveProfile, wipeProfile, audit, shortCooldown, sign, verify } from "./traveler-store.js";
import {
  createProfile as createDoc,
  renderEmbedData as renderDoc,
  rerollField as rerollDoc,
  migrateProfile
} from "./traveler-builder.js";

function labelOf(f) {
  return f.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// Build buttons (locks deactivate)
function buildButtons(profile, userId) {
  const rows = [];
  const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i*n, i*n+n));
  for (const slice of chunk(REROLLABLE_FIELDS, 5)) {
    const row = new ActionRowBuilder();
    for (const f of slice) {
      const locked = profile.locks?.[f] || (profile.rerolls?.[f] ?? 0) <= 0;
      const idCore = `trav:rr|uid=${userId}|field=${f}`;
      const sig = sign(idCore);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${idCore}|sig=${sig}`)
          .setLabel(locked ? `🔒 ${labelOf(f)}` : `🎲 Reroll ${labelOf(f)}`)
          .setStyle(locked ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(locked)
      );
    }
    rows.push(row);
  }
  return rows;
}

// ---------- MESSAGE COMMANDS ----------
export async function onMessageCreate(msg) {
  if (msg.author.bot || msg.__handled) return;

  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  const isOur =
    cmd === "!traveler" || cmd === "!trav" ||
    cmd === "!travreset" || cmd === "!travwipe" ||
    cmd === "!travgrant" || cmd === "!travsheet" || cmd === "!travexport" ||
    cmd === "!ping";

  if (!isOur) return;
  msg.__handled = true;

  const uid = msg.author.id;

  if (cmd === "!ping") {
    return void msg.reply("pong");
  }

  if (cmd === "!traveler" || cmd === "!trav") {
    let prof = await getProfile(uid);
    if (!prof) {
      prof = createDoc(uid, {});
      await saveProfile(uid, prof);
    } else {
      migrateProfile(prof);
      await saveProfile(uid, prof);
    }
    const data = renderDoc(prof);
    const embed = new EmbedBuilder()
      .setTitle(data.title).addFields(...data.fields)
      .setColor("DarkPurple").setFooter({ text: data.footer });
    const components = buildButtons(prof, uid);
    await msg.channel.send({ embeds: [embed], components });
    return;
  }

  if (cmd === "!travsheet") {
    const prof = await getProfile(uid);
    if (!prof) return void msg.reply("No traveler yet. Use `!traveler`.");
    migrateProfile(prof);
    await saveProfile(uid, prof);

    const data = renderDoc(prof);
    const embed = new EmbedBuilder()
      .setTitle(data.title).addFields(...data.fields)
      .setColor("DarkPurple").setFooter({ text: data.footer });
    const components = buildButtons(prof, uid);
    await msg.channel.send({ embeds: [embed], components });
    return;
  }

  if (cmd === "!travexport") {
    const prof = await getProfile(uid);
    if (!prof) return void msg.reply("No traveler yet. Use `!traveler`.");
    migrateProfile(prof);
    await saveProfile(uid, prof);
    const json = "```json\n" + JSON.stringify(prof, null, 2) + "\n```";
    await msg.channel.send(json);
    return;
  }

  // Admin utilities (server admins only)
  if (cmd === "!travreset" || cmd === "!travwipe" || cmd === "!travgrant") {
    if (!msg.member?.permissions?.has?.("Administrator")) {
      return void msg.reply("🚫 Admins only.");
    }
  }

  if (cmd === "!travwipe") {
    await wipeProfile(uid);
    await msg.reply("Traveler wiped. Run `!traveler` to create anew.");
    return;
  }

  if (cmd === "!travreset") {
    const prof = await getProfile(uid);
    if (!prof) return void msg.reply("No traveler to reset.");
    for (const f of Object.keys(prof.locks || {})) prof.locks[f] = false;
    for (const f of Object.keys(prof.rerolls || {})) prof.rerolls[f] = 1;
    await saveProfile(uid, prof);
    await msg.reply("Reroll tokens reset and fields unlocked.");
    return;
  }

  if (cmd === "!travgrant") {
    const field = (parts[1] || "").toLowerCase();
    const prof = await getProfile(uid);
    if (!prof) return void msg.reply("No traveler to grant.");
    if (!REROLLABLE_FIELDS.includes(field)) {
      return void msg.reply(`Unknown field. Try: ${REROLLABLE_FIELDS.join(", ")}`);
    }
    prof.rerolls[field] = 1;
    prof.locks[field] = false;
    await saveProfile(uid, prof);
    await msg.reply(`Granted one reroll for **${field}** and unlocked it.`);
    return;
  }
}

// ---------- BUTTON INTERACTIONS ----------
export async function onInteractionCreate(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId?.startsWith("trav:rr")) return;

  // Parse: trav:rr|uid=...|field=...|sig=...
  const parts = Object.fromEntries(
    interaction.customId.split("|").slice(1).map(p => p.split("="))
  );
  const uid = parts.uid;
  const field = parts.field;
  const idCore = `trav:rr|uid=${uid}|field=${field}`;

  // Validate signature
  if (!verify(idCore, parts.sig || "")) {
    return void interaction.reply({ content: "Signature mismatch.", ephemeral: true });
  }

  // Only owner can reroll
  if (interaction.user.id !== uid) {
    return void interaction.reply({ content: "Not your traveler.", ephemeral: true });
  }

  // Short cooldown to prevent double-click spam
  const cd = await shortCooldown(uid, 2);
  if (cd > 0) {
    return void interaction.reply({ content: `Cool down… ${cd}s`, ephemeral: true });
  }

  // Load, migrate, reroll, save
  const prof = await getProfile(uid);
  if (!prof) {
    return void interaction.reply({ content: "No traveler yet. Use `!traveler`.", ephemeral: true });
  }

  try {
    migrateProfile(prof);
    const result = rerollDoc(uid, prof, field);
    await audit(uid, result);
    await saveProfile(uid, prof);
  } catch (e) {
    return void interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
  }

  // Re-render
  const data = renderDoc(prof);
  const embed = new EmbedBuilder()
    .setTitle(data.title).addFields(...data.fields)
    .setColor("DarkPurple").setFooter({ text: data.footer });
  const components = buildButtons(prof, uid);

  try {
    await interaction.update({ embeds: [embed], components });
  } catch {
    await interaction.reply({ embeds: [embed], components, ephemeral: false });
  }
}
