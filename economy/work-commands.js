// economy/work-commands.js
import { EmbedBuilder, PermissionsBitField } from "discord.js";
import { Redis } from "@upstash/redis";
import { getBalance, addBalance, subBalance } from "./econ-core.js";

const redis = Redis.fromEnv();

/** CONFIG *******************************************************************/

// Optional: enforce that !clockin / !work / !clockout must be used in the correct channel.
// Set ENFORCE_WORK_CHANNELS=1 in Render to enable.
const ENFORCE = process.env.ENFORCE_WORK_CHANNELS === "1";

// Map job "company" names (from job-command.js) to a short vendor alias and (optionally) a channel name.
const VENDOR_ALIASES = {
  "Crimson Pantry": { alias: "pantry", channel: "crimson-pantry" },
  "Distorted Fleet Exports": { alias: "fleet", channel: "distorted-fleet-exports" },
  "Stirred Vile": { alias: "vile", channel: "stirred-vile" },
  "Distorted Realm Reserve": { alias: "bank", channel: "distorted-realm-reserve" },
  "Distorted Casino": { alias: "casino", channel: "distorted-casino" },
  "Distorted Crimson Reality": { alias: "reality", channel: "distorted-crimson-reality" },
};

// Role → base pay rules
function basePayForRole(title = "") {
  const t = title.toLowerCase();
  if (t.includes("hr manager")) return 750;
  if (t.includes("manager")) return 1000; // Sales Manager, Bar Manager, Pit Manager, Branch Manager, etc.
  // associate tier keywords
  if (
    t.includes("associate") ||
    t.includes("teller") ||
    t.includes("dealer") ||
    t.includes("bartender") ||
    t.includes("realtor") // treat "Lead Realtor" as associate tier unless you want a special rate
  ) return 500;
  // default to associate tier if unknown
  return 500;
}

// Work cooldown (seconds) to prevent spam
const WORK_COOLDOWN_S = 45;

/** PERSISTENCE KEYS **********************************************************/

const JOB_ASSIGNED = (uid) => `job:assigned:${uid}`;            // from job-command.js
const SHIFT_KEY    = (uid) => `work:shift:${uid}`;              // JSON: { company, title, vendor, startedAt, events }
const SHIFT_DELTA  = (uid) => `work:shift:delta:${uid}`;        // integer: net delta from !work events this shift
const WORK_CD      = (uid) => `work:cd:${uid}`;                 // cooldown stamp (ts seconds)

/** HELPERS *******************************************************************/

async function getUserJob(userId) {
  const rec = await redis.get(JOB_ASSIGNED(userId));
  return rec ? (typeof rec === "string" ? JSON.parse(rec) : rec) : null;
}

function companyToVendor(company) {
  return VENDOR_ALIASES[company] ? VENDOR_ALIASES[company].alias : null;
}

function checkChannelOk(company, channel) {
  if (!ENFORCE) return true;
  const meta = VENDOR_ALIASES[company];
  if (!meta?.channel) return true; // no binding set, allow
  return channel?.name?.toLowerCase() === meta.channel.toLowerCase();
}

async function getShift(userId) {
  const data = await redis.get(SHIFT_KEY(userId));
  return data ? (typeof data === "string" ? JSON.parse(data) : data) : null;
}
async function setShift(userId, obj) {
  await redis.set(SHIFT_KEY(userId), JSON.stringify(obj));
}
async function clearShift(userId) {
  await redis.del(SHIFT_KEY(userId));
  await redis.del(SHIFT_DELTA(userId));
}

async function addShiftDelta(userId, delta) {
  await redis.incrby(SHIFT_DELTA(userId), delta);
}
async function getShiftDelta(userId) {
  return parseInt(await redis.get(SHIFT_DELTA(userId))) || 0;
}

async function checkCooldown(userId) {
  const now = Math.floor(Date.now() / 1000);
  const until = parseInt(await redis.get(WORK_CD(userId))) || 0;
  const left = until - now;
  if (left > 0) return left;
  await redis.set(WORK_CD(userId), now + WORK_COOLDOWN_S);
  return 0;
}

/** EVENTS ********************************************************************/
/**
 * Event tables per vendor alias.
 * Each event => { text, delta } where delta applies immediately to wallet + shift delta.
 * Start with CRIMSON PANTRY; we’ll add more vendors later.
 */

const EVENTS = {
  pantry: [
    { text: "You upsold a premium olive oil to a foodie. Commission hits nice.", delta: +45 },
    { text: "Price tag misprint—had to honor it. Ouch.", delta: -20 },
    { text: "Helped restock the freezer faster than a speedrun. Boss is impressed.", delta: +25 },
    { text: "Knocked over a pyramid of soup cans. Dramatic. Loud. Costly.", delta: -30 },
    { text: "Prevented a cart collision with elite footwork. Hero bonus.", delta: +15 },
    { text: "Gave a regular an extra coupon by mistake.", delta: -10 },
    { text: "Holiday rush mastery: moved the line like a conductor. Tips!", delta: +35 },
    { text: "Left the deli scale on tare. Chaos ensued.", delta: -18 },
    { text: "Found a lost kid and reunited them. Parent tipped you.", delta: +20 },
    { text: "Free sample frenzy — gave out the entire tray to one goblin. Manager facepalmed.", delta: -12 },
  ],
  // TODO: add fleet / vile / bank / casino / reality next
};

/** COMMANDS ******************************************************************/

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  // --------- !clockin [vendorAlias]
  if (cmd === "!clockin") {
    const job = await getUserJob(msg.author.id);
    if (!job) return msg.reply("You don't have a job yet. Use `!job` to get assigned first.");

    if (!checkChannelOk(job.company, msg.channel)) {
      return msg.reply("You need to clock in from your workplace channel.");
    }

    const existing = await getShift(msg.author.id);
    if (existing) {
      return msg.reply(`You're already clocked in at **${existing.company}** as **${existing.title}**.`);
    }

    // If user provided a vendor alias, sanity-check it matches their company
    const userAlias = parts[1]?.toLowerCase();
    const expectedAlias = companyToVendor(job.company);
    if (userAlias && expectedAlias && userAlias !== expectedAlias) {
      return msg.reply(`That vendor doesn't match your job. You work at **${job.company}**.`);
    }

    const shift = {
      company: job.company,
      title: job.title,
      vendor: expectedAlias, // null is allowed if unmapped; we only gate by channel when ENFORCE=1
      startedAt: Date.now(),
      events: 0,
    };
    await setShift(msg.author.id, shift);
    await addShiftDelta(msg.author.id, 0);

    const basePay = basePayForRole(job.title);
    const e = new EmbedBuilder()
      .setTitle("🕒 Shift Started")
      .setDescription(
        `Clocked in at **${job.company}** as **${job.title}**.\n` +
        `Base shift pay on clockout: **${basePay} DD**.\n` +
        `Run **!work** to handle tasks/events and stack bonuses (or penalties).`
      )
      .setColor("Green");
    return msg.channel.send({ embeds: [e] });
  }

  // --------- !work
  if (cmd === "!work") {
    const shift = await getShift(msg.author.id);
    if (!shift) return msg.reply("You're not clocked in. Use `!clockin` first.");

    if (!checkChannelOk(shift.company, msg.channel)) {
      return msg.reply("You need to work from your workplace channel.");
    }

    // vendor alias drives event table; fall back to no-op if unknown
    const vendor = companyToVendor(shift.company) || shift.vendor || "pantry";
    const table = EVENTS[vendor];
    if (!table || !table.length) {
      return msg.reply("This workplace doesn't have tasks yet. Ping the admin to add events.");
    }

    const cdLeft = await checkCooldown(msg.author.id);
    if (cdLeft > 0) {
      return msg.reply(`⏳ Take a breath—next task available in **${cdLeft}s**.`);
    }

    // pick random event & apply
    const idx = Math.floor(Math.random() * table.length);
    const event = table[idx];
    let deltaApplied = 0;

    try {
      if (event.delta > 0) {
        await addBalance(msg.author.id, event.delta);
        deltaApplied = event.delta;
      } else if (event.delta < 0) {
        // don’t allow negative wallet; clamp if needed
        const abs = Math.abs(event.delta);
        try {
          await subBalance(msg.author.id, abs);
          deltaApplied = event.delta;
        } catch {
          // insufficient funds; apply what we can (0) and narrate it
          deltaApplied = 0;
        }
      }
      await addShiftDelta(msg.author.id, deltaApplied);
      // bump event count
      const updated = { ...shift, events: (shift.events || 0) + 1 };
      await setShift(msg.author.id, updated);
    } catch (err) {
      return msg.reply("Task failed to process—try again in a moment.");
    }

    const sign = deltaApplied >= 0 ? "+" : "−";
    const e = new EmbedBuilder()
      .setTitle("🧰 Task Completed")
      .setDescription(`${event.text}`)
      .addFields({ name: "Shift delta", value: `${sign}${Math.abs(deltaApplied)} DD`, inline: true })
      .setColor(deltaApplied >= 0 ? "Green" : "Orange");
    return msg.channel.send({ embeds: [e] });
  }

  // --------- !clockout
  if (cmd === "!clockout") {
    const shift = await getShift(msg.author.id);
    if (!shift) return msg.reply("You're not clocked in.");

    if (!checkChannelOk(shift.company, msg.channel)) {
      return msg.reply("Clock out from your workplace channel.");
    }

    const base = basePayForRole(shift.title);
    const delta = await getShiftDelta(msg.author.id);
    const total = base + delta;

    if (total > 0) await addBalance(msg.author.id, total);
    // If negative total somehow, we won't subtract at clockout; negatives were already applied on !work.

    await clearShift(msg.author.id);

    const summary = new EmbedBuilder()
      .setTitle("🧾 Shift Summary")
      .setDescription(
        `**${shift.company}** — **${shift.title}**\n` +
        `Tasks completed: **${shift.events || 0}**\n` +
        `Base pay: **${base} DD**\n` +
        `Task delta: **${delta >= 0 ? "+" : "−"}${Math.abs(delta)} DD**\n` +
        `**Paid:** ${total} DD`
      )
      .setColor("Blue");
    return msg.channel.send({ embeds: [summary] });
  }
}
