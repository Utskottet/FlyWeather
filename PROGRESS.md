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
| 3     | Wind rose SVG component                       | done        | commit eb457f4; CI green |
| 4     | Map integration                               | done        | commit e0be471; CI green |
| 5     | Forecast provider + time slider               | done        | commit e9d7b8f; CI green |
| 6     | Live wind adapters                            | done        | commit e102b33; CI green |
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

## Block 3 complete: wind rose SVG component
- Status: done
- Definition of Done: [x] all §29 unit tests pass (32 tests: 17
  geometry + 15 component)  [x] rose renders correctly at 48px, 64px,
  and expanded (160px) sizes  [x] component reviewed visually via
  Playwright screenshots for SW/S/E/N-wraparound/red/orange/gray cases
  [x] CI green
- Commit: eb457f4 "Block 3: wind rose SVG component"
- Files changed: 16 files, +1826/-3
- Deferred / unresolved: Playwright installed and used locally but not
  wired into CI yet (deferred until Block 4/5 gives it a fuller page —
  map + time slider — to test meaningfully; see docs/DECISIONS.md).
  WindRose deliberately doesn't own source/age/status-reason text (§2.4
  expanded-view fields) — that's future SiteSheet territory wrapping
  this component, not folded into it.
- Next: Block 4 — Map integration

## Block 4 complete: map integration
- Status: done
- Definition of Done: [x] build + local preview shows all located
  enabled sites correctly bounded  [x] sites without coordinates are
  absent, not crashing  [x] mobile widths 360/390/430px checked  [x] CI
  green
- Commit: e0be471 "Block 4: map integration"
- Files changed: 15 files, +496/-8
- Deferred / unresolved: only 5 of 24 enabled sites currently have
  coordinates (hammar, ravlunda, ven-n, ven-sv, ven-v) — real limitation
  carried over from Block 2, not something to fix in this block. Rose
  markers use `renderToStaticMarkup` (not React portals into divIcon);
  revisit if/when Block 5's time slider needs markers to update
  reactively without recreating the Leaflet icon. No fake wind data
  anywhere on the live map — every marker is honestly gray/unknown until
  Block 5/6 wire up real data.
- Next: Block 5 — Forecast provider + time slider

## Block 5 complete: forecast provider + time slider
- Status: done
- Definition of Done: [x] E2E: NOW->+6h->+24h updates label without map
  jump (verified via Leaflet pane transform)  [x] no API call per slider
  tick (verified via network request count)  [x] unit tests for wind
  unit and compass/degree conversions  [x] CI green
- Commit: e9d7b8f "Block 5: forecast provider + time slider"
- Files changed: 24 files, +1313/-38
- Deferred / unresolved: pulled forward a minimal direction+speed
  flyability slice (not its own block) since real forecast data now
  exists to evaluate - GREEN state is unreachable today since no site has
  verified wind_speed yet (Block 2), by design not a bug. Full flyability
  (hard rules, restrictions-override-weather) stays out of scope. End-to-
  end confirmed live against real Open-Meteo data: Hammar at +12h showed
  WSW 238°/4.9 m/s/9.0 m/s gust, correctly MAYBE (238° is in the orange
  sector, not green).
- Next: Block 6 — Live wind adapters (continuing per user request to run
  5/6/7 back to back without stopping for review)

## Block 6 complete: live wind adapters
- Status: done
- Definition of Done: [x] NOW shows live data where a source works,
  clearly labeled observation vs. forecast fallback  [x]
  docs/DATA_SOURCE_AUDIT.md records every source considered, including
  blocked ones  [x] no credential bypass  [x] CI green (confirms GitHub
  Actions runners can reach widget.holfuy.com too)
- Commit: e102b33 "Block 6: live wind adapters"
- Files changed: 20 files, +830/-26
- Deferred / unresolved: ViVa (barsebäck's source, no station ID known)
  and FindWind not implemented - documented, not silently dropped. The
  Holfuy widget's `owind` recent-sample history is parsed and tested but
  not yet wired into the rose's optional history dots (needs extending
  LiveWindProvider beyond a single current reading). Found 2 new Holfuy
  station IDs (215, 217) with no matching SITES.md entry - left as a
  note, not acted on (never auto-create sites). End-to-end confirmed
  live: Hammar showed a real 273°/8.0 m/s/13.9 m/s-gust reading,
  correctly BAD since 273° is outside its sectors.
- Next: Block 7 — Height mode (continuing per user request)
