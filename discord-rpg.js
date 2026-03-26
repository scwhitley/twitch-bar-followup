// discord-rpg.js

const EXCLUDED_STARTERS = new Set([
  "articuno",
  "zapdos",
  "moltres",
  "mewtwo",
  "mew",
]);

// Temporary Gen 1 pool placeholder.
// For now we use names only.
// Later this will be replaced by your full Gen 1 database file.
const GEN1_STARTERS = [
  "bulbasaur", "ivysaur", "venusaur",
  "charmander", "charmeleon", "charizard",
  "squirtle", "wartortle", "blastoise",
  "caterpie", "metapod", "butterfree",
  "weedle", "kakuna", "beedrill",
  "pidgey", "pidgeotto", "pidgeot",
  "rattata", "raticate",
  "spearow", "fearow",
  "ekans", "arbok",
  "pikachu", "raichu",
  "sandshrew", "sandslash",
  "nidoran-f", "nidorina", "nidoqueen",
  "nidoran-m", "nidorino", "nidoking",
  "clefairy", "clefable",
  "vulpix", "ninetales",
  "jigglypuff", "wigglytuff",
  "zubat", "golbat",
  "oddish", "gloom", "vileplume",
  "paras", "parasect",
  "venonat", "venomoth",
  "diglett", "dugtrio",
  "meowth", "persian",
  "psyduck", "golduck",
  "mankey", "primeape",
  "growlithe", "arcanine",
  "poliwag", "poliwhirl", "poliwrath",
  "abra", "kadabra", "alakazam",
  "machop", "machoke", "machamp",
  "bellsprout", "weepinbell", "victreebel",
  "tentacool", "tentacruel",
  "geodude", "graveler", "golem",
  "ponyta", "rapidash",
  "slowpoke", "slowbro",
  "magnemite", "magneton",
  "farfetchd",
  "doduo", "dodrio",
  "seel", "dewgong",
  "grimer", "muk",
  "shellder", "cloyster",
  "gastly", "haunter", "gengar",
  "onix",
  "drowzee", "hypno",
  "krabby", "kingler",
  "voltorb", "electrode",
  "exeggcute", "exeggutor",
  "cubone", "marowak",
  "hitmonlee", "hitmonchan",
  "lickitung",
  "koffing", "weezing",
  "rhyhorn", "rhydon",
  "chansey",
  "tangela",
  "kangaskhan",
  "horsea", "seadra",
  "goldeen", "seaking",
  "staryu", "starmie",
  "mr-mime",
  "scyther",
  "jynx",
  "electabuzz",
  "magmar",
  "pinsir",
  "tauros",
  "magikarp", "gyarados",
  "lapras",
  "ditto",
  "eevee", "vaporeon", "jolteon", "flareon",
  "porygon",
  "omanyte", "omastar",
  "kabuto", "kabutops",
  "aerodactyl",
  "snorlax",
  "dratini", "dragonair", "dragonite",
  "articuno", "zapdos", "moltres",
  "mewtwo", "mew"
];

const gameSession = {
  isActive: true,
  maxPlayers: 4,
  dmId: process.env.DISCORD_DM_ID || "",
  players: {}
};

function normalizeName(name = "") {
  return String(name).trim().toLowerCase();
}

function getPlayerCount() {
  return Object.keys(gameSession.players).length;
}

function isDm(userId) {
  return !!gameSession.dmId && userId === gameSession.dmId;
}

function getUsedStarters() {
  return new Set(
    Object.values(gameSession.players)
      .map((p) => normalizeName(p.starter))
      .filter(Boolean)
  );
}

function getEligibleStarterPool() {
  const used = getUsedStarters();

  return GEN1_STARTERS.filter((name) => {
    const normalized = normalizeName(name);
    return (
      !EXCLUDED_STARTERS.has(normalized) &&
      !used.has(normalized)
    );
  });
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatPokemonName(name = "") {
  return String(name)
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

export function setupDiscordRpg(client) {
  client.on("messageCreate", async (msg) => {
    if (!msg || msg.author?.bot) return;
    if (!msg.content) return;

    const content = msg.content.trim();
    if (!content.startsWith("!")) return;

    const args = content.split(/\s+/);
    const command = args[0].toLowerCase();
    const userId = msg.author.id;
    const username = msg.author.username;

    try {
      // !join
      if (command === "!join") {
        if (!gameSession.isActive) {
          return msg.reply("The campaign is not active right now.");
        }

        if (gameSession.players[userId]) {
          return msg.reply("You already joined the party.");
        }

        if (getPlayerCount() >= gameSession.maxPlayers) {
          return msg.reply("Party is full. Max is 4 players.");
        }

        gameSession.players[userId] = {
          id: userId,
          username,
          starter: null,
          joinedAt: new Date().toISOString(),
        };

        return msg.reply(`${username} has joined the party. Use \`!starter\` to receive your Pokémon.`);
      }

      // !starter
      if (command === "!starter") {
        const player = gameSession.players[userId];

        if (!player) {
          return msg.reply("You are not in the party yet. Use `!join` first.");
        }

        if (player.starter) {
          return msg.reply(`You already have a starter: **${formatPokemonName(player.starter)}**.`);
        }

        const pool = getEligibleStarterPool();

        if (!pool.length) {
          return msg.reply("No eligible starter Pokémon remain.");
        }

        const starter = pickRandom(pool);
        player.starter = starter;

        return msg.reply(
          `🎉 ${username}, your starter Pokémon is **${formatPokemonName(starter)}**!`
        );
      }

      // !profile
      if (command === "!profile") {
        const player = gameSession.players[userId];

        if (!player) {
          return msg.reply("You are not in the party yet. Use `!join` first.");
        }

        const starterText = player.starter
          ? formatPokemonName(player.starter)
          : "None yet";

        return msg.reply(
          `**Trainer:** ${player.username}\n**Starter:** ${starterText}`
        );
      }

      // !players
      if (command === "!players") {
        const players = Object.values(gameSession.players);

        if (!players.length) {
          return msg.reply("No players have joined yet.");
        }

        const lines = players.map((p, i) => {
          const starter = p.starter ? formatPokemonName(p.starter) : "No starter yet";
          return `${i + 1}. ${p.username} — ${starter}`;
        });

        return msg.reply(`**Active Party (${players.length}/${gameSession.maxPlayers})**\n${lines.join("\n")}`);
      }

      // Optional DM reset command
      if (command === "!sessionreset") {
        if (!isDm(userId)) {
          return msg.reply("Only the Dungeon Master can reset the session.");
        }

        gameSession.players = {};
        gameSession.isActive = true;

        return msg.reply("Session reset. The party has been cleared.");
      }
    } catch (err) {
      console.error("[DISCORD RPG ERROR]", err);
      return msg.reply("Something broke in the Pokémon Realm. Very cinematic. Very unhelpful.");
    }
  });
}
