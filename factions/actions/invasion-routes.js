// /factions/actions/invasion-routes.js
import { INVASION_DEFAULT_SEC } from "../core/faction-constants.js";
import { invasionActiveKey, invasionEndsKey, invasionLockKey } from "../core/alignment-core.js";

export function registerInvasionRoutes(app, { redis, pick }) {
  const INVASION_STARTS = [
    "Sirens wail. Doors lock. Credits flow.",
    "Shroud flares — opportunists grin.",
    "The floor hums: double gains for all who act.",
  ];

  app.get("/invasion/start", async (req, res) => {
    const by = String(req.query.by || "").trim().replace(/^@+/, "").toLowerCase();
    const sec = Math.max(30, Math.min(900, Number(req.query.seconds || INVASION_DEFAULT_SEC)));

    if (await redis.get(invasionLockKey())) {
      return res.type("text/plain").send("Invasion already triggered today.");
    }
    const endsAt = Date.now() + sec * 1000;

    await Promise.all([
      redis.set(invasionActiveKey(), 1, { ex: sec }),
      redis.set(invasionEndsKey(), String(endsAt), { ex: sec + 60 }),
      redis.set(invasionLockKey(), 1, { ex: 24 * 3600 }),
    ]);

    const line = pick(INVASION_STARTS) || "Invasion begins — double points!";
    return res.type("text/plain").send(`@${by || "someone"} triggers an INVASION: ${line} (ends in ~${sec}s)`);
  });

  app.get("/invasion/stop", async (_req, res) => {
    await Promise.all([
      redis.del(invasionActiveKey()),
      redis.del(invasionEndsKey()),
    ]);
    return res.type("text/plain").send("Invasion ended. Points return to normal.");
  });
}
