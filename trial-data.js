// trial-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let QUESTIONS = [];
let _status = {
  ok: false,
  reason: "not loaded",
  pathTried: [],
  loadedFrom: null,
  count: 0,
};

// --- validation helpers
function isQuestion(q) {
  if (!q || typeof q.prompt !== "string" || !Array.isArray(q.answers)) return false;
  if (q.answers.length !== 4) return false;
  for (const a of q.answers) {
    if (!a || typeof a.label !== "string" || typeof a.alignment !== "string") return false;
    const al = a.alignment.toLowerCase();
    if (!["sith", "jedi", "grey"].includes(al)) return false;
  }
  return true;
}

function validate(arr) {
  return Array.isArray(arr) && arr.length >= 1 && arr.every(isQuestion);
}

function loadJson(p) {
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Try several likely locations, plus env override
function candidatePaths() {
  const env = process.env.TRIAL_QUESTIONS_PATH;
  const list = [];
  if (env) list.push(path.resolve(env));
  list.push(
    path.resolve(__dirname, "trial-questions.json"),
    path.resolve(__dirname, "data", "trial-questions.json"),
    path.resolve(process.cwd(), "trial-questions.json"),
    path.resolve(process.cwd(), "data", "trial-questions.json")
  );
  return list;
}

export function reloadTrialData() {
  const tried = [];
  let loaded = null;
  for (const p of candidatePaths()) {
    tried.push(p);
    const j = loadJson(p);
    if (validate(j)) {
      QUESTIONS = j.map(q => ({
        prompt: q.prompt,
        answers: q.answers.map(a => ({
          label: a.label,
          alignment: a.alignment.toLowerCase(),
        })),
      }));
      _status = { ok: true, reason: "loaded", pathTried: tried, loadedFrom: p, count: QUESTIONS.length };
      return true;
    }
  }
  QUESTIONS = [];
  _status = { ok: false, reason: "No valid JSON found", pathTried: tried, loadedFrom: null, count: 0 };
  return false;
}

export function getTrialStatus() {
  return { ..._status };
}

// Initial load (on cold start)
reloadTrialData();

// Read-only export the current array
export { QUESTIONS };
