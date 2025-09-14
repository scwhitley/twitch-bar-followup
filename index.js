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
  const user = (req.query.user || "mysterious stranger").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "2500", 10) || 2500, 4500);

  // Optional shared key check
  if (process.env.SHARED_KEY) {
    if (req.query.key !== process.env.SHARED_KEY) {
      res.status(401).type("text/plain").send("unauthorized");
      return;
    }
  }

  await sleep(delayMs);
  const line = LINES[Math.floor(Math.random() * LINES.length)];
  res.type("text/plain").send(`Bartender to ${user}: ${line}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
