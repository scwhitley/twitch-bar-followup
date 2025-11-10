// /factions/core/faction-utils.js
export function sanitizeOneLine(s = "") {
  return String(s).replace(/\r|\n/g, " ").trim();
}
export function pick(arr) {
  return Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}
export function oppSide(side) {
  return side === "jedi" ? "sith" : side === "sith" ? "jedi" : null;
}
// pretty labels if you want them in messages
export function niceSideLabel(side) {
  return side === "jedi" ? "Jedi" : side === "sith" ? "Sith" : "Gray";
}
