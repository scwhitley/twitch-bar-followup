// utils/rng.js
// Mulberry32 PRNG (deterministic, fast, no deps)
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Convert arbitrary strings into a 32-bit seed */
export function seedFrom(...parts) {
  const s = parts.filter(Boolean).join("|");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  return mulberry32(seed >>> 0);
}

export function pick(rng, arr) {
  if (!arr?.length) return null;
  const i = Math.floor(rng() * arr.length);
  return arr[i];
}
