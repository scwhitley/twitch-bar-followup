// trial-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let QUESTIONS = [];
let _status = {
  loaded: false,
  from: "",
  count: 0,
  reason: "Not loaded",
  pathsTried: [],
};

function resetStatus() {
  _status = { loaded: false, from: "", count: 0, reason: "Not loaded", pathsTried: [] };
}
function recordTry(p) {
  if (!_status.pathsTried.includes(p)) _status.pathsTried.push(p);
}
function resolveCandidate(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(__dirname, p);
}

async function tryLoadModule(absPath) {
  recordTry(absPath);
  if (!fs.existsSync(absPath)) return false;
  const modUrl = pathToFileURL(absPath).href;
  const mod = await import(modUrl); // only for .mjs/.js
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
  try {
    const raw = fs.readFileSync(absPath, "utf8");
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.QUESTIONS) ? parsed.QUESTIONS : null;
    if (Array.isArray(arr) && arr.length > 0) {
      QUESTIONS = arr;
      _status = { loaded: true, from: absPath, count: arr.length, reason: "OK", pathsTried: _status.pathsTried };
      return true;
    }
    _status.reason = "File parsed but contained no QUESTIONS";
    return false;
  } catch (e) {
    _status.reason = `JSON parse error: ${e.message}`;
    return false;
  }
}

export function getTrialStatus() {
  return { ..._status };
}

export async function reloadTrialData() {
  resetStatus();

  const envPath = process.env.TRIAL_QUESTIONS_PATH;
  if (envPath) {
    const abs = resolveCandidate(envPath);
    if (abs.endsWith(".mjs") || abs.endsWith(".js")) {
      if (await tryLoadModule(abs)) return true;
    } else if (abs.endsWith(".json")) {
      if (await tryLoadJSON(abs)) return true;
    }
  }

  // Default search order (modules first, then JSON)
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
    } else if (p.endsWith(".json")) {
      if (await tryLoadJSON(p)) return true;
    }
  }

  _status.reason = "No valid questions file found or file is empty.";
  return false;
}

// Load once on boot
await reloadTrialData();

export { QUESTIONS };
