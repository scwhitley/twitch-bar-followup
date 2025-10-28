// utils/pronouns.js
import { Gender } from "./gender.js";

const PACKS = {
  [Gender.MALE]:      { they: "he",   them: "him",  their: "his",  They: "He",   Them: "Him",  Their: "His"  },
  [Gender.FEMALE]:    { they: "she",  them: "her",  their: "her",  They: "She",  Them: "Her",  Their: "Her"  },
  [Gender.NONBINARY]: { they: "they", them: "them", their: "their",They: "They", Them: "Them", Their: "Their"},
  [Gender.UNKNOWN]:   { they: "they", them: "them", their: "their",They: "They", Them: "Them", Their: "Their"},
};

export function pronounsFor(gender) {
  return PACKS[gender] || PACKS[Gender.UNKNOWN];
}

/**
 * Replace tokens like {they} {them} {their} {They} {Them} {Their}
 */
export function applyPronouns(text, gender) {
  const p = pronounsFor(gender);
  return text
    .replaceAll("{they}", p.they)
    .replaceAll("{them}", p.them)
    .replaceAll("{their}", p.their)
    .replaceAll("{They}", p.They)
    .replaceAll("{Them}", p.Them)
    .replaceAll("{Their}", p.Their);
}
