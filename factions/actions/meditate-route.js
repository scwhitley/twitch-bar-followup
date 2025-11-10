// /factions/actions/meditate-route.js
import { DEFENSE_TTL_SEC, MEDITATE_CD_SEC, MEDITATE_DAILY_MAX } from "../core/faction-constants.js";
import { defendMeditateKey } from "../core/alignment-core.js";
import { applyEloDailyBonus } from "../elo/elo-core.js";

const meditateCdKey   = (u) => `meditate:cd:${u}`;
const meditateDailyKey= (u) => `meditate:daily:${u}`;

export function registerMeditateRoute(app, { redis, sanitizeOneLine, getAlignment, addFactionPoints }) {
  app.get("/meditate", async (req, res) => {
    const user = sanitizeOneLine(req.query.user || "").replace(/^@+/, "").toLowerCase();
    if (!user) return res.type("text/plain").send("Usage: /meditate?user=NAME");

    const align = await getAlignment(user);
    if (!align) return res.type("text/plain").send(`@${user} must take the Force Trial first: use !force`);

    if (await redis.get(meditateCdKey(user))) return res.type("text/plain").send(`@${user} meditation cooldown active.`);
    const count = Number((await redis.get(meditateDailyKey(user))) || 0);
    if (count >= MEDITATE_DAILY_MAX) return res.type("text/plain").send(`@${user} reached today's meditate limit (${MEDITATE_DAILY_MAX}).`);

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
}
