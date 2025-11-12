// /factions/actions/meditate-route.js
import express from "express";
import {
  DEFENSE_TTL_SEC,
  MEDITATE_CD_SEC,
  MEDITATE_DAILY_MAX,
} from "../core/faction-constants.js";
import { defendMeditateKey, getAlignment, addFactionPoints } from "../core/alignment-core.js";
import { sanitizeOneLine } from "../core/faction-utils.js";
import { applyEloDailyBonus } from "../elo/elo-core.js";

export const meditateRouter = express.Router();

// local keys for cd / daily
const meditateCdKey    = (u) => `meditate:cd:${u}`;
const meditateDailyKey = (u) => `meditate:daily:${u}`;

meditateRouter.get("/meditate", async (req, res) => {
  const redis = req.app.locals.redis; // <- provided by root index.js
  const user = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
  if (!user) return res.type("text/plain").send("Usage: /meditate?user=NAME");

  const align = await getAlignment(user);
  if (!align) return res.type("text/plain").send(`@${user} must take the Force Trial first: use !force`);

  // cooldown & daily
  if (await redis.get(meditateCdKey(user))) {
    return res.type("text/plain").send(`@${user} meditation cooldown active.`);
  }
  const count = Number((await redis.get(meditateDailyKey(user))) || 0);
  if (count >= MEDITATE_DAILY_MAX) {
    return res.type("text/plain").send(`@${user} reached today's meditate limit (${MEDITATE_DAILY_MAX}).`);
  }

  // set defend flag (10m), cd, daily++, and small ELO bonus (capped per day)
  await Promise.all([
    redis.set(defendMeditateKey(user), 1, { ex: DEFENSE_TTL_SEC }),
    redis.set(meditateCdKey(user), 1, { ex: MEDITATE_CD_SEC }),
    redis.set(meditateDailyKey(user), count + 1),
    applyEloDailyBonus(user),
  ]);

  // Small chance to buff Jedi meter or chip Sith
  let deltaMsg = "";
  if (Math.random() < 0.10) { await addFactionPoints("jedi", 2); deltaMsg += " +2 Jedi"; }
  if (Math.random() < 0.05)  { await addFactionPoints("sith", -1); deltaMsg += " (−1 Sith)"; }

  const base = `@${user} meditates. Mind steady, saber steadier.`;
  return res.type("text/plain").send(deltaMsg ? `${base}${deltaMsg}` : base);
});
