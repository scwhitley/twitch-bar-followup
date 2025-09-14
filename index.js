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

app.get("/", (req, res) => res.type("text/plain").send("OK"));
app.get("/healthz", (req, res) => res.type("text/plain").send("OK"));
app.head("/healthz", (req, res) => res.status(200).end());

app.get("/followup", async (req, res) => {
  const user = (req.query.user || "").toString();
  const delayMs = Math.min(parseInt(req.query.delayMs || "2500", 10) || 2500, 4500);

  if (process.env.SHARED_KEY && req.query.key !== process.env.SHARED_KEY) {
    return res.status(401).type("text/plain").send("unauthorized");
  }

  await sleep(delayMs);
  const line = LINES[Math.floor(Math.random() * LINES.length)];
  const msg = user ? `Bartender to ${user}: ${line}` : line; // no 400s
  res.type("text/plain").send(msg);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
