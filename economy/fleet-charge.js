// economy/fleet-charge.js
import { EmbedBuilder } from "discord.js";
import { getBalance, subBalance } from "./econ-core.js";
import { CARS } from "./vendor-fleet.js";
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

const CHARGE_COST_PER_UNIT = 0.5; // 0.5 DD per unit
const CH_KEY = (uid, alias) => `fleet:charge:${uid}:${alias}`;
const OWN_KEY = (uid) => `fleet:owned:${uid}`;

const DRIVE_EVENTS = [
  { text: "Cruised Distortia’s Skyway Loop.", use: 40,  fee:  0 },
  { text: "Hit downtown gridlock—stop & go.", use: 25,  fee:  0 },
  { text: "Night run out to the Neon Docks (toll).", use: 60,  fee: 25 },
  { text: "Canyon sprint via Drift Ridge.", use: 90,  fee:  0 },
  { text: "Mall crawl + rooftop parking.", use: 35,  fee: 10 },
];

const findCar = (alias) => CARS.find(c => c.alias === alias);

export async function onMessageCreate(msg) {
  if (msg.author.bot || msg.__handled) return;
  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  // Show charge
  if (cmd === "!carcharge") {
    const alias = (parts[1] || "").toLowerCase();
    const car = findCar(alias);
    if (!car) return; // ignore
    const cur = parseInt((await redis.get(CH_KEY(msg.author.id, alias))) || "0", 10);
    const e = new EmbedBuilder()
      .setTitle(`🔋 ${car.name} — Charge`)
      .setDescription(`Current: **${cur}/${car.maxCharge}** units`)
      .setColor("DarkRed");
    await msg.channel.send({ embeds: [e] });
    msg.__handled = true;
    return;
  }

  // Drive
  if (cmd === "!drive") {
    const alias = (parts[1] || "").toLowerCase();
    const car = findCar(alias);
    if (!car) return;
    const key = CH_KEY(msg.author.id, alias);
    let cur = parseInt((await redis.get(key)) || "0", 10);

    const ev = DRIVE_EVENTS[Math.floor(Math.random() * DRIVE_EVENTS.length)];
    if (cur < ev.use) {
      await msg.reply(`Not enough charge for that trip. Need **${ev.use}**, you have **${cur}**.`);
      msg.__handled = true;
      return;
    }

    cur -= ev.use;
    await redis.set(key, cur);

    if (ev.fee > 0) {
      try { await subBalance(msg.author.id, ev.fee); } catch {}
    }

    const e = new EmbedBuilder()
      .setTitle(`🛞 ${car.name} — Drive Complete`)
      .setDescription(`${ev.text}\nUsed **${ev.use}** units${ev.fee ? ` · Paid **${ev.fee} DD**` : ""}.\nRemaining charge: **${cur}/${car.maxCharge}**.`)
      .setColor("DarkRed");
    await msg.channel.send({ embeds: [e] });
    msg.__handled = true;
    return;
  }

  // Charge to full (use in charge channel if you enforce one)
  if (cmd === "!charge") {
    const alias = (parts[1] || "").toLowerCase();
    const car = findCar(alias);
    if (!car) return;

    const key = CH_KEY(msg.author.id, alias);
    const cur = parseInt((await redis.get(key)) || "0", 10);
    const need = Math.max(0, car.maxCharge - cur);
    const cost = need * CHARGE_COST_PER_UNIT;

    const bal = await getBalance(msg.author.id);
    if (need === 0) {
      await msg.reply(`Already full. **${cur}/${car.maxCharge}**.`);
      msg.__handled = true;
      return;
    }
    if (bal < cost) {
      await msg.reply(`Charging cost is **${cost} DD**, you only have **${bal} DD**.`);
      msg.__handled = true;
      return;
    }

    await subBalance(msg.author.id, cost);
    await redis.set(key, car.maxCharge);

    const e = new EmbedBuilder()
      .setTitle(`⚡ ${car.name} — Charged`)
      .setDescription(`Added **${need}** units for **${cost} DD**.\nNow at **${car.maxCharge}/${car.maxCharge}**.`)
      .setColor("DarkRed");
    await msg.channel.send({ embeds: [e] });
    msg.__handled = true;
    return;
  }
}
