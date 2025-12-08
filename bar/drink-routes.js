// /bar/drink-routes.js

// ------------ Imports -------------
import express from "express";
import { DRINKS } from "./data/drink-menu.js";
import { QUIPS } from "./data/drink-quips.js";
import { getBalance, deductBalance } from "./data/bar-economy.js";

const router = express.Router();

// --- /drinks/send ---
router.get("/drinks/send", async (req, res) => {
  const fromUser = (req.query.from || "").replace("@", "");
  const toUser = (req.query.to || "").replace("@", "");
  const drinkKey = (req.query.drink || "").toLowerCase();

  const drink = DRINKS[drinkKey];
  if (!drink) return res.type("text/plain").send(`Sorry, ${fromUser}, that drink isn’t on the menu.`);
  if (!toUser) return res.type("text/plain").send(`You need to specify who to send the drink to, ${fromUser}.`);

  const balance = getBalance(fromUser);
  if (balance < drink.price) {
    return res.type("text/plain").send(`@${fromUser}, you don’t have enough Distortion Dollars for a ${drink.name}. Balance: ${balance}`);
  }

  const newBalance = deductBalance(fromUser, drink.price);

  return res.type("text/plain").send(
    `@${fromUser} has sent a ${drink.name} to @${toUser}! They have ${newBalance} Distortion Dollars left. Make sure to thank them for the drink!`
  );
});

// --- /drinks/receive ---
const drinkCounts = {};
function bumpDrinkCount(user) {
  if (!drinkCounts[user]) drinkCounts[user] = 0;
  drinkCounts[user] += 1;
  return drinkCounts[user];
}

router.get("/drinks/receive", (req, res) => {
  const fromUser = (req.query.from || "").replace("@", "");
  const toUser = (req.query.to || "").replace("@", "");
  const drinkKey = (req.query.drink || "").toLowerCase();

  const drink = DRINKS[drinkKey];
  if (!drink) return res.type("text/plain").send(`Sorry, ${toUser}, that drink isn’t on the menu.`);

  const count = bumpDrinkCount(toUser);
  let counterLine = ` That’s drink #${count} tonight.`;
  if (count === 3) counterLine += " Remember to hydrate. 💧";
  if (count === 5) counterLine += " Easy there, champion. 🛑 Hydration check!";
  if (count === 7) counterLine += " Why are you crying and dancing on the table shirtless?";
  if (count === 10) counterLine += " 🚕 Call them an uber. Security get them out of here!";

  const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)];

  return res.type("text/plain").send(
    `@${toUser} has received a ${drink.name} from @${fromUser}!${counterLine} ${quip}`
  );
});

// --- /drinks/menu ---
router.get("/drinks/menu", (req, res) => {
  let menuLines = Object.values(DRINKS).map(
    (drink) => `${drink.name} — ${drink.price}`
  );
  const menuText = "📜 Drink Menu 📜\n" + menuLines.join("\n");
  return res.type("text/plain").send(menuText);
});

// Exports
export { router };

export async function onMessageCreate(msg) {
  // Dispatcher logic for !menu, !senddrink, !receive if you want chat commands too
  return;
}

