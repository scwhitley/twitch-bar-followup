// index.js
import express from "express";
import { BARTENDER_FIRST, BARTENDER_LAST } from "./bartender-names.js";
import { fetch as undiciFetch } from "undici";
const fetch = globalThis.fetch || undiciFetch;


// --- StreamElements Loyalty API (auto-award) ---
const SE_JWT = process.env.SE_JWT || "";
const SE_CHANNEL_ID = process.env.SE_CHANNEL_ID || "";

// polyfilled fetch already set earlier:
// import { fetch as undiciFetch } from "undici";
// const fetch = globalThis.fetch || undiciFetch;

/**
 * Attempt to add points to a user.
 * Returns { ok:boolean, status:number, body:string }
 */
async function seAddPoints(username, amount) {
  const cleanUser = String(username || "")
    .replace(/^@/, "")      // strip @ if present
    .trim()
    .toLowerCase();         // SE expects the Twitch login, lowercased

  if (!SE_JWT || !SE_CHANNEL_ID || !cleanUser || !Number.isInteger(amount) || amount <= 0) {
    return { ok: false, status: 0, body: "missing params/env" };
  }

  const url = `https://api.streamelements.com/kappa/v2/points/${encodeURIComponent(SE_CHANNEL_ID)}/${encodeURIComponent(cleanUser)}/${amount}`;

  try {
    const resp = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${SE_JWT}`,
        "Accept": "application/json"
      }
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
        body: result.body
      });
    } catch {}
  });
}


const app = express();
app.disable("x-powered-by");

// ---------------- Shared helpers ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomBartenderName = () =>
  `${sample(BARTENDER_FIRST)} ${sample(BARTENDER_LAST)}`;

// -------- Daily Drink Special --------
const DRINK_KEYS = [
  "vodka","whiskey","gin","rum","tequila",
  "lightbeer","darkbeer","redwine","espresso","bourbon"
];

// daily bonus amount (Distortion Dollars shown in chat; SE deduct/add handled separately)
const DAILY_BONUS = 1000;

// salt so your daily pick isn't guessable by others (set in Render env if you want)
const SPECIAL_SALT = process.env.SPECIAL_SALT || "distorted-realm-salt";

// track who already got the special today (user lowercase + date) -> true
const specialAwardedToday = new Set();

// helper: YYYY-MM-DD in America/New_York without bringing in a tz lib
const dateKeyNY = () => {
  const now = new Date();
  // get the NY components using locale; safe enough for daily granularity
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`; // e.g. 2025-09-16
};

// simple deterministic hash → index
function hashToIndex(str, mod) {
  let h = 2166136261 >>> 0; // FNV-ish
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

function awardAndLogLater(user, drink, date, amount) {
  // fire-and-forget so the HTTP response is fast
  setImmediate(async () => {
    try {
      const awarded = aspecialAwardedToday.add(awardKey);
tail += ` 🎯 Daily Special! +${DAILY_BONUS} Distortion Dollars`;
awardAndLogLater(user, drink, date, DAILY_BONUS); // no await

    } catch (e) {
      // swallow errors; don't crash server
    }
  });
}


// ---------------- Quip pools ----------------
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
  "Here’s your drink, now get out my face."
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
  (user, issue) => `Bartender to ${user}: “Alright ${user}, I’ll remake it… but this time I’m charging you emotional labor.”`
];

const STORM_OFF = [
  (user) => `The bartender glares at ${user}, rips off the apron, and storms out screaming “Y’all don’t deserve me!”`,
  (user) => `Bartender yeets the bar rag, mutters something unholy about ${user}, and moonwalks out the door.`,
  (user) => `“I’m unionized with the Sith now,” the bartender hisses at ${user} before force-sliding out.`,
  (user) => `The bartender flips a coaster at ${user} like a ninja star and vanishes into the night.`,
  (user) => `Keys slam. “I quit this pixel bar,” they snarl at ${user}, exiting stage left in dramatic fashion.`
];

const CHEERS = [
  (user) => `Bartender to ${user}: “Appreciate you! May your ice always clink and your Wi-Fi never drop.”`,
  (user) => `Bartender to ${user}: “Cheers, legend. Next one comes with extra style points.”`,
  (user) => `Bartender to ${user}: “Verified: you have excellent taste and impeccable vibes.”`,
  (user) => `Bartender to ${user}: “Gratitude noted. Hydration and happiness incoming.”`,
  (user) => `Bartender to ${user}: “Thanks fam. Tip jar smiles upon you.”`
];

// ---------------- State: fired counter, per-user drinks, and session totals ----------------
let firedCount = 0;
let drinksServedCount = 0;
let cheersCount = 0;
let fightsCount = 0;

const drinkCounts = new Map(); // key: username (lowercase), value: count tonight
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
  const today = dateKeyNY(); // you already have dateKeyNY()
  if (specialAward.date !== today) {
    specialAward = { date: today, awarded: false };
  }
  return specialAward;
}

// ---- Cut-off (Uber) until midnight ET ----
const bannedUntilMidnight = new Map(); // key: lowercased user -> dateKey (YYYY-MM-DD)

function banUserUntilMidnight(user) {
  const u = String(user || "").trim().toLowerCase();
  if (!u) return false;
  bannedUntilMidnight.set(u, dateKeyNY());
  return true;
}

function isUserBanned(user) {
  const u = String(user || "").trim().toLowerCase();
  if (!u) return false;
  const today = dateKeyNY();
  const stamp = bannedUntilMidnight.get(u);
  if (!stamp) return false;
  // auto-expire if day rolled over
  if (stamp !== today) {
    bannedUntilMidnight.delete(u);
    return false;
  }
  return true;
}


// ---------------- Health routes ----------------
app.get("/", (_req, res) => res.type("text/plain").send("OK"));
app.get("/healthz", (_req, res) => res.type("text/plain").send("OK"));

// GET /special -> "Today's special is: bourbon (+1000)"
app.get("/special", (_req, res) => {
  const { date, drink } = getTodaysSpecial();
  res.type("text/plain").send(`Today's special (${date}) is: ${drink} (+${DAILY_BONUS})`);
});


// ---------------- FOLLOWUP (Nightbot uses for each drink) ----------------
// Accepts: bare=1, user=<name>, drink=<slug>, delayMs, key=<shared>
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

    // hard gate: banned users can't order until midnight ET
  if (isUserBanned(user)) {
    const msg = bare
      ? "Cut off. No more drinks tonight. 🚫"
      : `Bartender to ${user}: You’ve been cut off for the night. 🚫`;
    return res.type("text/plain").send(msg);
  }


  // just pick a quip — no drink tag at all
  const base = sample(LINES);
  const line = (typeof base === "string" && base.trim()) ? base : "Enjoy!";

  // per-user drink counting + session total + milestones + DAILY SPECIAL
  let tail = "";
  if (user && drink) {
    const count = bumpDrinkCount(user);
    drinksServedCount += 1;
    tail = ` That’s drink #${count} tonight.`;
    if (count === 3) tail += " Remember to hydrate. 💧";
    if (count === 5) tail += " Easy there, champion. 🛑 Hydration check!";
    if (count === 10) tail += " Chat, keep an eye on them.";
    if (count === 12) tail += " Why are you crying and dancing on the table shirtless?";
    if (count === 15) tail += " 🚕 Call them an !uber. Security get them out of here!";



    // --- Daily Special check (one award per stream globally) ---
    const { date, drink: todaySpecial } = getTodaysSpecial();
    const flag = ensureSpecialFlagForToday();

    if (drink.toLowerCase() === todaySpecial) {
      if (!flag.awarded) {
        flag.awarded = true;
        tail += ` 🎯 Daily Special! +${DAILY_BONUS} Distortion Dollars`;
        awardAndLogLater(user, drink, date, DAILY_BONUS); // your async helper
      }
    }
  }

  const msg = bare ? `${line}${tail}` : `Bartender to ${user}: ${line}${tail}`;
  return res.type("text/plain").send(msg);
});


// ---------------- COMPLAINT (for !barcomplaint) ----------------
app.get("/complaint", async (req, res) => {
  const bare = req.query.bare === "1";
  const user = (req.query.user || "").toString();
  const issue = (req.query.issue || "").toString().slice(0, 120);
  const delayMs =
    Math.min(parseInt(req.query.delayMs || "2000", 10) || 2000, 4500);

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

// ---------------- FIRE PACK (for !fire) ----------------
app.get("/firepack", async (req, res) => {
  const user = (req.query.user || "").toString();
  const delayMs =
    Math.min(parseInt(req.query.delayMs || "5000", 10) || 5000, 8000);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }

  await sleep(delayMs);

  const storm = sample(STORM_OFF)(user || "the Realm");
  firedCount += 1;
  const hire = `A new bartender, ${randomBartenderName()}, has now taken over the Distorted Realm bar to better serve the Realm. (Fired so far: ${firedCount})`;

  return res.type("text/plain").send(`${storm} ${hire}`);
});

// ---------------- CHEERS (for !cheers) ----------------
app.get("/cheers", async (req, res) => {
  const bare = req.query.bare === "1";
  const user = (req.query.user || "").toString();
  const delayMs =
    Math.min(parseInt(req.query.delayMs || "1500", 10) || 1500, 4500);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }

  await sleep(delayMs);
  cheersCount += 1; // track session cheers
  const full = sample(CHEERS)(user || "friend");
  if (bare) {
    const stripped = full.replace(/^Bartender to .*?:\s*/, "");
    return res.type("text/plain").send(stripped);
  }
  return res.type("text/plain").send(full);
});

// --- FIGHT tracking (silent; accepts multiple aliases) ---
const trackFightHandler = (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  // Optional: track by type if provided (fight vs fight2)
  // fightsByType[req.query.type || "fight"] = (fightsByType[req.query.type || "fight"] || 0) + 1;
  fightsCount += 1;
  return res.status(204).send(); // no chat output
};

// Accept multiple paths so either command works
app.get("/trackfight", trackFightHandler);
app.get("/trackfight2", trackFightHandler);
app.get("/track/fight", trackFightHandler);


// ---------------- Utility & Summary ----------------
app.get("/firedcount", (_req, res) => {
  return res
    .type("text/plain")
    .send(`Bartenders fired so far: ${firedCount}`);
});

// GET /drinks?user=<name> -> "<name> has N drinks tonight."
app.get("/drinks", (req, res) => {
  const user = (req.query.user || "").toString();
  const k = keyUser(user);
  const n = k ? drinkCounts.get(k) || 0 : 0;
  const who = user || "Guest";
  res
    .type("text/plain")
    .send(`${who} has ${n} drink${n === 1 ? "" : "s"} tonight.`);
});

// GET /fightscount?key=SECRET -> "Fights so far: X"
app.get("/fightscount", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  res.type("text/plain").send(`Fights so far: ${fightsCount}`);
});

// Quick peek at the last special award entry (mods only)
app.get("/speciallast", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  try {
    if (!fs.existsSync(AWARD_LOG_FILE)) {
      return res.type("text/plain").send("No awards logged yet.");
    }
    const data = JSON.parse(fs.readFileSync(AWARD_LOG_FILE, "utf8"));
    const last = data[data.length - 1];
    if (!last) return res.type("text/plain").send("No awards logged yet.");
    const txt = `last award -> user: ${last.user}, drink: ${last.drink}, amount: ${last.amount}, ok: ${last.awarded}, status: ${last.status}`;
    return res.type("text/plain").send(txt);
  } catch {
    return res.status(500).type("text/plain").send("Error reading last award");
  }
});

// Ban a user until midnight ET (called by !uber)
app.get("/uberban", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  const target = (req.query.target || "").toString();
  if (!target) return res.status(400).type("text/plain").send("Missing ?target=");
  const ok = banUserUntilMidnight(target);
  if (!ok) return res.status(400).type("text/plain").send("Bad target");
  return res
    .type("text/plain")
    .send(`${target} is cut off until midnight ET.`);
});

// Optional: unban mid-stream
app.get("/uberunban", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  const target = (req.query.target || "").toString();
  if (!target) return res.status(400).type("text/plain").send("Missing ?target=");
  bannedUntilMidnight.delete(String(target).trim().toLowerCase());
  return res.type("text/plain").send(`${target} is no longer cut off.`);
});

// Optional: list current bans (mods only)
app.get("/uberbans", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  const today = dateKeyNY();
  const list = [];
  for (const [u, day] of bannedUntilMidnight.entries()) {
    if (day === today) list.push(u);
  }
  res.type("text/plain").send(list.length ? `Cut off tonight: ${list.join(", ")}` : "No one is cut off.");
});




// End-of-stream summary
// /end?key=SECRET
app.get("/end", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  const summary = `Session Summary: Bartenders fired: ${firedCount} | Drinks served: ${drinksServedCount} | Cheers given: ${cheersCount} | Fights broke out: ${fightsCount}`;
  res.type("text/plain").send(summary);
});

// Admin: reset per-user or all drink counters
// /resetdrinks?key=SECRET            -> reset all
// /resetdrinks?user=<name>&key=SECRET -> reset one user
app.get("/resetdrinks", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  const user = (req.query.user || "").toString();
  if (user) {
    drinkCounts.delete(keyUser(user));
    return res.type("text/plain").send(`Reset drink counter for ${user}.`);
  }
  drinkCounts.clear();
  res.type("text/plain").send("Reset all drink counters.");
});

// Admin: reset firedCount
// /resetfired?key=SECRET
app.get("/resetfired", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  firedCount = 0;
  res.type("text/plain").send("Fired counter reset to 0");
});

// Admin: reset EVERYTHING for a fresh session
// /resetall?key=SECRET
app.get("/resetall", (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
    bannedUntilMidnight.clear();

  }

  firedCount = 0;
  drinksServedCount = 0;
  cheersCount = 0;
  fightsCount = 0;
  drinkCounts.clear();

  // NEW: reset the daily special flag too
  specialAward = { date: dateKeyNY(), awarded: false };

  res.type("text/plain").send("All counters reset.");
});

// DEBUG: manually test awarding points: /debug/award?user=<u>&amount=100&key=SECRET
app.get("/debug/award", async (req, res) => {
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  const user = (req.query.user || "").toString();
  const amount = parseInt(req.query.amount || "0", 10);
  const result = await seAddPoints(user, amount);
  return res.type("text/plain").send(`award test -> ok: ${result.ok}, status: ${result.status}, body: ${result.body}`);
});



// ---------------- Start server ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
