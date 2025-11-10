// /factions/actions/event-route.js
import { EVENT_MIN_GAP_SEC } from "../core/faction-constants.js";
import { eventLastKey } from "../core/alignment-core.js";

export function registerEventRoute(app, { redis, pick, addFactionPoints }) {
  // You can inject a BAR_EVENTS pool if you want flavor + effects
  const BAR_EVENTS = [
    { text: "A hush falls — then laughter erupts.", effect: { jedi: +1 } },
    { text: "A glass shatters; wagers double.", effect: { sith: +1 } },
    { text: "A courier whispers of raids. Tension rises.", effect: {} },
  ];

  app.get("/event/random", async (_req, res) => {
    const last = Number((await redis.get(eventLastKey())) || 0);
    const now  = Date.now();
    if (now - last < EVENT_MIN_GAP_SEC * 1000) {
      return res.type("text/plain").send("Event cooling…");
    }
    await redis.set(eventLastKey(), now);

    const ev = pick(BAR_EVENTS);
    if (ev?.effect) {
      if (typeof ev.effect.jedi === "number") await addFactionPoints("jedi", ev.effect.jedi);
      if (typeof ev.effect.sith === "number") await addFactionPoints("sith", ev.effect.sith);
    }
    const text = ev?.text || "Strange vibes pass through the bar.";
    return res.type("text/plain").send(`Bar Event: ${text}`);
  });
}
