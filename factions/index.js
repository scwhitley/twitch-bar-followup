// /factions/index.js
import express from "express";

// Convert
import { convertRouter }   from "./elo/convert-routes.js";

// Actions
import { rallyRouter }     from "./actions/rally-route.js";
import { meditateRouter }  from "./actions/meditate-route.js";
import { seetheRouter }    from "./actions/seethe-route.js";
import { eventRouter }     from "./actions/event-route.js";
import { invasionRouter }  from "./actions/invasion-routes.js";
import { duelRouter }      from "./actions/duel-route.js";

// Force trial (legacy HTTP flow)
import { forceTrialRouter } from "./trial/force-trial-routes.js";

// Re-export any Discord message handlers you still use (not routers)
export { onMessageCreate as onEloMsg } from "./elo/elo-commands.js";

const router = express.Router();

// Mount sub-routers (order only matters if paths overlap)
if (eloRouter)        router.use(eloRouter);
router.use(convertRouter);

router.use(rallyRouter);
router.use(meditateRouter);
router.use(seetheRouter);
router.use(eventRouter);
router.use(invasionRouter);
router.use(duelRouter);

router.use(forceTrialRouter);

export { router as factionsRouter };
