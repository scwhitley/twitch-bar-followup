// trial-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

let QUESTIONS = [];
let LAST_REASON = "Not loaded";
let LAST_FROM = "";
let LAST_PATHS = [];
let LAST_ERROR = "";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CWD = process.cwd();

function recordAttempt(p, ok, note) {
  LAST_PATHS.push(p);
  if (ok) {
    LAST_FROM = p;
    LAST_REASON = "Loaded OK";
  } else if (note) {
    LAST_ERROR = note;
    LAST_REASON = "No valid JSON found";
  }
}

async function tryImportModule(modPath) {
  try {
    const mod = await import(modPath + `?t=${Date.now()}`);
    const q = mod.QUESTIONS || mod.default;
    if (Array.isArray(q) && q.length) {
      QUESTIONS = q;
      recordAttempt(modPath, true);
      return true;
    }
    recordAttempt(modPath, false, "Module did not export QUESTIONS or was empty");
  } catch (e) {
    recordAttempt(modPath, false, `Module import failed: ${e?.message || e}`);
  }
  return false;
}

function tryReadJson(jsonPath) {
  try {
    if (!fs.existsSync(jsonPath)) {
      recordAttempt(jsonPath, false, "File does not exist");
      return false;
    }
    const raw = fs.readFileSync(jsonPath, "utf8");
    const q = JSON.parse(raw);
    if (!Array.isArray(q) || !q.length) {
      recordAttempt(jsonPath, false, "Parsed but empty / not an array");
      return false;
    }
    QUESTIONS = q;
    recordAttempt(jsonPath, true);
    return true;
  } catch (e) {
    recordAttempt(jsonPath, false, `JSON parse/read error: ${e?.message || e}`);
    return false;
  }
}

export async function reloadTrialData() {
  QUESTIONS = [];
  LAST_REASON = "Not loaded";
  LAST_FROM = "";
  LAST_PATHS = [];
  LAST_ERROR = "";

  // 1) Env override (module OR json)
  const envPath = process.env.TRIAL_QUESTIONS_PATH;
  if (envPath) {
    const abs = path.isAbsolute(envPath) ? envPath : path.join(CWD, envPath);
    if (envPath.endsWith(".mjs") || envPath.endsWith(".js")) {
      if (await tryImportModule(pathToFileUrl(abs))) return true;
    } else {
      if (tryReadJson(abs)) return true;
    }
  }

  // 2) Prefer module in root
  const modRoot = path.join(CWD, "trial-questions.mjs");
  if (fs.existsSync(modRoot)) {
    if (await tryImportModule(pathToFileUrl(modRoot))) return true;
  }

  // 3) JSON in root or /data fallback
  const jsonRoot = path.join(CWD, "trial-questions.json");
  if (tryReadJson(jsonRoot)) return true;

  const jsonData = path.join(CWD, "data", "trial-questions.json");
  if (tryReadJson(jsonData)) return true;

  // 4) Also try next to this file (rare)
  const modLocal = path.join(__dirname, "trial-questions.mjs");
  if (fs.existsSync(modLocal)) {
    if (await tryImportModule(pathToFileUrl(modLocal))) return true;
  }
  const jsonLocal = path.join(__dirname, "trial-questions.json");
  if (tryReadJson(jsonLocal)) return true;

  return false;
}

function pathToFileUrl(p) {
  const u = new URL("file:///");
  // normalize to posix-like
  u.pathname = p.replace(/\\/g, "/");
  return u.href;
}

export function getTrialStatus() {
  return {
    loaded: Array.isArray(QUESTIONS) && QUESTIONS.length > 0,
    from: LAST_FROM || "—",
    count: Array.isArray(QUESTIONS) ? QUESTIONS.length : 0,
    reason: LAST_REASON + (LAST_ERROR ? ` — ${LAST_ERROR}` : ""),
    pathsTried: LAST_PATHS.slice(),
    cwd: CWD
  };
}

export { QUESTIONS };
