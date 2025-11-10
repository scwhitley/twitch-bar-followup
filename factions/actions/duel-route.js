// /factions/actions/duel-route.js
import { DUEL_COOLDOWN_MS, D4RTH_USERNAME, ELO_WIN, ELO_LOSS, ELO_LOSS_VS_D4RTH } from "../core/faction-constants.js";
import { getAlignment, addFactionPoints } from "../core/alignment-core.js";
import { ensureElo, setElo } from "../elo/elo-core.js";
import { pick } from "../core/faction-utils.js";

const duelLastKey = (user) => `duel:last:${user}`;

export function registerDuelRoute(app, { redis, sanitizeOneLine }) {
  const DUEL_ROASTS = {
    jedi: ["Patience, padawan.", "Serenity… but in pieces."],
    sith: ["Kneel or crawl — either works.", "Fear was the right response."],
    gray: ["Balance means you still fell."],
  };

  app.get("/duel", async (req, res) => {
    const challenger = sanitizeOneLine(req.query.challenger || "").replace(/^@+/, "").toLowerCase();
    const targetRaw  = sanitizeOneLine(req.query.target || "").replace(/^@+/, "").toLowerCase();
    if (!challenger || !targetRaw) return res.type("text/plain").send("Usage: /duel?challenger=NAME&target=NAME");
    if (challenger === targetRaw)  return res.type("text/plain").send(`@${challenger} cannot duel themself.`);

    const lastTs = Number(await redis.get(duelLastKey(challenger)) || 0);
    const now = Date.now();
    if (now - lastTs < DUEL_COOLDOWN_MS) {
      const secs = Math.ceil((DUEL_COOLDOWN_MS - (now - lastTs)) / 1000);
      return res.type("text/plain").send(`@${challenger} duel cooldown: ${secs}s.`);
    }

    const [chalAlign, targAlign] = await Promise.all([getAlignment(challenger), getAlignment(targetRaw)]);
    if (!chalAlign) return res.type("text/plain").send(`@${challenger} must take the Force Trial first: use !force`);
    if (!targAlign)  return res.type("text/plain").send(`@${targetRaw} is unaligned. They must use !force before dueling.`);

    const chalElo = await ensureElo(challenger);
    const targElo = await ensureElo(targetRaw);

    if (targetRaw === D4RTH_USERNAME) {
      await addFactionPoints("sith", 2);
      await setElo(challenger, Math.max(0, chalElo + ELO_LOSS_VS_D4RTH));
      await redis.set(duelLastKey(challenger), String(now));
      const out = `@${challenger} challenged @${D4RTH_USERNAME} and instantly lost. +2 Sith. (ELO now ${Math.max(0, chalElo + ELO_LOSS_VS_D4RTH)})`;
      return res.type("text/plain").send(out);
    }

    const roll = Math.random();
    const winner = roll < 0.5 ? challenger : targetRaw;
    const loser  = winner === challenger ? targetRaw : challenger;

    const winnerAlign = winner === challenger ? chalAlign : targAlign;
    const loserAlign  = loser  === challenger ? chalAlign : targAlign;

    const winnerElo = winner === challenger ? chalElo : targElo;
    const loserElo  = loser  === challenger ? chalElo : targElo;

    await setElo(winner, winnerElo + ELO_WIN);
    await setElo(loser,  Math.max(0, loserElo + ELO_LOSS));

    if (winnerAlign === "jedi" || winnerAlign === "sith") {
      await addFactionPoints(winnerAlign, 2);
    }

    await redis.set(duelLastKey(challenger), String(now));

    const roastPool =
      loserAlign === "jedi" ? DUEL_ROASTS.jedi :
      loserAlign === "sith" ? DUEL_ROASTS.sith :
      DUEL_ROASTS.gray;

    const out = `@${challenger} vs @${targetRaw} — Winner: @${winner} ${winnerAlign === "jedi" ? "+2 Jedi." : winnerAlign === "sith" ? "+2 Sith." : "(Gray victory — war meter unchanged.)"} ${pick(roastPool)}`;
    return res.type("text/plain").send(out);
  });
}
