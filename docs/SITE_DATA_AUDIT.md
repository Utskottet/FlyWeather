# SITE_DATA_AUDIT.md — CPS site data verification log

Required V1 deliverable per `MASTER_SPEC.md` §21. Filled in incrementally
across Block 2a/2b/2c (see `BLOCKS.md`). Each row reflects the state as of
the CPS check noted, not a permanent guarantee — `SITES.md` remains
authoritative.

## Method notes (apply to all sub-blocks)

- Sources checked: `https://www.cps.to/flygstallen/` (index),
  `https://m.cps.to/` (mobile station list), and each site's individual
  CPS page.
- `m.cps.to` renders its Holfuy widgets client-side; a plain fetch only
  recovers the static station-name list, not station IDs or live
  rose/degree data. Holfuy station IDs already recorded in `SITES.md`
  could not be independently re-confirmed this way. They remain as
  previously set (`verified: true` where already so) pending a method
  that can read the rendered widgets (e.g. browser automation) or direct
  confirmation from a station owner/club contact.
- CPS pages state direction only as Swedish compass abbreviations (N, NO,
  O, SO, S, SV, V, NV = N, NE, E, SE, S, SW, W, NW). A CPS page confirming
  a site's compass label is **not** sufficient to mark `rose.verified:
  true` — it only corroborates the label the provisional sector was
  already derived from (§24), it does not supply exact degree boundaries.
- The index page (`/flygstallen/`) also lists an entry titled "Litta ti om
  väred" (garbled OCR/extraction of what is almost certainly "Lite till om
  väder" — "a bit more about weather"). This reads as a general article,
  not a flying site, and is not a real flying-site page. Not added to
  `SITES.md`, per the rule that a scraper never auto-creates sites.

## Block 2a — SE South/East region

| Site | Coords verified? | Sector verified? | Speed limits verified? | Live source verified? | Soaring height verified? | Unresolved notes |
|---|---|---|---|---|---|---|
| hammar | Yes — CPS page gives "N 55°24.20 E 14°00.73" (DDM), converts to 55.403333/14.012167, exact match to existing `SITES.md` value. Reconfirmed 2026-08-18. | No — SV label confirmed, exact 213.75–236.25° boundary not independently verified. | No | Holfuy 214, `verified: true` (pre-existing; could not re-confirm via m.cps.to, see method notes) | No (150 m agl unverified) | None beyond above. |
| kaseberga-s | No — CPS page states no coordinates. | No | No | Holfuy 155, `verified: true` (pre-existing; same m.cps.to caveat) | No | Coordinates unresolved; CPS page has none. Needs an alternate source (e.g. GPS on-site, OSM lookup) — out of scope for this CPS-only sub-block. |
| rokerierna | No — CPS page states no coordinates. | No | No | Holfuy 155 (proxy from Kåseberga), `verified: false` (unchanged) | No | Coordinates unresolved. CPS confirms this is a distinct advanced sub-site near Kåseberga harbor with its own seasonal livestock-pasture restriction (already captured). |
| ales-stenar-sv | No — CPS page states no coordinates. | No | No | Holfuy 214 (proxy from Hammar), `verified: false` (unchanged) | No | Coordinates unresolved. CPS confirms landowner prohibition on launching directly at the stones (already captured as a restriction). |
| ravlunda | Yes — CPS page gives "N 55°43,87 O 14°11,64" (DDM, comma decimal), converts to 55.731167/14.194000, exact match to existing `SITES.md` value. Reconfirmed 2026-08-18. | No — O(East) label confirmed, exact 78.75–101.25° boundary not independently verified. | No | Holfuy 126, `verified: true` (pre-existing; same m.cps.to caveat) | No | Military-range dependency and "Ravlunda effect" (site can be near-calm when 8–9 m/s blows elsewhere in Skåne) reconfirmed from CPS text; already captured. |
| vik | No — CPS page states no coordinates. | No — East (O) label reconfirmed; note the automated page summary mistranslated "O" as "West", which is wrong (O = Öster = East in Swedish); existing `SITES.md` sector (78.75–101.25°, east-facing) is correct and unchanged. | No | Holfuy 596, `verified: true` (pre-existing; same m.cps.to caveat) | No | CPS explicitly calls this "very advanced" (matches existing description). Coordinates unresolved. |
| vitemolla | No — CPS page states no coordinates. | No — ENE (ONO) label reconfirmed; the automated page summary mistranslated "ONO" as "Northwest", which is wrong (ONO = Öst-nordost = ENE); existing `SITES.md` sector (56.25–78.75°, ENE-facing) is correct and unchanged. | No | none configured (unchanged; not in the m.cps.to station list either) | No | **New finding, added to `SITES.md`:** CPS page states Länsstyrelsen (county board) prohibits flying here 1 April–31 July for vegetation/bird protection, effective 2024. Added as a hard `restrictions` entry. Coordinates unresolved. |

## Block 2b — Öresund/West + Bjäre regions

No coordinates were found on any of these 9 CPS pages. Direction labels,
sectors, and ridge heights all cross-checked consistent with existing
`SITES.md` values (no changes needed there). `VNV-NNV` for Barsebäck was
again mistranslated by the automated page summary (as "north-northwest to
north"); disregarded — VNV = WNW, so VNV-NNV = WNW to NNW, matching the
existing sector.

| Site | Coords verified? | Sector verified? | Speed limits verified? | Live source verified? | Soaring height verified? | Unresolved notes |
|---|---|---|---|---|---|---|
| lernacken | No — page gives no lat/lon, only a Google Maps link to "Monumentet". | No — SSO-SSV label reconfirmed only. | No — existing 6–7 m/s SSW note for the low ridge reconfirmed verbatim; still not a full verified band. | none configured (unchanged) | No | **New:** added a nature-reserve/hazard restriction (hidden debris in reed beds, electric fencing, avoid Stenören section and bird nesting areas). Coordinates unresolved. |
| brofastet | No — not stated. | No — V(West) label reconfirmed. | No | none configured (unchanged) | No | Terrain described as hazardous (sharp stones, thorny bushes) but this is already implied by the existing "advanced" description; no structured restriction added. Coordinates unresolved. |
| barseback | No — not stated. | No — VNV-NNV label reconfirmed (see mistranslation note above). | No | ViVa, `verified: false` (unchanged) | No | **New:** added CPS's explicit "at least 8 m/s" minimum-wind quote to `wind_speed.notes`. Coordinates unresolved. |
| alabodarna | No — not stated. | No — V-SV label reconfirmed. | No | Holfuy 216, `verified: true` (pre-existing; same m.cps.to caveat as 2a) | No | **New:** added a seasonal restriction — adjacent field off-limits during growing season, use beach/cliff edge. Coordinates unresolved. |
| larod | No — not stated. | No — SV label reconfirmed. | No | none configured (unchanged) | No | Built-up-area/resident-consideration note already captured; nothing new. Coordinates unresolved. |
| hoganas | No — not stated. | No — VNV label reconfirmed. | No — "hårdvindshang" (hard-wind ridge) framing already captured in existing notes; no numeric limit given. | Holfuy 128, `verified: true` (pre-existing; same m.cps.to caveat) | No | Coordinates unresolved; height also still unstated on CPS page. |
| molle | No — not stated. | No — SSV-VSV label reconfirmed. | No | Holfuy 597, `verified: true` (pre-existing; same m.cps.to caveat) | No | **New:** added a nature-reserve/drowning-risk restriction near the landing beach. Coordinates unresolved. |
| hovs-hallar-n | No — not stated. | No — N label reconfirmed. | No | Holfuy 127, `verified: false` (unchanged — CPS gives a separate "Nora" wind-meter contact number, not a station ID, so this doesn't resolve the exposure-match question already flagged) | No | Trail to launch described as hard to find; not safety-critical enough to add as a structured restriction. Coordinates unresolved. |
| hovs-hallar-nv | No — not stated. | No — NV-NNV label reconfirmed. | No | Holfuy 127, `verified: true` (pre-existing; same m.cps.to caveat) | No | **New:** added a local-rule restriction (mandatory pruning shears, launch-position and landing-field warnings). Coordinates unresolved. |

Block 2c appends further rows below when run.
