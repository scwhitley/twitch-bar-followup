// /factions/actions/seethe-route.js
import { DEFENSE_TTL_SEC, SEETHE_CD_SEC, SEETHE_DAILY_MAX } from "../core/faction-constants.js";
import { defendSeetheKey } from "../core/alignment-core.js";
import { applyEloDailyBonus } from "../elo/elo-core.js";

const seetheCdKey    = (u) => `seethe:cd:${u}`;
const seetheDailyKey = (u) => `seethe:daily:${u}`;

export function registerSeetheRoute(app, { redis, sanitizeOneLine, getAlignment, addFactionPoints }) {
  app.get("/seethe", async (req, res) => {
    const user = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
    if (!user) return res.type("text/plain").send("Usage: /seethe?user=NAME");

    const align = await getAlignment(user);
    if (!align) return res.type("text/plain").send(`@${user} must take the Force Trial first: use !force`);

    if (await redis.get(seetheCdKey(user))) return res.type("text/plain").send(`@${user} seethe cooldown active.`);
    const count = Number((await redis.get(seetheDailyKey(user))) || 0);
    if (count >= SEETHE_DAILY_MAX) return res.type("text/plain").send(`@${user} reached today's seethe limit (${SEETHE_DAILY_MAX}).`);

    await Promise.all([
      redis.set(defendSeetheKey(user), 1, { ex: DEFENSE_TTL_SEC }),
      redis.set(seetheCdKey(user), 1, { ex: SEETHE_CD_SEC }),
      redis.set(seetheDailyKey(user), count + 1),
      applyEloDailyBonus(user),
    ]);

    let deltaMsg = "";
    if (Math.random() < 0.10) { await addFactionPoints("sith", 2); deltaMsg += " +2 Sith"; }
    if (Math.random() < 0.05)  { await addFactionPoints("jedi", -1); deltaMsg += " (−1 Jedi)"; }

    const base = `@${user} seethes. Rage refined into focus.`;
    return res.type("text/plain").send(deltaMsg ? `${base}${deltaMsg}` : base);
  });
}
