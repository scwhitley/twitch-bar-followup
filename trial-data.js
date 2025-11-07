// trial-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Robust loader that tries multiple strategies/locations ----
function tryReadJSON(absPath) {
  try {
    if (!fs.existsSync(absPath)) return null;
    const raw = fs.readFileSync(absPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Node >=20 supports JSON modules; use as a fallback if fs fails
async function tryImportJSON(absPath) {
  try {
    // Convert to file URL and import as JSON module
    const url = pathToFileURL(absPath).href;
    const mod = await import(url, { assert: { type: "json" } });
    // Node json modules expose default
    return mod?.default ?? null;
  } catch {
    return null;
  }
}

async function loadQuestions() {
  // Allow override via env (either a path or a raw JSON string)
  const ENV = process.env.TRIAL_QUESTIONS_JSON?.trim();
  if (ENV) {
    // Try as path first
    const envPath = path.isAbsolute(ENV) ? ENV : path.resolve(__dirname, ENV);
    let data = tryReadJSON(envPath);
    if (!data) {
      // Try parse as raw JSON text
      try { data = JSON.parse(ENV); } catch {}
    }
    if (data?.questions?.length) {
      console.log(`[trial-data] Loaded questions from TRIAL_QUESTIONS_JSON (${data.questions.length})`);
      return data.questions;
    }
  }

  // Candidate relative paths (both root and /data)
  const relCandidates = [
    "./trial-questions.json",
    "./data/trial-questions.json",
    "../trial-questions.json",
    "../data/trial-questions.json",
  ];

  // 1) Try fs reads
  for (const rel of relCandidates) {
    const abs = path.resolve(__dirname, rel);
    const data = tryReadJSON(abs);
    if (data?.questions?.length) {
      console.log(`[trial-data] Loaded questions (fs) from ${path.relative(process.cwd(), abs)} (${data.questions.length})`);
      return data.questions;
    }
  }

  // 2) Try JSON module import (in case of bundlers/packagers)
  for (const rel of relCandidates) {
    const abs = path.resolve(__dirname, rel);
    const data = await tryImportJSON(abs);
    if (data?.questions?.length) {
      console.log(`[trial-data] Loaded questions (import) from ${path.relative(process.cwd(), abs)} (${data.questions.length})`);
      return data.questions;
    }
  }

  console.error("[trial-data] FAILED to load trial-questions.json. Expected at /src/trial-questions.json or /src/data/trial-questions.json (or set TRIAL_QUESTIONS_JSON).");
  return [];
}

function validateQuestions(arr = []) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const q = arr[i];
    if (!q || typeof q.prompt !== "string" || !q.prompt.trim()) continue;
    const ans = Array.isArray(q.answers) ? q.answers : q.options; // allow "options" older schema
    if (!Array.isArray(ans) || ans.length !== 4) continue;
    const ok = ans.every(a => a && typeof a.label === "string" && typeof a.alignment === "string");
    if (!ok) continue;
    out.push({
      prompt: q.prompt,
      answers: ans.map(a => ({ label: a.label, alignment: a.alignment.toLowerCase() })),
      scoring: q.scoring || undefined,
    });
  }
  return out;
}

// Kick the async loader once on module import
let QUESTIONS = [];
let LOADED = false;
let LOAD_ERR = null;
const _loadPromise = (async () => {
  try {
    const raw = await loadQuestions();
    QUESTIONS = validateQuestions(raw);
    LOADED = true;
    if (!QUESTIONS.length) {
      LOAD_ERR = "No valid questions after validation";
    }
  } catch (e) {
    LOAD_ERR = e?.message || String(e);
    console.error("[trial-data] Loader error:", e);
  }
})();

// Helper so callers can await readiness (optional)
export async function ensureQuestionsLoaded() {
  await _loadPromise;
  return QUESTIONS.length;
}

export function getQuestions() {
  return QUESTIONS;
}

export function getQuestion(idx) {
  if (!LOADED) {
    // This helps your command show a friendly error instead of crashing.
    throw new Error("[trial] Questions not loaded yet. Try again in a second.");
  }
  if (!QUESTIONS.length) {
    throw new Error("[trial] No questions loaded (check JSON path/export)");
  }
  if (idx < 0 || idx >= QUESTIONS.length) return null;
  return QUESTIONS[idx];
}

export function totalQuestions() {
  return QUESTIONS.length;
}

// ------------- Saber forge pools (as before) -------------
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

export const FORGE_MATRIX = {
  exotics: {
    chance: 0.03,
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
