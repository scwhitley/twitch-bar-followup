// trial-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Built-in fallback questions (same schema as the JSON file)
const BUILTIN = /* paste the JSON array from Option A here as a JS array */ [
  // ... (same 15 question objects)
];

function loadJson(relPath) {
  const p = path.join(__dirname, relPath);
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const fromFile = loadJson("./trial-questions.json");

// Simple schema guards
function valid(qs) {
  return Array.isArray(qs) && qs.every(q =>
    typeof q.prompt === "string" &&
    Array.isArray(q.options) &&
    q.options.length === 4 &&
    q.options.every(o => typeof o.text === "string" && /^(sith|jedi|grey)$/i.test(o.align))
  );
}

export const QUESTIONS = valid(fromFile) ? fromFile : BUILTIN;

// --- Saber forge pools (by final alignment) ---
export const FORGE_MATRIX = {
  sith: {
    colors: [
      "Crimson", "Blood Red", "Magenta", "Black-Red (unstable)", "Inferno Scarlet"
    ],
    forms: [
      "Single Blade", "Dual Blades", "Crossguard", "Curved-hilt Single"
    ],
    emitters: [
      "Forked Emitter", "Vented Emitter", "Razor Crown", "Apex Fang"
    ],
    cores: [
      "Bled Kyber", "Synthetic Kyber", "Cracked Kyber (chaotic)"
    ],
    adjectives: [
      "jagged", "scorch-etched", "predatory", "night-forged", "vengeful"
    ],
    materials: [
      "obsidian alloy", "voidsteel", "dark duralium", "slag-tempered iron"
    ]
  },
  jedi: {
    colors: [
      "Blue", "Green", "Yellow", "White", "Cyan"
    ],
    forms: [
      "Single Blade", "Double (Staff)", "Shoto Off-hand"
    ],
    emitters: [
      "Temple-etched Emitter", "Channel-ring Emitter", "Pilgrim’s Guard"
    ],
    cores: [
      "Attuned Kyber", "Lothal Kyber", "Ilum Kyber"
    ],
    adjectives: [
      "harmonic", "serene", "balanced", "warden’s", "vigilant"
    ],
    materials: [
      "titanium weave", "polished durasteel", "monkwood inlay", "silvered alloy"
    ]
  },
  grey: {
    colors: [
      "Purple", "Amber", "Silver", "Teal", "Smoke-Violet"
    ],
    forms: [
      "Single Blade", "Dual (Switchable Coupler)", "Split Saber"
    ],
    emitters: [
      "Offset Emitter", "Split-socket Emitter", "Chevron Guard"
    ],
    cores: [
      "Balanced Kyber", "Resonant Kyber", "Twin-phase Kyber"
    ],
    adjectives: [
      "paradox-bound", "wayfarer’s", "echo-tuned", "equilibrium", "wanderer’s"
    ],
    materials: [
      "gunmetal mosaic", "carbon-filament wrap", "weathered steel", "stone-set spine"
    ]
  }
};

// Optional convenience helper
export function forgePoolFor(align = "grey") {
  const key = String(align).toLowerCase();
  return FORGE_MATRIX[key] || FORGE_MATRIX.grey;
}

