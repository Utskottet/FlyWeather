/**
 * Region names pilots actually use, not formal administrative divisions
 * (explicit feedback: not "judicial län" boundaries). For Sweden this
 * means the 25 traditional landskap (provinces) - not the 21 modern "län"
 * - since that's the closest thing to a recognizable, complete regional
 * naming scheme with nothing more purpose-built available yet. Adding a
 * new region for real means editing this list - a deliberate, cheap manual
 * step, not a live lookup.
 */
export const REGIONS_BY_COUNTRY: Record<string, string[]> = {
  se: [
    "angermanland",
    "blekinge",
    "bohuslan",
    "dalarna",
    "dalsland",
    "gastrikland",
    "gotland",
    "halland",
    "halsingland",
    "harjedalen",
    "jamtland",
    "lappland",
    "medelpad",
    "narke",
    "norrbotten",
    "oland",
    "ostergotland",
    "skane",
    "smaland",
    "sodermanland",
    "uppland",
    "varmland",
    "vasterbotten",
    "vastergotland",
    "vastmanland",
  ],
  dk: ["nordjylland", "nordsjaelland"],
};

export const COUNTRIES = Object.keys(REGIONS_BY_COUNTRY);

export const PILOT_LEVELS = ["easy", "medium", "difficult"] as const;

/**
 * Every band's core is green, every derived margin is orange - same hex
 * values as production's src/components/WindRose/WindRose.tsx. Fixed
 * constants, not a per-band choice, since color is no longer authored.
 */
export const CORE_COLOR_HEX = "#27c93f";
export const MARGIN_COLOR_HEX = "#ff9800";
