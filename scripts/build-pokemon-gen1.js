import fs from "node:fs/promises";
import path from "node:path";
import axios from "axios";
import * as cheerio from "cheerio";

const BASE = "https://bulbapedia.bulbagarden.net/wiki";
const OUTPUT_FILE = path.resolve("./pokemon-gen1.js");

const GEN1_POKEMON = [
  { dexNumber: 1, slug: "Bulbasaur_(Pokémon)", name: "Bulbasaur" },
  { dexNumber: 2, slug: "Ivysaur_(Pokémon)", name: "Ivysaur" },
  { dexNumber: 3, slug: "Venusaur_(Pokémon)", name: "Venusaur" },
  { dexNumber: 4, slug: "Charmander_(Pokémon)", name: "Charmander" },
  { dexNumber: 5, slug: "Charmeleon_(Pokémon)", name: "Charmeleon" },
  { dexNumber: 6, slug: "Charizard_(Pokémon)", name: "Charizard" },
  { dexNumber: 7, slug: "Squirtle_(Pokémon)", name: "Squirtle" },
  { dexNumber: 8, slug: "Wartortle_(Pokémon)", name: "Wartortle" },
  { dexNumber: 9, slug: "Blastoise_(Pokémon)", name: "Blastoise" },
  { dexNumber: 10, slug: "Caterpie_(Pokémon)", name: "Caterpie" },
  { dexNumber: 11, slug: "Metapod_(Pokémon)", name: "Metapod" },
  { dexNumber: 12, slug: "Butterfree_(Pokémon)", name: "Butterfree" },
  { dexNumber: 13, slug: "Weedle_(Pokémon)", name: "Weedle" },
  { dexNumber: 14, slug: "Kakuna_(Pokémon)", name: "Kakuna" },
  { dexNumber: 15, slug: "Beedrill_(Pokémon)", name: "Beedrill" },
  { dexNumber: 16, slug: "Pidgey_(Pokémon)", name: "Pidgey" },
  { dexNumber: 17, slug: "Pidgeotto_(Pokémon)", name: "Pidgeotto" },
  { dexNumber: 18, slug: "Pidgeot_(Pokémon)", name: "Pidgeot" },
  { dexNumber: 19, slug: "Rattata_(Pokémon)", name: "Rattata" },
  { dexNumber: 20, slug: "Raticate_(Pokémon)", name: "Raticate" },
  { dexNumber: 21, slug: "Spearow_(Pokémon)", name: "Spearow" },
  { dexNumber: 22, slug: "Fearow_(Pokémon)", name: "Fearow" },
  { dexNumber: 23, slug: "Ekans_(Pokémon)", name: "Ekans" },
  { dexNumber: 24, slug: "Arbok_(Pokémon)", name: "Arbok" },
  { dexNumber: 25, slug: "Pikachu_(Pokémon)", name: "Pikachu" },
  { dexNumber: 26, slug: "Raichu_(Pokémon)", name: "Raichu" },
  { dexNumber: 27, slug: "Sandshrew_(Pokémon)", name: "Sandshrew" },
  { dexNumber: 28, slug: "Sandslash_(Pokémon)", name: "Sandslash" },
  { dexNumber: 29, slug: "Nidoran♀_(Pokémon)", name: "Nidoran♀" },
  { dexNumber: 30, slug: "Nidorina_(Pokémon)", name: "Nidorina" },
  { dexNumber: 31, slug: "Nidoqueen_(Pokémon)", name: "Nidoqueen" },
  { dexNumber: 32, slug: "Nidoran♂_(Pokémon)", name: "Nidoran♂" },
  { dexNumber: 33, slug: "Nidorino_(Pokémon)", name: "Nidorino" },
  { dexNumber: 34, slug: "Nidoking_(Pokémon)", name: "Nidoking" },
  { dexNumber: 35, slug: "Clefairy_(Pokémon)", name: "Clefairy" },
  { dexNumber: 36, slug: "Clefable_(Pokémon)", name: "Clefable" },
  { dexNumber: 37, slug: "Vulpix_(Pokémon)", name: "Vulpix" },
  { dexNumber: 38, slug: "Ninetales_(Pokémon)", name: "Ninetales" },
  { dexNumber: 39, slug: "Jigglypuff_(Pokémon)", name: "Jigglypuff" },
  { dexNumber: 40, slug: "Wigglytuff_(Pokémon)", name: "Wigglytuff" },
  { dexNumber: 41, slug: "Zubat_(Pokémon)", name: "Zubat" },
  { dexNumber: 42, slug: "Golbat_(Pokémon)", name: "Golbat" },
  { dexNumber: 43, slug: "Oddish_(Pokémon)", name: "Oddish" },
  { dexNumber: 44, slug: "Gloom_(Pokémon)", name: "Gloom" },
  { dexNumber: 45, slug: "Vileplume_(Pokémon)", name: "Vileplume" },
  { dexNumber: 46, slug: "Paras_(Pokémon)", name: "Paras" },
  { dexNumber: 47, slug: "Parasect_(Pokémon)", name: "Parasect" },
  { dexNumber: 48, slug: "Venonat_(Pokémon)", name: "Venonat" },
  { dexNumber: 49, slug: "Venomoth_(Pokémon)", name: "Venomoth" },
  { dexNumber: 50, slug: "Diglett_(Pokémon)", name: "Diglett" },
  { dexNumber: 51, slug: "Dugtrio_(Pokémon)", name: "Dugtrio" },
  { dexNumber: 52, slug: "Meowth_(Pokémon)", name: "Meowth" },
  { dexNumber: 53, slug: "Persian_(Pokémon)", name: "Persian" },
  { dexNumber: 54, slug: "Psyduck_(Pokémon)", name: "Psyduck" },
  { dexNumber: 55, slug: "Golduck_(Pokémon)", name: "Golduck" },
  { dexNumber: 56, slug: "Mankey_(Pokémon)", name: "Mankey" },
  { dexNumber: 57, slug: "Primeape_(Pokémon)", name: "Primeape" },
  { dexNumber: 58, slug: "Growlithe_(Pokémon)", name: "Growlithe" },
  { dexNumber: 59, slug: "Arcanine_(Pokémon)", name: "Arcanine" },
  { dexNumber: 60, slug: "Poliwag_(Pokémon)", name: "Poliwag" },
  { dexNumber: 61, slug: "Poliwhirl_(Pokémon)", name: "Poliwhirl" },
  { dexNumber: 62, slug: "Poliwrath_(Pokémon)", name: "Poliwrath" },
  { dexNumber: 63, slug: "Abra_(Pokémon)", name: "Abra" },
  { dexNumber: 64, slug: "Kadabra_(Pokémon)", name: "Kadabra" },
  { dexNumber: 65, slug: "Alakazam_(Pokémon)", name: "Alakazam" },
  { dexNumber: 66, slug: "Machop_(Pokémon)", name: "Machop" },
  { dexNumber: 67, slug: "Machoke_(Pokémon)", name: "Machoke" },
  { dexNumber: 68, slug: "Machamp_(Pokémon)", name: "Machamp" },
  { dexNumber: 69, slug: "Bellsprout_(Pokémon)", name: "Bellsprout" },
  { dexNumber: 70, slug: "Weepinbell_(Pokémon)", name: "Weepinbell" },
  { dexNumber: 71, slug: "Victreebel_(Pokémon)", name: "Victreebel" },
  { dexNumber: 72, slug: "Tentacool_(Pokémon)", name: "Tentacool" },
  { dexNumber: 73, slug: "Tentacruel_(Pokémon)", name: "Tentacruel" },
  { dexNumber: 74, slug: "Geodude_(Pokémon)", name: "Geodude" },
  { dexNumber: 75, slug: "Graveler_(Pokémon)", name: "Graveler" },
  { dexNumber: 76, slug: "Golem_(Pokémon)", name: "Golem" },
  { dexNumber: 77, slug: "Ponyta_(Pokémon)", name: "Ponyta" },
  { dexNumber: 78, slug: "Rapidash_(Pokémon)", name: "Rapidash" },
  { dexNumber: 79, slug: "Slowpoke_(Pokémon)", name: "Slowpoke" },
  { dexNumber: 80, slug: "Slowbro_(Pokémon)", name: "Slowbro" },
  { dexNumber: 81, slug: "Magnemite_(Pokémon)", name: "Magnemite" },
  { dexNumber: 82, slug: "Magneton_(Pokémon)", name: "Magneton" },
  { dexNumber: 83, slug: "Farfetch'd_(Pokémon)", name: "Farfetch'd" },
  { dexNumber: 84, slug: "Doduo_(Pokémon)", name: "Doduo" },
  { dexNumber: 85, slug: "Dodrio_(Pokémon)", name: "Dodrio" },
  { dexNumber: 86, slug: "Seel_(Pokémon)", name: "Seel" },
  { dexNumber: 87, slug: "Dewgong_(Pokémon)", name: "Dewgong" },
  { dexNumber: 88, slug: "Grimer_(Pokémon)", name: "Grimer" },
  { dexNumber: 89, slug: "Muk_(Pokémon)", name: "Muk" },
  { dexNumber: 90, slug: "Shellder_(Pokémon)", name: "Shellder" },
  { dexNumber: 91, slug: "Cloyster_(Pokémon)", name: "Cloyster" },
  { dexNumber: 92, slug: "Gastly_(Pokémon)", name: "Gastly" },
  { dexNumber: 93, slug: "Haunter_(Pokémon)", name: "Haunter" },
  { dexNumber: 94, slug: "Gengar_(Pokémon)", name: "Gengar" },
  { dexNumber: 95, slug: "Onix_(Pokémon)", name: "Onix" },
  { dexNumber: 96, slug: "Drowzee_(Pokémon)", name: "Drowzee" },
  { dexNumber: 97, slug: "Hypno_(Pokémon)", name: "Hypno" },
  { dexNumber: 98, slug: "Krabby_(Pokémon)", name: "Krabby" },
  { dexNumber: 99, slug: "Kingler_(Pokémon)", name: "Kingler" },
  { dexNumber: 100, slug: "Voltorb_(Pokémon)", name: "Voltorb" },
  { dexNumber: 101, slug: "Electrode_(Pokémon)", name: "Electrode" },
  { dexNumber: 102, slug: "Exeggcute_(Pokémon)", name: "Exeggcute" },
  { dexNumber: 103, slug: "Exeggutor_(Pokémon)", name: "Exeggutor" },
  { dexNumber: 104, slug: "Cubone_(Pokémon)", name: "Cubone" },
  { dexNumber: 105, slug: "Marowak_(Pokémon)", name: "Marowak" },
  { dexNumber: 106, slug: "Hitmonlee_(Pokémon)", name: "Hitmonlee" },
  { dexNumber: 107, slug: "Hitmonchan_(Pokémon)", name: "Hitmonchan" },
  { dexNumber: 108, slug: "Lickitung_(Pokémon)", name: "Lickitung" },
  { dexNumber: 109, slug: "Koffing_(Pokémon)", name: "Koffing" },
  { dexNumber: 110, slug: "Weezing_(Pokémon)", name: "Weezing" },
  { dexNumber: 111, slug: "Rhyhorn_(Pokémon)", name: "Rhyhorn" },
  { dexNumber: 112, slug: "Rhydon_(Pokémon)", name: "Rhydon" },
  { dexNumber: 113, slug: "Chansey_(Pokémon)", name: "Chansey" },
  { dexNumber: 114, slug: "Tangela_(Pokémon)", name: "Tangela" },
  { dexNumber: 115, slug: "Kangaskhan_(Pokémon)", name: "Kangaskhan" },
  { dexNumber: 116, slug: "Horsea_(Pokémon)", name: "Horsea" },
  { dexNumber: 117, slug: "Seadra_(Pokémon)", name: "Seadra" },
  { dexNumber: 118, slug: "Goldeen_(Pokémon)", name: "Goldeen" },
  { dexNumber: 119, slug: "Seaking_(Pokémon)", name: "Seaking" },
  { dexNumber: 120, slug: "Staryu_(Pokémon)", name: "Staryu" },
  { dexNumber: 121, slug: "Starmie_(Pokémon)", name: "Starmie" },
  { dexNumber: 122, slug: "Mr._Mime_(Pokémon)", name: "Mr. Mime" },
  { dexNumber: 123, slug: "Scyther_(Pokémon)", name: "Scyther" },
  { dexNumber: 124, slug: "Jynx_(Pokémon)", name: "Jynx" },
  { dexNumber: 125, slug: "Electabuzz_(Pokémon)", name: "Electabuzz" },
  { dexNumber: 126, slug: "Magmar_(Pokémon)", name: "Magmar" },
  { dexNumber: 127, slug: "Pinsir_(Pokémon)", name: "Pinsir" },
  { dexNumber: 128, slug: "Tauros_(Pokémon)", name: "Tauros" },
  { dexNumber: 129, slug: "Magikarp_(Pokémon)", name: "Magikarp" },
  { dexNumber: 130, slug: "Gyarados_(Pokémon)", name: "Gyarados" },
  { dexNumber: 131, slug: "Lapras_(Pokémon)", name: "Lapras" },
  { dexNumber: 132, slug: "Ditto_(Pokémon)", name: "Ditto" },
  { dexNumber: 133, slug: "Eevee_(Pokémon)", name: "Eevee" },
  { dexNumber: 134, slug: "Vaporeon_(Pokémon)", name: "Vaporeon" },
  { dexNumber: 135, slug: "Jolteon_(Pokémon)", name: "Jolteon" },
  { dexNumber: 136, slug: "Flareon_(Pokémon)", name: "Flareon" },
  { dexNumber: 137, slug: "Porygon_(Pokémon)", name: "Porygon" },
  { dexNumber: 138, slug: "Omanyte_(Pokémon)", name: "Omanyte" },
  { dexNumber: 139, slug: "Omastar_(Pokémon)", name: "Omastar" },
  { dexNumber: 140, slug: "Kabuto_(Pokémon)", name: "Kabuto" },
  { dexNumber: 141, slug: "Kabutops_(Pokémon)", name: "Kabutops" },
  { dexNumber: 142, slug: "Aerodactyl_(Pokémon)", name: "Aerodactyl" },
  { dexNumber: 143, slug: "Snorlax_(Pokémon)", name: "Snorlax" },
  { dexNumber: 144, slug: "Articuno_(Pokémon)", name: "Articuno" },
  { dexNumber: 145, slug: "Zapdos_(Pokémon)", name: "Zapdos" },
  { dexNumber: 146, slug: "Moltres_(Pokémon)", name: "Moltres" },
  { dexNumber: 147, slug: "Dratini_(Pokémon)", name: "Dratini" },
  { dexNumber: 148, slug: "Dragonair_(Pokémon)", name: "Dragonair" },
  { dexNumber: 149, slug: "Dragonite_(Pokémon)", name: "Dragonite" },
  { dexNumber: 150, slug: "Mewtwo_(Pokémon)", name: "Mewtwo" },
  { dexNumber: 151, slug: "Mew_(Pokémon)", name: "Mew" }
];

const http = axios.create({
  timeout: 30000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; DistortedRealmBot/1.0; +https://github.com/)"
  }
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueStrings(values) {
  return [...new Set(values.map(v => v.trim()).filter(Boolean))];
}

function normalizeWhitespace(str = "") {
  return str.replace(/\s+/g, " ").trim();
}

function decodeWikiTitle(text = "") {
  return normalizeWhitespace(
    text
      .replace(/\[[^\]]*]/g, "")
      .replace(/_/g, " ")
      .replace(/\s+\(Pokémon\)$/i, "")
  );
}

async function fetchHtml(url) {
  const { data } = await http.get(url);
  return data;
}

function extractTypes($) {
  const types = [];

  // Infobox usually contains links like /wiki/Grass_(type)
  $('table.roundy a[href$="_(type)"]').each((_, el) => {
    const text = normalizeWhitespace($(el).text());
    if (text && !types.includes(text)) {
      types.push(text);
    }
  });

  return types.slice(0, 2);
}

function extractEvolution($, currentName) {
  const bodyText = normalizeWhitespace($("#mw-content-text").text());

  let evolvesFrom = null;
  const evolvesTo = [];

  const fromMatch = bodyText.match(/evolves from ([A-Z][A-Za-z.'♀♂ -]+)/i);
  if (fromMatch) {
    evolvesFrom = normalizeWhitespace(fromMatch[1]);
  }

  const toMatches = [
    ...bodyText.matchAll(/evolves into ([A-Z][A-Za-z.'♀♂ -]+)(?: starting| when| by| with|,|\.| and)/gi)
  ];

  for (const match of toMatches) {
    const evoName = normalizeWhitespace(match[1]);
    if (evoName && evoName.toLowerCase() !== currentName.toLowerCase()) {
      evolvesTo.push({ name: evoName, method: null });
    }
  }

  return {
    evolvesFrom,
    evolvesTo: uniqueEvolutionArray(evolvesTo)
  };
}

function uniqueEvolutionArray(arr) {
  const seen = new Set();
  const out = [];

  for (const item of arr) {
    const key = `${item.name}|${item.method ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }

  return out;
}

function extractLatestPokedexDescription($) {
  // Try to find the Pokédex entries heading, then the next table
  const heading = $("#mw-content-text")
    .find("span.mw-headline")
    .filter((_, el) => normalizeWhitespace($(el).text()).toLowerCase() === "pokédex entries")
    .first();

  if (!heading.length) return "";

  let node = heading.closest("h2, h3, h4").next();
  while (node.length) {
    if (node.is("table")) break;
    if (node.is("h2, h3, h4")) break;
    node = node.next();
  }

  if (!node.length || !node.is("table")) return "";

  const rows = node.find("tr");
  let latestDescription = "";

  rows.each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length >= 2) {
      const maybeDescription = normalizeWhitespace($(cells[cells.length - 1]).text());
      if (maybeDescription.length > 20) {
        latestDescription = maybeDescription;
      }
    }
  });

  return latestDescription;
}

function extractMovesFromLearnset($) {
  const moveNames = [];

  // Gen IX learnset pages usually have tables after headings like "By leveling up", "By TM", etc.
  $("table tr").each((_, row) => {
    const links = $(row).find('a[href*="_(move)"]');

    links.each((__, link) => {
      const move = normalizeWhitespace($(link).text());
      if (move) moveNames.push(move);
    });
  });

  return uniqueStrings(moveNames).sort((a, b) => a.localeCompare(b));
}

async function scrapePokemon(species) {
  const speciesUrl = `${BASE}/${encodeURI(species.slug)}`;
  const learnsetUrl = `${BASE}/${encodeURI(species.slug)}/Generation_IX_learnset`;

  console.log(`Scraping #${String(species.dexNumber).padStart(3, "0")} ${species.name}`);

  const [speciesHtml, learnsetHtml] = await Promise.all([
    fetchHtml(speciesUrl),
    fetchHtml(learnsetUrl).catch(() => "")
  ]);

  const $species = cheerio.load(speciesHtml);
  const $learnset = learnsetHtml ? cheerio.load(learnsetHtml) : cheerio.load("<html></html>");

  const name =
    normalizeWhitespace(
      $species.firstHeading?.text?.() ||
      $species("h1.firstHeading").first().text()
    )
      .replace(/\s*\(Pokémon\)\s*$/i, "") || species.name;

  const types = extractTypes($species);
  const evolution = extractEvolution($species, name);
  const pokedexDescription = extractLatestPokedexDescription($species);
  const moves = extractMovesFromLearnset($learnset);

  return {
    dexNumber: species.dexNumber,
    name,
    types,
    moves,
    evolution,
    pokedexDescription
  };
}

function toModuleString(data) {
  return `export const pokemonGen1 = ${JSON.stringify(data, null, 2)};\n`;
}

async function main() {
  const results = [];

  for (const species of GEN1_POKEMON) {
    try {
      const pokemon = await scrapePokemon(species);
      results.push(pokemon);

      // be nice to Bulbapedia
      await wait(1200);
    } catch (err) {
      console.error(`Failed on ${species.name}:`, err.message);
      results.push({
        dexNumber: species.dexNumber,
        name: species.name,
        types: [],
        moves: [],
        evolution: { evolvesFrom: null, evolvesTo: [] },
        pokedexDescription: ""
      });
    }
  }

  const fileContents = toModuleString(results);
  await fs.writeFile(OUTPUT_FILE, fileContents, "utf8");

  console.log(`Wrote ${results.length} Pokémon to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
