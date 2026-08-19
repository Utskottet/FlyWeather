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

## Block 2c — Ven + Denmark regions

Three Ven sites (`ven-n`, `ven-sv`, `ven-v`) had genuine DMS coordinates on
their CPS pages — first coordinates found since `hammar`/`ravlunda` in 2a.
The page's degree symbol rendered as a mojibake "ƒ" in the fetched text
(e.g. "N 55ƒ55'40"); read as "N 55°55'40"" (degrees-minutes-seconds) and
converted to decimal degrees. `ven-sv` also gives an explicit "SV (235°)"
— a specific degree, not just a compass letter — which is stronger source
corroboration than usual, though it only supports the sector's *center*;
the ±11.25° sector width is still a modeling convention, not something
CPS states, so `rose.verified` stays `false`. Dokkedal's "O" was again
mistranslated by the automated page summary (as "Ouest/West"); disregarded
— O = Öster = East in Swedish, matching the existing east-facing sector.

| Site | Coords verified? | Sector verified? | Speed limits verified? | Live source verified? | Soaring height verified? | Unresolved notes |
|---|---|---|---|---|---|---|
| ven-n | **Yes — new.** CPS: "N 55°55'40" O 12°41'25"" → 55.927778/12.690278. | No — wind field on the page is itself blank ("Vind: 15m", no direction); N label corroborated only by page description text ("Ven's north shore"), not a direction field. | No | none configured | No | Height 15 m matches existing `ridge_height_m`. |
| ven-so | No — page states no coordinates. | No — "SO–O" (SE to E) label reconfirmed, matches existing 90–135° sector. | No | none configured | No | Coordinates unresolved. |
| ven-sv | **Yes — new.** CPS: "N 55°54'10" O 12°41'40"" → 55.902778/12.694444. | No — explicit "SV (235°)" reconfirmed verbatim (stronger than a compass-letter source, but only pins the center; sector width still unverified). | No | none configured | No | Ridge height 30–35 m on CPS; existing `ridge_height_m: 35` is within range, left unchanged. CPS notes there's no good takeoff spot — very experienced pilots only. |
| ven-v | **Yes — new.** CPS: "N 55°55'00" O 12°40'15"" → 55.916667/12.670833. | No — West label reconfirmed, matches existing 258.75–281.25° sector. | No | none configured | No | Height 15 m matches existing `ridge_height_m`. |
| dk-gilbjerg-hoved | No — not stated. | No — NNV label reconfirmed. | No | none configured | No | "Offentligt tillträde" (public access) noted, not a restriction. Coordinates unresolved. |
| dk-strandbjerggard | No — not stated. | No — NV label reconfirmed. | No | none configured | No | Coordinates unresolved. |
| dk-lokken | No — not stated. | No — VNV (V-NV) label reconfirmed. | No | none configured | No | **New:** added a rotor/top-landing hazard restriction (Rubjerg Knude 90 m cliff). Height 15–25 m on CPS; existing `ridge_height_m: 25` is at the top of that range, left unchanged. Coordinates unresolved. |
| dk-dokkedal | No — not stated. | No — O(East) label reconfirmed (see mistranslation note above). | No | none configured | No | **New:** added a seasonal closure restriction for the practice slope (May–Sept) and a livestock-fencing note. Coordinates unresolved. |

## Coverage summary (Block 2 complete)

All 24 enabled sites now have an audit row across 2a/2b/2c. Coordinates
resolved for 6 of 24 (hammar, ravlunda — reconfirmed pre-existing; ven-n,
ven-sv, ven-v — newly found this block). The remaining 18 have no
coordinates on their CPS pages and stay unresolved rather than guessed —
a non-CPS source (on-site GPS, OSM lookup, or a club/pilot contact) is
needed to close them, which is out of scope for the CPS-only sources this
block was limited to. No site's `rose.verified` or `wind_speed.verified`
was flipped to `true` from CPS prose anywhere in Block 2, per §24 — every
sector/speed corroboration found only confirms the compass-label or
minimum-speed-quote the existing provisional data was already seeded
from, not exact verified boundaries.

## Block 13 — Non-CPS coordinate resolution (OpenStreetMap Nominatim)

Block 2 deliberately stayed CPS-only and left 19 sites unresolved. This
block revisits that limitation using OpenStreetMap's Nominatim geocoder
(free, keyless, rate-limited to 1 request/second with a required
descriptive User-Agent - both respected). Every result below was sanity-
checked against known regional geography before being accepted (e.g.
correct kommun/municipality, correct coast, correct country) - none were
accepted purely on the geocoder's word.

**All 19 coordinates below are village/landmark-level approximations,
not exact launch-point coordinates**, and are marked `coordinates.
verified: false` accordingly, per §24's provisional-data rule extended
to this new source type. Each `SITES.md` entry's `coordinates.source`
field states exactly what was searched and how confident the match is.

| Site | Query | Result | Confidence |
|---|---|---|---|
| kaseberga-s | "Kåseberga, Sweden" | Direct hamlet match | Village-level |
| rokerierna | "Kåseberga, Sweden" | Same as above (reused) | Village-level, and this site is a distinct sub-location near the harbor, not the village center |
| ales-stenar-sv | "Ales stenar, Sweden" | Direct landmark match (the monument itself) | Landmark-level - the closest match in this batch |
| vik | "Vik, Simrishamns kommun, Sweden" | Direct village match, kommun-disambiguated | Village-level |
| vitemolla | "Vitemölla, Sweden" | Direct village match | Village-level |
| lernacken | "Lernacken, Malmö, Sweden" | Matched a "Lernacken" railway/site POI near the Öresund bridge's Swedish landfall | Moderate - name matches exactly but the POI type is unusual |
| brofastet | "Brofästet, Malmö, Sweden" then fallback "Klagshamn, Malmö, Sweden" | No direct result; used the nearest named locality near the bridge's Swedish side | Coarse fallback |
| barseback | "Barsebäck, Sweden" | Direct village match (Kävlinge kommun; a same-named Stockholm result was rejected) | Village-level |
| alabodarna | "Ålabodarna, Glumslöv, Sweden" | Matched a kiosk directly at Ålabodstranden beach | Beach-level - closer than most in this batch |
| larod | "Laröd, Helsingborg, Sweden" (dropped "-baden" suffix after no result) | Direct village match | Village-level |
| hoganas | "Höganäs Strandbaden, Sweden" then fallback "Höganäs, Sweden" | No direct result; used the town center | Coarse fallback - actual site is a specific beach, not the town center |
| molle | "Mölle, Sweden" | Direct village match (a same-named Umeå result was rejected) | Village-level |
| hovs-hallar-n / hovs-hallar-nv | "Hovs Hallar, Sweden" | Matched POIs at the nature reserve | Shared between both sites - does not distinguish the two separate launch points |
| ven-so | "Ven, Landskrona, Sweden" | Matched the island generally | Island-level - coarser than ven-n/sv/v's CPS-sourced side-specific coordinates |
| dk-gilbjerg-hoved | "Gilbjerg Hoved, Gilleleje, Denmark" then fallback "Gilleleje, Denmark" | No direct result; used the nearby town (site is stated as between Gilleleje and Smidstrup) | Coarse fallback |
| dk-strandbjerggard | "Rågeleje, Denmark" | Direct village match | Village-level |
| dk-lokken | "Løkken, Denmark" | Direct match, disambiguated from a same-named Syddjurs Kommune hamlet | Village-level |
| dk-dokkedal | "Dokkedal, Denmark" | Direct village match | Village-level |

**Result: 24 of 24 enabled sites now have a coordinate** (up from 5).
None were flipped to `verified: true` - that still requires a
pilot-confirmed or CPS-stated coordinate, which this geocoding pass does
not provide.

## Block 15: winch site research (kept disabled, honest reasons found)

`winch-brandstad` and `winch-urasa` were investigated per Block 15's
scope (activate the Soaring/Winch site-mode toggle) via their dedicated
CPS pages, not the shared `/flygstallen/` index used above.

- **winch-brandstad**: the CPS page itself states, repeated multiple
  times, "DETTA FÄLT ANVÄNDS FÖR NÄRVARANDE INTE" (this field is
  currently not in use). Kept `enabled: false` because the source
  reports the field inactive, not because of a data gap - enabling an
  inactive field would be worse than leaving it off. No coordinates
  published either way. Directions: Väg 13 from Hörby, turn at the
  "Krokhuset" road sign near Brandstad; usable wind directions E/W and
  N/S; ~90m elevation. Contacts: Johan Svärd or Trisse.
- **winch-urasa**: appears to be an active field (2.5km N-S runway,
  400-600m release altitude) but the CPS page publishes no coordinates
  at all - only driving directions (väg 30, between Ingelstad and
  Väckelsång, locked gate) and a phone contact (Anders Bergqvist,
  070-55 415 71) for exact location. Geocoding "Ingelstad" or
  "Väckelsång" via Nominatim would land on a town/village center several
  km from the actual field behind its gate - given the imprecision, that
  would be a materially worse (and misleading) pin than for this
  project's other Nominatim-geocoded sites, most of which match a named
  feature at the actual site rather than a distant town center. Left
  unresolved rather than publish a pin likely to send a pilot to the
  wrong place; a direct GPS reading or club-supplied coordinate is
  needed.

**Net effect**: the Soaring/Winch toggle (Block 15) is built and
functional, but the Winch site set is currently empty - both candidate
sites have a real, documented reason to stay off the map rather than a
fabricated location.
