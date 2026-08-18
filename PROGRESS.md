# PROGRESS.md — Block status

Read `BLOCKS.md` for what each block means. Update this file at the end of
every block (see `AGENTS.md` → "Block discipline") and commit it alongside
the block's work.

| Block | Description                                  | Status      | Notes |
|-------|-----------------------------------------------|-------------|-------|
| 1     | Repo scaffold + SITES.md schema/parser        | done        | commit e337274; CI green |
| 2a    | CPS data: index + m.cps.to + SE South/East    | done        | commit 31e65fb; CI green |
| 2b    | CPS data: Öresund/West + Bjäre                | done        | commit 70b5355; CI green |
| 2c    | CPS data: Ven + Denmark                       | done        | commit 533dc43; CI green; Block 2 complete |
| 3     | Wind rose SVG component                       | not_started |       |
| 4     | Map integration                               | not_started |       |
| 5     | Forecast provider + time slider               | not_started |       |
| 6     | Live wind adapters                            | not_started |       |
| 7     | Height mode                                   | not_started |       |
| 8     | Autonomous deployment (Actions + Pages)       | not_started |       |
| 9     | Polish                                        | not_started |       |

Status values: `not_started`, `in_progress`, `blocked`, `done`.

## Log

- 2026-08-18: `BLOCKS.md` created, splitting `MASTER_SPEC.md` milestones
  into checkpointed blocks. Block 2 pre-split into 2a/2b/2c by region
  (24 enabled sites was too many CPS fetches for one confident session).
  Added a standard end-of-block chat report format to `AGENTS.md`. No
  implementation work started yet.

## Block 1 complete: repo scaffold + SITES.md schema/parser
- Status: done
- Definition of Done: [x] npm run build passes  [x] npm test passes
  (14/14)  [x] npm run validate:sites passes (29 sites, 24 enabled)
  [x] CI green on GitHub
- Commit: e337274 "Block 1: repo scaffold, SITES.md schema/parser, CI"
- Files changed: 16 files, +4876
- Deferred / unresolved: map library choice (MapLibre vs Leaflet) not
  decided yet — deferred to Block 4 per docs/DECISIONS.md. No Playwright
  yet (not needed until a block has UI to test).
- Next: Block 2a — CPS index + m.cps.to + SE South/East region sites

## Block 2a complete: CPS data, index + m.cps.to + SE South/East
- Status: done
- Definition of Done: [x] all 7 sites have coordinate or documented
  unresolved reason  [x] npm run validate:sites passes  [x]
  docs/SITE_DATA_AUDIT.md covers all 7  [x] CI green
- Commit: 31e65fb "Block 2a: CPS site data check - index, m.cps.to, SE
  South/East"
- Files changed: 2 files, +48 (SITES.md, docs/SITE_DATA_AUDIT.md)
- Deferred / unresolved: 5 of 7 sites (kaseberga-s, rokerierna,
  ales-stenar-sv, vik, vitemolla) still have no coordinates — CPS pages
  don't list any; needs a non-CPS source later. Holfuy station IDs
  could not be re-verified against m.cps.to (JS-rendered widgets, plain
  fetch only sees the static station-name list).
- Next: Block 2b — Öresund/West + Bjäre region sites

## Block 2b complete: CPS data, Öresund/West + Bjäre
- Status: done
- Definition of Done: [x] all 9 sites have coordinate or documented
  unresolved reason  [x] npm run validate:sites passes  [x]
  docs/SITE_DATA_AUDIT.md covers all 9  [x] CI green
- Commit: 70b5355 "Block 2b: CPS site data check - Oresund/West + Bjare"
- Files changed: 2 files, +43/-1 (SITES.md, docs/SITE_DATA_AUDIT.md)
- Deferred / unresolved: none of these 9 sites have coordinates on CPS
  pages — all still unresolved, same as 2a's 5. Added 4 new
  restrictions/notes sourced directly from CPS text (Lernacken nature
  reserve hazards, Barsebäck's 8 m/s minimum, Ålabodarna seasonal field
  access, Mölle nature-reserve/drowning risk, Hovs Hallar NV local
  rules).
- Next: Block 2c — Ven + Denmark region sites

## Block 2c complete: CPS data, Ven + Denmark (Block 2 finished)
- Status: done
- Definition of Done: [x] all 8 sites have coordinate or documented
  unresolved reason  [x] npm run validate:sites passes  [x]
  docs/SITE_DATA_AUDIT.md covers all 8 (and all 24 enabled sites overall)
  [x] CI green
- Commit: 533dc43 "Block 2c: CPS site data check - Ven + Denmark (Block 2
  complete)"
- Files changed: 2 files, +61/-11 (SITES.md, docs/SITE_DATA_AUDIT.md)
- Deferred / unresolved: Block 2 overall closes with 6/24 enabled sites
  coordinate-verified (hammar, ravlunda, ven-n, ven-sv, ven-v — the last
  3 newly found this sub-block via DMS coordinates on their CPS pages —
  plus none others). 18/24 sites still have no coordinates anywhere on
  CPS and need a non-CPS source (on-site GPS, OSM, club contact) before
  Block 4's map can place them. Holfuy station IDs still unverified
  against m.cps.to (JS-rendered, out of reach of plain fetch).
- Next: Block 3 — Wind rose SVG component
