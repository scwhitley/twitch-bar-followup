// abilities-core.js
export function roll4d6DropLowest(rng) {
  const rolls = [0,0,0,0].map(() => 1 + Math.floor(rng() * 6)).sort((a,b)=>a-b);
  return rolls.slice(1).reduce((a,b)=>a+b,0); // drop lowest
}

export function rollAbilityArray(rng) {
  return {
    STR: roll4d6DropLowest(rng),
    DEX: roll4d6DropLowest(rng),
    CON: roll4d6DropLowest(rng),
    INT: roll4d6DropLowest(rng),
    WIS: roll4d6DropLowest(rng),
    CHA: roll4d6DropLowest(rng),
  };
}

export function modsFrom(scores) {
  const out = {};
  for (const [k,v] of Object.entries(scores||{})) {
    out[k.toLowerCase()] = Math.floor((v - 10) / 2);
  }
  return out;
}

// Tiny RNG with seed fallback
export function makeRng(seedStr = Date.now().toString()) {
  let h = 2166136261 >>> 0;
  for (let i=0;i<seedStr.length;i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  return function rand() {
    h += 0x6D2B79F5;
    let t = Math.imul(h ^ h >>> 15, 1 | h);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
