// ------------ Imports -------------
import { DRINKS } from "./data/drink-menu.js";
import { QUIPS } from "./data/drink-quips.js";

// Single handler for all drink-related commands
export async function onMessageCreate(msg) {
  const content = msg.content.toLowerCase().trim();

  // !menu command
  if (content.startsWith("!menu")) {
    let menuLines = Object.values(DRINKS).map(
      (drink) => `${drink.name} — ${drink.price} Distortion Dollars :: ${drink.description}`
    );
    const menuText = "📜 Drink Menu 📜\n" + menuLines.join("\n");
    return menuText;
  }

  // TODO: add !senddrink, !receive, etc. here later

  return;
}
