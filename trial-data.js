// trial-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

let QUESTIONS = null; // exported via getter functions

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Candidate paths (relative to /opt/render/project/src when deployed)
const CANDIDATES = [
  process.env.TRIAL_QUESTIONS_PATH,             // explicit override
  "trial-questions.json",                       // src/trial-questions.json
  "data/trial-questions.json",                  // src/data/trial-questions.json
].filter(Boolean);

// Normalizes any of:
//  - array of questions
//  - { questions: [...] }
function normalizeQuestions(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
  return null;
}

function safeReadJSON(absPath) {
  try {
    const raw = fs.readFileSync(absPath, "utf8");
    const parsed = JSON.parse(raw);
    const q = normalizeQuestions(parsed);
    if (!q || !q.length) return null;
    return q;
  } catch {
    return null;
  }
}

export async function ensureQuestionsLoaded() {
  if (QUESTIONS && Array.isArray(QUESTIONS) && QUESTIONS.length) return true;

  // Resolve candidates relative to this file (so it works no matter the CWD)
  for (const rel of CANDIDATES) {
    const abs = path.isAbsolute(rel) ? rel : path.join(__dirname, rel);
    const q = safeReadJSON(abs);
    if (q) {
      QUESTIONS = q;
      console.log(`[trial-data] Loaded (${q.length}) from ${abs}`);
      return true;
    }
  }

  console.error(
    `[trial-data] FAILED to load questions. Tried:\n` +
      CANDIDATES.map((p) =>
        path.isAbsolute(p) ? ` - ${p}` : ` - ${path.join(__dirname, p)}`
      ).join("\n")
  );
  return false;
}

export function totalQuestions() {
  return Array.isArray(QUESTIONS) ? QUESTIONS.length : 0;
}

export function getQuestion(idx) {
  if (!Array.isArray(QUESTIONS)) return null;
  if (idx < 0 || idx >= QUESTIONS.length) return null;
  return QUESTIONS[idx];
}
