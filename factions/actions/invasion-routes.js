// /factions/actions/invasion-routes.js
import express from "express";
import { INVASION_DEFAULT_SEC } from "../core/faction-constants.js";
import { invasionActiveKey, invasionEndsKey, invasionLockKey } from "../core/alignment-core.js";
import { pick } from "../core/faction-utils.js";

export const invasionRouter = express.Router();

// /invasion/start?by=<name>[&seconds=180]
invasionRouter.get("/invasion/start", async (req, res) => {
  const by = String(req.query.by || "").trim().replace(/^@+/, "").toLowerCase();
  const sec = Math.max(30, Math.min(900, Number(req.query.seconds || INVASION_DEFAULT_SEC)));

  if (await req.app.locals.redis.get(invasionLockKey())) {
    return res.type("text/plain").send("Invasion already triggered today.");
  }

  const endsAt = Date.now() + sec * 1000;

  await Promise.all([
    req.app.locals.redis.set(invasionActiveKey(), 1, { ex: sec }),
    req.app.locals.redis.set(invasionEndsKey(), String(endsAt), { ex: sec + 60 }),
    req.app.locals.redis.set(invasionLockKey(), 1, { ex: 24 * 3600 }),
  ]);

  const INVASION_STARTS = [
    "Sirens wail. Doors lock. Credits flow.",
    "Shroud flares — opportunists grin.",
    "The floor hums: double gains for all who act.",
  ];
  const line = pick(INVASION_STARTS) || "Invasion begins — double points!";
  return res.type("text/plain").send(`@${by || "someone"} triggers an INVASION: ${line} (ends in ~${sec}s)`);
});

invasionRouter.get("/invasion/stop", async (_req, res) => {
  await Promise.all([
    _req.app.locals.redis.del(invasionActiveKey()),
    _req.app.locals.redis.del(invasionEndsKey()),
  ]);
  return res.type("text/plain").send("Invasion ended. Points return to normal.");
});
