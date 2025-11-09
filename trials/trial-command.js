// top of trial-command.js
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import { Redis } from "@upstash/redis";
import { QUESTIONS, getTrialStatus, reloadTrialData } from "./trial-data.js";


const redis = Redis.fromEnv();

// Session + result keys
const SKEY = (uid) => `trial:session:${uid}`;
const RKEY = (uid) => `trial:result:${uid}`;
const LKEY = (uid) => `trial:lock:${uid}`;

// anti double-click
async function withClickLock(uid, fn) {
  const ok = await redis.set(LKEY(uid), "1", { nx: true, ex: 2 });
  if (!ok) return { lockedOut: true };
  try { return await fn(); }
  finally { await redis.del(LKEY(uid)); }
}

// progress meter
function progressBar(completed, total) {
  const full = Math.max(0, Math.min(total, completed));
  return "▰".repeat(full) + "▱".repeat(total - full);
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
      throw new Error(`[trial] Question ${idx} answer ${i} missing 'label' or 'alignment'`);
    }
  }
  return q;
}

function getQuestion(idx) {
  const total = Array.isArray(QUESTIONS) ? QUESTIONS.length : 0;
  if (!total) throw new Error("[trial] No questions loaded (check JSON path/export)");
  if (idx < 0 || idx >= total) return null; // finished
  return assertValidQuestion(QUESTIONS[idx], idx);
}

function parseId(id) {
  // trial:answer|u=...|i=...|a=...
  if (!id?.startsWith("trial:answer")) return null;
  const parts = id.split("|");
  const kv = {};
  for (const p of parts.slice(1)) {
    const [k, v] = p.split("=");
    kv[k] = decodeURIComponent(v ?? "");
  }
  return kv;
}

function buildQuestionEmbed(userId, idx) {
  const q = getQuestion(idx);
  if (!q) return null;

  const total = QUESTIONS.length;
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
  ].sort((a,b) => b[1]-a[1]);

  if (arr[0][1] > arr[1][1]) return arr[0][0];
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
  const [cmd] = msg.content.trim().toLowerCase().split(/\s+/);

  // Debug/status
if (cmd === "!trialdebug") {
  const s = getTrialStatus();
  const e = new EmbedBuilder()
    .setTitle("Trial Data Status")
    .addFields(
      { name: "Loaded", value: s.loaded ? "✅ Loaded" : "❌ Not Loaded", inline: true },
      { name: "Loaded From", value: s.from || "—" },
      { name: "Question Count", value: String(s.count || 0), inline: true },
      { name: "Reason", value: s.reason || "—" },
      { name: "Paths Tried", value: (s.pathsTried?.length ? s.pathsTried.map(p => `• ${p}`).join("\n") : "—") }
    )
    .setColor(s.loaded ? "Green" : "Red");
  return void msg.channel.send({ embeds: [e] });
}

  // Manual reload
  // inside onMessageCreate(msg) in trial-command.js
if (cmd === "!trialreload") {
  const ok = await reloadTrialData();
  const s = getTrialStatus();
  const e = new EmbedBuilder()
    .setTitle(ok ? "🔄 Trial Data Reloaded" : "❌ Trial Data Reload Failed")
    .addFields(
      { name: "Loaded", value: ok ? "Yes" : "No", inline: true },
      { name: "From", value: s.from || "—" },
      { name: "Count", value: String(s.count), inline: true },
      { name: "Reason", value: s.reason || "—" },
      { name: "Paths Tried", value: (s.pathsTried?.length ? s.pathsTried.map(p => `• ${p}`).join("\n") : "—") }
    )
    .setColor(ok ? "Green" : "Red");
  return void msg.channel.send({ embeds: [e] });
}

  if (cmd === "!trial") {
    // Quick guard
    if (!QUESTIONS.length) {
      const st = getTrialStatus();
      return void msg.reply(
        "Trial data not loaded yet. Run **!trialreload**.\n" +
        (st.pathTried?.length ? "Paths tried:\n" + st.pathTried.map(p => `• ${p}`).join("\n") : "")
      );
    }

    // Already finished? show result
    const existingResult = await redis.get(RKEY(msg.author.id));
    if (existingResult) {
      const result = typeof existingResult === "string" ? JSON.parse(existingResult) : existingResult;
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

    // Ask next question (or finalize)
    const built = buildQuestionEmbed(msg.author.id, session.qIndex);
    if (!built) {
      const alignment =
        Object.entries(session.tally).sort((a, b) => b[1] - a[1])[0]?.[0] || "grey";

      const result = {
        userId: msg.author.id,
        alignment,
        score: session.tally,
        finishedAt: Date.now(),
        totalAnswered: session.answers?.length ?? 0,
      };

      await redis.set(RKEY(msg.author.id), JSON.stringify(result));
      await redis.del(SKEY(msg.author.id));

      const e = buildResultEmbed(result);
      return void msg.channel.send({ embeds: [e] });
    }

    const { embed, components } = built;
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
  if (!ix.customId?.startsWith("trial:answer")) return;

  const kv = parseId(ix.customId);
  if (!kv) return;

  const uid = ix.user.id;
  const qIndex = parseInt(kv.i, 10);
  const optIndex = parseInt(kv.a, 10);

  const lockedTry = await withClickLock(uid, async () => {
    const raw = await redis.get(SKEY(uid));
    if (!raw) {
      return { reply: { content: "No active trial. Run **!trial** to begin.", ephemeral: true } };
    }
    const session = typeof raw === "string" ? JSON.parse(raw) : raw;

    // stale button?
    if (qIndex !== session.qIndex) {
      return { reply: { content: "That prompt moved on. Answer the latest question above.", ephemeral: true } };
    }

    const q = getQuestion(qIndex);
    const opt = q.answers[optIndex];
    if (!opt) {
      return { reply: { content: "Invalid option.", ephemeral: true } };
    }

    // record
    const align = opt.alignment;
    session.tally[align] = (session.tally[align] || 0) + 1;
    session.answers.push({ qid: qIndex, alignment: align });

    if (qIndex < QUESTIONS.length - 1) {
      session.qIndex = qIndex + 1;
      await redis.set(SKEY(uid), JSON.stringify(session));
      const payload = buildQuestionEmbed(uid, session.qIndex);
      try {
        await ix.update({ embeds: [payload.embed], components: payload.components });
      } catch {
        await ix.reply({ embeds: [payload.embed], components: payload.components });
      }
      return {};
    }

    // final
    const alignment = decideAlignment(session.tally, "randomAmongTop");
    const result = { alignment, completedAt: Date.now(), score: session.tally };
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
    return void ix.reply({ content: "Processing that click—try again in a sec.", ephemeral: true });
  }
  if (lockedTry?.reply) {
    const { reply } = lockedTry;
    if (ix.deferred || ix.replied) return void ix.followUp(reply);
    return void ix.reply(reply);
  }
}
