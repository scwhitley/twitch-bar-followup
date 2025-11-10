// /factions/actions/rally-route.js
import { RALLY_RECENT_TTL_SEC } from "../core/faction-constants.js";
import { rallyDailyKey, rallyRecentKey } from "../core/alignment-core.js";

export function registerRallyRoute(app, { redis, sanitizeOneLine, pick, getAlignment, addFactionPoints }) {
  app.get("/rally", async (req, res) => {
    const rawUser = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
    const sideQ   = String(req.query.side || "").toLowerCase(); // only for gray users
    if (!rawUser) return res.type("text/plain").send("Usage: /rally?user=NAME[&side=jedi|sith]");

    const align = await getAlignment(rawUser);
    if (!align) return res.type("text/plain").send(`@${rawUser} must take the Force Trial first: use !force`);

    const dKey = rallyDailyKey(rawUser);
    if (await redis.get(dKey)) return res.type("text/plain").send(`@${rawUser} has already rallied today.`);

    let side = align;
    if (align === "gray") {
      if (!["jedi","sith"].includes(sideQ)) {
        return res.type("text/plain").send(`@${rawUser} (Gray) must pick a side: !rally jedi or !rally sith`);
      }
      side = sideQ;
    }
    if (!["jedi","sith"].includes(side)) return res.type("text/plain").send(`Rally only affects Jedi or Sith.`);

    await Promise.all([
      addFactionPoints(side, 1),
      redis.sadd(rallyRecentKey(side), rawUser),
      redis.expire(rallyRecentKey(side), RALLY_RECENT_TTL_SEC),
      redis.set(dKey, 1, { ex: 24 * 3600 }),
    ]);

    // Optional: flavor text injection (you can import your pool and pick from it)
    return res.type("text/plain").send(`@${rawUser} rallies the ${side.toUpperCase()}. +1 ${side}`);
  });
}
