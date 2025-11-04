// skills-data.js
export const PROF_BONUS = 2;

export const SKILLS = [
  // Str
  { key: "Athletics", ability: "STR" },
  // Dex
  { key: "Acrobatics", ability: "DEX" },
  { key: "SleightofHand", ability: "DEX" },
  { key: "Stealth", ability: "DEX" },
  // Int
  { key: "Arcana", ability: "INT" },
  { key: "History", ability: "INT" },
  { key: "Investigation", ability: "INT" },
  { key: "Nature", ability: "INT" },
  { key: "Religion", ability: "INT" },
  // Wis
  { key: "AnimalHandling", ability: "WIS" },
  { key: "Insight", ability: "WIS" },
  { key: "Medicine", ability: "WIS" },
  { key: "Perception", ability: "WIS" },
  { key: "Survival", ability: "WIS" },
  // Cha
  { key: "Deception", ability: "CHA" },
  { key: "Intimidation", ability: "CHA" },
  { key: "Performance", ability: "CHA" },
  { key: "Persuasion", ability: "CHA" },
];

export const SKILL_TO_ABILITY = Object.fromEntries(SKILLS.map(s => [s.key, s.ability]));
