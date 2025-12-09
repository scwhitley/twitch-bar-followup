// /bar/index.js
import { router, onMessageCreate } from "./drink-routes.js";

export function registerDrinkRoutes(app) {
  // Mount all drink routes under /drinks
  app.use("/drinks", router);
}

export { onMessageCreate };
