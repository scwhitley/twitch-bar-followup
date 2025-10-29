import { Gender } from "./gender.js";
import { makeRng, seedFrom, pick } from "./rng.js";
import { ORIGINS } from "./origins.js";
import { maleFirst, femaleFirst, neutralFirst, lastNames } from "./names.js";
import { applyPronouns, pronounsFor } from "./pronouns.js";


const PERSONALITIES = [
  "calculating","loyal","stoic","brutally honest","charismatic","ruthless"
];

const GOALS = [
  "unseat a corrupt guildmaster","wipe a debt ledger clean","reclaim a stolen relic","found a new order"
];

const FLAWS = [
  "trusts plans more than people","holds grudges","tempted by quick power","avoids vulnerability"
];

const QUIRKS = [
  "collects broken droids 'for parts'","annotates every map with secret glyphs","refuses to step on floor cracks","keeps a silent metronome rhythm when thinking"
];

function nameForGender(rng, gender) {
  let pool;
  switch (gender) {
    case Gender.MALE: pool = maleFirst; break;
    case Gender.FEMALE: pool = femaleFirst; break;
    case Gender.NONBINARY: default: pool = neutralFirst; break;
  }
  const first = pick(rng, pool);
  const last  = pick(rng, lastNames);
  return `${first} ${last}`;
}

/**
 * Build a structured backstory object and prose (rules-based).
 * @param {object} opts
 * @param {string} opts.userId - Discord user id (for seeding)
 * @param {string} [opts.gender] - Gender enum
 * @param {number} [opts.overrideSeed] - Optional fixed seed
 */
export function generateBackstory({ userId, gender = Gender.UNKNOWN, overrideSeed }) {
  const seed = overrideSeed ?? seedFrom(userId, gender, Date.now().toString());
  const rng = makeRng(seed);

  
  const name = nameForGender(rng, gender === Gender.UNKNOWN ? Gender.NONBINARY : gender); // fallback to neutral pool
  const origin = pick(rng, ORIGINS);
  const originPlace = origin.state && origin.city
    ? `${origin.state} > ${origin.city}`
    : (origin.region || "somewhere uncharted");
  const p = pronounsFor(gender);
  const isPlural = (gender === Gender.NONBINARY || gender === Gender.UNKNOWN);
  const wasWere = isPlural ? "were" : "was";
  const personality = pick(rng, PERSONALITIES);
  const goal = pick(rng, GOALS);
  const flaw = pick(rng, FLAWS);
  const quirk = pick(rng, QUIRKS);
  const heightBuild = pick(rng, [
    "tall, wiry","compact, powerful","broad-shouldered","lithe and poised","average height, scarred knuckles",
  ]);
  const age = 18 + Math.floor(rng() * 22); // 18–39

  // lightweight prose with pronoun tokens
  const p = pronounsFor(gender);
  let prose = [
  `${p.They} ${wasWere} raised on ${origin.planet}, in ${originPlace}, where deals are inked in shadows and paid in favors.`,
  `Known for being ${personality}, ${p.they} learned early that silence travels faster than rumor.`,
  `Now, ${p.they} seeks to ${goal}, even if it means embracing the parts of ${p.their} past ${p.they} swore to bury.`
].join(" ");

  prose = applyPronouns(prose, gender);

  return {
    seed,
    name,
    gender,
    origin,
    personality,
    goal,
    flaw,
    quirk,
    age,
    heightBuild,
    prose,
  };
}

