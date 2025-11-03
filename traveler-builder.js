// traveler-builder.js
import { makeRng, seedFrom, pick } from "./rng.js";
import { maleFirst, femaleFirst, neutralFirst, lastNames } from "./names.js";
import {
  REROLLABLE_FIELDS, RACES, REGIONS, AFFINITIES, EMOTION_TRIGGERS,
  MANIFESTATIONS, CLASSES, FACTIONS, START_CORRUPTION,
  RACE_META, PERSONALITY_POOL
} from "./traveler-tables.js";

// ---------- helpers
function randomName(rng) {
  const pools = [maleFirst, femaleFirst, neutralFirst];
  const first = pick(rng, pick(rng, pools));
  return `${first} ${pick(rng, lastNames)}`;
}
function roll(listOrObjArr, rng) {
  return pick(rng, listOrObjArr);
}
function rollRegion(rng) { return roll(REGIONS, rng); }
function rollClass(rng)  { return roll(CLASSES, rng); }
function rollAff(rng)    { return roll(AFFINITIES, rng); }
function rollFaction(rng){ return roll(FACTIONS, rng); }
function raceMeta(race)  { return RACE_META[race] || RACE_META["Human"]; }

export function baseSeed(userId) {
  return seedFrom(userId, "traveler", "v1");
}

// sample 2–3 physical trait snippets for the race
function sampleTraits(rng, race) {
  const t = raceMeta(race).traits || [];
  const size = Math.min(3, Math.max(2, Math.floor(rng() * 3) + 1)); // 2–3
  const pool = [...t];
  const out = [];
  while (out.length < size && pool.length) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i,1)[0]);
  }
  return out;
}

function rollColor(rng, race) {
  const colors = raceMeta(race).colors || ["neutral tone"];
  return pick(rng, colors);
}
function rollAge(rng, race) {
  const a = raceMeta(race).age || { adultMin: 18, adultMax: 60 };
  const span = Math.max(0, a.adultMax - a.adultMin);
  return a.adultMin + Math.floor(rng() * (span + 1));
}

export function createProfile(userId, overrides = {}) {
  const rng = makeRng(seedFrom(baseSeed(userId), "create", Date.now().toString()));
  const region = rollRegion(rng);
  const klass  = rollClass(rng);
  const aff    = rollAff(rng);
  const fact   = rollFaction(rng);

  const race = overrides.race || pick(rng, RACES);
  const age  = overrides.age ?? rollAge(rng, race);
  const color = overrides.color_variation || rollColor(rng, race);
  const phys = overrides.physical_traits || sampleTraits(rng, race);
  const personality = overrides.personality || pick(rng, PERSONALITY_POOL);

  const doc = {
    seed: baseSeed(userId),
    name: overrides.name || randomName(rng),
    race,
    class: overrides.class || klass.label,
    affinity: overrides.affinity || aff.label,
    emotion_trigger: overrides.emotion_trigger || pick(rng, EMOTION_TRIGGERS),
    manifestation: overrides.manifestation || pick(rng, MANIFESTATIONS),
    faction: overrides.faction || fact.label,
    region: overrides.region || region.label,
    region_trait: region.trait,
    corruption_level: overrides.corruption_level ?? pick(rng, START_CORRUPTION),

    // NEW fields
    age,
    personality,
    color_variation: color,
    physical_traits: phys, // array of 2–3 strings

    stats: { VIT: 10, WIL: 10, PRE: 10, INT: 10, AGI: 10, STR: 10 },

    locks: Object.fromEntries(REROLLABLE_FIELDS.map(f => [f, false])),
    rerolls: Object.fromEntries(REROLLABLE_FIELDS.map(f => [f, 1])),

    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return doc;
}

// Deterministic per-field reroll using seed derivation
export function rerollField(userId, profile, field) {
  const ok = new Set(REROLLABLE_FIELDS);
  if (!ok.has(field)) throw new Error("Field is not rerollable.");
  if (profile.locks?.[field]) throw new Error("That field is already locked.");
  if (!profile.rerolls || profile.rerolls[field] <= 0) throw new Error("No rerolls left for that field.");

  const countUsed = 1 - (profile.rerolls[field] || 0); // 0 on first reroll
  const rng = makeRng(seedFrom(profile.seed, field, String(countUsed + Date.now())));

  let oldVal = profile[field];
  let next;

  switch (field) {
    case "name": next = randomName(rng); break;
    case "race": {
      const newRace = pick(rng, RACES);
      profile.race = newRace;
      // refresh race-bound cosmetics when race changes
      profile.color_variation = rollColor(rng, newRace);
      profile.physical_traits = sampleTraits(rng, newRace);
      // keep age within the new race’s adult band
      profile.age = rollAge(rng, newRace);
      next = newRace;
      break;
    }
    case "class": next = rollClass(rng).label; break;
    case "affinity": next = rollAff(rng).label; break;
    case "emotion_trigger": next = pick(rng, EMOTION_TRIGGERS); break;
    case "manifestation": next = pick(rng, MANIFESTATIONS); break;
    case "faction": next = rollFaction(rng).label; break;
    case "region": {
      const r = rollRegion(rng);
      next = r.label;
      profile.region_trait = r.trait;
      break;
    }
    case "corruption_level": next = pick(rng, START_CORRUPTION); break;

    // NEW rerolls
    case "age": next = rollAge(rng, profile.race); break;
    case "personality": next = pick(rng, PERSONALITY_POOL); break;
    case "color_variation": next = rollColor(rng, profile.race); break;
    case "physical_traits": next = sampleTraits(rng, profile.race); break;

    default: throw new Error("Unsupported field.");
  }

  profile[field] = next;
  profile.rerolls[field] = 0;
  profile.locks[field] = true;
  profile.updatedAt = Date.now();
  return { from: oldVal, to: next, field };
}

// ---------- migration for old saves ----------
function regionByLabel(label) {
  return REGIONS.find(r => r.label === label) || REGIONS[0];
}

export function migrateProfile(profile) {
  const rng = makeRng(seedFrom(profile.seed || "seed", "migrate", String(Date.now())));

  const want = [
    "name","race","class","affinity","emotion_trigger","manifestation",
    "faction","region","corruption_level",
    "age","personality","color_variation","physical_traits"
  ];
  profile.rerolls = profile.rerolls || {};
  profile.locks   = profile.locks   || {};
  for (const k of want) {
    if (!(k in profile.rerolls)) profile.rerolls[k] = 1;
    if (!(k in profile.locks))   profile.locks[k]   = false;
  }

  if (!profile.region_trait) {
    const r = regionByLabel(profile.region);
    profile.region_trait = r?.trait || "resourceful locals";
  }

  const meta = (RACE_META[profile.race] || RACE_META.Human);
  if (profile.age == null) {
    const { adultMin, adultMax } = meta.age || { adultMin: 18, adultMax: 60 };
    const span = Math.max(0, (adultMax ?? 60) - (adultMin ?? 18));
    profile.age = (adultMin ?? 18) + Math.floor(rng() * (span + 1));
  }
  if (!profile.personality) {
    profile.personality = pick(rng, PERSONALITY_POOL);
  }
  if (!profile.color_variation) {
    const colors = meta.colors || ["neutral tone"];
    profile.color_variation = pick(rng, colors);
  }
  if (!profile.physical_traits || !Array.isArray(profile.physical_traits) || profile.physical_traits.length === 0) {
    const traits = [...(meta.traits || ["plain features"])];
    const out = [];
    while (out.length < 2 && traits.length) {
      out.push(traits.splice(Math.floor(rng()*traits.length),1)[0]);
    }
    profile.physical_traits = out;
  }

  profile.updatedAt = Date.now();
  return profile;
}

// ---------- embed renderer ----------
export function renderEmbedData(profile) {
  const rareFlag = /Dread Apostle/i.test(profile.class) ? " ⚠️" : "";
  const footerRerolls =
    Object.entries(profile.rerolls || {})
      .map(([k,v]) => `${k.replace(/_/g," ")}(${v})`)
      .join(" • ");

  const phys = Array.isArray(profile.physical_traits)
    ? profile.physical_traits.slice(0,2).join("; ")
    : String(profile.physical_traits || "");

  return {
    title: `Traveler: ${profile.name || "Unknown"} — ${profile.race || "—"} · ${profile.class || "—"}${rareFlag}`,
    fields: [
      { name: "Faction", value: String(profile.faction ?? "—"), inline: true },
      { name: "Region",  value: `${profile.region || "—"}\n*${profile.region_trait || "—"}*`, inline: true },
      { name: "Affinity", value: String(profile.affinity ?? "—"), inline: true },
      { name: "Emotion Trigger", value: String(profile.emotion_trigger ?? "—"), inline: true },
      { name: "Manifestation", value: String(profile.manifestation ?? "—"), inline: true },
      { name: "Corruption", value: String(profile.corruption_level ?? "—"), inline: true },

      { name: "Age", value: String(profile.age ?? "—"), inline: true },
      { name: "Personality", value: String(profile.personality ?? "—"), inline: true },
      { name: "Color Variation", value: String(profile.color_variation ?? "—"), inline: true },
      { name: "Physical Traits", value: phys || "—", inline: false },
    ],
    footer: `Seed ${profile.seed} — Rerolls left: ${footerRerolls}`,
  };
}
