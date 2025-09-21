// index.js
import express from "express";
import crypto from "crypto";
import fs from "fs";
import { BARTENDER_FIRST, BARTENDER_LAST } from "./bartender-names.js";
import { fetch as undiciFetch } from "undici";
const fetch = globalThis.fetch || undiciFetch;

// ---------- Twitch EventSub config ----------
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || "";
const TWITCH_EVENTSUB_SECRET = process.env.TWITCH_EVENTSUB_SECRET || "";
const TWITCH_BROADCASTER_ID = process.env.TWITCH_BROADCASTER_ID || "";
const TWITCH_REWARD_ID = process.env.TWITCH_REWARD_ID || ""; // optional

// ---------- StreamElements Loyalty API (auto-award) ----------
const SE_JWT = process.env.SE_JWT || "";
const SE_CHANNEL_ID = process.env.SE_CHANNEL_ID || "";

// ---------- Award log (optional, keeps /speciallast working) ----------
const AWARD_LOG_FILE = "./award-log.json";
function logSpecialAward(entry) {
  try {
    const arr = fs.existsSync(AWARD_LOG_FILE)
      ? JSON.parse(fs.readFileSync(AWARD_LOG_FILE, "utf8"))
      : [];
    arr.push(entry);
    fs.writeFileSync(AWARD_LOG_FILE, JSON.stringify(arr.slice(-200), null, 2));
  } catch {}
}

/**
 * Attempt to add points to a user.
 * Returns { ok:boolean, status:number, body:string }
 */
async function seAddPoints(username, amount) {
  const cleanUser = String(username || "").replace(/^@/, "").trim().toLowerCase();
  if (!SE_JWT || !SE_CHANNEL_ID || !cleanUser || !Number.isInteger(amount) || amount <= 0) {
    return { ok: false, status: 0, body: "missing params/env" };
  }
  const url = `https://api.streamelements.com/kappa/v2/points/${encodeURIComponent(
    SE_CHANNEL_ID
  )}/${encodeURIComponent(cleanUser)}/${amount}`;

  try {
    const resp = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${SE_JWT}`,
        Accept: "application/json",
      },
    });
    let bodyText = "";
    try { bodyText = await resp.text(); } catch {}
    return { ok: resp.ok, status: resp.status, body: bodyText?.slice(0, 300) || "" };
  } catch (err) {
    return { ok: false, status: -1, body: String(err).slice(0, 300) };
  }
}

/** Fire-and-forget award + log; never blocks Nightbot response */
function awardAndLogLater(user, drink, date, amount) {
  setImmediate(async () => {
    const result = await seAddPoints(user, amount);
    try {
      logSpecialAward({
        user,
        drink,
        amount,
        date,
        time: new Date().toISOString(),
        awarded: result.ok,
        status: result.status,
        body: result.body,
      });
    } catch {}
  });
}

const app = express();
app.disable("x-powered-by");

// ---------------- Shared helpers ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomBartenderName = () => `${sample(BARTENDER_FIRST)} ${sample(BARTENDER_LAST)}`;

// -------- Daily Drink Special (bar side) --------
const DRINK_KEYS = ["vodka","whiskey","gin","rum","tequila","lightbeer","darkbeer","redwine","espresso","bourbon"];
const DAILY_BONUS = 1000;
const SPECIAL_SALT = process.env.SPECIAL_SALT || "distorted-realm-salt";

const dateKeyNY = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};
function hashToIndex(str, mod) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Number(h % mod);
}
function getTodaysSpecial() {
  const key = dateKeyNY();
  const idx = hashToIndex(`${key}:${SPECIAL_SALT}`, DRINK_KEYS.length);
  return { date: key, drink: DRINK_KEYS[idx] };
}

// ---------------- Quip pools (bar) ----------------
const LINES = [
  "Careful, that one's potent.",
  "Tip jar’s over there 👉 https://streamelements.com/d4rth_distortion/tip",
  "Another round already?",
  "I like the way you use that straw 😏",
  "This one’s made with love 😘",
  "Wish I could drink with you...",
  "This full glass is opposite of my empty life...",
  "You about to get cut off buddy!",
  "Ay lil shawty, can I have your number?",
  "We didn't have the liquor you wanted, so I substituted it with Everclear. It's all the same.",
  "Hell yeah I suck toes! *puts phone down* my bad, here’s your drink.",
  "Enjoy!",
  "*looks you up and down* that’s the outfit you chose tonight? *shrugs* couldn’t be me?",
  "Don’t spill it on the carpet.",
  "Here’s your drink, now get out my face.",
];

const COMPLAINTS = [
  (user, issue) => `Bartender to ${user}: “Oh, ${issue || "that drink"} not to your liking? Fine, but the jukebox still takes quarters.”`,
  (user, issue) => `Bartender to ${user}: “Not enough umbrella in your ${issue || "cocktail"}? We ran out after the last pirate convention.”`,
  (user, issue) => `Bartender to ${user}: “That ${issue || "drink"} comes with a free life lesson: don’t trust the specials board.”`,
  (user, issue) => `Bartender to ${user}: “Complain all you want, but my pour was measured by the gods themselves.”`,
  (user, issue) => `Bartender to ${user}: “Listen I literally don't get paid enough to deal. Take it up with D4rth Distortion.”`,
  (user, issue) => `Bartender to ${user}: “*crashes out* I DONT GIVE A DAMN ABOUT YOU OR THAT DRINK! FOH!”`,
  (user, issue) => `Bartender to ${user}: “Ah yes, ${issue || "your drink"}… we call that ‘house flavor’. It’s rustic.”`,
  (user, issue) => `Bartender to ${user}: “No refunds, but I’ll throw in an extra olive. That’s our version of customer service.”`,
  (user, issue) => `Bartender to ${user}: “If you wanted perfection, you should’ve gone to Hogwarts, not my bar.”`,
  (user, issue) => `Bartender to ${user}: “OMG I'm so sorry! Heres a new drink for you, please don't tell D4rth Distortion.”`,
  (user, issue) => `Bartender to ${user}: “Alright ${user}, I’ll remake it… but this time I’m charging you emotional labor.”`,
];

const STORM_OFF = [
  (user) => `The bartender glares at ${user}, rips off the apron, and storms out screaming “Y’all don’t deserve me!”`,
  (user) => `Bartender yeets the bar rag, mutters something unholy about ${user}, and moonwalks out the door.`,
  (user) => `“I’m unionized with the Sith now,” the bartender hisses at ${user} before force-sliding out.`,
  (user) => `The bartender flips a coaster at ${user} like a ninja star and vanishes into the night.`,
  (user) => `Keys slam. “I quit this pixel bar,” they snarl at ${user}, exiting stage left in dramatic fashion.`,
];

const CHEERS = [
  (user) => `Bartender to ${user}: “Appreciate you! May your ice always clink and your Wi-Fi never drop.”`,
  (user) => `Bartender to ${user}: “Cheers, legend. Next one comes with extra style points.”`,
  (user) => `Bartender to ${user}: “Verified: you have excellent taste and impeccable vibes.”`,
  (user) => `Bartender to ${user}: “Gratitude noted. Hydration and happiness incoming.”`,
  (user) => `Bartender to ${user}: “Thanks fam. Tip jar smiles upon you.”`,
];

// ---------------- State: fired counter, per-user drinks, and session totals ----------------
let firedCount = 0;
let drinksServedCount = 0;
let cheersCount = 0;
let fightsCount = 0;

const drinkCounts = new Map();
const keyUser = (u) => String(u || "").trim().toLowerCase();
const bumpDrinkCount = (u) => {
  const k = keyUser(u);
  if (!k) return 0;
  const next = (drinkCounts.get(k) || 0) + 1;
  drinkCounts.set(k, next);
  return next;
};

// --- Daily Special: one award per stream (auto-resets at midnight ET) ---
let specialAward = { date: null, awarded: false };
function ensureSpecialFlagForToday() {
  const today = dateKeyNY();
  if (specialAward.date !== today) {
    specialAward = { date: today, awarded: false };
  }
  return specialAward;
}

// ---------------- Health routes ----------------
app.get("/", (_req, res) => res.type("text/plain").send("OK"));
app.get("/healthz", (_req, res) => res.type("text/plain").send("OK"));

// GET /special -> "Today's special is: bourbon (+1000)"
app.get("/special", (_req, res) => {
  const { date, drink } = getTodaysSpecial();
  res.type("text/plain").send(`Today's special (${date}) is: ${drink} (+${DAILY_BONUS})`);
});

// ---------------- FOLLOWUP (Nightbot uses for drinks) ----------------
app.get("/followup", async (req, res) => {
  const bare = req.query.bare === "1";
  const user = (req.query.user || "").toString();
  const drink = (req.query.drink || "").toString().slice(0, 40);
  const delayMs = Math.min(parseInt(req.query.delayMs || "2500", 10) || 2500, 4500);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  if (!bare && !user) {
    return res.status(400).type("text/plain").send("Missing ?user= parameter");
  }

  await sleep(delayMs);

  const base = sample(LINES);
  const line = typeof base === "string" && base.trim() ? base : "Enjoy!";

  // per-user drink counting + milestones + daily special
  let tail = "";
  if (user && drink) {
    const count = bumpDrinkCount(user);
    drinksServedCount += 1;
    tail = ` That’s drink #${count} tonight.`;
    if (count === 3) tail += " Remember to hydrate. 💧";
    if (count === 5) tail += " Easy there, champion. 🛑 Hydration check!";
    if (count === 7) tail += " Why are you crying and dancing on the table shirtless?";
    if (count === 10) tail += " 🚕 Call them an uber. Security get them out of here!";

    const { date, drink: todaySpecial } = getTodaysSpecial();
    const flag = ensureSpecialFlagForToday();
    if (drink.toLowerCase() === todaySpecial) {
      if (!flag.awarded) {
        flag.awarded = true;
        tail += ` 🎯 Daily Special! +${DAILY_BONUS} Distortion Dollars`;
        awardAndLogLater(user, drink, date, DAILY_BONUS);
      }
    }
  }

  const msg = bare ? `${line}${tail}` : `Bartender to ${user}: ${line}${tail}`;
  return res.type("text/plain").send(msg);
});

// ---------------- COMPLAINT ----------------
app.get("/complaint", async (req, res) => {
  const bare = req.query.bare === "1";
  const user = (req.query.user || "").toString();
  const issue = (req.query.issue || "").toString().slice(0, 120);
  const delayMs = Math.min(parseInt(req.query.delayMs || "2000", 10) || 2000, 4500);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  await sleep(delayMs);
  const full = sample(COMPLAINTS)(user || "guest", issue);
  if (bare) {
    const stripped = full.replace(/^Bartender to .*?:\s*/, "");
    return res.type("text/plain").send(stripped);
  }
  return res.type("text/plain").send(full);
});

// ---------------- FIRE PACK ----------------
app.get("/firepack", async (req, res) => {
  const user = (req.query.user || "").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "5000", 10) || 5000, 8000);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  await sleep(delayMs);
  const storm = sample(STORM_OFF)(user || "the Realm");
  firedCount += 1;
  const hire = `A new bartender, ${randomBartenderName()}, has now taken over the Distorted Realm bar to better serve the Realm. (Fired so far: ${firedCount})`;
  return res.type("text/plain").send(`${storm} ${hire}`);
});

// ---------------- CHEERS ----------------
app.get("/cheers", async (req, res) => {
  const bare = req.query.bare === "1";
  const user = (req.query.user || "").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "1500", 10) || 1500, 4500);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  await sleep(delayMs);
  cheersCount += 1;
  const full = sample(CHEERS)(user || "friend");
  if (bare) {
    const stripped = full.replace(/^Bartender to .*?:\s*/, "");
    return res.type("text/plain").send(stripped);
  }
  return res.type("text/plain").send(full);
});

// --- FIGHT tracking (silent) ---
const trackFightHandler = (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  fightsCount += 1;
  return res.status(204).send();
};
app.get("/trackfight", trackFightHandler);
app.get("/trackfight2", trackFightHandler);
app.get("/track/fight", trackFightHandler);

// ---------------- Utility & Summary ----------------
app.get("/firedcount", (_req, res) => {
  return res.type("text/plain").send(`Bartenders fired so far: ${firedCount}`);
});
app.get("/drinks", (req, res) => {
  const user = (req.query.user || "").toString();
  const k = keyUser(user);
  const n = k ? drinkCounts.get(k) || 0 : 0;
  const who = user || "Guest";
  res.type("text/plain").send(`${who} has ${n} drink${n === 1 ? "" : "s"} tonight.`);
});
app.get("/fightscount", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  res.type("text/plain").send(`Fights so far: ${fightsCount}`);
});
app.get("/speciallast", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  try {
    if (!fs.existsSync(AWARD_LOG_FILE)) return res.type("text/plain").send("No awards logged yet.");
    const data = JSON.parse(fs.readFileSync(AWARD_LOG_FILE, "utf8"));
    const last = data[data.length - 1];
    if (!last) return res.type("text/plain").send("No awards logged yet.");
    const txt = `last award -> user: ${last.user}, drink: ${last.drink}, amount: ${last.amount}, ok: ${last.awarded}, status: ${last.status}`;
    return res.type("text/plain").send(txt);
  } catch {
    return res.status(500).type("text/plain").send("Error reading last award");
  }
});
app.get("/end", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const summary = `Session Summary: Bartenders fired: ${firedCount} | Drinks served: ${drinksServedCount} | Cheers given: ${cheersCount} | Fights broke out: ${fightsCount}`;
  res.type("text/plain").send(summary);
});
app.get("/resetdrinks", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  if (user) {
    drinkCounts.delete(keyUser(user));
    return res.type("text/plain").send(`Reset drink counter for ${user}.`);
  }
  drinkCounts.clear();
  res.type("text/plain").send("Reset all drink counters.");
});
app.get("/resetfired", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  firedCount = 0;
  res.type("text/plain").send("Fired counter reset to 0");
});
app.get("/resetall", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  firedCount = 0; drinksServedCount = 0; cheersCount = 0; fightsCount = 0; drinkCounts.clear();
  specialAward = { date: dateKeyNY(), awarded: false };
  res.type("text/plain").send("All counters reset.");
});
app.get("/debug/award", async (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  const amount = parseInt(req.query.amount || "0", 10);
  const result = await seAddPoints(user, amount);
  return res.type("text/plain").send(`award test -> ok: ${result.ok}, status: ${result.status}, body: ${result.body}`);
});

// ---------------- Twitch EventSub (webhook) ----------------
app.post("/twitch/eventsub", express.raw({ type: "application/json" }), async (req, res) => {
  const msgId = req.header("twitch-eventsub-message-id");
  const ts = req.header("twitch-eventsub-message-timestamp");
  const sig = req.header("twitch-eventsub-message-signature");
  if (!msgId || !ts || !sig) return res.status(400).send("missing headers");
  const age = Math.abs(Date.now() - Date.parse(ts));
  if (age > 10 * 60 * 1000) return res.status(403).send("stale");

  const hmac = crypto.createHmac("sha256", TWITCH_EVENTSUB_SECRET);
  hmac.update(msgId + ts + req.body);
  const expected = "sha256=" + hmac.digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
      return res.status(403).send("bad signature");
    }
  } catch {
    return res.status(403).send("bad signature");
  }

  const messageType = req.header("twitch-eventsub-message-type");
  const payload = JSON.parse(req.body.toString("utf8"));
  if (messageType === "webhook_callback_verification") {
    return res.status(200).type("text/plain").send(payload.challenge);
  }
  if (messageType === "revocation") {
    console.warn("EventSub revoked:", payload?.subscription?.status);
    return res.sendStatus(200);
  }
  if (messageType === "notification") {
    try {
      const subType = payload?.subscription?.type;
      const ev = payload?.event;
      if (subType === "channel.channel_points_custom_reward_redemption.add") {
        const title = (ev?.reward?.title || "").toLowerCase();
        const rewardId = ev?.reward?.id || "";
        const login = ev?.user_login || "";
        const matchesId = TWITCH_REWARD_ID && rewardId === TWITCH_REWARD_ID;
        const matchesTitle = title === "first";
        if ((matchesId || matchesTitle) && login) {
          const result = await seAddPoints(login, 200);
          logSpecialAward({
            user: login,
            drink: "channel-redeem:first",
            amount: 200,
            date: dateKeyNY(),
            time: new Date().toISOString(),
            awarded: result.ok,
            status: result.status,
            body: result.body,
          });
        }
      }
    } catch (e) {
      console.error("EventSub handler error:", e);
    }
    return res.sendStatus(200);
  }
  return res.sendStatus(200);
});


// ===================== GRASS ENTREPRENEUR (revamped) =====================
// All flower types + brownies + gummies.
// Flowers: buy +8oz, roll up -2oz
// Brownies: buy +10 (pieces), eat -1
// Gummies: buy +10 (pieces), chew -1

// Product catalog
const FLOWER_LIST = [
  { slug:"sithshade", name:"Sithshade Indica" },
  { slug:"vadersbreath", name:"Vader’s Breath" },
  { slug:"kyberkush", name:"Crimson Kyber Kush" },
  { slug:"obsidianog", name:"Obsidian OG" },
  { slug:"darksidediesel", name:"Dark Side Diesel" },
  { slug:"acolytehaze", name:"Acolyte Haze" },
  { slug:"phantomnebula", name:"Phantom Nebula" },
  { slug:"dathomirdream", name:"Dathomir Dream" }
];

const PRODUCTS = {
  // Flowers: unit=oz, buyInc=8, consumeInc=2
  ...Object.fromEntries(FLOWER_LIST.map(f => [f.slug, {kind:"flower", unit:"oz", name:f.name, buyInc:8, consumeInc:2}])),
  // Edibles
  brownies: { kind:"brownie", unit:"pcs", name:"Night Market Brownies", buyInc:10, consumeInc:1 },
  gummies:  { kind:"gummy",  unit:"pcs", name:"Crimson Citrus Gummies", buyInc:10, consumeInc:1 }
};

// Storage: Map<userLower, Map<slug, number>>
const grassInv = new Map();

const userKey = u => String(u || "").trim().toLowerCase();
const getProduct = slug => PRODUCTS[String(slug || "").trim().toLowerCase()] || null;

function addInv(user, slug, amount) {
  const u = userKey(user); if (!u) return 0;
  if (!grassInv.has(u)) grassInv.set(u, new Map());
  const bag = grassInv.get(u);
  const next = (bag.get(slug) || 0) + amount;
  bag.set(slug, next);
  return next;
}
function subInv(user, slug, amount) {
  const u = userKey(user); if (!u) return { ok:false, left:0 };
  const bag = grassInv.get(u); if (!bag) return { ok:false, left:0 };
  const have = bag.get(slug) || 0;
  if (have < amount) return { ok:false, left:have };
  const left = have - amount;
  if (left === 0) bag.delete(slug); else bag.set(slug, left);
  if (bag.size === 0) grassInv.delete(u);
  return { ok:true, left };
}
function biggestFlowerSlug(user) {
  const u = userKey(user);
  const bag = grassInv.get(u); if (!bag) return null;
  let best = null, max = -1;
  for (const [slug, qty] of bag.entries()) {
    const p = getProduct(slug);
    if (p?.kind === "flower" && qty > max) { best = slug; max = qty; }
  }
  return best;
}

const WEED_QUIPS = [
  (u,p) => `“Keep it discreet, ${u}. ${p} pairs with lo-fi beats and good vibes.”`,
  (u,p) => `“Shadow vendor nods. ${p} acquired; snacks recommended.”`,
  (u,p) => `“Receipt printed in Sith ink. ${p} secured.”`,
  (u,p) => `“Be wise, ${u}. ${p} respects responsible chill.”`,
  (u,p) => `“Stocked up. ${p} unlocks +2 Vibes.”`
];
const ROLLUP_EFFECTS = [
  "exhales a perfect ring and contemplates the galaxy.",
  "finds the overlay surprisingly profound.",
  "initiates Operation: Snack Run.",
  "laughs at a silent meme for 12 seconds.",
  "nods to the beat like a sage."
];

// Mode router (so SE and Nightbot can get different wording)
function buildLinesForBuy({ user, product, newTotal, amount }) {
  const seLine = `${user} has bought ${amount}${product.unit === "oz" ? "oz" : ""} of ${product.name}, they now have ${newTotal}${product.unit === "oz" ? "oz" : ""}.`;
  const nbLine = WEED_QUIPS[Math.floor(Math.random() * WEED_QUIPS.length)](user, product.name);
  return { seLine, nbLine };
}
function buildLinesForConsume({ user, product, left, used, actionWord }) {
  const seLine = `${user} ${actionWord} ${product.name} (-${used}${product.unit === "oz" ? "oz" : ""}). They now have ${left}${product.unit === "oz" ? "oz" : ""}.`;
  const nbLine = `${user} ${actionWord} ${product.name}. ${ROLLUP_EFFECTS[Math.floor(Math.random()*ROLLUP_EFFECTS.length)]} Remaining: ${left}${product.unit === "oz" ? "oz" : ""}.`;
  return { seLine, nbLine };
}

// Health
app.get("/grass/health", (_req,res) => res.type("text/plain").send("grass: OK"));

// BUY: /grass/buy?user=<u>&product=<slug>&mode=se|nb&key=SECRET
app.get("/grass/buy", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  const product = getProduct(req.query.product);
  const mode = (req.query.mode || "").toString().toLowerCase();

  if (!user || !product) return res.status(400).type("text/plain").send("Missing user or product");

  const amount = product.buyInc; // fixed per rules
  const newTotal = addInv(user, product.slug || req.query.product.toLowerCase(), amount);
  const { seLine, nbLine } = buildLinesForBuy({ user, product, newTotal, amount });

  if (mode === "se") return res.type("text/plain").send(seLine);
  if (mode === "nb") return res.type("text/plain").send(nbLine);
  return res.type("text/plain").send(`${seLine} ${nbLine}`);
});

// ROLLUP (flowers): /grass/rollup?user=<u>&product=<slug optional>&mode=se|nb
app.get("/grass/rollup", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  let slug = (req.query.product || "").toString().toLowerCase();
  if (!user) return res.status(400).type("text/plain").send("Missing user");

  let product = slug ? getProduct(slug) : null;
  if (!product) {
    const best = biggestFlowerSlug(user);
    if (!best) return res.type("text/plain").send(`${user} has no flower to roll up.`);
    product = getProduct(best);
    slug = best;
  }
  if (product.kind !== "flower") return res.type("text/plain").send("That item isn’t rollable flower.");

  const used = product.consumeInc; // 2oz
  const r = subInv(user, slug, used);
  const { seLine, nbLine } = buildLinesForConsume({ user, product, left: r.left, used, actionWord: "rolls up" });
  if (!r.ok) return res.type("text/plain").send(`${user} doesn’t have enough ${product.name}. Need ${used}oz.`);
  const mode = (req.query.mode || "").toString().toLowerCase();
  if (mode === "se") return res.type("text/plain").send(seLine);
  if (mode === "nb") return res.type("text/plain").send(nbLine);
  return res.type("text/plain").send(`${seLine} ${nbLine}`);
});

// EAT brownie: /grass/eat?user=<u>&mode=se|nb
app.get("/grass/eat", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  if (!user) return res.status(400).type("text/plain").send("Missing user");
  const product = PRODUCTS["brownies"];
  const r = subInv(user, "brownies", product.consumeInc); // -1
  if (!r.ok) return res.type("text/plain").send(`${user} has no ${product.name} to eat.`);
  const { seLine, nbLine } = buildLinesForConsume({ user, product, left: r.left, used: product.consumeInc, actionWord: "eats" });
  const mode = (req.query.mode || "").toString().toLowerCase();
  if (mode === "se") return res.type("text/plain").send(seLine);
  if (mode === "nb") return res.type("text/plain").send(nbLine);
  return res.type("text/plain").send(`${seLine} ${nbLine}`);
});

// CHEW gummy: /grass/chew?user=<u>&mode=se|nb
app.get("/grass/chew", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  if (!user) return res.status(400).type("text/plain").send("Missing user");
  const product = PRODUCTS["gummies"];
  const r = subInv(user, "gummies", product.consumeInc); // -1
  if (!r.ok) return res.type("text/plain").send(`${user} has no ${product.name} to chew.`);
  const { seLine, nbLine } = buildLinesForConsume({ user, product, left: r.left, used: product.consumeInc, actionWord: "chews" });
  const mode = (req.query.mode || "").toString().toLowerCase();
  if (mode === "se") return res.type("text/plain").send(seLine);
  if (mode === "nb") return res.type("text/plain").send(nbLine);
  return res.type("text/plain").send(`${seLine} ${nbLine}`);
});

// BUY edibles packs: /grass/buybrownies?user=...  /grass/buygummies?user=...
app.get("/grass/buybrownies", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  if (!user) return res.status(400).type("text/plain").send("Missing user");
  const product = PRODUCTS["brownies"];
  const newTotal = addInv(user, "brownies", product.buyInc); // +10
  const { seLine, nbLine } = buildLinesForBuy({ user, product, newTotal, amount: product.buyInc });
  const mode = (req.query.mode || "").toString().toLowerCase();
  if (mode === "se") return res.type("text/plain").send(seLine);
  if (mode === "nb") return res.type("text/plain").send(nbLine);
  return res.type("text/plain").send(`${seLine} ${nbLine}`);
});
app.get("/grass/buygummies", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  if (!user) return res.status(400).type("text/plain").send("Missing user");
  const product = PRODUCTS["gummies"];
  const newTotal = addInv(user, "gummies", product.buyInc); // +10
  const { seLine, nbLine } = buildLinesForBuy({ user, product, newTotal, amount: product.buyInc });
  const mode = (req.query.mode || "").toString().toLowerCase();
  if (mode === "se") return res.type("text/plain").send(seLine);
  if (mode === "nb") return res.type("text/plain").send(nbLine);
  return res.type("text/plain").send(`${seLine} ${nbLine}`);
});

// Inventory view
app.get("/grass/inv", (req, res) => {
  const user = (req.query.user || "").toString();
  if (!user) return res.status(400).type("text/plain").send("Missing user");
  const bag = grassInv.get(userKey(user));
  if (!bag || bag.size === 0) return res.type("text/plain").send(`${user} has no stash.`);
  const parts = [];
  for (const [slug, qty] of bag.entries()) {
    const p = getProduct(slug) || { unit:"" , name: slug };
    const unit = p.unit === "oz" ? "oz" : "pcs";
    parts.push(`${qty}${unit} ${p.name}`);
  }
  res.type("text/plain").send(`${user} stash: ${parts.join(" | ")}`);
});

// Admin resets
app.get("/grass/reset", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) return res.status(401).type("text/plain").send("unauthorized");
  const user = (req.query.user || "").toString();
  if (user) {
    grassInv.delete(userKey(user));
    return res.type("text/plain").send(`Cleared stash for ${user}.`);
  }
  grassInv.clear();
  res.type("text/plain").send("Cleared all stashes.");
});

// ---------------- Start server ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
