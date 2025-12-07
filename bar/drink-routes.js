// ------------ Imports -------------
import { QUIPS } from "./data/drink-quips.js";
import { DRINKS } from "./data/drink-menu.js";

// Skeleton handler for drink commands
export async function onMessageCreate(msg) {
  // For now, just return nothing until we wire logic
  // Later we'll parse msg.content for !whiskey, !senddrink, etc.
  return;
}

// Show the full drink menu
export async function onMessageCreate(msg) {
  const content = msg.content.toLowerCase().trim();

  // !menu command
  if (content.startsWith("!menu")) {
    // Build menu string
    let menuLines = Object.values(DRINKS).map(
      (drink) => `${drink.name} — ${drink.price} Distortion Dollars :: ${drink.description}`
    );

    // Join into one response
    const menuText = "📜 Drink Menu 📜\n" + menuLines.join("\n");

    return menuText;
  }

  // Other commands (order, send, receive) will go here later
  return;
}

