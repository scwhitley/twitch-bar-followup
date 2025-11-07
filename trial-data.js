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
