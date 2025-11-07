// trial-command.js
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import { Redis } from "@upstash/redis";
import { QUESTIONS } from "./trial-data.js";

const redis = Redis.fromEnv();

// Session + result keys
const SKEY = (uid) => `trial:session:${uid}`;
const RKEY = (uid) => `trial:result:${uid}`;
const LKEY = (uid) => `trial:lock:${uid}`;

// tiny lock to prevent double-clicks for ~2 seconds
async function withClickLock(uid, fn) {
  const ok = await redis.set(LKEY(uid), "1", { nx: true, ex: 2 });
  if (!ok) return { lockedOut: true };
  try { return await fn(); }
  finally { await redis.del(LKEY(uid)); }
}

// ---------- NEW: nicer progress meter ----------
function progressBar(completed, total) {
  const full = Math.max(0, Math.min(total, completed));
  const on = "▰".repeat(full);
  const off = "▱".repeat(total - full);
  return on + off;
}

function buildQuestionEmbed(qIndex, tally) {
  const total = QUESTIONS.length;              // 15
  const answered = qIndex;                     // how many already answered
  const pct = Math.round((answered / total) * 100);
  const q = QUESTIONS[qIndex];

  const bar = progressBar(answered, total);
  const counts = `Sith: **${tally.sith}** • Jedi: **${tally.jedi}** • Grey: **${tally.grey}**`;

  const desc = [
    `**Progress:** ${bar}  ${answered}/${total} · ${pct}%`,
    "",
    q.prompt
  ].join("\n");

  return {
    embed: new EmbedBuilder()
      .setTitle(`Sith Trial — Question ${qIndex + 1}/${total}`)
      .setDescription(desc)
      .setFooter({ text: counts })
      .setColor("DarkRed"),
    components: [
      new ActionRowBuilder().addComponents(
        ...q.options.map((o, idx) =>
          new ButtonBuilder()
            .setCustomId(`trial:answer:${qIndex}:${idx}`)
            .setLabel(o.text)
            .setStyle(ButtonStyle.Secondary)
        )
      ),
    ],
  };
}

function decideAlignment(tally, tieBreak = "randomAmongTop") {
  const arr = [
    ["sith", tally.sith],
    ["jedi", tally.jedi],
    ["grey", tally.grey],
  ];
  arr.sort((a,b) => b[1]-a[1]);

  if (arr[0][1] > arr[1][1]) return arr[0][0]; // clear winner
  const topScore = arr[0][1];
  const top = arr.filter(([_,v]) => v === topScore).map(([k]) => k);

  if (tieBreak === "preferSith" && top.includes("sith")) return "sith";
  if (tieBreak === "preferJedi" && top.includes("jedi")) return "jedi";
  if (tieBreak === "preferGrey" && top.includes("grey")) return "grey";
  return top[Math.floor(Math.random() * top.length)];
}

function buildResultEmbed(result) {
  const total = QUESTIONS.length;
  const bar = progressBar(total, total);
  const { alignment, score } = result;
  const color = alignment === "sith" ? "DarkRed" : alignment === "jedi" ? "Blue" : "Grey";
  const flavor =
    alignment === "sith" ? "Power accepted. The Shroud leans into your will."
  : alignment === "jedi" ? "Discipline holds. You walk the narrow line of light."
  : "You balance the blade’s edge. Neither dogma owns you.";

  return new EmbedBuilder()
    .setTitle(`Trial Complete — ${alignment.toUpperCase()}`)
    .setDescription(flavor)
    .addFields(
      { name: "Progress", value: `${bar}  ${total}/${total} · 100%` },
      { name: "Tally", value: `Sith: **${score.sith}** | Jedi: **${score.jedi}** | Grey: **${score.grey}**` },
      { name: "Next", value: "Run **!forge** to construct your saber." }
    )
    .setColor(color);
}

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  if (cmd === "!trial") {
    const existingResult = await redis.get(RKEY(msg.author.id));
    if (existingResult) {
      const result = typeof existingResult === "string" ? JSON.parse(existingResult) : existingResult;
      const e = buildResultEmbed(result);
      return void msg.channel.send({ embeds: [e] });
    }

    const existing = await redis.get(SKEY(msg.author.id));
    let session;
    if (existing) {
      session = typeof existing === "string" ? JSON.parse(existing) : existing;
    } else {
      session = {
        qIndex: 0,
        startedAt: Date.now(),
        tally: { sith: 0, jedi: 0, grey: 0 },
        answers: [],
      };
      await redis.set(SKEY(msg.author.id), JSON.stringify(session));
    }

    const { embed, components } = buildQuestionEmbed(session.qIndex, session.tally);
    return void msg.channel.send({ embeds: [embed], components });
  }

  if (cmd === "!trialcancel") {
    await redis.del(SKEY(msg.author.id));
    return void msg.reply("Your trial session has been canceled. Run **!trial** to start again.");
  }

  if (cmd === "!trialresult") {
    const r = await redis.get(RKEY(msg.author.id));
    if (!r) return void msg.reply("No trial result yet. Run **!trial** first.");
    const result = typeof r === "string" ? JSON.parse(r) : r;
    const e = buildResultEmbed(result);
    return void msg.channel.send({ embeds: [e] });
  }
}

export async function onInteractionCreate(ix) {
  if (!ix.isButton()) return;
  if (!ix.customId?.startsWith("trial:answer:")) return;

  const uid = ix.user.id;
  const [_, __, qStr, optStr] = ix.customId.split(":");
  const qIndex = parseInt(qStr, 10);
  const optIndex = parseInt(optStr, 10);

  const lockedTry = await withClickLock(uid, async () => {
    const raw = await redis.get(SKEY(uid));
    if (!raw) {
      return { reply: { content: "No active trial. Run **!trial** to begin.", ephemeral: true } };
    }
    const session = typeof raw === "string" ? JSON.parse(raw) : raw;

    // stale button?
    if (qIndex !== session.qIndex) {
      return { reply: { content: "That prompt has moved on. Answer the latest question above.", ephemeral: true } };
    }

    const q = QUESTIONS[qIndex];
    const opt = q.options[optIndex];
    if (!opt) {
      return { reply: { content: "Invalid option.", ephemeral: true } };
    }

    // record tally + answer
    session.tally[opt.align] = (session.tally[opt.align] || 0) + 1;
    session.answers.push({ qid: qIndex, align: opt.align });

    if (qIndex < QUESTIONS.length - 1) {
      session.qIndex = qIndex + 1;
      await redis.set(SKEY(uid), JSON.stringify(session));

      // next question
      const payload = buildQuestionEmbed(session.qIndex, session.tally);
      try {
        await ix.update({ embeds: [payload.embed], components: payload.components });
      } catch {
        await ix.reply({ embeds: [payload.embed], components: payload.components });
      }
      return {};
    }

    // final question answered — compute result
    const tieBreak = (typeof q.scoring?.tieBreak === "string" ? q.scoring.tieBreak : "randomAmongTop");
    const alignment = decideAlignment(session.tally, tieBreak);

    const result = {
      alignment,
      completedAt: Date.now(),
      score: session.tally,
    };
    await redis.set(RKEY(uid), JSON.stringify(result));
    await redis.del(SKEY(uid));

    const e = buildResultEmbed(result);
    try {
      await ix.update({ embeds: [e], components: [] });
    } catch {
      await ix.reply({ embeds: [e], components: [] });
    }
    return {};
  });

  if (lockedTry?.lockedOut) {
    return void ix.reply({ content: "Easy there—processing your click. Try again in a sec.", ephemeral: true });
  }
  if (lockedTry?.reply) {
    const { reply } = lockedTry;
    if (ix.deferred || ix.replied) {
      return void ix.followUp(reply);
    } else {
      return void ix.reply(reply);
    }
  }
}
