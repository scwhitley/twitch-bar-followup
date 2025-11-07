// trial-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadJson(rel) {
  const p = path.join(__dirname, rel);
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

function validateQuestions(qs) {
  if (!Array.isArray(qs) || qs.length !== 15) {
    throw new Error("trial-questions.json must contain exactly 15 questions");
  }
  const okAlign = new Set(["sith", "jedi", "grey"]);
  qs.forEach((q, idx) => {
    if (typeof q.prompt !== "string") throw new Error(`Q${idx+1}: prompt must be a string`);
    if (!Array.isArray(q.options) || q.options.length !== 4)
      throw new Error(`Q${idx+1}: must have exactly 4 options`);
    q.options.forEach((o, j) => {
      if (typeof o.text !== "string") throw new Error(`Q${idx+1} opt${j+1}: text missing`);
      if (!okAlign.has(o.align)) throw new Error(`Q${idx+1} opt${j+1}: align must be sith|jedi|grey`);
    });
  });
}

function validateForgeMatrix(m) {
  const need = ["colors","forms","descriptions","scoring","exotics"];
  for (const k of need) if (!m[k]) throw new Error(`forge-matrix.json missing '${k}'`);
  const okAlign = new Set(["sith","jedi","grey"]);
  for (const k of ["colors","forms","descriptions"]) {
    const sect = m[k];
    for (const a of okAlign) {
      if (!Array.isArray(sect[a]) || sect[a].length === 0)
        throw new Error(`forge-matrix.${k}.${a} must be a non-empty array`);
    }
  }
  if (!Array.isArray(m.exotics.colors) || !m.exotics.colors.length)
    throw new Error("forge-matrix.exotics.colors must be non-empty");
  if (!Array.isArray(m.exotics.forms) || !m.exotics.forms.length)
    throw new Error("forge-matrix.exotics.forms must be non-empty");
  if (!Array.isArray(m.exotics.descriptions) || !m.exotics.descriptions.length)
    throw new Error("forge-matrix.exotics.descriptions must be non-empty");
  if (typeof m.exotics.chance !== "number") m.exotics.chance = 0.01; // default 1%
}

export const QUESTIONS = (() => {
  const qs = loadJson("./trial-questions.json");
  validateQuestions(qs);
  return qs;
})();

export const FORGE_MATRIX = (() => {
  const fm = loadJson("./forge-matrix.json");
  validateForgeMatrix(fm);
  return fm;
})();
