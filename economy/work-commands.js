// economy/work-commands.js
import { EmbedBuilder } from "discord.js";
import { Redis } from "@upstash/redis";
import { addBalance, subBalance } from "./econ-core.js";
import { PermissionsBitField } from "discord.js";

const redis = Redis.fromEnv();

/** ============================================================================
 *  CONFIG
 *  Set ENFORCE_WORK_CHANNELS=1 in your Render env to force the correct channels.
 * ========================================================================== */

const ENFORCE = process.env.ENFORCE_WORK_CHANNELS === "1";

// Company → vendor alias + allowed channels (IDs preferred)
const VENDOR_ALIASES = {
  "Crimson Pantry": {
    alias: "pantry",
    channels: ["1427357566735880203"],
  },
  "Distorted Fleet Exports": {
    alias: "fleet",
    channels: ["1427357852804055160"],
  },
  "Stirred Vile": {
    alias: "vile",
    channels: ["1427357990394007592"], // #the-stirred-veil
  },
  "Distorted Realm Reserve": {
    alias: "bank",
    channels: ["1427358385581588657"],
  },
  "Distorted Casino": {
    alias: "casino",
    channels: ["1427358631610814484"],
  },
  "Distorted Crimson Reality": {
    alias: "reality",
    channels: ["1428520971010048051"],
  },
  "Distorted Fleet Charge": {
  alias: "charge",
  channels: ["1433493619192500275"], // or your channel ID if enforcing
  },
};

// Base payroll per shift by role title
function basePayForRole(title = "") {
  const t = title.toLowerCase();
  if (t.includes("hr manager")) return 750;
  if (t.includes("manager")) return 1000; // Sales/Bar/Pit/Branch/etc Manager
  if (
    t.includes("associate") ||
    t.includes("teller") ||
    t.includes("dealer") ||
    t.includes("bartender") ||
    t.includes("realtor")
  ) return 500;
  return 500;
}

const WORK_COOLDOWN_S = 45;

const ADMIN_BYPASS = process.env.ADMIN_BYPASS_WORK === "1"; // set to "1" in Render to enable
const isAdmin = (m) => !!m?.permissions?.has(PermissionsBitField.Flags.Administrator);
/** ============================================================================
 *  REDIS KEYS
 * ========================================================================== */

const JOB_ASSIGNED = (uid) => `job:assigned:${uid}`;
const SHIFT_KEY    = (uid) => `work:shift:${uid}`;         // { company, title, vendor, startedAt, events }
const SHIFT_DELTA  = (uid) => `work:shift:delta:${uid}`;   // int
const WORK_CD      = (uid) => `work:cd:${uid}`;            // ts seconds

/** ============================================================================
 *  HELPERS
 * ========================================================================== */

async function getUserJob(userId) {
  const rec = await redis.get(JOB_ASSIGNED(userId));
  return rec ? (typeof rec === "string" ? JSON.parse(rec) : rec) : null;
}
function companyToVendor(company) {
  return VENDOR_ALIASES[company]?.alias ?? null;
}
function channelMatches(meta, channel) {
  if (!meta?.channels || !meta.channels.length) return true;
  const arr = Array.isArray(meta.channels) ? meta.channels : [meta.channels];
  return arr.some((id) => String(id) === String(channel?.id));
}
function checkChannelOk(company, channel, member) {
  if (ADMIN_BYPASS && isAdmin(member)) return true;  // admin override
  if (!ENFORCE) return true;
  const meta = VENDOR_ALIASES[company];
  if (!meta) return true;
  return channelMatches(meta, channel);
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

/** ============================================================================
 *  EVENTS (per vendor)
 * ========================================================================== */

const EVENTS = {
  pantry: [
    { text: "Upsold premium olive oil to a foodie—commission secured.", delta: +45 },
    { text: "Price tag misprint—had to honor the discount.", delta: -20 },
    { text: "Restocked freezer like a speedrunner. Boss noticed.", delta: +25 },
    { text: "Soup-can pyramid collapse. Spectacular. Costly.", delta: -30 },
    { text: "Prevented a cart collision with elite footwork. Hero bonus.", delta: +15 },
    { text: "Double-scanned an item. Had to refund.", delta: -12 },
    { text: "Holiday rush mastery—kept the line moving. Tips rolled in.", delta: +35 },
    { text: "Forgot to rotate stock—expired yogurt discovered.", delta: -18 },
    { text: "Reunited lost kid with parents. Got tipped.", delta: +20 },
    { text: "Free sample frenzy—one goblin ate the tray. Manager sighed.", delta: -12 },
  ],
  fleet: [
    { text: "Closed a warranty bundle on a mid-tier sedan. Sweet commission.", delta: +120 },
    { text: "Gave away too much on a trade-in.", delta: -90 },
    { text: "Delivered a flawless test drive; customer signed on the spot.", delta: +150 },
    { text: "Forgot to file the DMV form—paperwork penalty.", delta: -40 },
    { text: "Upsold ceramic coating and floor mats.", delta: +80 },
    { text: "Customer ghosted after 3 hours of negotiation. Pain.", delta: -30 },
    { text: "Social post brought in a hot lead—bonus payout.", delta: +60 },
    { text: "Scratched a demo car with a key fob—oops.", delta: -120 },
    { text: "Negotiated like a Sith lord. Management slips you a bonus.", delta: +100 },
    { text: "Left the headlights on overnight—dead battery fee.", delta: -35 },
  ],
  vile: [
    { text: "Nailed a 5-drink round in 30 seconds flat. Tips!", delta: +70 },
    { text: "Shattered a martini glass mid-shake. Mood killer.", delta: -25 },
    { text: "Recommended a perfect pairing; customer raved.", delta: +40 },
    { text: "Overpoured the expensive whiskey. Oof.", delta: -45 },
    { text: "Invented a crowd-favorite: ‘Distorted Sunset.’", delta: +55 },
    { text: "Wrong order sent out twice. Refund time.", delta: -30 },
    { text: "Handled a rowdy table with charm and zero police.", delta: +35 },
    { text: "Spilled a tray on the floor… and your shoes.", delta: -20 },
    { text: "Happy hour crush managed like a champ.", delta: +50 },
    { text: "Forgot to ring in a drink. Comped.", delta: -18 },
  ],
  bank: [
    { text: "Balanced the vault to the cent. Manager slow-clapped.", delta: +40 },
    { text: "Mismatched account digits—had to reverse a transfer.", delta: -35 },
    { text: "Upsold a high-yield account. Commission hits.", delta: +60 },
    { text: "ATM jam on your watch. Service call charge.", delta: -25 },
    { text: "Saved a client from a phishing scam. Hero bonus.", delta: +45 },
    { text: "Forgot to notarize a form. Back to square one.", delta: -20 },
    { text: "Cross-sold a small business loan lead.", delta: +75 },
    { text: "Miscounted cash drawer by 10 DD. You covered it.", delta: -10 },
    { text: "Calmed a line after a system hiccup. Customer kudos.", delta: +30 },
    { text: "Printed the wrong statements for three clients.", delta: -22 },
  ],
  casino: [
    { text: "Kept the table moving—players loved you. Tips stack.", delta: +85 },
    { text: "Mispaid a blackjack. Had to reconcile.", delta: -60 },
    { text: "Spotted a cheat attempt. Security praises you.", delta: +90 },
    { text: "Miscalculated roulette payout. Math strikes back.", delta: -45 },
    { text: "High-roller tipped after a good run.", delta: +120 },
    { text: "Argued with a sore loser—supervisor intervention.", delta: -30 },
    { text: "Flawless dealing for an hour straight. Flow state bonus.", delta: +75 },
    { text: "Dropped a whole rack of chips. Embarrassing.", delta: -25 },
    { text: "Taught a newbie the rules; they stuck around.", delta: +35 },
    { text: "Misread hand signals. Minor penalty.", delta: -20 },
  ],
  reality: [
    { text: "Hosted an open house with stellar turnout.", delta: +70 },
    { text: "Forgot the lockbox code—late start.", delta: -25 },
    { text: "Negotiated a clean offer over asking.", delta: +110 },
    { text: "Misplaced a key for an hour. Yikes.", delta: -30 },
    { text: "Staged a room perfectly—buyers swooned.", delta: +55 },
    { text: "Inspection surprise—deal delayed.", delta: -40 },
    { text: "Found an off-market gem. Lead bonus.", delta: +80 },
    { text: "Printed brochures with the wrong phone number.", delta: -20 },
    { text: "Client testimonial goes viral. Referral bonus.", delta: +65 },
    { text: "Double-booked a showing. Awkward shuffles ensued.", delta: -18 },
  ],
  charge: [
    { text: "Calibrated dock arms and sped up a slow queue. Efficiency bonus.", delta: +25 },
    { text: "Mis-scanned a plate; comped a session.", delta: -20 },
    { text: "Upsold a fast-charge boost pack.", delta: +35 },
    { text: "Left a bay blocked after a test—small penalty.", delta: -15 },
    { text: "Guided a tourist through the app mess. Tip received.", delta: +18 },
    { text: "Replaced a frayed cable jacket.", delta: -10 },
    { text: "Handled a surge hour without delays.", delta: +28 },
    { text: "Printer jam ate five receipts.", delta: -8 },
    { text: "Cleaned bays and cleared cones like a pro.", delta: +12 },
    { text: "Wrong rate applied—refund processed.", delta: -14 },
],

};

/** ============================================================================
 *  COMMANDS
 * ========================================================================== */

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  // --------- !clockin [vendorAlias] ---------
 // --------- !clockin [vendorAlias]
if (cmd === "!clockin") {
  let job = await getUserJob(msg.author.id);
  const userAlias = parts[1]?.toLowerCase();

  // Admins can clock in without a job if ADMIN_BYPASS=1 and they provide an alias
  if (!job && ADMIN_BYPASS && isAdmin(msg.member) && userAlias) {
    const entry = Object.entries(VENDOR_ALIASES).find(([, v]) => v.alias === userAlias);
    if (!entry) return msg.reply("Unknown vendor alias. Try one of: pantry, fleet, vile, bank, casino, reality.");
    const [company] = entry;
    job = { company, title: "Admin Temp Shift" };
  }

  if (!job) return msg.reply("You don't have a job yet. Use `!job` to get assigned first.");

  if (!checkChannelOk(job.company, msg.channel, msg.member)) {
    return msg.reply("You need to clock in from your workplace channel.");
  }

  const existing = await getShift(msg.author.id);
  if (existing) {
    return msg.reply(`You're already clocked in at **${existing.company}** as **${existing.title}**.`);
  }

  const expectedAlias = companyToVendor(job.company);
  if (
    userAlias && expectedAlias && userAlias !== expectedAlias &&
    !(ADMIN_BYPASS && isAdmin(msg.member))
  ) {
    return msg.reply(`That vendor doesn't match your job. You work at **${job.company}**.`);
  }

  const shift = {
    company: job.company,
    title: job.title,
    vendor: expectedAlias || userAlias || null,
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

  if (!checkChannelOk(shift.company, msg.channel, msg.member)) {
    return msg.reply("You need to work from your workplace channel.");
  }

  const vendor = companyToVendor(shift.company) || shift.vendor || "pantry";
  const table = EVENTS[vendor];
  if (!table || !table.length) {
    return msg.reply("This workplace doesn't have tasks yet. Ping the admin to add events.");
  }

  // Admins can skip cooldown if ADMIN_BYPASS=1
  const cdLeft = (ADMIN_BYPASS && isAdmin(msg.member)) ? 0 : await checkCooldown(msg.author.id);
  if (cdLeft > 0) {
    return msg.reply(`⏳ Take a breath—next task in **${cdLeft}s**.`);
  }

  const event = table[Math.floor(Math.random() * table.length)];
  let deltaApplied = 0;

  try {
    if (event.delta > 0) {
      await addBalance(msg.author.id, event.delta);
      deltaApplied = event.delta;
    } else if (event.delta < 0) {
      const abs = Math.abs(event.delta);
      try {
        await subBalance(msg.author.id, abs);
        deltaApplied = event.delta;
      } catch {
        // couldn't cover negative; narrate but don't go below 0
        deltaApplied = 0;
      }
    }
    await addShiftDelta(msg.author.id, deltaApplied);
    const updated = { ...shift, events: (shift.events || 0) + 1 };
    await setShift(msg.author.id, updated);
  } catch {
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

  if (!checkChannelOk(shift.company, msg.channel, msg.member)) {
    return msg.reply("Clock out from your workplace channel.");
  }

  const base = basePayForRole(shift.title);
  const delta = await getShiftDelta(msg.author.id);
  const total = base + delta;

  if (total > 0) await addBalance(msg.author.id, total);
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
