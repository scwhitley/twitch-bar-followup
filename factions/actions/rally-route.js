// /factions/actions/rally-route.js
import express from "express";
import { RALLY_RECENT_TTL_SEC } from "../core/faction-constants.js";
import {
  rallyDailyKey,
  rallyRecentKey,
  getAlignment,
  addFactionPoints,
} from "../core/alignment-core.js";
import { sanitizeOneLine } from "../core/faction-utils.js";

export const rallyRouter = express.Router();

rallyRouter.get("/rally", async (req, res) => {
  const redis = req.app.locals.redis; // set in root index.js: app.locals.redis = redis;

  const rawUser = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
  const sideQ   = String(req.query.side || "").toLowerCase(); // only for gray users
  if (!rawUser) {
    return res.type("text/plain").send("Usage: /rally?user=NAME[&side=jedi|sith]");
  }

  const align = await getAlignment(rawUser);
  if (!align) {
    return res.type("text/plain").send(`@${rawUser} must take the Force Trial first: use !force`);
  }

  // once per day per user
  const dKey = rallyDailyKey(rawUser);
  if (await redis.get(dKey)) {
    return res.type("text/plain").send(`@${rawUser} has already rallied today.`);
  }

  // Determine scoring side
  let side = align;
  if (align === "gray") {
    if (!["jedi", "sith"].includes(sideQ)) {
      return res
        .type("text/plain")
        .send(`@${rawUser} (Gray) must pick a side: !rally jedi or !rally sith`);
    }
    side = sideQ;
  }
  if (!["jedi", "sith"].includes(side)) {
    return res.type("text/plain").send(`Rally only affects Jedi or Sith.`);
  }

  // +1 to chosen side, record recent rally (10m window), daily stamp
  await Promise.all([
    addFactionPoints(side, 1),
    redis.sadd(rallyRecentKey(side), rawUser),
    redis.expire(rallyRecentKey(side), RALLY_RECENT_TTL_SEC),
    redis.set(dKey, 1, { ex: 24 * 3600 }),
  ]);

  return res
    .type("text/plain")
    .send(`@${rawUser} rallies the ${side.toUpperCase()}. +1 ${side}`);
});
