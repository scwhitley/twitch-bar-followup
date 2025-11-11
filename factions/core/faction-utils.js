// /factions/core/faction-utils.js

// ---- Tiny helpers ----
export function sanitizeOneLine(s) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pick(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function niceSideLabel(side) {
  const s = String(side || "").toLowerCase();
  if (s === "jedi") return "Jedi";
  if (s === "sith") return "Sith";
  if (s === "gray" || s === "grey") return "Gray";
  return "Unaligned";
}

export function oppSide(side) {
  const s = String(side || "").toLowerCase();
  if (s === "jedi") return "sith";
  if (s === "sith") return "jedi";
  return null; // gray has no “opposite” for these rules
}

// ---- Redis key builders (namespaced & consistent) ----
// Convert flows
export const convertCooldownKey = (caster) =>
  `convert:cd:${String(caster).toLowerCase()}`;

export const convertDailyKey = (caster) =>
  `convert:daily:${String(caster).toLowerCase()}`;

export const convertImmunityKey = (target) =>
  `convert:immune:${String(target).toLowerCase()}`;

// Rally & momentum
export const rallyRecentKey = (side) =>
  `rally:recent:${String(side).toLowerCase()}`;

// Meditate (Jedi-leaning defense)
export const meditateCdKey = (user) =>
  `meditate:cd:${String(user).toLowerCase()}`;
export const meditateDailyKey = (user) =>
  `meditate:daily:${String(user).toLowerCase()}`;
export const defendMeditateKey = (user) =>
  `defend:meditate:${String(user).toLowerCase()}`;

// Seethe (Sith-leaning defense)
export const seetheCdKey = (user) =>
  `seethe:cd:${String(user).toLowerCase()}`;
export const seetheDailyKey = (user) =>
  `seethe:daily:${String(user).toLowerCase()}`;
export const defendSeetheKey = (user) =>
  `defend:seethe:${String(user).toLowerCase()}`;

// Random bar events
export const eventLastKey = () => `event:last`;

// Invasions
export const invasionActiveKey = () => `invasion:active`;
export const invasionEndsKey = () => `invasion:endsAt`;
export const invasionLockKey = () => `invasion:lock:daily`;

// Duels
export const duelLastKey = (user) =>
  `duel:last:${String(user).toLowerCase()}`;
