// economy/vendor-reality.js
import { EmbedBuilder } from "discord.js";
import { getBalance, subBalance, addItem } from "./econ-core.js";

// Distortia apartments — 20 listings with aliases
const APTS = [
  { alias: "spire1",  name: "Spire One Microloft",   price: 900,  area: "Old Grid",     rooms: "1 bed / 1 bath", feat: ["Skyline view", "Smart lock"] },
  { alias: "spire9",  name: "Spire Nine Corner",     price: 1200, area: "Neon Docks",   rooms: "2 bed / 1 bath", feat: ["Corner glass", "Dock access"] },
  { alias: "ember",   name: "Ember Court Suite",     price: 1600, area: "Cinder Row",   rooms: "2 bed / 2 bath", feat: ["Heated floors", "Vaulted ceilings"] },
  { alias: "pulse",   name: "Pulse Tower Duplex",    price: 2000, area: "Pulse Ward",   rooms: "3 bed / 2 bath", feat: ["Dual-level", "Private terrace"] },
  { alias: "arc",     name: "Arc District Loft",     price: 1100, area: "Arc District", rooms: "1 bed / 1 bath", feat: ["Exposed fiber", "Noise glass"] },
  { alias: "datum",   name: "Datum Hub Studio",      price: 850,  area: "Data Sprawl",  rooms: "Studio",         feat: ["Smart wall", "Modular kitchen"] },
  { alias: "vault",   name: "Vault Gate Flat",       price: 1300, area: "Gatefront",    rooms: "2 bed / 1 bath", feat: ["Secure lobby", "Package drone port"] },
  { alias: "ribbon",  name: "Ribbon Walk Nest",      price: 950,  area: "Ribbon Walk",  rooms: "1 bed / 1 bath", feat: ["Greenway access", "Bike storage"] },
  { alias: "flare",   name: "Flare Court Deluxe",    price: 1750, area: "Cinder Row",   rooms: "2 bed / 2 bath", feat: ["Corner wrap balcony", "Induction line"] },
  { alias: "overlook",name: "Overlook Skyflat",      price: 2100, area: "Skyline Rim",  rooms: "3 bed / 2 bath", feat: ["Panorama glass", "Dual EV bay"] },
  { alias: "canopy",  name: "Canopy Garden Pod",     price: 1150, area: "Greenway",     rooms: "1 bed / 1 bath", feat: ["Atrium access", "Air-filtration"] },
  { alias: "vault2",  name: "Vault Gate Corner",     price: 1450, area: "Gatefront",    rooms: "2 bed / 2 bath", feat: ["Corner windows", "Storage unit"] },
  { alias: "docklite",name: "Docklite Studio",       price: 780,  area: "Neon Docks",   rooms: "Studio",         feat: ["Dock view", "Noise cancel walls"] },
  { alias: "emberloft",name: "Ember Loft Plus",      price: 1550, area: "Cinder Row",   rooms: "2 bed / 1 bath", feat: ["Warmstone counters", "Hidden pantry"] },
  { alias: "gridmax", name: "GridMax Family",        price: 1650, area: "Old Grid",     rooms: "3 bed / 1.5 bath", feat: ["Courtyard", "Play zone"] },
  { alias: "pulseedge",name: "Pulse Edge Pent",      price: 2600, area: "Pulse Ward",   rooms: "3 bed / 2.5 bath", feat: ["Private elevator", "Roof lounge"] },
  { alias: "arcmini", name: "Arc Mini Loft",         price: 890,  area: "Arc District", rooms: "Studio",         feat: ["Fold bed", "Projection wall"] },
  { alias: "span",    name: "Span Bridge View",      price: 1400, area: "Span Quarter", rooms: "2 bed / 1 bath", feat: ["River span view", "Transit node"] },
  { alias: "holo",    name: "Holo Court Duplex",     price: 1900, area: "Holo Square",  rooms: "2 bed / 2 bath", feat: ["Holo-screen wall", "Quiet floor"] },
  { alias: "silk",    name: "Silk Row Corner",       price: 1350, area: "Silk Row",     rooms: "1 bed / 1 bath", feat: ["Corner light", "Chef line"] },
];

// Helper names are unique to avoid accidental duplicate identifiers
const realityListEmbed = () =>
  new EmbedBuilder()
    .setTitle("🏙️ Distorted Crimson Reality — Listings (Distortia)")
    .setDescription(APTS.map(a => `• **!${a.alias}** — ${a.name} · **${a.price} DD** · ${a.area}`).join("\n"))
    .setColor("DarkButNotBlack");

const realityDetailEmbed = (a) =>
  new EmbedBuilder()
    .setTitle(`🏢 ${a.name}`)
    .addFields(
      { name: "Price", value: `${a.price} DD`, inline: true },
      { name: "Area", value: a.area, inline: true },
      { name: "Layout", value: a.rooms, inline: true },
      { name: "Features", value: a.feat.map(f => `• ${f}`).join("\n") },
    )
    .setColor("DarkButNotBlack");

export async function onMessageCreate(msg) {
  // single-response guard
  if (msg.author.bot || msg.__handled) return;

  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  // List all apartments
  if (cmd === "!apartments" || cmd === "!apts" || cmd === "!realty") {
    await msg.channel.send({ embeds: [realityListEmbed()] });
    msg.__handled = true; 
    return;
  }

  // Apartment detail via alias (e.g., !pulse)
  if (cmd.startsWith("!")) {
    const alias = cmd.slice(1);
    const apt = APTS.find(a => a.alias === alias);
    if (apt) {
      await msg.channel.send({ embeds: [realityDetailEmbed(apt)] });
      msg.__handled = true;
      return;
    }
  }

  // Buy apartment
  if (cmd === "!buyapt") {
    const alias = (parts[1] || "").toLowerCase();
    const apt = APTS.find(a => a.alias === alias);
    if (!apt) {
      await msg.reply("Use `!apartments` to see listings, then `!buyapt <alias>`.");
      msg.__handled = true; 
      return;
    }

    const bal = await getBalance(msg.author.id);
    if (bal < apt.price) {
      await msg.reply(`You need **${apt.price - bal} DD** more.`);
      msg.__handled = true; 
      return;
    }

    await subBalance(msg.author.id, apt.price);
    await addItem(msg.author.id, `Apartment: ${apt.name} @ ${apt.area}`, 1);

    const e = new EmbedBuilder()
      .setTitle("🧾 Lease Signed")
      .setDescription(`**${apt.name}** is now yours. Welcome to ${apt.area}.`)
      .setColor("DarkButNotBlack");

    await msg.channel.send({ embeds: [e] });
    msg.__handled = true; 
    return;
  }
}
