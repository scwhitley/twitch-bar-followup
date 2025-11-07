// trial-command.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Redis } from "@upstash/redis";
import {
  ensureQuestionsLoaded,
  getQuestion,
  totalQuestions,
} from "./trial-data.js";

const redis = Redis.fromEnv();

// Session + result keys
const SKEY = (uid) => `trial:session:${uid}`;
const RKEY = (uid) => `trial:result:${uid}`;
const LKEY = (uid) => `trial:lock:${uid}`;

// tiny lock to prevent double-clicks for ~2 seconds
async function withClickLock(uid, fn) {
  const ok = await redis.set(LKEY(uid), "1", { nx: true, ex: 2 });
  if (!ok) return { lockedOut: true };
  try {
    return await fn();
  } finally {
    await redis.del(LKEY(uid));
  }
}

// ---------- progress meter ----------
function progressBar(completed, total) {
  const full = Math.max(0, Math.min(total, completed));
  const on = "▰".repeat(full);
  const off = "▱".repeat(total - full);
  return on + off;
}

function assertValidQuestion(q, idx) {
  if (!q) throw new Error(`[trial] Missing question at index ${idx}`);
  if (typeof q.prompt !== "string" || !q.prompt.trim()) {
    throw new Error(`[trial] Question ${idx} missing 'prompt'`);
  }
  if (!Array.isArray(q.answers) || q.answers.length !== 4) {
    throw new Error(`[trial] Question ${idx} needs 4 answers`);
  }
  for (let i = 0; i < 4; i++) {
    const a = q.answers[i];
    if (!a || typeof a.label !== "string" || !a.alignment) {
      throw new Error(
        `[trial] Question ${idx} answer ${i} missing 'label' or 'alignment'`
      );
    }
  }
  return q;
}

// small parser for our pipe-delimited customId
function parseId(id) {
  // format: trial:answer|u=...|i=...|a=...
  if (!id?.startsWith("trial:answer")) return null;
  const parts = id.split("|");
  const kv = {};
  for (let p of parts.slice(1)) {
    const [k, v] = p.split("=");
    kv[k] = decodeURIComponent(v ?? "");
  }
  return kv; // { u, i, a }
}

function buildQuestionEmbed(userId, idx, tally) {
  const q = assertValidQuestion(getQuestion(idx), idx);
  const total = totalQuestions();
  const progress = `${idx + 1}/${total}`;

  const embed = new EmbedBuilder()
    .setTitle(`Sith Trial — Question ${progress}`)
    .setDescription(q.prompt)
    .setColor("Purple")
    .setFooter({ text: `Progress: ${progress}` });

  const row = new ActionRowBuilder().addComponents(
    q.answers.map((a, i) =>
      new ButtonBuilder()
        .setCustomId(`trial:answer|u=${userId}|i=${idx}|a=${i}`)
        .setLabel(a.label)
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embed, components: [row] };
}

function decideAlignment(tally, tieBreak = "randomAmongTop") {
  const arr = [
    ["sith", tally.sith],
    ["jedi", tally.jedi],
    ["grey", tally.grey],
  ];
  arr.sort((a, b) => b[1] - a[1]);

  if (arr[0][1] > arr[1][1]) return arr[0][0]; // clear winner
  const topScore = arr[0][1];
  const top = arr.filter(([_, v]) => v === topScore).map(([k]) => k);

  if (tieBreak === "preferSith" && top.includes("sith")) return "sith";
  if (tieBreak === "preferJedi" && top.includes("jedi")) return "jedi";
  if (tieBreak === "preferGrey" && top.includes("grey")) return "grey";
  return top[Math.floor(Math.random() * top.length)];
}

function buildResultEmbed(result) {
  const total = totalQuestions();
  const bar = progressBar(total, total);
  const { alignment, score } = result;
  const color =
    alignment === "sith" ? "DarkRed" : alignment === "jedi" ? "Blue" : "Grey";
  const flavor =
    alignment === "sith"
      ? "Power accepted. The Shroud leans into your will."
      : alignment === "jedi"
      ? "Discipline holds. You walk the narrow line of light."
      : "You balance the blade’s edge. Neither dogma owns you.";

  return new EmbedBuilder()
    .setTitle(`Trial Complete — ${alignment.toUpperCase()}`)
    .setDescription(flavor)
    .addFields(
      { name: "Progress", value: `${bar}  ${total}/${total} · 100%` },
      {
        name: "Tally",
        value: `Sith: **${score.sith}** | Jedi: **${score.jedi}** | Grey: **${score.grey}**`,
      },
      { name: "Next", value: "Run **!forge** to construct your saber." }
    )
    .setColor(color);
}

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  if (cmd === "!trial") {
    // Ensure questions are actually loaded
    const loaded = await ensureQuestionsLoaded();
    if (!loaded) {
      return void msg.reply(
        "Trial data not loaded yet. Double-check the `trial-questions.json` location or env var."
      );
    }

    // If they’ve already completed the trial, just show their result card
    const existingResult = await redis.get(RKEY(msg.author.id));
    if (existingResult) {
      const result =
        typeof existingResult === "string"
          ? JSON.parse(existingResult)
          : existingResult;
      const e = buildResultEmbed(result);
      return void msg.channel.send({ embeds: [e] });
    }

    // Load or create a session
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

    // Ask next question (or finalize if we're out of questions)
    const total = totalQuestions();
    if (session.qIndex >= total) {
      const alignment =
        Object.entries(session.tally).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        "grey";

      const result = {
        userId: msg.author.id,
        alignment,
        score: session.tally,
        finishedAt: Date.now(),
        totalAnswered: session.answers?.length ?? 0,
      };

      await redis.set(RKEY(msg.author.id), JSON.stringify(result));
      await redis.del(SKEY(msg.author.id)); // clear session

      const e = buildResultEmbed(result);
      return void msg.channel.send({ embeds: [e] });
    }

    const { embed, components } = buildQuestionEmbed(
      msg.author.id,
      session.qIndex,
      session.tally
    );
    return void msg.channel.send({ embeds: [embed], components });
  }

  if (cmd === "!trialcancel") {
    await redis.del(SKEY(msg.author.id));
    return void msg.reply(
      "Your trial session has been canceled. Run **!trial** to start again."
    );
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
  if (!ix.customId?.startsWith("trial:answer")) return;

  const kv = parseId(ix.customId); // ← parse pipe format
  if (!kv) return;

  const uid = ix.user.id;
  const qIndex = parseInt(kv.i, 10);
  const optIndex = parseInt(kv.a, 10);

  const lockedTry = await withClickLock(uid, async () => {
    const raw = await redis.get(SKEY(uid));
    if (!raw) {
      return {
        reply: {
          content: "No active trial. Run **!trial** to begin.",
          ephemeral: true,
        },
      };
    }
    const session = typeof raw === "string" ? JSON.parse(raw) : raw;

    // stale button?
    if (qIndex !== session.qIndex) {
      return {
        reply: {
          content:
            "That prompt has moved on. Answer the latest question above.",
          ephemeral: true,
        },
      };
    }

    const q = getQuestion(qIndex);
    const opt = q.answers[optIndex]; // ✅ answers, not options
    if (!opt) {
      return { reply: { content: "Invalid option.", ephemeral: true } };
    }

    // record tally + answer
    const align = opt.alignment.toLowerCase(); // ✅ alignment
    session.tally[align] = (session.tally[align] || 0) + 1;
    session.answers.push({ qid: qIndex, alignment: align });

    const total = totalQuestions();
    if (qIndex < total - 1) {
      session.qIndex = qIndex + 1;
      await redis.set(SKEY(uid), JSON.stringify(session));

      // next question
      const payload = buildQuestionEmbed(uid, session.qIndex, session.tally);
      try {
        await ix.update({
          embeds: [payload.embed],
          components: payload.components,
        });
      } catch {
        await ix.reply({
          embeds: [payload.embed],
          components: payload.components,
        });
      }
      return {};
    }

    // final question answered — compute result
    const alignment = decideAlignment(session.tally, "randomAmongTop");

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
    return void ix.reply({
      content: "Easy there—processing your click. Try again in a sec.",
      ephemeral: true,
    });
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
