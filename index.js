import express from "express";
const app = express();

const LINES = [
  "Careful, that one's potent.",
  "Tip jar’s over there 👉",
  "Another round already?",
  "You gain +1 Liquid Courage.",
  "Don’t spill it on the carpet.",
  "Bartender wipes the bar with a knowing nod."
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
