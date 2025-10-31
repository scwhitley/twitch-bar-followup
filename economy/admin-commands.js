// economy/admin-commands.js
import { EmbedBuilder, PermissionsBitField } from "discord.js";
import { getBalance, addBalance, subBalance } from "./econ-core.js";

function isAdmin(member) {
  if (!member) return false;
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  );
}

function parseArgs(msg) {
  const parts = msg.content.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const mention = msg.mentions.users.first();
  const amountStr = parts.at(-1);
  const amount = parseInt(amountStr, 10);
  return { cmd, mention, amount };
}

export async function onMessageCreate(msg) {
  // 🔒 single-response guard
  if (msg.author.bot || msg.__handled) return;

  const content = msg.content?.trim().toLowerCase() || "";
  const isAdminCmd =
    content.startsWith("!grantdd") ||
    content.startsWith("!takedd") ||
    content.startsWith("!setdd");

  if (!isAdminCmd) return; // not our command

  if (!isAdmin(msg.member)) {
    await msg.reply("🚫 You don’t have permission to run economy admin commands.");
    msg.__handled = true; return;
  }

  const { cmd, mention, amount } = parseArgs(msg);
  if (!mention) { await msg.reply("Tag a user, e.g. `!grantdd @user 100`"); msg.__handled = true; return; }
  if (!Number.isFinite(amount) || amount <= 0) {
    await msg.reply("Enter a valid **positive** amount.");
    msg.__handled = true; return;
  }

  const userId = mention.id;

  try {
    if (cmd === "!grantdd") {
      const after = await addBalance(userId, amount);
      await msg.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("💸 Funds Granted")
            .setDescription(`Granted **${amount} DD** to <@${userId}>.\nNew wallet: **${after} DD**`)
            .setColor("Green"),
        ],
      });
      msg.__handled = true; return;
    }

    if (cmd === "!takedd") {
      await subBalance(userId, amount);
      const after = await getBalance(userId);
      await msg.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🧾 Funds Removed")
            .setDescription(`Removed **${amount} DD** from <@${userId}>.\nNew wallet: **${after} DD**`)
            .setColor("Orange"),
        ],
      });
      msg.__handled = true; return;
    }

    if (cmd === "!setdd") {
      const current = await getBalance(userId);
      const delta = amount - current;
      if (delta > 0) {
        await addBalance(userId, delta);
      } else if (delta < 0) {
        await subBalance(userId, Math.abs(delta));
      }
      const after = await getBalance(userId);
      await msg.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🏦 Balance Set")
            .setDescription(`Set <@${userId}> wallet to **${after} DD**`)
            .setColor("Blue"),
        ],
      });
      msg.__handled = true; return;
    }
  } catch (err) {
    await msg.reply(`❌ ${err?.message || "Operation failed."}`);
    msg.__handled = true; return;
  }
}
