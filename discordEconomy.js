// discordEconomy.js (ESM) — temporary in-memory economy
const DRINKS = [
  { key: 'margarita',   name: 'Margarita',       price: 30, desc: 'Tequila, lime, triple sec. Salted rim, salty attitude.' },
  { key: 'espresso',    name: 'Espresso Shot',   price: 15, desc: 'Concentrated caffeine missile. Aim responsibly.' },
  { key: 'cosmo',       name: 'Cosmopolitan',    price: 28, desc: 'Vodka, cranberry, lime, triple sec. Pink, but it bites.' },
  { key: 'mojito',      name: 'Mojito',          price: 26, desc: 'Rum, mint, lime, sugar. Refreshing chaos.' },
  { key: 'oldfashioned',name: 'Old Fashioned',   price: 32, desc: 'Whiskey, bitters, sugar cube. Classic menace.' },
  { key: 'negroni',     name: 'Negroni',         price: 29, desc: 'Gin, Campari, vermouth. Bitter—like your ex.' },
  { key: 'manhattan',   name: 'Manhattan',       price: 31, desc: 'Whiskey, sweet vermouth, bitters. Big city energy.' },
  { key: 'daiquiri',    name: 'Daiquiri',        price: 25, desc: 'Rum, lime, sugar. Minimalist trouble.' },
  { key: 'whiskeysour', name: 'Whiskey Sour',    price: 27, desc: 'Whiskey, lemon, simple syrup. Foam if you fancy.' },
  { key: 'pina',        name: 'Piña Colada',     price: 24, desc: 'Rum, coconut, pineapple. Vacation in a glass.' },
];

const QUIPS = [
  "Careful—this one stares back.",
  "House special: regret with a lime wedge.",
  "Pairs nicely with questionable decisions.",
  "Shaken, not judged.",
  "Distilled courage, bottled chaos.",
  "Best enjoyed away from your ex’s DMs.",
  "Calories don’t count at The Veil.",
  "If it burns, it’s working.",
  "Garnished with poor impulse control.",
  "Goes down smoother than your excuses.",
  "Do not taunt the cocktail.",
  "Comes with free advice you won’t follow.",
  "Looks classy. Acts feral.",
  "Conceived in a lab, approved by gremlins.",
  "Sip it before it sips you.",
  "Brewed in the back room by rumors.",
  "Fortified with vibes and spite.",
  "Legend says the third one talks.",
  "Wiser folks stopped at two.",
  "We are legally required to say ‘enjoy.’",
];

const wallets = new Map(); // key `${platform}:${userId}` -> { balance, lifetimeDrinks }
const keyOf = ({ platform, userId }) => `${platform}:${userId}`;
function getOrInitWallet({ platform, userId }) {
  const k = keyOf({ platform, userId });
  if (!wallets.has(k)) wallets.set(k, { balance: 100, lifetimeDrinks: 0 });
  return wallets.get(k);
}

export async function getMenu() { return DRINKS; }

export async function getBalance({ platform, userId }) {
  const w = getOrInitWallet({ platform, userId });
  return { balance: w.balance, lifetimeDrinks: w.lifetimeDrinks };
}

export async function purchaseDrink({ platform, userId, command }) {
  const drink = DRINKS.find(d => d.key === command);
  if (!drink) return { ok: false, error: `Unknown drink: ${command}` };

  const w = getOrInitWallet({ platform, userId });
  if (w.balance < drink.price) return { ok: false, error: `You're short ${drink.price - w.balance} DD.` };

  w.balance -= drink.price;
  w.lifetimeDrinks += 1;

  const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)];
  const message =
    `Here’s your **${drink.name}** — that’ll be **${drink.price} DD**.\n` +
    `_${quip}_\n` +
    `> ${drink.desc}\n` +
    `Balance: **${w.balance} DD** | Lifetime drinks: **${w.lifetimeDrinks}**`;

  return { ok: true, message, newBalance: w.balance, lifetimeDrinks: w.lifetimeDrinks };
}
