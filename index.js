import express from "express";
import {BARTENDER_FIRST, BARTENDER_LAST} from "./bartender-names.js"; // <-- import arrays here

const app = express();
app.disable("x-powered-by");

// function to pick a random bartender name
const randomBartenderName = () =>
  `${BARTENDER_FIRST[Math.floor(Math.random() * BARTENDER_FIRST.length)]} ${
    BARTENDER_LAST[Math.floor(Math.random() * BARTENDER_LAST.length)]
  }`;


// ---------------- Shared helpers ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------- Existing follow-up lines ----------------
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

// ---------------- Complaint comeback lines ----------------
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

// ---------------- NEW: Storm-off lines & Cheers lines ----------------
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

// ---------------- NEW: Random bartender names & fired counter ----------------
const BARTENDER_FIRST = [
  "Kai","Nova","Rhea","Zed","Lux","Orion","Vega","Jinx","Nyx","Rook",
  "Echo","Sable","Kade","Mara","Axel","Rex","Skye","Jet","Ivy","Knox"
];
const BARTENDER_LAST = [
  "Blackthorn","Nightjar","Grimm","Starfall","Ashwood","Ironhand","Vantablack",
  "Stormborne","Bloodmoon","Graves","Darkwater","Voidwalker","Wolfsbane",
  "Ravenshade","Steel","Crowe","Holloway","Frost","Locke","Onyx"
];

let firedCount = 0;
const randomBartenderName = () => `${sample(BARTENDER_FIRST)} ${sample(BARTENDER_LAST)}`;

// ---------------- Health routes ----------------
app.get("/", (_req, res) => res.type("text/plain").send("OK"));
app.get("/healthz", (_req, res) => res.type("text/plain").send("OK"));

// ---------------- FOLLOWUP (for !bar) ----------------
app.get("/followup", async (req, res) => {
  const bare = req.query.bare === "1";
  const user = (req.query.user || "").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "2500", 10) || 2500, 4500);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  if (!bare && !user) {
    return res.status(400).type("text/plain").send("Missing ?user= parameter");
  }

  await sleep(delayMs);
  const line = sample(LINES);
  const msg = bare ? line : `Bartender to ${user}: ${line}`;
  return res.type("text/plain").send(msg);
});

// ---------------- COMPLAINT (for !barcomplaint) ----------------
app.get("/complaint", async (req, res) => {
  const bare = req.query.bare === "1";
  const user  = (req.query.user  || "").toString();
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

// ---------------- NEW: FIRE PACK (one Nightbot message after delay) ----------------
// Returns: "<storm-off quip> A new bartender, <Name>, arrives... (Fired so far: X)"
app.get("/firepack", async (req, res) => {
  const user  = (req.query.user  || "").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "5000", 10) || 5000, 8000); // ~5s default

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }

  await sleep(delayMs);

  // 1) storm-off line
  const storm = sample(STORM_OFF)(user || "the Realm");

  // 2) increment fired counter & announce new bartender
  firedCount += 1;
  const hire = `A new bartender, ${randomBartenderName()}, has now taken over the Distorted Realm bar to better serve the Realm. (Fired so far: ${firedCount})`;

  return res.type("text/plain").send(`${storm} ${hire}`);
});

// ---------------- NEW: CHEERS (for !cheers) ----------------
app.get("/cheers", async (req, res) => {
  const bare = req.query.bare === "1";
  const user  = (req.query.user  || "").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "1500", 10) || 1500, 4500);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }

  await sleep(delayMs);
  const full = sample(CHEERS)(user || "friend");
  if (bare) {
    const stripped = full.replace(/^Bartender to .*?:\s*/, "");
    return res.type("text/plain").send(stripped);
  }
  return res.type("text/plain").send(full);
});

// ---------------- NEW: Fired counter getter ----------------
app.get("/firedcount", (_req, res) => {
  return res.type("text/plain").send(`Bartenders fired so far: ${firedCount}`);
});

// ---------------- Start server ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
