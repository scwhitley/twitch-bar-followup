// /factions/index.js
import express from "express";

// ---- Discord chat handlers you expose from factions (optional) ----
export { onMessageCreate as onEloMsg } from "./elo/elo-commands.js";

// ---- Routers (HTTP endpoints) ----
import { eloRouter }        from "./elo/elo-commands.js";        // if this file defines HTTP endpoints
import { convertRouter }    from "./elo/convert-routes.js";

import { rallyRouter }      from "./actions/rally-route.js";
import { meditateRouter }   from "./actions/meditate-route.js";
import { seetheRouter }     from "./actions/seethe-route.js";
import { eventRouter }      from "./actions/event-route.js";
import { invasionRouter }   from "./actions/invasion-routes.js";
import { duelRouter }       from "./actions/duel-route.js";

import { forceTrialRouter } from "./trial/force-trial-routes.js";

// ---- Build one combined router and export it ----
const router = express.Router();

// Mount sub-routers. Order only matters if paths overlap.
router.use(eloRouter);        // if present
router.use(convertRouter);

router.use(rallyRouter);
router.use(meditateRouter);
router.use(seetheRouter);
router.use(eventRouter);
router.use(invasionRouter);
router.use(duelRouter);

router.use(forceTrialRouter);

export { router as factionsRouter };
