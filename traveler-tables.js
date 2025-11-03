// traveler-tables.js
export const REROLLABLE_FIELDS = [
  "name", "race", "class", "affinity", "emotion_trigger", "manifestation",
  "faction", "region", "corruption_level"
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

export const START_CORRUPTION = [0,1,2,3]; // creation band
