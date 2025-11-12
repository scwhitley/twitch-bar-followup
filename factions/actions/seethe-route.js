// /factions/actions/seethe-route.js
import express from "express";
import { DEFENSE_TTL_SEC, SEETHE_CD_SEC, SEETHE_DAILY_MAX } from "../core/faction-constants.js";
import { defendSeetheKey, getAlignment, addFactionPoints } from "../core/alignment-core.js";
import { applyEloDailyBonus } from "../elo/elo-core.js";
import { sanitizeOneLine } from "../core/faction-utils.js";

export const seetheRouter = express.Router();

const seetheCdKey    = (u) => `seethe:cd:${u}`;
const seetheDailyKey = (u) => `seethe:daily:${u}`;

seetheRouter.get("/seethe", async (req, res) => {
  const redis = req.app.locals.redis; // set in root index: app.locals.redis = redis;

  const user = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
  if (!user) return res.type("text/plain").send("Usage: /seethe?user=NAME");

  const align = await getAlignment(user);
  if (!align) return res.type("text/plain").send(`@${user} must take the Force Trial first: use !force`);

  if (await redis.get(seetheCdKey(user))) {
    return res.type("text/plain").send(`@${user} seethe cooldown active.`);
  }
  const count = Number((await redis.get(seetheDailyKey(user))) || 0);
  if (count >= SEETHE_DAILY_MAX) {
    return res.type("text/plain").send(`@${user} reached today's seethe limit (${SEETHE_DAILY_MAX}).`);
  }

  await Promise.all([
    redis.set(defendSeetheKey(user), 1, { ex: DEFENSE_TTL_SEC }),
    redis.set(seetheCdKey(user), 1, { ex: SEETHE_CD_SEC }),
    redis.set(seetheDailyKey(user), count + 1),
    applyEloDailyBonus(user),
  ]);

  // Sith-leaning procs
  let deltaMsg = "";
  if (Math.random() < 0.10) { await addFactionPoints("sith", 2); deltaMsg += " +2 Sith"; }
  if (Math.random() < 0.05)  { await addFactionPoints("jedi", -1); deltaMsg += " (−1 Jedi)"; }

  const base = `@${user} seethes. Rage refined into focus.`;
  return res.type("text/plain").send(deltaMsg ? `${base}${deltaMsg}` : base);
});
