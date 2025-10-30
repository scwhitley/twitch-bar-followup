// economy/admin-commands.js
import { EmbedBuilder, PermissionsBitField } from "discord.js";
import { getBalance, addBalance, subBalance } from "./econ-core.js";

function isAdmin(member) {
  if (!member) return false;
  return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
         member.permissions.has(PermissionsBitField.Flags.ManageGuild);
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
  if (msg.author.bot) return;
  const content = msg.content?.trim().toLowerCase() || "";
  if (!content.startsWith("!grantdd") &&
      !content.startsWith("!takedd") &&
      !content.startsWith("!setdd")) return;

  if (!isAdmin(msg.member)) {
    return void msg.reply("🚫 You don’t have permission to run economy admin commands.");
  }

  const { cmd, mention, amount } = parseArgs(msg);
  if (!mention) return void msg.reply("Tag a user, e.g. `!grantdd @user 100`");
  if (!Number.isFinite(amount) || amount <= 0) {
    return void msg.reply("Enter a valid positive amount.");
  }

  const userId = mention.id;

  try {
    if (cmd === "!grantdd") {
      const after = await addBalance(userId, amount);
      return void msg.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("💸 Funds Granted")
            .setDescription(`Granted **${amount} DD** to <@${userId}>.\nNew wallet: **${after} DD**`)
            .setColor("Green"),
        ],
      });
    }

    if (cmd === "!takedd") {
      await subBalance(userId, amount);
      const after = await getBalance(userId);
      return void msg.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🧾 Funds Removed")
            .setDescription(`Removed **${amount} DD** from <@${userId}>.\nNew wallet: **${after} DD**`)
            .setColor("Orange"),
        ],
      });
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
      return void msg.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🏦 Balance Set")
            .setDescription(`Set <@${userId}> wallet to **${after} DD**`)
            .setColor("Blue"),
        ],
      });
    }
  } catch (err) {
    return void msg.reply(`❌ ${err.message || "Operation failed."}`);
  }
}
