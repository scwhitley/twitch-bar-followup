// trial-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---- tolerant JSON loader (tries /data then root) ----
function loadJson(relFromModule) {
  try {
    const p = path.join(__dirname, relFromModule);
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

let QUESTIONS = loadJson("./data/trial-questions.json");
if (!Array.isArray(QUESTIONS) || QUESTIONS.length === 0) {
  QUESTIONS = loadJson("./trial-questions.json") || [];
}
if (!Array.isArray(QUESTIONS)) QUESTIONS = [];

export { QUESTIONS };

// Handy getter w/ useful error if empty/out-of-range
export function getQuestion(i) {
  if (!Array.isArray(QUESTIONS) || QUESTIONS.length === 0) {
    throw new Error("[trial] No questions loaded (check JSON path/export)");
  }
  if (i < 0 || i >= QUESTIONS.length) {
    throw new Error(`[trial] Question index out of range: ${i}/${QUESTIONS.length}`);
  }
  return QUESTIONS[i];
}

// ---- Forge matrix + helper (used by forge-command.js) ----
export const FORGE_MATRIX = {
  colors: {
    sith: ["Crimson", "Blood Red", "Dark Magenta"],
    jedi: ["Blue", "Green", "Yellow"],
    grey: ["White", "Silver", "Smoke"],
  },
  forms: {
    sith: ["Crossguard", "Scimitar", "Curved Hilt"],
    jedi: ["Standard", "Shoto", "Staff"],
    grey: ["Dual-Phase", "Variable", "Split-Saber"],
  },
  emitters: {
    sith: ["Fang", "Razor", "Blight"],
    jedi: ["Sentinel", "Beacon", "Harmony"],
    grey: ["Balance", "Mirror", "Veil"],
  },
  cores: {
    sith: ["Synthetic Kyber", "Onyx Core", "Rage Focus"],
    jedi: ["Kyber Crystal", "Lumen Core", "Calm Focus"],
    grey: ["Attuned Shard", "Neutral Core", "Shroud Focus"],
  },
  adjectives: {
    sith: ["Barbed", "Vicious", "Seething"],
    jedi: ["Serene", "Stalwart", "Guiding"],
    grey: ["Austere", "Measured", "Veiled"],
  },
  materials: {
    sith: ["Charred Durasteel", "Obsidian Alloy", "Hemosteel"],
    jedi: ["Aureline Steel", "Polished Brylark", "Temple Brass"],
    grey: ["Gunmetal Alloy", "Smoked Steel", "Runic Composite"],
  },
  exotics: {
    chance: 0.03,
    colors: ["Amethyst", "Black-Core Red", "Darksilver"],
    forms: ["Tri-Saber", "Chain-Saber", "Switchblade Pike"],
    descriptions: [
      "Anomalous resonance hums through the hilt.",
      "A forbidden design stolen from ancient holocrons.",
      "The blade flickers like a heartbeat in the Shroud.",
    ],
  },
};

export function forgePoolFor(alignment = "grey") {
  const key = String(alignment || "grey").toLowerCase();
  const m = FORGE_MATRIX;

  const pick = (obj) =>
    (obj?.[key] ?? obj?.grey ?? obj ?? []);

  return {
    colors:     pick(m.colors),
    forms:      pick(m.forms),
    emitters:   pick(m.emitters),
    cores:      pick(m.cores),
    adjectives: pick(m.adjectives),
    materials:  pick(m.materials),
    exotics:    m.exotics || null,
  };
}
