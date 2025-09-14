import express from "express";
const app = express();

const LINES = [
  "Careful, that one's potent.",
  "Tip jar’s over there 👉 https://streamelements.com/d4rth_distortion/tip",
  "Another round already?",
  "I like the way you use that straw 😏",
  "This ones made with love 😘",
  "Wish I could drink with you...",
  "This full glass is opposite of my empty life...",
  "You about to get cut off buddy!",
  "Ay lil shawty, can I have your number?",
  "We didn't have the liquor you wanted, so I substituted it with Everclear. It's all the same.",
  "Hell yeah I suck toes! *puts phone down* my bad, heres you drink.",
  "Enjoy!",
  "*looks you up and down* thats the outfit you chose tonight? *shrugs* couldn't be me?",
  "Don’t spill it on the carpet.",
  "Heres your drink, now get out my face."
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

app.get("/followup", async (req, res) => {
  // if no ?user= in URL, just return 400 or empty string
  if (!req.query.user) {
    return res
      .status(400)
      .type("text/plain")
      .send("Missing ?user= parameter");
  }

  const user = req.query.user.toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "2500", 10) || 2500, 4500);

  // Optional shared key check
  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }

  await sleep(delayMs);
  const line = LINES[Math.floor(Math.random() * LINES.length)];
  res.type("text/plain").send(`Bartender to ${user}: ${line}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
