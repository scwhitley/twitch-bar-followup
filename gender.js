// utils/gender.js
export const Gender = Object.freeze({
  MALE: "male",
  FEMALE: "female",
  NONBINARY: "nonbinary",
  UNKNOWN: "unknown",
});

const MAP = {
  male: [ "m", "male", "man", "masc", "m." ],
  female: [ "f", "female", "woman", "fem", "f." ],
  nonbinary: [ "nb", "enby", "nonbinary", "non-binary", "non binary" ],
};

export function parseGender(input) {
  if (!input) return Gender.UNKNOWN;
  const s = String(input).trim().toLowerCase();
  if (MAP.male.includes(s)) return Gender.MALE;
  if (MAP.female.includes(s)) return Gender.FEMALE;
  if (MAP.nonbinary.includes(s)) return Gender.NONBINARY;
  return Gender.UNKNOWN;
}

export function genderLabel(g) {
  switch (g) {
    case Gender.MALE: return "Male";
    case Gender.FEMALE: return "Female";
    case Gender.NONBINARY: return "Non-binary";
    default: return "Unspecified";
  }
}

