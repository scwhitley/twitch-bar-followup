// /factions/elo/convert-routes.js
import { IMMUNITY_SECONDS, CONVERT_COOLDOWN_SEC, CONVERT_DAILY_LIMIT, D4RTH_USERNAME } from "../core/faction-constants.js";
import { convertCooldownKey, convertDailyKey, convertImmunityKey } from "../core/alignment-core.js";
import { eloAdjustedChance, ensureElo, setElo, getElo } from "./elo-core.js";
import { niceSideLabel } from "../core/faction-utils.js";

// Helper: fallback if not injected
function defaultRollSuccess(p) { return Math.random() < p; }

export function registerEloRoutes(app, deps) {
  const {
    redis,
    sanitizeOneLine,
    getAlignment,
    setUserAlignmentRedis,
    addFactionPoints, // optional for season counters
    calcConvertChance, // optional injection
    rollSuccess       // optional injection
  } = deps;

  // shared
  async function baseChance({ caster, target, casterSide, targetSideForTeamBonus }) {
    if (typeof calcConvertChance === "function") {
      return await calcConvertChance({ caster, target, casterSide, targetSideForTeamBonus });
    }
    // baseline if not injected
    return 0.5;
  }
  const _roll = typeof rollSuccess === "function" ? rollSuccess : defaultRollSuccess;

  // ---- CLEANSE → to Jedi
  app.get("/convert/cleanse", async (req, res) => {
    const caster = sanitizeOneLine(req.query.caster || "").replace(/^@+/, "").toLowerCase();
    const target = sanitizeOneLine(req.query.target || "").replace(/^@+/, "").toLowerCase();
    if (!caster || !target) return res.type("text/plain").send("Usage: /convert/cleanse?caster=NAME&target=NAME");
    if (target === D4RTH_USERNAME) return res.type("text/plain").send(`@${caster} attempts to cleanse @${target}. The cosmos replies: "No."`);

    const [casterSide, targetSide] = await Promise.all([getAlignment(caster), getAlignment(target)]);
    if (casterSide !== "jedi") return res.type("text/plain").send(`@${caster} must be aligned with the Jedi to use !cleanse.`);
    if (!targetSide) return res.type("text/plain").send(`@${target} must take the Force Trial first: use !force`);

    const cdKey = convertCooldownKey(caster);
    const dKey  = convertDailyKey(caster);
    const immKey = convertImmunityKey(target);

    if (await redis.get(cdKey)) return res.type("text/plain").send(`@${caster} cleanse cooldown active. Try again soon.`);
    const attempts = Number((await redis.get(dKey)) || 0);
    if (attempts >= CONVERT_DAILY_LIMIT) return res.type("text/plain").send(`@${caster} reached today's cleanse attempts (${CONVERT_DAILY_LIMIT}).`);
    if (await redis.get(immKey)) return res.type("text/plain").send(`@${target} is temporarily immune to conversion.`);

    // chance with ELO adjust
    const base = await baseChance({ caster, target, casterSide: "jedi", targetSideForTeamBonus: "jedi" });
    const targetElo = await ensureElo(target);
    const p = eloAdjustedChance(base, targetElo);
    const success = _roll(p);

    await Promise.all([
      redis.set(cdKey, 1, { ex: CONVERT_COOLDOWN_SEC }),
      redis.set(dKey, attempts + 1),
    ]);

    if (!success) {
      const [ce, te] = await Promise.all([getElo(caster), getElo(target)]);
      await Promise.all([ setElo(caster, ce - 5), setElo(target, te + 5) ]);
      return res.type("text/plain").send(`@${caster} reaches for the Light... @${target} resists. (${Math.round(p*100)}% chance)`);
    }

    await setUserAlignmentRedis(target, "jedi");
    await redis.set(immKey, 1, { ex: IMMUNITY_SECONDS });
    return res.type("text/plain").send(`@${caster} bends fate — @${target} joins the Jedi. (${Math.round(p*100)}% chance)`);
  });

  // ---- CORRUPT → to Sith
  app.get("/convert/corrupt", async (req, res) => {
    const caster = sanitizeOneLine(req.query.caster || "").replace(/^@+/, "").toLowerCase();
    const target = sanitizeOneLine(req.query.target || "").replace(/^@+/, "").toLowerCase();
    if (!caster || !target) return res.type("text/plain").send("Usage: /convert/corrupt?caster=NAME&target=NAME");
    if (target === D4RTH_USERNAME) return res.type("text/plain").send(`@${caster} dares corrupt @${target}. Reality prevents the attempt.`);

    const [casterSide, targetSide] = await Promise.all([getAlignment(caster), getAlignment(target)]);
    if (casterSide !== "sith") return res.type("text/plain").send(`@${caster} must be aligned with the Sith to use !corrupt.`);
    if (!targetSide) return res.type("text/plain").send(`@${target} must take the Force Trial first: use !force`);

    const cdKey = convertCooldownKey(caster);
    const dKey  = convertDailyKey(caster);
    const immKey = convertImmunityKey(target);

    if (await redis.get(cdKey)) return res.type("text/plain").send(`@${caster} corruption cooldown active. Try again soon.`);
    const attempts = Number((await redis.get(dKey)) || 0);
    if (attempts >= CONVERT_DAILY_LIMIT) return res.type("text/plain").send(`@${caster} reached today's corrupt attempts (${CONVERT_DAILY_LIMIT}).`);
    if (await redis.get(immKey)) return res.type("text/plain").send(`@${target} is temporarily immune to conversion.`);

    const base = await baseChance({ caster, target, casterSide: "sith", targetSideForTeamBonus: "sith" });
    const targetElo = await ensureElo(target);
    const p = eloAdjustedChance(base, targetElo);
    const success = _roll(p);

    await Promise.all([
      redis.set(cdKey, 1, { ex: CONVERT_COOLDOWN_SEC }),
      redis.set(dKey, attempts + 1),
    ]);

    if (!success) {
      const [ce, te] = await Promise.all([getElo(caster), getElo(target)]);
      await Promise.all([ setElo(caster, ce - 5), setElo(target, te + 5) ]);
      return res.type("text/plain").send(`@${caster} whispers power... @${target} refuses the Dark. (${Math.round(p*100)}% chance)`);
    }

    await setUserAlignmentRedis(target, "sith");
    await redis.set(immKey, 1, { ex: IMMUNITY_SECONDS });
    return res.type("text/plain").send(`@${caster} corrupts @${target}. Welcome to the Sith. (${Math.round(p*100)}% chance)`);
  });

  // ---- SWAY (Gray chooses side)
  app.get("/convert/sway", async (req, res) => {
    const caster = sanitizeOneLine(req.query.caster || "").replace(/^@+/, "").toLowerCase();
    const target = sanitizeOneLine(req.query.target || "").replace/^@+/, "").toLowerCase();
    const side   = String(req.query.side || "").toLowerCase();
    if (!caster || !target || !["jedi", "sith"].includes(side)) {
      return res.type("text/plain").send("Usage: /convert/sway?caster=NAME&target=NAME&side=jedi|sith");
    }
    if (target === D4RTH_USERNAME) return res.type("text/plain").send(`@${caster} tries to sway @${target}. The Force shakes its head.`);

    const [casterSide, targetSide] = await Promise.all([getAlignment(caster), getAlignment(target)]);
    if (casterSide !== "gray") return res.type("text/plain").send(`@${caster} must walk the Gray path to use !sway.`);
    if (!targetSide) return res.type("text/plain").send(`@${target} must take the Force Trial first: use !force`);

    const cdKey = convertCooldownKey(caster);
    const dKey  = convertDailyKey(caster);
    const immKey = convertImmunityKey(target);

    if (await redis.get(cdKey)) return res.type("text/plain").send(`@${caster} sway cooldown active. Try again soon.`);
    const attempts = Number((await redis.get(dKey)) || 0);
    if (attempts >= CONVERT_DAILY_LIMIT) return res.type("text/plain").send(`@${caster} reached today's sway attempts (${CONVERT_DAILY_LIMIT}).`);
    if (await redis.get(immKey)) return res.type("text/plain").send(`@${target} is temporarily immune to conversion.`);

    const base = await baseChance({ caster, target, casterSide: "gray", targetSideForTeamBonus: side });
    const targetElo = await ensureElo(target);
    const p = eloAdjustedChance(base, targetElo);
    const success = _roll(p);

    await Promise.all([
      redis.set(cdKey, 1, { ex: CONVERT_COOLDOWN_SEC }),
      redis.set(dKey, attempts + 1),
    ]);

    if (!success) {
      const [ce, te] = await Promise.all([getElo(caster), getElo(target)]);
      await Promise.all([ setElo(caster, ce - 5), setElo(target, te + 5) ]);
      return res.type("text/plain").send(`@${caster} nudges destiny... @${target} stands firm. (${Math.round(p*100)}% chance)`);
    }

    await setUserAlignmentRedis(target, side);
    await redis.set(immKey, 1, { ex: IMMUNITY_SECONDS });
    return res.type("text/plain").send(`@${caster} sways @${target} toward the ${niceSideLabel(side)}. (${Math.round(p*100)}% chance)`);
  });
}
