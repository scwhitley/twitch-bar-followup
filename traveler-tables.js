// traveler-tables.js
export const REROLLABLE_FIELDS = [
  "name", "race", "class", "affinity", "emotion_trigger", "manifestation",
  "faction", "region", "corruption_level",
  "age", "personality", "color_variation", "physical_traits"
];

// Lore tables (trimmed for brevity; expand anytime)
export const RACES = [
  "Human","Veydrin","Elyndari","Torrin","Seraphite","Gryndal",
  "Noctari","Korrvex","Mirrion","Vaelborn","Dravari","Aetherkin",
];

export const REGIONS = [
  { key: "obsidian_reach", label: "Obsidian Reach", trait: "Heat-hardened; capital city of Distortia." },
  { key: "hollow_expanse", label: "Hollow Expanse", trait: "Echo-sensitive; hears what others miss." },
  { key: "verdant_verge",  label: "Verdant Verge",  trait: "Resilient; mends quickly between trials." },
  { key: "luminous_void",  label: "Luminous Void",  trait: "Night-attuned; calm in the uncanny." },
];

export const AFFINITIES = [
  { key: "echo_bound", label: "Echo-Bound", note: "Tethered to lingering resonance." },
  { key: "conduit",    label: "Conduit",    note: "Channels power rather than hoarding it." },
  { key: "resonant",   label: "Resonant",   note: "Vibrates with the world’s hidden tones." },
  { key: "hollowed",   label: "Hollowed",   note: "Power fills what loss carved away." },
  { key: "dormant",    label: "Dormant",    note: "Quiet today; tomorrow, maybe not." },
  { key: "warden",     label: "Warden-Touched", note: "Marked by ancient guardians." },
];

export const EMOTION_TRIGGERS = [
  "Rage","Fear","Hope","Grief","Desire","Serenity","Despair","Awe","Defiance","Ambition"
];

export const MANIFESTATIONS = [
  "Crimson Static","Violet Mist","Shadow Echo","Luminescent Veins",
  "Glass-black Tears","Harmonic Whispers","Fractured Halo","Frosted Breath"
];

export const CLASSES = [
  { key:"shroud_warden",   label:"Shroud Warden",    sig:"Bulwark of unseen currents." },
  { key:"bloodforged",     label:"Bloodforged",      sig:"Strength at the body’s cost." },
  { key:"terrak_sentinel", label:"Terrak Sentinel",  sig:"The ground keeps their oath." },
  { key:"shadowblade",     label:"Shadowblade",      sig:"Cuts the space between heartbeats." },
  { key:"pulsebreaker",    label:"Pulsebreaker",     sig:"Disrupts patterns, unravels wards." },
  { key:"riftwalker",      label:"Riftwalker",       sig:"Steps where maps say 'no'." },
  { key:"starborn_hunter", label:"Starborn Hunter",  sig:"Tracks what leaves no tracks." },
  { key:"technomancer",    label:"Technomancer",     sig:"Machines pray when they arrive." },
  { key:"bio_alchemist",   label:"Bio-Alchemist",    sig:"Life rewrites at their whim." },
  { key:"aether_scribe",   label:"Aether Scribe",    sig:"Writes contracts with the unreal." },
  { key:"psion_vanguard",  label:"Psion Vanguard",   sig:"Thought strikes before steel." },
  { key:"dread_apostle",   label:"Dread Apostle",    sig:"⚠️ Rare — council oversight advised." },
];

export const FACTIONS = [
  { key:"council", label:"D4rth Council", perk:"Audience with the severe and powerful." },
  { key:"union",   label:"Verge Union",   perk:"Mutual aid; doors open in lean times." },
  { key:"tribes",  label:"Hollow Tribes", perk:"Old paths, older promises." },
  { key:"none",    label:"Unaffiliated",  perk:"Unclaimed — freedom and suspicion." },
];

// Race metadata for age + appearance.
// age: { adultMin, adultMax } = roll between these at creation
// colors: strings flavored to the race
// traits: short physical descriptors; we’ll sample 2–3 for flavor
export const RACE_META = {
  Human: {
    age: { adultMin: 18, adultMax: 60 },
    colors: ["warm tan", "olive", "light umber", "russet", "pearl", "bronze"],
    traits: ["scarred knuckles", "storm-gray eyes", "freckled cheekbones", "broad shoulders", "runner’s calves", "old training calluses"],
  },
  Veydrin: {
    age: { adultMin: 30, adultMax: 140 },
    colors: ["ashen blue skin", "smoky lilac hue", "dusk-gray", "moon-pale", "ink-dark sclera"],
    traits: ["angular cheek ridges", "vein-glow at temples", "soft bioluminescent freckles", "knife-straight posture"],
  },
  Elyndari: {
    age: { adultMin: 25, adultMax: 180 },
    colors: ["leaf-green undertone", "gold-veined skin", "moss-cool tint", "sun-kissed bark-brown"],
    traits: ["vine-like hair filaments", "petal-thin ears", "pollen-dust lashes", "sap-sweet scent"],
  },
  Torrin: {
    age: { adultMin: 20, adultMax: 90 },
    colors: ["basalt gray", "iron slate", "cinder speckle", "charcoal banding"],
    traits: ["stone-dense frame", "mineral flecks in skin", "grounded stance", "hammer-broad hands"],
  },
  Seraphite: {
    age: { adultMin: 22, adultMax: 120 },
    colors: ["opalescent glow", "porcelain pale", "halo-sheen", "silver blush"],
    traits: ["faint crown-ring light", "wing-scar vestiges", "voice with bell overtones", "feather-grain hair"],
  },
  Gryndal: {
    age: { adultMin: 16, adultMax: 55 },
    colors: ["russet hide", "umber plates", "sand mottling", "coal stripes"],
    traits: ["horn nubs", "ridged forearms", "predator-calm gaze", "tail flick tell"],
  },
  Noctari: {
    age: { adultMin: 18, adultMax: 100 },
    colors: ["void-black sheen", "blue-black velvet", "starlit speckling", "indigo undertone"],
    traits: ["wide night-dilated pupils", "soft light-absorbent hair", "shadow-lean build", "echo-soft steps"],
  },
  Korrvex: {
    age: { adultMin: 28, adultMax: 160 },
    colors: ["obsidian glass tone", "volcanic red veining", "cracked lava pattern", "smoke-matte finish"],
    traits: ["heat-scored scars", "ember-glow eyes", "steady furnace breath", "forge-scarred palms"],
  },
  Mirrion: {
    age: { adultMin: 24, adultMax: 110 },
    colors: ["mirror-sheen patches", "chrome freckles", "polished silver tone", "liquid-steel gleam"],
    traits: ["reflective cheek panes", "prism-split irises", "metronome-steady blink", "immaculate grooming"],
  },
  Vaelborn: {
    age: { adultMin: 20, adultMax: 130 },
    colors: ["twilight violet", "dusky rose", "horizon gold", "storm teal"],
    traits: ["constellation birthmark", "sigh-soft voice", "long pianist fingers", "distant-sky eyes"],
  },
  Dravari: {
    age: { adultMin: 26, adultMax: 150 },
    colors: ["ember-kissed bronze", "blackened copper", "pyre-red glow", "smolder-auburn"],
    traits: ["ash-dust lashes", "smoke-curl hair", "coal-smudge fingertips", "embers in the breath"],
  },
  Aetherkin: {
    age: { adultMin: 18, adultMax: 200 },
    colors: ["aether-blue veins", "glass-pale dermis", "haze-white glow", "prism aura"],
    traits: ["gravity-light step", "hair moving with no wind", "tone that harmonizes rooms", "eyes that catch static"],
  },
};

export const START_CORRUPTION = [0,1,2,3]; // creation band
// Personality pool (bigger, flavorful, Codex-aligned vibe)
export const PERSONALITY_POOL = [
  "calculating", "loyal", "stoic", "blunt truth-teller", "charismatic", "ruthless",
  "dryly sarcastic", "quiet observer", "methodical planner", "recklessly curious",
  "calm strategist", "hot-headed but brave", "charming negotiator", "relentless perfectionist",
  "soft-spoken empath", "street-smart skeptic", "chaotic-good gremlin", "by-the-book operator",
  "patient opportunist", "melancholy romantic", "cold pragmatist", "shameless hype-beast",
];
