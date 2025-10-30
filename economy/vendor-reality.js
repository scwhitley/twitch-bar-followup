// economy/vendor-reality.js
import { EmbedBuilder } from "discord.js";
import { getBalance, subBalance, addItem } from "./econ-core.js";

// Distortia neighborhoods + consistent vibes
const APTS = [
  { alias: "plaza-11a",   name: "Plaza Tower 11A",    price: 900,  location: "Distortia — Central Plaza",     sqft: 720,  features: ["Skyline view", "Holo-kitchen", "Auto-blinds"] },
  { alias: "kyber-loft7", name: "Kyber Loft #7",      price: 1100, location: "Distortia — Crystal Row",       sqft: 860,  features: ["Crystal lighting", "Quiet walls", "Tea nook"] },
  { alias: "rimhaven-4e", name: "Rimhaven 4E",        price: 750,  location: "Distortia — Outer Rimhaven",    sqft: 680,  features: ["Night market access", "Sound shield", "Nano lock"] },
  { alias: "voidview-29", name: "Voidview 29",        price: 1500, location: "Distortia — Upper Skyline",     sqft: 1040, features: ["Panorama wall", "Auto-chef", "Zero-draft seals"] },
  { alias: "cinder-9b",   name: "Cinder Belt 9B",     price: 620,  location: "Distortia — Cinder Belt",        sqft: 540,  features: ["Heat shielding", "Compact core", "Filtered air"] },
  { alias: "nebula-1712", name: "Nebula 1712",        price: 980,  location: "Distortia — Galactic Commons",  sqft: 810,  features: ["Transit link", "Eco glazing", "Drone parcel port"] },
  { alias: "raven-5c",    name: "Raven Perch 5C",     price: 700,  location: "Distortia — Low Quarter",        sqft: 600,  features: ["Shadow balcony", "Smart storage", "Cool mist"] },
  { alias: "onyx-ph2",    name: "Onyx Court PH-2",    price: 2200, location: "Distortia — Core Heights",       sqft: 1500, features: ["Private lift", "Atrium garden", "Stellar bath"] },
  { alias: "comet-805",   name: "Comet 805",          price: 820,  location: "Distortia — Mid Wreath",         sqft: 740,  features: ["Star tunnel view", "Hush doors", "Fleck stone"] },
  { alias: "ion-12",      name: "Ion Haven 12",       price: 1150, location: "Distortia — Trade Docks",        sqft: 920,  features: ["Dock nearby", "Ion-filter AC", "Dual office"] },
  { alias: "phase-33",    name: "Phase Arc 33",       price: 1300, location: "Distortia — Senate Reach",       sqft: 1000, features: ["Arch windows", "Vaulted light", "Quiet corridor"] },
  { alias: "drift-2b",    name: "Drift Nest 2B",      price: 560,  location: "Distortia — Outlander Block",    sqft: 520,  features: ["Cozy corner", "Night lights", "Thick drapes"] },
  { alias: "crown-901",   name: "Crown Peak 901",     price: 1900, location: "Distortia — Apex Quarter",       sqft: 1320, features: ["Crest lounge", "Chef island", "Twin suites"] },
  { alias: "glide-4e",    name: "Glide 4E",           price: 680,  location: "Distortia — Rapid Loop",         sqft: 620,  features: ["Transit link", "Fold wall", "Nano pantry"] },
  { alias: "nova-21",     name: "Nova Plex 21",       price: 1450, location: "Distortia — Starview Ridge",     sqft: 1180, features: ["Starglass", "Quiet core", "Garden deck"] },
  { alias: "echo-10d",    name: "Echo Court 10D",     price: 760,  location: "Distortia — Commons East",       sqft: 660,  features: ["Echo-cancel walls", "Smart vents", "Dry room"] },
  { alias: "vector-889",  name: "Vector 889",         price: 1050, location: "Distortia — Tri-Arc Level",      sqft: 910,  features: ["Tri fold", "Corner sun", "Hidden storage"] },
  { alias: "phantom-301", name: "Phantom 301",        price: 1700, location: "Distortia — Skyveil Cluster",    sqft: 1260, features: ["Veil glass", "Silent track", "Stellar bay"] },
  { alias: "meridian-5a", name: "Meridian 5A",        price: 880,  location: "Distortia — Trade Overlook",     sqft: 780,  features: ["Harbor view", "Quiet floors", "Chef alcove"] },
  { alias: "crown-2ph",   name: "Crown Royal 2PH",    price: 2600, location: "Distortia — Apex Summit",        sqft: 1680, features: ["Penthouse deck", "Private bot butler", "Skylight bath"] },
];

function listEmbed() {
  const lines = APTS.map(a => `• **!${a.alias}** — ${a.name} · **${a.price} DD** · ${a.location}`);
  return new EmbedBuilder().setTitle("🏢 Distorted Crimson Reality — Listings").setDescription(lines.join("\n")).setColor("DarkAqua");
}
function aptEmbed(a) {
  return new EmbedBuilder()
    .setTitle(`🏠 ${a.name}`)
    .addFields(
      { name: "Price", value: `${a.price} DD`, inline: true },
      { name: "Size", value: `${a.sqft} sqft`, inline: true },
      { name: "Location", value: a.location, inline: false },
      { name: "Features", value: a.features.map(f => `• ${f}`).join("\n") }
    )
    .setColor("DarkAqua");
}

export async function onMessageCreate(msg) {
  if (msg.author.bot) return;
  const parts = msg.content.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();

  if (cmd === "!apartments" || cmd === "!apts" || cmd === "!realty") {
    return msg.channel.send({ embeds: [listEmbed()] });
  }

  if (cmd.startsWith("!")) {
    const alias = cmd.slice(1);
    const a = APTS.find(x => x.alias === alias);
    if (a) return msg.channel.send({ embeds: [aptEmbed(a)] });
  }

  if (cmd === "!buyapt") {
    const alias = (parts[1] || "").toLowerCase();
    const a = APTS.find(x => x.alias === alias);
    if (!a) return msg.reply("Use `!apartments` to see listings, then `!buyapt <alias>`.");
    const bal = await getBalance(msg.author.id);
    if (bal < a.price) return msg.reply(`Insufficient funds. You need **${a.price - bal} DD** more.`);

    await subBalance(msg.author.id, a.price);
    await addItem(msg.author.id, `Apartment: ${a.name}`, 1);

    const e = new EmbedBuilder()
      .setTitle("🧾 Property Acquired")
      .setDescription(`**${msg.author.username}** purchased **${a.name}** for **${a.price} DD**.\nWelcome to Distortia real estate supremacy.`)
      .setColor("DarkAqua");
    return msg.channel.send({ embeds: [e] });
  }
}
