// /factions/index.js
import express from "express";

// ---- HTTP Routers (each file must export a Router with this name) ----
import { convertRouter }    from "./elo/convert-routes.js";
// If you convert elo-commands.js into an HTTP router later, import it here:
// import { eloRouter }     from "./elo/elo-commands.js";

import { rallyRouter }      from "./actions/rally-route.js";
import { meditateRouter }   from "./actions/meditate-route.js";
import { seetheRouter }     from "./actions/seethe-route.js";
import { eventRouter }      from "./actions/event-route.js";
import { invasionRouter }   from "./actions/invasion-routes.js";
import { duelRouter }       from "./actions/duel-route.js";
import { eloRouter }        from "./elo/elo-http.js";

import { forceTrialRouter } from "./trial/force-trial-routes.js";

// ---- Optional: Discord message handlers (not HTTP) ----
export { onMessageCreate as onEloMsg } from "./elo/elo-commands.js";

// ---- Aggregate router ----
export const factionsRouter = express.Router();

// Mount sub-routers (order only matters if paths overlap)
factionsRouter.use(convertRouter);

// If/when you have an eloRouter HTTP router, uncomment the line below
// factionsRouter.use(eloRouter);
router.use(eloRouter);  
factionsRouter.use(rallyRouter);
factionsRouter.use(meditateRouter);
factionsRouter.use(seetheRouter);
factionsRouter.use(eventRouter);
factionsRouter.use(invasionRouter);
factionsRouter.use(duelRouter);

factionsRouter.use(forceTrialRouter);
