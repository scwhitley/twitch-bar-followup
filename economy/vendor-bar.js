// economy/vendor-bar.js
import { EmbedBuilder } from "discord.js";
import { getBalance, subBalance, addItem } from "./econ-core.js";

// Menu: classics + Sith/Star-Wars vibes
const DRINKS = [
  // Classics
  { alias: "oldfashioned", name: "Old Fashioned", price: 18, desc: "Bourbon, bitters, sugar cube, orange peel." },
  { alias: "martini", name: "Classic Martini", price: 17, desc: "Gin or vodka, whisper of vermouth, olive." },
  { alias: "margarita", name: "Margarita", price: 16, desc: "Tequila, lime, triple sec, salted rim." },
  { alias: "mojito", name: "Mojito", price: 15, desc: "Rum, mint, lime, bubbly refresh." },
  { alias: "espresso", name: "Espresso Martini", price: 18, desc: "Vodka, espresso, coffee liqueur — wired & classy." },
  { alias: "negroni", name: "Negroni", price: 16, desc: "Gin, Campari, vermouth — bitter bliss." },

  // Distorted / Sith-flavored
  { alias: "sithsour", name: "Sith Sour", price: 19, desc: "Smoked bourbon, dark foam, citrus bite." },
  { alias: "kyberfizz", name: "Kyber Fizz", price: 17, desc: "Iridescent gin fizz with crystal glow." },
  { alias: "darkside", name: "Dark Side Olde", price: 19, desc: "Black rum & spice with ominous sweetness." },
  { alias: "mustafar", name: "Mustafar Mule", price: 16, desc: "Overproof rum, ginger, lava-heat chili." },
  { alias: "coruscant", name: "Coruscant Sky", price: 18, desc: "Vodka, blue citrus, skyline shimmer." },
  { alias: "darthmocha", name: "Darth Mocha", price: 17, desc: "Spiked cold brew with cocoa & menace." },
];

const THANKS = [
  "Appreciate the patronage — may your night level up.",
  "Tab updated. Don’t spill it on the datapad.",
  "Cheers! Dark and delightful.",
  "Receipt vanished into the void. The drink did not. Enjoy.",
  "House rule: sip like a Sith, tip like a Senator.",
];

const menuEmbed = () =>
  new EmbedBuilder()
    .setTitle("🍸 The Stirred Veil — Menu")
    .setDescription(DRINKS.map(d => `• **!${d.alias}** — ${d.name} · **${d.price} DD**\n  _${d.desc}_`).join("\n"))
    .setColor("Purple");

async function buy(msg, drink, qty = 1) {
  const total = drink.price * qty;
  const bal = await getBalance(msg.author.id);
  if (bal < total) { await msg.reply(`You’re short **${total - bal} DD**.`); msg.__handled = true; return; }

  await subBalance(msg.author.id, total);
  await addItem(msg.author.id, `Drink: ${drink.name}`, qty);

  const e = new EmbedBuilder()
    .setTitle("🥂 Order Up")
    .setDescription(`**${msg.author.username}** purchased ${qty} × **${drink.name}** for **${total} DD**.\n${THANKS[Math.floor(Math.random()*THANKS.length)]}`)
    .setColor("Purple");
  await msg.channel.send({ embeds: [e] });
  msg.__handled = true;
}

export async function onMessageCreate(msg) {
  if (msg.author.bot || msg.__handled) return;
  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  if (cmd === "!menu" || cmd === "!bar") {
    await msg.channel.send({ embeds: [menuEmbed()] });
    msg.__handled = true;
    return;
  }

  if (cmd.startsWith("!")) {
    const alias = cmd.slice(1);
    const drink = DRINKS.find(d => d.alias === alias);
    if (!drink) return;
    const qtyArg = parseInt(parts[1], 10);
    const qty = Number.isFinite(qtyArg) && qtyArg > 0 ? qtyArg : 1;
    await buy(msg, drink, qty);
    return;
  }
}
