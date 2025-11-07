// trial-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- State ----------
let QUESTIONS = [];
let _status = {
  loaded: false,
  from: "",
  count: 0,
  reason: "Not loaded",
  pathsTried: [],
};

// ---------- Helpers ----------
function resetStatus() {
  _status = { loaded: false, from: "", count: 0, reason: "Not loaded", pathsTried: [] };
}

function recordTry(p) {
  if (!_status.pathsTried.includes(p)) _status.pathsTried.push(p);
}

async function tryLoadModule(absPath) {
  recordTry(absPath);
  if (!fs.existsSync(absPath)) return false;
  const modUrl = pathToFileURL(absPath).href;
  const mod = await import(modUrl);
  const arr = mod.QUESTIONS;
  if (Array.isArray(arr) && arr.length > 0) {
    QUESTIONS = arr;
    _status = { loaded: true, from: absPath, count: arr.length, reason: "OK", pathsTried: _status.pathsTried };
    return true;
  }
  return false;
}

async function tryLoadJSON(absPath) {
  recordTry(absPath);
  if (!fs.existsSync(absPath)) return false;
  const raw = fs.readFileSync(absPath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed) && parsed.length > 0) {
    QUESTIONS = parsed;
    _status = { loaded: true, from: absPath, count: parsed.length, reason: "OK", pathsTried: _status.pathsTried };
    return true;
  } else if (Array.isArray(parsed?.QUESTIONS) && parsed.QUESTIONS.length > 0) {
    QUESTIONS = parsed.QUESTIONS;
    _status = { loaded: true, from: absPath, count: QUESTIONS.length, reason: "OK", pathsTried: _status.pathsTried };
    return true;
  }
  return false;
}

function resolveCandidate(p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  return path.join(__dirname, p);
}

// ---------- Public API ----------
export function getTrialStatus() {
  return { ..._status };
}

export async function reloadTrialData() {
  resetStatus();

  // 1) Env override first
  const envPath = process.env.TRIAL_QUESTIONS_PATH;
  if (envPath) {
    const abs = resolveCandidate(envPath);
    // Try module then JSON
    if (await tryLoadModule(abs)) return true;
    if (await tryLoadJSON(abs)) return true;
  }

  // 2) Default candidates (module first, then json)
  const candidates = [
    "./trial-questions.mjs",
    "./trial-questions.js",
    "./trial-questions.json",
    "./data/trial-questions.mjs",
    "./data/trial-questions.js",
    "./data/trial-questions.json",
  ].map(resolveCandidate);

  for (const p of candidates) {
    if (p.endsWith(".mjs") || p.endsWith(".js")) {
      if (await tryLoadModule(p)) return true;
    } else {
      if (await tryLoadJSON(p)) return true;
    }
  }

  // Nothing loaded
  _status.reason = "No valid questions file found or file is empty.";
  return false;
}

// Top-level load on boot (Node 20+ supports TLA)
await reloadTrialData();

// Export live reference (importer reads current array)
export { QUESTIONS };
