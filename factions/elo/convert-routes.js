// /factions/elo/convert-routes.js
import express from "express";
import { Redis } from "@upstash/redis";

import {
  sanitizeOneLine,
  pick,
  niceSideLabel,
  oppSide,
  convertCooldownKey,
  convertDailyKey,
  convertImmunityKey,
} from "../core/faction-utils.js";

import {
  getAlignment,
  setUserAlignmentRedis,
  addFactionPoints,
  ensureElo,
  getElo,
  setElo,
} from "../core/alignment-core.js";

import {
  calcConvertChance,
  rollSuccess,
} from "./elo-core.js";

import {
  CONVERT_COOLDOWN_SEC,
  CONVERT_DAILY_LIMIT,
  IMMUNITY_SECONDS,      // ✅ seconds, not hours
  D4RTH_USERNAME,
} from "../core/faction-constants.js";

const redis = Redis.fromEnv();
const router = express.Router();

// ---------- /convert/cleanse (to Jedi) ----------
router.get("/convert/cleanse", async (req, res) => {
  const caster = sanitizeOneLine(req.query.caster || "").replace(/^@+/, "").toLowerCase();
  const target = sanitizeOneLine(req.query.target || "").replace(/^@+/, "").toLowerCase();
  if (!caster || !target) {
    return res.type("text/plain").send("Usage: /convert/cleanse?caster=NAME&target=NAME");
  }

  if (target === D4RTH_USERNAME) {
    return res.type("text/plain").send(`@${caster} attempts to cleanse @${target}. The cosmos replies: "No."`);
  }

  const casterSide = await getAlignment(caster);
  const targetSide = await getAlignment(target);
  if (casterSide !== "jedi") {
    return res.type("text/plain").send(`@${caster} must be aligned with the Jedi to use !cleanse. Use !force if unaligned.`);
  }
  if (!targetSide) {
    return res.type("text/plain").send(`@${target} must take the Force Trial first: use !force`);
  }

  const cdKey = convertCooldownKey(caster);
  if (await redis.get(cdKey)) {
    return res.type("text/plain").send(`@${caster} cleanse cooldown active. Try again soon.`);
  }
  const dKey = convertDailyKey(caster);
  const attempts = Number((await redis.get(dKey)) || 0);
  if (attempts >= CONVERT_DAILY_LIMIT) {
    return res.type("text/plain").send(`@${caster} reached today's cleanse attempts (${CONVERT_DAILY_LIMIT}).`);
  }
  const immKey = convertImmunityKey(target);
  if (await redis.get(immKey)) {
    return res.type("text/plain").send(`@${target} is temporarily immune to conversion.`);
  }

  const p = await calcConvertChance({ caster, target, casterSide: "jedi", targetSideForTeamBonus: "jedi" });
  const success = rollSuccess(p);

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
  await redis.set(immKey, 1, { ex: IMMUNITY_SECONDS });      // ✅ 20 min window from constants
  await redis.incr(`war:season:jedi`);

  return res.type("text/plain").send(`@${caster} bends fate — @${target} joins the Jedi. (${Math.round(p*100)}% chance)`);
});

// ---------- /convert/corrupt (to Sith) ----------
router.get("/convert/corrupt", async (req, res) => {
  const caster = sanitizeOneLine(req.query.caster || "").replace(/^@+/, "").toLowerCase();
  const target = sanitizeOneLine(req.query.target || "").replace(/^@+/, "").toLowerCase();
  if (!caster || !target) {
    return res.type("text/plain").send("Usage: /convert/corrupt?caster=NAME&target=NAME");
  }

  if (target === D4RTH_USERNAME) {
    return res.type("text/plain").send(`@${caster} dares corrupt @${target}. Reality prevents the attempt.`);
  }

  const casterSide = await getAlignment(caster);
  const targetSide = await getAlignment(target);
  if (casterSide !== "sith") {
    return res.type("text/plain").send(`@${caster} must be aligned with the Sith to use !corrupt. Use !force if unaligned.`);
  }
  if (!targetSide) {
    return res.type("text/plain").send(`@${target} must take the Force Trial first: use !force`);
  }

  const cdKey = convertCooldownKey(caster);
  if (await redis.get(cdKey)) {
    return res.type("text/plain").send(`@${caster} corruption cooldown active. Try again soon.`);
  }
  const dKey = convertDailyKey(caster);
  const attempts = Number((await redis.get(dKey)) || 0);
  if (attempts >= CONVERT_DAILY_LIMIT) {
    return res.type("text/plain").send(`@${caster} reached today's corrupt attempts (${CONVERT_DAILY_LIMIT}).`);
  }
  const immKey = convertImmunityKey(target);
  if (await redis.get(immKey)) {
    return res.type("text/plain").send(`@${target} is temporarily immune to conversion.`);
  }

  const p = await calcConvertChance({ caster, target, casterSide: "sith", targetSideForTeamBonus: "sith" });
  const success = rollSuccess(p);

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
  await redis.set(immKey, 1, { ex: IMMUNITY_SECONDS });      // ✅
  await redis.incr(`war:season:sith`);

  return res.type("text/plain").send(`@${caster} corrupts @${target}. Welcome to the Sith. (${Math.round(p*100)}% chance)`);
});

// ---------- /convert/sway (Gray helps one side) ----------
router.get("/convert/sway", async (req, res) => {
  const caster = sanitizeOneLine(req.query.caster || "").replace(/^@+/, "").toLowerCase();
  const target = sanitizeOneLine(req.query.target || "").replace(/^@+/, "").toLowerCase();
  const side   = String(req.query.side || "").toLowerCase();
  if (!caster || !target || !["jedi","sith"].includes(side)) {
    return res.type("text/plain").send("Usage: /convert/sway?caster=NAME&target=NAME&side=jedi|sith");
  }

  if (target === D4RTH_USERNAME) {
    return res.type("text/plain").send(`@${caster} tries to sway @${target}. The Force shakes its head.`);
  }

  const casterSide = await getAlignment(caster);
  const targetSide = await getAlignment(target);
  if (casterSide !== "gray") {
    return res.type("text/plain").send(`@${caster} must walk the Gray path to use !sway.`);
  }
  if (!targetSide) {
    return res.type("text/plain").send(`@${target} must take the Force Trial first: use !force`);
  }

  const cdKey = convertCooldownKey(caster);
  if (await redis.get(cdKey)) {
    return res.type("text/plain").send(`@${caster} sway cooldown active. Try again soon.`);
  }
  const dKey = convertDailyKey(caster);
  const attempts = Number((await redis.get(dKey)) || 0);
  if (attempts >= CONVERT_DAILY_LIMIT) {
    return res.type("text/plain").send(`@${caster} reached today's sway attempts (${CONVERT_DAILY_LIMIT}).`);
  }
  const immKey = convertImmunityKey(target);
  if (await redis.get(immKey)) {
    return res.type("text/plain").send(`@${target} is temporarily immune to conversion.`);
  }

  const p = await calcConvertChance({ caster, target, casterSide: "gray", targetSideForTeamBonus: side });
  const success = rollSuccess(p);

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
  await redis.set(immKey, 1, { ex: IMMUNITY_SECONDS });      // ✅
  await redis.incr(`war:season:${side}`);

  return res.type("text/plain").send(`@${caster} sways @${target} toward the ${niceSideLabel(side)}. (${Math.round(p*100)}% chance)`);
});

export const convertRouter = router;   // ✅ named export expected by /factions/index.js
