// /factions/core/faction-constants.js
export const D4RTH_USERNAME = "d4rth_distortion"; // lowercased handle used in your routes

// --- Conversion tuning ---
export const CONVERT_COOLDOWN_SEC   = 60;        // per-caster cooldown between attempts
export const CONVERT_DAILY_LIMIT    = 10;        // attempts per caster per day
export const IMMUNITY_SECONDS       = 20 * 60;   // ✅ 20 minutes immunity after a successful convert

// --- Rally/Event/Defense ---
export const RALLY_RECENT_TTL_SEC   = 10 * 60;   // 10 minutes
export const DEFENSE_TTL_SEC        = 10 * 60;   // meditate/seethe defense window
export const MEDITATE_CD_SEC        = 60;        // per-use cooldown
export const SEETHE_CD_SEC          = 60;
export const MEDITATE_DAILY_MAX     = 15;        // per day per user
export const SEETHE_DAILY_MAX       = 15;

// --- Invasion / Events ---
export const INVASION_DEFAULT_SEC   = 180;
export const EVENT_MIN_GAP_SEC      = 45;        // min gap between /event/random

// --- Duel / ELO ---
export const DUEL_COOLDOWN_MS       = 45_000;
export const ELO_WIN                = +8;
export const ELO_LOSS               = -4;
export const ELO_LOSS_VS_D4RTH      = -25;

// --- ELO daily bonus via meditate/seethe helpers ---
export const ELO_BONUS_DAILY_CAP    = 5;
export const ELO_BONUS_PER_USE      = 1;
