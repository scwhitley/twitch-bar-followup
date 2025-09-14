import express from "express";
const app = express();

app.disable("x-powered-by");

// --- lines for normal follow-up ---
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

// --- bartender comebacks for complaints ---
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- health routes for uptime pings ---
app.get("/", (_req, res) => res.type("text/plain").send("OK"));
app.get("/healthz", (_req, res) => res.type("text/plain").send("OK"));

// --- FOLLOWUP: supports bare=1 so user is optional ---
app.get("/followup", async (req, res) => {
  const bare = req.query.bare === "1";
  const user = (req.query.user || "").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "2500", 10) || 2500, 4500);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }

  // If not bare, require a user (keeps old behavior)
  if (!bare && !user) {
    return res.status(400).type("text/plain").send("Missing ?user= parameter");
  }

  await sleep(delayMs);
  const line = LINES[Math.floor(Math.random() * LINES.length)];
  // bare mode = just the quip; normal mode = full prefix
  const msg = bare ? line : `Bartender to ${user}: ${line}`;
  return res.type("text/plain").send(msg);
});

// --- COMPLAINT: bare=1 returns only the quip (no name prefix) ---
app.get("/complaint", async (req, res) => {
  const bare = req.query.bare === "1";
  const user  = (req.query.user  || "").toString();
  // Express already decodes query params; don't double-decode
  const issue = (req.query.issue || "").toString().slice(0, 120);
  const delayMs = Math.min(parseInt(req.query.delayMs || "2000", 10) || 2000, 4500);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }

  await sleep(delayMs);
  const pick = COMPLAINTS[Math.floor(Math.random() * COMPLAINTS.length)];
  const full = pick(user || "guest", issue);

  if (bare) {
    // strip leading "Bartender to <name>: "
    const stripped = full.replace(/^Bartender to .*?:\s*/, "");
    return res.type("text/plain").send(stripped);
  }
  return res.type("text/plain").send(full);
});

// --- start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
