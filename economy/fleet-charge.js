// economy/fleet-charge.js
import { EmbedBuilder } from "discord.js";
import { getBalance, subBalance } from "./econ-core.js";
import { Redis } from "@upstash/redis";
import { CARS } from "./vendor-fleet.js";
const redis = Redis.fromEnv();

const OWN_KEY = (uid) => `fleet:owned:${uid}`;
const CHARGE_KEY = (uid, alias) => `fleet:charge:${uid}:${alias}`;

// ENV: optional hard-enforced charge room
const ENFORCE_FLEET_CHARGE = process.env.ENFORCE_FLEET_CHARGE === "1";
const FLEET_CHARGE_CHANNEL_ID = process.env.FLEET_CHARGE_CHANNEL_ID || "distorted-fleet-charge"; // name or id

function carByAlias(a){ return CARS.find(c=>c.alias===a); }

function channelMatches(channel) {
  const id = String(FLEET_CHARGE_CHANNEL_ID);
  if (/^\d{16,20}$/.test(id)) return String(channel?.id) === id;
  return String(channel?.name || "").toLowerCase() === id.toLowerCase();
}

// random “driving costs” table (negative = cost)
const DRIVE_EVENTS = [
  { text: "Paid city tolls.", delta: -5 },
  { text: "Parking meter ran a bit long.", delta: -3 },
  { text: "Quick wash at the auto-suds.", delta: -4 },
  { text: "All green lights—no extra costs.", delta: 0 },
  { text: "Premium parking near Distortia Plaza.", delta: -7 },
];

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

  // !drive <alias> <distanceUnits>
  // Each "distance" consumes equal charge units (1:1). You can tune later.
  if (cmd === "!drive") {
    const alias = (parts[1] || "").toLowerCase();
    const dist = Math.max(1, parseInt(parts[2] || "10", 10)); // default 10 units
    const car = carByAlias(alias);
    if (!car) return msg.reply("Usage: `!drive <car-alias> <distance>`");

    const owns = await redis.sismember(OWN_KEY(msg.author.id), alias);
    if (!owns) return msg.reply("You don't own that vehicle.");

    let cur = parseInt(await redis.get(CHARGE_KEY(msg.author.id, alias))) || 0;
    if (cur <= 0) return msg.reply("Your battery is empty. Use `!charge <alias>` in the charge room.");

    const consume = Math.min(dist, cur);
    cur -= consume;
    await redis.set(CHARGE_KEY(msg.author.id, alias), cur);

    // Random driving expenses
    const ev = DRIVE_EVENTS[Math.floor(Math.random() * DRIVE_EVENTS.length)];
    let costApplied = 0;
    if (ev.delta < 0) {
      const bal = await getBalance(msg.author.id);
      const needed = Math.abs(ev.delta);
      if (bal >= needed) {
        await subBalance(msg.author.id, needed);
        costApplied = ev.delta;
      } else {
        costApplied = 0; // can't afford; narration still ok
      }
    }

    const e = new EmbedBuilder()
      .setTitle("🚦 Drive Complete")
      .setDescription(
        `**${car.name}** drove **${consume} units**.\n` +
        `${ev.text} ${costApplied ? `(${costApplied} DD)` : ""}\n` +
        `Charge remaining: **${cur}/${car.maxCharge}**`
      )
      .setColor("DarkRed");
    return msg.channel.send({ embeds: [e] });
  }

  // !charge <alias> — only in charge room when enforced
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

    const needed = car.maxCharge - cur;               // units to full
    const cost = needed * 0.5;                        // 0.5 DD per unit
    const bal = await getBalance(msg.author.id);
    if (bal < cost) return msg.reply(`Charging to full costs **${cost} DD**; you’re short **${(cost - bal).toFixed(1)} DD**.`);

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
