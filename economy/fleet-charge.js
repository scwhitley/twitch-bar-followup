// economy/fleet-charge.js
import { EmbedBuilder } from "discord.js";
import { getBalance, subBalance } from "./econ-core.js";
import { Redis } from "@upstash/redis";
import { CARS } from "./vendor-fleet.js";
const redis = Redis.fromEnv();

const OWN_KEY = (uid) => `fleet:owned:${uid}`;
const CHARGE_KEY = (uid, alias) => `fleet:charge:${uid}:${alias}`;

const ENFORCE_FLEET_CHARGE = process.env.ENFORCE_FLEET_CHARGE === "1";
const FLEET_CHARGE_CHANNEL_ID = process.env.FLEET_CHARGE_CHANNEL_ID || "distorted-fleet-charge";

function carByAlias(a){ return CARS.find(c=>c.alias===a); }
function channelMatches(channel) {
  const id = String(FLEET_CHARGE_CHANNEL_ID);
  if (/^\d{16,20}$/.test(id)) return String(channel?.id) === id;
  return String(channel?.name || "").toLowerCase() === id.toLowerCase();
}

/**
 * DRIVE_EVENTS: per-car arrays of events.
 * - miles: how many charge units to consume
 * - ddCost: optional DD cost (negative numbers); omitted/0 = no cost
 */
const DRIVE_EVENTS = {
  // Sporty/long-range events tend to use more miles
  voidrunner: [
    { text: "Cruised the Distortia Loop in silent glide.", miles: 18 },
    { text: "Quick dash across Central Plaza arteries.", miles: 12, ddCost: -3 },
    { text: "Late-night skyline tour, soft underglow on.", miles: 28 },
    { text: "Detour through Market Ring (toll gates).", miles: 14, ddCost: -5 },
  ],
  stargo: [
    { text: "Metro autopilot along the Rapid Loop.", miles: 16 },
    { text: "Errands in Crystal Row with smooth stops.", miles: 10, ddCost: -2 },
    { text: "Scenic run to Starview Ridge.", miles: 24 },
    { text: "Short hop to Trade Docks (premium parking).", miles: 8, ddCost: -6 },
  ],
  banewing: [
    { text: "Night prowl through Apex Quarter.", miles: 26 },
    { text: "Mag-brake testing on the Upper Skyline.", miles: 22, ddCost: -4 },
    { text: "Swift sprint past the Tri-Arc Level.", miles: 18 },
    { text: "VIP lane to Core Heights (toll surge).", miles: 12, ddCost: -7 },
  ],
  moonside23: [
    { text: "Grocery glide to Central Plaza and back.", miles: 9 },
    { text: "Evening loop around Outlander Block.", miles: 7 },
    { text: "Shortcut through Mid Wreath service road.", miles: 12, ddCost: -2 },
    { text: "Quick school run across Commons East.", miles: 6 },
  ],
  sablehawk: [
    { text: "Commuter route via Transit Wreath.", miles: 14 },
    { text: "Side-street cruise with cloak-tint glass.", miles: 11 },
    { text: "Rainy-day errand circuit.", miles: 13, ddCost: -2 },
    { text: "Pickup at Rapid Loop depot (meter fees).", miles: 8, ddCost: -3 },
  ],
  quasar: [
    { text: "Quantum nav plotted the cleanest arc.", miles: 20 },
    { text: "Airblade fins sliced the morning traffic.", miles: 22 },
    { text: "Late appointment at Senate Reach garage.", miles: 15, ddCost: -4 },
    { text: "Twilight cruise over Starview bridges.", miles: 25 },
  ],
  redcomet: [
    { text: "Boost spool lit—quick errand blitz.", miles: 16 },
    { text: "Street sync path across Low Quarter.", miles: 10, ddCost: -2 },
    { text: "Aero splitter hum on the Rapid Loop.", miles: 18 },
    { text: "Garage hop near Trade Overlook.", miles: 9, ddCost: -3 },
  ],
  onyxphase: [
    { text: "Ghost mode through late-night traffic.", miles: 30 },
    { text: "Phase-array lidar stress test route.", miles: 34, ddCost: -6 },
    { text: "Core Heights to Apex Summit express.", miles: 26 },
    { text: "Self-seal tire check around Tri-Arc.", miles: 20 },
  ],
  driftscythe: [
    { text: "Sidewinder steering in Tight Alley Run.", miles: 19 },
    { text: "Practice drift at Market Ring lot (don’t tell).", miles: 22, ddCost: -5 },
    { text: "Cold-ion AC errand run.", miles: 12 },
    { text: "Night cruise to Skyveil Cluster.", miles: 18 },
  ],
  starion: [
    { text: "Compact hop to the Commons.", miles: 8 },
    { text: "City pilot errands around Central Plaza.", miles: 9, ddCost: -2 },
    { text: "Eco cell commute to Work Hub.", miles: 10 },
    { text: "Pickup at Transit Loop (short stay).", miles: 6, ddCost: -1 },
  ],
  darklancer: [
    { text: "Overdrive ion surging the Apex ascent.", miles: 36 },
    { text: "Carbon weave hum past Starview Ridge.", miles: 28 },
    { text: "Auto-stabil fins in crosswinds.", miles: 22, ddCost: -5 },
    { text: "VIP escort to Core Heights (priority toll).", miles: 18, ddCost: -8 },
  ],
  nebulite: [
    { text: "Cosmo nav mapped a quiet corridor.", miles: 17 },
    { text: "Nebula glass glowed at dusk.", miles: 15 },
    { text: "Lane warp through mid-day clog.", miles: 20, ddCost: -3 },
    { text: "Commons to Tri-Arc shuttle.", miles: 14 },
  ],
  ravenx: [
    { text: "Night visor tour of Low Quarter.", miles: 13 },
    { text: "Mist cooling during noon errands.", miles: 11 },
    { text: "Echo soundstage test drive.", miles: 16, ddCost: -2 },
    { text: "Shortcut via service tunnel (fee).", miles: 9, ddCost: -2 },
  ],
  kyberline: [
    { text: "Crystal-sync express around the Core.", miles: 24 },
    { text: "Rapid dock demo between towers.", miles: 20, ddCost: -4 },
    { text: "Kyber-grade sprint to Apex Quarter.", miles: 26 },
    { text: "Vector weave through Senate Reach.", miles: 22, ddCost: -3 },
  ],
  glidefox: [
    { text: "Slipstream glide along the Rapid Loop.", miles: 15 },
    { text: "Holo mirrors threaded the tight lanes.", miles: 13 },
    { text: "Autolane commute to Trade Docks.", miles: 16, ddCost: -2 },
    { text: "Evening coast to Starview Ridge.", miles: 17 },
  ],
  blacknova: [
    { text: "Nova pack weekend tour.", miles: 27 },
    { text: "Sonic dampers through cobbled streets.", miles: 19 },
    { text: "G-force seats on the Skyline turns.", miles: 23 },
    { text: "Premium park near Apex Quarter.", miles: 14, ddCost: -6 },
  ],
  ionpike: [
    { text: "Trail lift around Distortia Ridge.", miles: 18 },
    { text: "Grav dampers on the service roads.", miles: 15 },
    { text: "Cargo grid run to Trade Docks.", miles: 16, ddCost: -3 },
    { text: "Dusty detour near Cinder Belt.", miles: 20 },
  ],
  scarlex: [
    { text: "Specter drive through Skyveil Cluster.", miles: 34 },
    { text: "Auto aero-trim on high crosswinds.", miles: 30, ddCost: -5 },
    { text: "Guardian swarm escort demo.", miles: 28 },
    { text: "Apex Summit tollway (priority lane).", miles: 22, ddCost: -9 },
  ],
  vaporshift: [
    { text: "Vapor cooling on the noon rush.", miles: 16 },
    { text: "Shift matrix danced through lanes.", miles: 18 },
    { text: "HUD ribbon guided a scenic loop.", miles: 14 },
    { text: "Premium park near Central Plaza.", miles: 10, ddCost: -4 },
  ],
  echelon: [
    { text: "Crown AI chauffeured the gala circuit.", miles: 32 },
    { text: "Royal cabin cruise to Apex Summit.", miles: 28 },
    { text: "Auto valet at Core Heights (lux fee).", miles: 20, ddCost: -10 },
    { text: "Evening promenade above Starview Ridge.", miles: 24 },
  ],

  // fallback for any car without a table (shouldn't trigger, but safe)
  default: [
    { text: "Casual city loop.", miles: 12 },
    { text: "Errands across the Core.", miles: 9, ddCost: -2 },
    { text: "Scenic detour along the skyline.", miles: 16 },
    { text: "Short hop with a toll booth.", miles: 8, ddCost: -3 },
  ],
};

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  // !carcharge <alias>
  if (cmd === "!carcharge") {
    const alias = (parts[1] || "").toLowerCase();
    const car = carByAlias(alias);
    if (!car) return msg.reply("Usage: `!carcharge <car-alias>` (see `!cars`)");

    const owns = await redis.sismember(OWN_KEY(msg.author.id), alias);
    if (!owns) return msg.reply("You don't own that vehicle.");

    const cur = parseInt(await redis.get(CHARGE_KEY(msg.author.id, alias))) || 0;
    const e = new EmbedBuilder()
      .setTitle("🔋 Vehicle Charge")
      .setDescription(`**${car.name}** — ${cur}/${car.maxCharge} units\n(Full = ${car.range})`)
      .setColor("DarkRed");
    return msg.channel.send({ embeds: [e] });
  }

  // !drive <alias>  (uses per-car events)
  if (cmd === "!drive") {
    const alias = (parts[1] || "").toLowerCase();
    const car = carByAlias(alias);
    if (!car) return msg.reply("Usage: `!drive <car-alias>` (see `!cars`)");

    const owns = await redis.sismember(OWN_KEY(msg.author.id), alias);
    if (!owns) return msg.reply("You don't own that vehicle.");

    let cur = parseInt(await redis.get(CHARGE_KEY(msg.author.id, alias))) || 0;
    if (cur <= 0) return msg.reply("Your battery is empty. Use `!charge <alias>` in the charge room.");

    const table = DRIVE_EVENTS[alias] || DRIVE_EVENTS.default;
    const ev = table[Math.floor(Math.random() * table.length)];

    // consume miles, clamped by current charge
    const milesUsed = Math.min(ev.miles, cur);
    cur -= milesUsed;
    await redis.set(CHARGE_KEY(msg.author.id, alias), cur);

    // optional DD cost
    let ddApplied = 0;
    if (ev.ddCost && ev.ddCost < 0) {
      const needed = Math.abs(ev.ddCost);
      const bal = await getBalance(msg.author.id);
      if (bal >= needed) {
        await subBalance(msg.author.id, needed);
        ddApplied = ev.ddCost;
      } else {
        ddApplied = 0; // can't afford; we still drove, but no charge for the fee
      }
    }

    const e = new EmbedBuilder()
      .setTitle("🚦 Drive Event")
      .setDescription(
        `${ev.text}\n` +
        `Used **${milesUsed}** charge units.\n` +
        (ddApplied ? `Event cost: **${ddApplied} DD**\n` : "") +
        `Remaining charge: **${cur}/${car.maxCharge}**`
      )
      .setColor("DarkRed");
    return msg.channel.send({ embeds: [e] });
  }

  // !charge <alias> — fills to full in charge room (if enforced)
  if (cmd === "!charge") {
    if (ENFORCE_FLEET_CHARGE && !channelMatches(msg.channel)) {
      return msg.reply("Charging must be done in the **distorted-fleet-charge** room.");
    }

    const alias = (parts[1] || "").toLowerCase();
    const car = carByAlias(alias);
    if (!car) return msg.reply("Usage: `!charge <car-alias>`");

    const owns = await redis.sismember(OWN_KEY(msg.author.id), alias);
    if (!owns) return msg.reply("You don't own that vehicle.");

    let cur = parseInt(await redis.get(CHARGE_KEY(msg.author.id, alias))) || 0;
    if (cur >= car.maxCharge) {
      return msg.reply("You're already fully charged.");
    }

    const needed = car.maxCharge - cur;
    const cost = needed * 0.5; // 0.5 DD per unit to full
    const bal = await getBalance(msg.author.id);
    if (bal < cost) {
      const short = (cost - bal).toFixed(1);
      return msg.reply(`Charging to full costs **${cost} DD**; you’re short **${short} DD**.`);
    }

    await subBalance(msg.author.id, cost);
    await redis.set(CHARGE_KEY(msg.author.id, alias), car.maxCharge);

    const e = new EmbedBuilder()
      .setTitle("⚡ Fully Charged")
      .setDescription(
        `**${car.name}** charged **${needed} units** → **${car.maxCharge}/${car.maxCharge}**\n` +
        `Cost: **${cost} DD** at **0.5 DD/unit**`
      )
      .setColor("DarkGreen");
    return msg.channel.send({ embeds: [e] });
  }
}
