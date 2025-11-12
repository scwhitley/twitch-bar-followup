// factions/index.js
import express from "express";

// ---- Routers (HTTP endpoints) ----
// ELO + conversion
import { eloRouter }          from "./elo/elo-commands.js";
import { convertRouter }      from "./elo/convert-routes.js";

// Action routes
import { rallyRouter }        from "./actions/rally-route.js";
import { meditateRouter }     from "./actions/meditate-route.js";
import { seetheRouter }       from "./actions/seethe-route.js";
import { eventRouter }        from "./actions/event-route.js";
import { invasionRouter }     from "./actions/invasion-routes.js";
import { duelRouter }         from "./actions/duel-route.js";

// Force trial routes
import { forceTrialRouter }   from "./trial/force-trial-routes.js";

// ---- Optional: message-based handlers (chat commands) ----
// If your elo-commands.js exports a Discord handler for "!elo" etc., re-export it:
export { onMessageCreate as onEloMsg } from "./elo/elo-commands.js";
// If you later add message handlers under actions/trial, re-export similarly.

export const factionsRouter = express.Router();
factionsRouter.use(convertRouter);
// ... mount other routers

export function registerFactionRoutes(app) {
  app.use(factionsRouter);
}

// ---- Build aggregated router ----
const router = express.Router();

// Mount sub-routers. Order is not critical unless paths overlap.
router.use(eloRouter);
router.use(convertRouter);

router.use(rallyRouter);
router.use(meditateRouter);
router.use(seetheRouter);
router.use(eventRouter);
router.use(invasionRouter);
router.use(duelRouter);

router.use(forceTrialRouter);

