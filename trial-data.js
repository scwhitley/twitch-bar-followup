// trial-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ESM __dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function tryLoad(p) {
  try {
    const full = path.resolve(__dirname, p);
    if (!fs.existsSync(full)) return null;
    const raw = fs.readFileSync(full, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Try multiple locations so Render / your repo layout both work
const candidates = [
  "./trial-questions.json",
  "./data/trial-questions.json",
];

let QUESTIONS_RAW = null;
for (const rel of candidates) {
  const data = tryLoad(rel);
  if (data?.questions?.length) {
    QUESTIONS_RAW = data;
    console.log(`[trial-data] Loaded questions from ${rel} (${data.questions.length})`);
    break;
  }
}

function validateQuestions(arr = []) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const q = arr[i];
    if (!q || typeof q.prompt !== "string") continue;
    if (!Array.isArray(q.answers) || q.answers.length !== 4) continue;
    // Each answer: { label, alignment }
    const ok = q.answers.every(a => a && typeof a.label === "string" && typeof a.alignment === "string");
    if (!ok) continue;
    out.push({
      prompt: q.prompt,
      // normalize field names just in case
      answers: q.answers.map(a => ({ label: a.label, alignment: a.alignment.toLowerCase() })),
      scoring: q.scoring || undefined,
    });
  }
  return out;
}

export const QUESTIONS = validateQuestions(QUESTIONS_RAW?.questions);

// Safety: stop the runtime from exploding if file was missing.
// You’ll still see an error card in logs, but commands won’t crash.
if (!QUESTIONS.length) {
  console.error("[trial-data] No questions loaded. Make sure trial-questions.json exists in project root OR /data and has { questions: [...] } with 4 answers each.");
}

// ----------------- FORGE POOL / MATRIX -----------------

// Basic pools by alignment (expand as you like)
const FORGE_POOLS = {
  sith: {
    colors: ["Crimson", "Blood Red", "Dark Scarlet"],
    forms: ["Single Saber", "Crossguard", "Curved Hilt"],
    emitters: ["Forked Emitter", "Vented Emitter", "Spine Emitter"],
    cores: ["Kyber (Bled)", "Synthetic Core", "Shroud-Touched Crystal"],
    adjectives: ["Jagged", "Aggressive", "Seared"],
    materials: ["Obsidian Steel", "Burnt Durasteel", "War-etched Alloy"],
  },
  jedi: {
    colors: ["Blue", "Green", "Yellow"],
    forms: ["Single Saber", "Shoto Offhand", "Guardian Pike"],
    emitters: ["Clean Emitter", "Halo Emitter", "Disc Emitter"],
    cores: ["Kyber (Attuned)", "Luminant Core", "Balanced Crystal"],
    adjectives: ["Elegant", "Disciplined", "Harmonized"],
    materials: ["Polished Steel", "Temple Alloy", "Songwood Inlay"],
  },
  grey: {
    colors: ["White", "Silver", "Amethyst"],
    forms: ["Dual Sabers", "Staff Saber", "Switch-Hilt"],
    emitters: ["Phase Emitter", "Ring Emitter", "Split Emitter"],
    cores: ["Veiled Crystal", "Phase Core", "Twinned Kyber"],
    adjectives: ["Adaptive", "Balanced", "Quiet"],
    materials: ["Shadowglass", "Worn Durasteel", "Ghostwood Wrap"],
  },
};

export function forgePoolFor(alignment) {
  const a = String(alignment || "grey").toLowerCase();
  return FORGE_POOLS[a] || FORGE_POOLS.grey;
}

// Optional exotic matrix (low chance)
export const FORGE_MATRIX = {
  exotics: {
    chance: 0.03, // 3% exotic
    colors: ["Black Core", "Prismatic Rift", "Voidglow"],
    forms: ["Chain Saber", "Whipblade", "Split Staff"],
    descriptions: [
      "A ripple of voidlight devours the edges of the blade.",
      "Segments phase in and out, singing in reverse.",
      "The beam blooms and contracts like a living heartbeat.",
    ],
  },
  colors: {
    sith: FORGE_POOLS.sith.colors,
    jedi: FORGE_POOLS.jedi.colors,
    grey: FORGE_POOLS.grey.colors,
  },
  forms: {
    sith: FORGE_POOLS.sith.forms,
    jedi: FORGE_POOLS.jedi.forms,
    grey: FORGE_POOLS.grey.forms,
  },
  descriptions: {
    sith: [
      "A hungry edge that howls when swung.",
      "The beam gutters like embers before roaring alive.",
      "The hilt thrums with caged fury.",
    ],
    jedi: [
      "A steady tone, pure and resolute.",
      "Balanced light flows like water from a spring.",
      "The blade hums in quiet harmony.",
    ],
    grey: [
      "A calm, shifting resonance strung between two worlds.",
      "The edge flickers with choices not yet made.",
      "Silent power tempered by restraint.",
    ],
  },
};
