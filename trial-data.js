// trial-data.js (robust loader for /data or root JSONs)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Try multiple candidate locations so it “just works” whether
// your JSONs are in src/data, project-root/data, or directly in src/root.
const CANDIDATES = {
  questions: [
    "./data/trial-questions.json",     // src/data/...
    "../data/trial-questions.json",    // project-root/data/...
    "./trial-questions.json",          // src/...
    "../trial-questions.json",         // project-root/...
  ],
  forge: [
    "./data/forge-matrix.json",
    "../data/forge-matrix.json",
    "./forge-matrix.json",
    "../forge-matrix.json",
  ],
};

function firstExistingJSON(relPaths) {
  for (const rel of relPaths) {
    const full = path.resolve(__dirname, rel);
    try {
      const raw = fs.readFileSync(full, "utf8");
      const data = JSON.parse(raw);
      return { data, path: full };
    } catch (e) {
      // swallow and try next
    }
  }
  return { data: null, path: null };
}

const q = firstExistingJSON(CANDIDATES.questions);
const f = firstExistingJSON(CANDIDATES.forge);

export const QUESTIONS = q.data || [];
export const FORGE_MATRIX = f.data || {};

if (!Array.isArray(QUESTIONS) || QUESTIONS.length === 0) {
  console.error(
    "[trial] No questions loaded. Checked paths:",
    CANDIDATES.questions.map(p => path.resolve(__dirname, p))
  );
}
if (!FORGE_MATRIX || Object.keys(FORGE_MATRIX).length === 0) {
  console.error(
    "[trial] No forge matrix loaded. Checked paths:",
    CANDIDATES.forge.map(p => path.resolve(__dirname, p))
  );
}

// Optional: quick visibility on what succeeded
console.log(
  `[trial] QUESTIONS: ${Array.isArray(QUESTIONS) ? QUESTIONS.length : 0} loaded`,
  q.path ? `from ${q.path}` : "(not found)"
);
console.log(
  `[trial] FORGE_MATRIX: ${Object.keys(FORGE_MATRIX || {}).length} keys`,
  f.path ? `from ${f.path}` : "(not found)"
);
