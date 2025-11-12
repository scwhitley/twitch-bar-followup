// /factions/actions/event-route.js
import express from "express";
import { Redis } from "@upstash/redis";

import { EVENT_MIN_GAP_SEC } from "../core/faction-constants.js";
import { addFactionPoints } from "../core/alignment-core.js";
import { pick } from "../core/faction-utils.js";

// NOTE: BAR_EVENTS likely lives at project root as faction-text.js.
// Adjust the path if yours is different.
import { BAR_EVENTS } from "../../faction-text.js";

const redis = Redis.fromEnv();
const router = express.Router();

const eventLastKey = () => `event:last`; // single global throttle

router.get("/event/random", async (_req, res) => {
  try {
    const last = Number((await redis.get(eventLastKey())) || 0);
    const now = Date.now();

    if (now - last < EVENT_MIN_GAP_SEC * 1000) {
      const wait = Math.ceil((EVENT_MIN_GAP_SEC * 1000 - (now - last)) / 1000);
      return res.type("text/plain").send(`Event cooling… (${wait}s)`);
    }

    await redis.set(eventLastKey(), now);

    const ev = pick(BAR_EVENTS);
    if (ev?.effect) {
      if (typeof ev.effect.jedi === "number") await addFactionPoints("jedi", ev.effect.jedi);
      if (typeof ev.effect.sith === "number") await addFactionPoints("sith", ev.effect.sith);
    }

    const text = ev?.text || "Strange vibes pass through the bar.";
    return res.type("text/plain").send(`Bar Event: ${text}`);
  } catch (err) {
    console.error("[/event/random] error:", err);
    return res.type("text/plain").status(500).send("Event error.");
  }
});

export const eventRouter = router;
export default router;
