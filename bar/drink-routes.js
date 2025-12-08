// ------------ Imports -------------
import { DRINKS } from "./data/drink-menu.js";
import { QUIPS } from "./data/drink-quips.js";

// Import your economy helpers (adjust path to match your repo)
import { getBalance, deductBalance } from "./data/bar-economy.js";

const router = express.Router();

// Simple in-memory drink counter
const drinkCounts = {};
function bumpDrinkCount(user) {
  if (!drinkCounts[user]) drinkCounts[user] = 0;
  drinkCounts[user] += 1;
  return drinkCounts[user];
}

export { router };
// ------------ Handler -------------
export async function onMessageCreate(msg) {
  const content = msg.content.toLowerCase().trim();

  // --- !menu ---
  if (content.startsWith("!menu")) {
    let menuLines = Object.values(DRINKS).map(
      (drink) => `${drink.name} — ${drink.price} Distortion Dollars :: ${drink.description}`
    );
    return "📜 Drink Menu 📜\n" + menuLines.join("\n");
  }

  // --- !senddrink <drink> @user ---
  if (content.startsWith("!senddrink")) {
    const parts = msg.content.split(" ");
    const drinkKey = (parts[1] || "").toLowerCase();
    const toUser = (parts[2] || "").replace("@", "");
    const fromUser = msg.author;

    const drink = DRINKS[drinkKey];
    if (!drink) return `Sorry, ${fromUser}, that drink isn’t on the menu.`;
    if (!toUser) return `You need to specify who to send the drink to, ${fromUser}.`;

    // Economy integration
    const balance = await getBalance(fromUser);
    if (balance < drink.price) {
      return `@${fromUser}, you don’t have enough Distortion Dollars for a ${drink.name}. Balance: ${balance}`;
    }

    await deductBalance(fromUser, drink.price);
    const newBalance = balance - drink.price;

    return `@${fromUser} has sent a ${drink.name} to @${toUser}! They have ${newBalance} Distortion Dollars left. Make sure to thank them for the drink!`;
  }

  // --- !receive <drink> @fromUser ---
  if (content.startsWith("!receive")) {
    const parts = msg.content.split(" ");
    const drinkKey = (parts[1] || "").toLowerCase();
    const fromUser = (parts[2] || "").replace("@", "");
    const toUser = msg.author;

    const drink = DRINKS[drinkKey];
    if (!drink) return `Sorry, ${toUser}, that drink isn’t on the menu.`;

    const count = bumpDrinkCount(toUser);
    let counterLine = ` That’s drink #${count} tonight.`;
    if (count === 3) counterLine += " Remember to hydrate. 💧";
    if (count === 5) counterLine += " Easy there, champion. 🛑 Hydration check!";
    if (count === 7) counterLine += " Why are you crying and dancing on the table shirtless?";
    if (count === 10) counterLine += " 🚕 Call them an uber. Security get them out of here!";

    const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)];

    return `@${toUser} has received a ${drink.name} from @${fromUser}!${counterLine} ${quip}`;
  }

  return;
}


