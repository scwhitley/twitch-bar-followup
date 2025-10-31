// economy/vendor-fleet.js
import { EmbedBuilder } from "discord.js";
import { getBalance, subBalance, addItem } from "./econ-core.js";
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

export const CARS = [
  { alias: "voidrunner",  name: "Kessel Voidrunner",  year: 2037, price: 650,  range: "620 mi/charge",  maxCharge: 620,  features: ["Grav-stabilized chassis", "Adaptive HUD", "Silent glide"] },
  { alias: "stargo",      name: "Coruscant Stargo S", year: 2038, price: 900,  range: "710 mi/charge",  maxCharge: 710,  features: ["Metro autopilot+", "Neon aerofoil", "Holo-dash"] },
  { alias: "banewing",    name: "Sith Banewing GT",   year: 2039, price: 1200, range: "680 mi/charge",  maxCharge: 680,  features: ["Twin ion boost", "Night canopy", "Mag-brakes"] },
  { alias: "moonside23",  name: "Moonside 23 Aer",    year: 2036, price: 500,  range: "540 mi/charge",  maxCharge: 540,  features: ["EVA-grade seals", "Panoramic dome", "Street stealth"] },
  { alias: "sablehawk",   name: "Sable Hawk LX",      year: 2038, price: 700,  range: "600 mi/charge",  maxCharge: 600,  features: ["Cloak-tint glass", "Smart traction", "Holo-key"] },
  { alias: "quasar",      name: "Quasar Meridian",    year: 2039, price: 950,  range: "720 mi/charge",  maxCharge: 720,  features: ["Quantum nav", "Airblade fins", "Zero-lag torque"] },
  { alias: "redcomet",    name: "Red Comet RS",       year: 2037, price: 640,  range: "590 mi/charge",  maxCharge: 590,  features: ["Boost spool", "Street sync", "Aero splitter"] },
  { alias: "onyxphase",   name: "Onyx Phase IX",      year: 2040, price: 1400, range: "760 mi/charge",  maxCharge: 760,  features: ["Phase-array lidar", "Ghost mode", "Self-seal tires"] },
  { alias: "driftscythe", name: "Drift Scythe Pro",   year: 2038, price: 820,  range: "610 mi/charge",  maxCharge: 610,  features: ["Sidewinder steer", "Drift assist", "Cold-ion AC"] },
  { alias: "starion",     name: "Starion Vale",       year: 2036, price: 480,  range: "520 mi/charge",  maxCharge: 520,  features: ["City pilot", "Eco cell", "Compact cabin"] },
  { alias: "darklancer",  name: "Dark Lancer R",      year: 2040, price: 1600, range: "780 mi/charge",  maxCharge: 780,  features: ["Overdrive ion", "Carbon weave", "Auto-stabil fins"] },
  { alias: "nebulite",    name: "Nebulite Prime",     year: 2039, price: 920,  range: "705 mi/charge",  maxCharge: 705,  features: ["Cosmo nav", "Nebula glass", "Lane warp"] },
  { alias: "ravenx",      name: "Raven X Echo",       year: 2037, price: 600,  range: "600 mi/charge",  maxCharge: 600,  features: ["Echo soundstage", "Mist cooling", "Night visor"] },
  { alias: "kyberline",   name: "Kyberline Vector",   year: 2040, price: 1250, range: "750 mi/charge",  maxCharge: 750,  features: ["Kyber-grade cells", "Crystal sync", "Rapid dock"] },
  { alias: "glidefox",    name: "Glidefox Aero",      year: 2038, price: 720,  range: "615 mi/charge",  maxCharge: 615,  features: ["Slipstream body", "Holo mirrors", "Auto lane"] },
  { alias: "blacknova",   name: "Black Nova Supra",   year: 2039, price: 1100, range: "735 mi/charge",  maxCharge: 735,  features: ["Nova pack", "Sonic dampers", "G-force seats"] },
  { alias: "ionpike",     name: "Ion Pike Trail",     year: 2037, price: 560,  range: "605 mi/charge",  maxCharge: 605,  features: ["Trail lift", "Grav dampers", "Cargo grid"] },
  { alias: "scarlex",     name: "Scarlex Phantom",    year: 2041, price: 1750, range: "800 mi/charge",  maxCharge: 800,  features: ["Specter drive", "Auto aero-trim", "Guardian swarm"] },
  { alias: "vaporshift",  name: "VaporShift T",       year: 2038, price: 780,  range: "640 mi/charge",  maxCharge: 640,  features: ["Vapor cooling", "Shift matrix", "HUD ribbon"] },
  { alias: "echelon",     name: "Echelon Crown",      year: 2041, price: 2000, range: "820 mi/charge",  maxCharge: 820,  features: ["Crown AI", "Royal cabin", "Auto valet"] },
];

const OWN_KEY    = (uid) => `fleet:owned:${uid}`;
const CHARGE_KEY = (uid, alias) => `fleet:charge:${uid}:${alias}`;

const carByAlias = (alias) => CARS.find(c => c.alias === alias);

const inventoryEmbed = () =>
  new EmbedBuilder()
    .setTitle("🚗 Distorted Fleet — Inventory")
    .setDescription(CARS.map(c => `• **!${c.alias}** — ${c.name} (${c.year}) · **${c.price} DD**`).join("\n"))
    .setColor("DarkRed");

const carDetailEmbed = (car, charge = null) =>
  new EmbedBuilder()
    .setTitle(`🚘 ${car.name} — ${car.year}`)
    .addFields(
      { name: "Range (full)", value: car.range, inline: true },
      { name: "Price", value: `${car.price} DD`, inline: true },
      { name: "Features", value: car.features.map(f => `• ${f}`).join("\n") }
    )
    .setFooter({
      text: charge != null ? `Your current charge: ${charge}/${car.maxCharge}` : "Buy to unlock charge tracking",
    })
    .setColor("DarkRed");

export async function onMessageCreate(msg) {
  if (msg.author.bot || msg.__handled) return;

  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  // Inventory
  if (cmd === "!car" || cmd === "!cars" || cmd === "!inventorycars") {
    await msg.channel.send({ embeds: [inventoryEmbed()] });
    msg.__handled = true;
    return;
  }

  // Car detail via alias (e.g., !voidrunner)
  if (cmd.startsWith("!")) {
    const alias = cmd.slice(1);
    const car = carByAlias(alias);
    if (car) {
      const charge = await redis.get(CHARGE_KEY(msg.author.id, alias));
      const cur = charge != null ? parseInt(charge) : null;
      await msg.channel.send({ embeds: [carDetailEmbed(car, cur)] });
      msg.__handled = true;
      return;
    }
  }

  // Purchase
  if (cmd === "!buycar") {
    const alias = (parts[1] || "").toLowerCase();
    const car = carByAlias(alias);
    if (!car) {
      await msg.reply("Use `!car` to see inventory, then `!buycar <alias>`.");
      msg.__handled = true;
      return;
    }

    const bal = await getBalance(msg.author.id);
    if (bal < car.price) {
      await msg.reply(`Insufficient funds. You need **${car.price - bal} DD** more.`);
      msg.__handled = true;
      return;
    }

    await subBalance(msg.author.id, car.price);
    await redis.sadd(OWN_KEY(msg.author.id), alias);
    await redis.set(CHARGE_KEY(msg.author.id, alias), car.maxCharge);
    await addItem(msg.author.id, `Vehicle: ${car.name} (${car.year})`, 1);

    const e = new EmbedBuilder()
      .setTitle("🧾 Purchase Complete")
      .setDescription(`**${msg.author.username}** purchased **${car.name}** for **${car.price} DD**.\nThanks for choosing Distorted Fleet Exports — enjoy the ride!`)
      .setColor("DarkRed");

    await msg.channel.send({ embeds: [e] });
    msg.__handled = true;
    return;
  }
}
