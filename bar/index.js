// /bar/index.js
// Facade for all drink-related logic

import { router, onMessageCreate } from "./drink-routes.js";
export { onMessageCreate } from "./drink-routes.js";

// Facade to register all bar-related API routes
export function registerDrinkRoutes(app) {
  app.use(router);
}

export { onMessageCreate };








