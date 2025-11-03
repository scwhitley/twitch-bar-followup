// traveler-builder.js
import { makeRng, seedFrom, pick } from "./rng.js";
import { maleFirst, femaleFirst, neutralFirst, lastNames } from "./names.js";
import { pronounsFor, applyPronouns } from "./pronouns.js";
import {
  REROLLABLE_FIELDS, RACES, REGIONS, AFFINITIES, EMOTION_TRIGGERS,
  MANIFESTATIONS, CLASSES, FACTIONS, START_CORRUPTION
} from "./traveler-tables.js";

// helper: random name
function randomName(rng) {
  const pools = [maleFirst, femaleFirst, neutralFirst];
  const first = pick(rng, pick(rng, pools));
  return `${first} ${pick(rng, lastNames)}`;
}

function rollRegion(rng) { return pick(rng, REGIONS); }
function rollClass(rng)  { return pick(rng, CLASSES); }
function rollAff(rng)    { return pick(rng, AFFINITIES); }
function rollFaction(rng){ return pick(rng, FACTIONS); }

export function baseSeed(userId) {
  // stable base; you can swap in Date.now() for fully fresh each time
  return seedFrom(userId, "traveler", "v1");
}

export function createProfile(userId, overrides = {}) {
  const rng = makeRng(seedFrom(baseSeed(userId), "create", Date.now().toString()));

  const region = rollRegion(rng);
  const klass  = rollClass(rng);
  const aff    = rollAff(rng);
  const fact   = rollFaction(rng);

  const doc = {
    seed: baseSeed(userId),
    name: overrides.name || randomName(rng),
    race: overrides.race || pick(rng, RACES),
    class: overrides.class || klass.label,
    affinity: overrides.affinity || aff.label,
    emotion_trigger: overrides.emotion_trigger || pick(rng, EMOTION_TRIGGERS),
    manifestation: overrides.manifestation || pick(rng, MANIFESTATIONS),
    faction: overrides.faction || fact.label,
    region: overrides.region || region.label,
    region_trait: region.trait,
    corruption_level: overrides.corruption_level ?? pick(rng, START_CORRUPTION),
    stats: { VIT: 10, WIL: 10, PRE: 10, INT: 10, AGI: 10, STR: 10 }, // placeholder stat block

    locks: Object.fromEntries(REROLLABLE_FIELDS.map(f => [f, false])),
    rerolls: Object.fromEntries(REROLLABLE_FIELDS.map(f => [f, 1])),

    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return doc;
}

// Deterministic per-field reroll using seed derivation
export function rerollField(userId, profile, field) {
  const allowed = new Set(REROLLABLE_FIELDS);
  if (!allowed.has(field)) throw new Error("Field is not rerollable.");
  if (profile.locks?.[field]) throw new Error("That field is already locked.");
  if (!profile.rerolls || profile.rerolls[field] <= 0) throw new Error("No rerolls left for that field.");

  const countUsed = 1 - (profile.rerolls[field] || 0); // 0 on first reroll
  const rng = makeRng(seedFrom(profile.seed, field, String(countUsed + Date.now())));

  let oldVal = profile[field];
  let next;

  switch (field) {
    case "name": next = randomName(rng); break;
    case "race": next = pick(rng, RACES); break;
    case "class": next = rollClass(rng).label; break;
    case "affinity": next = rollAff(rng).label; break;
    case "emotion_trigger": next = pick(rng, EMOTION_TRIGGERS); break;
    case "manifestation": next = pick(rng, MANIFESTATIONS); break;
    case "faction": next = rollFaction(rng).label; break;
    case "region": {
      const r = rollRegion(rng);
      next = r.label;
      profile.region_trait = r.trait; // keep trait synced
      break;
    }
    case "corruption_level": next = pick(rng, START_CORRUPTION); break;
    default: throw new Error("Unsupported field.");
  }

  profile[field] = next;
  profile.rerolls[field] = 0;
  profile.locks[field] = true;
  return { from: oldVal, to: next, field };
}

// Pretty embed text
export function renderEmbedData(profile) {
  const pron = pronounsFor(); // gender-less for now; add if you want
  const rareFlag = /Dread Apostle/i.test(profile.class) ? " ⚠️" : "";

  const footerRerolls =
    Object.entries(profile.rerolls)
      .map(([k,v]) => `${k.replace(/_/g," ")}(${v})`)
      .join(" • ");

  return {
    title: `Traveler: ${profile.name} — ${profile.race} · ${profile.class}${rareFlag}`,
    fields: [
      { name: "Faction", value: profile.faction, inline: true },
      { name: "Region",  value: `${profile.region}\n*${profile.region_trait}*`, inline: true },
      { name: "Affinity", value: `${profile.affinity}`, inline: true },
      { name: "Emotion Trigger", value: profile.emotion_trigger, inline: true },
      { name: "Manifestation", value: profile.manifestation, inline: true },
      { name: "Corruption", value: String(profile.corruption_level), inline: true },
    ],
    footer: `Seed ${profile.seed} — Rerolls left: ${footerRerolls}`,
  };
}
