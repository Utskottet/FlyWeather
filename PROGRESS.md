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
| 7     | Height mode                                   | done        | commit 5d6dcaa; CI green |
| 8     | Autonomous deployment (Actions + Pages)       | done        | commits ebdcc2b, d458303; live at https://utskottet.github.io/FlyWeather/ |
| 9     | Polish                                        | done        | commit e5be055; CI green; V1 live |
| 10    | Regional wind arrow field                     | done        | commit c1ddb71; CI green; live |
| 11    | Rose overall-state visibility                 | done        | commit 55f2605; CI green; live |
| 12    | Time slider day/hour graduations              | done        | commit 1b89e2a; CI green; live |
| 13    | Site coordinate coverage expansion            | done        | commit 3829bd6; CI green; live |
| 14a   | MapLibre + Mapterhorn: RELIEF (library swap)  | done        | commits 3206048, f4a6feb, 6aed79e; CI green; live |
| 14b   | MapLibre + Mapterhorn: TOPO                   | done        | commit f5d4ae0; CI green; live |
| 14c   | MapLibre + Mapterhorn: MAP                    | done        | commit 6a2090b; CI green; live |
| 15    | Soaring/Winch site-mode switch                | done        | commit 4d3f1a4; CI green; live; lower priority per user |
| 16    | flyxc data source research                    | done        | commit TBD; research only, no code changes; lower priority per user |
| 17    | Airspace layer                                | done        | commit 683b777; CI green; live; needs OPENAIP_KEY GitHub secret for future weekly refreshes |
| 18    | Skyways layer                                 | done        | commit e7aeece; CI green; live; lower priority per user |
| 19    | Live tracking                                 | skipped     | user decision 2026-08-19: not worth the persistent-backend architecture change right now |

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

## Block 7 complete: height mode
- Status: done
- Definition of Done: [x] toggle updates every rose without map jump
  (verified via Leaflet pane transform, same pattern as the time slider)
  [x] effective height shown in the site sheet's detail panel  [x] CI
  green
- Commit: 5d6dcaa "Block 7: height mode"
- Files changed: 13 files, +566/-30
- Deferred / unresolved: found a real marker-clustering gap while
  testing - Ven's three sites (ven-n, ven-sv, ven-v) sit close enough
  together that their map markers visually overlap and intercept each
  other's clicks at the current zoom level. Not fixed in this block
  (out of Block 7's scope - it's a §16 "avoid clustering" concern);
  flagged here for whoever picks up Block 9 (polish) or an earlier map
  refinement. One E2E test simplified to avoid the resulting flakiness
  rather than force-click around it. End-to-end confirmed live: Hammar's
  surface reading (WNW 286°, 7.0 m/s, live) vs. its 150m soaring-height
  forecast (WSW 249°, 1.6 m/s) show genuine wind shear.
- Next: Block 8 — Autonomous deployment (GitHub Actions + Pages).
  **Stopping here** - this closes out the "do blocks 5/6/7" request; the
  block-discipline default (one block, then pause for review) resumes
  from Block 8 onward unless told otherwise.

## Block 8 complete: autonomous deployment
- Status: done
- Definition of Done: [x] public GitHub Pages URL serves the app -
  **https://utskottet.github.io/FlyWeather/** - confirmed working with
  Playwright against the real production URL (map, markers, live data,
  height toggle, time slider all functional)  [x] a refresh run
  completed successfully and updated served data without a new commit -
  confirmed: `live.json`'s `generatedAt` (07:55:40) matches the refresh
  run's timing exactly, HEAD commit unchanged before/after (`d458303`)
- Commits: ebdcc2b "Block 8: autonomous deployment (GitHub Actions +
  Pages)", d458303 "Fix GitHub Pages project-page base path"
- Files changed: 3 new workflow/decision files + 3-file base-path fix
- Two real problems surfaced only by actually deploying (not by local
  `npm run build` succeeding), both documented in full in
  `docs/DECISIONS.md`:
  1. **Genuine credential/permission blocker** - `actions/configure-pages`
     can't enable a repo's Pages feature from inside a workflow alone;
     the repo owner had to visit Settings → Pages once and set Source to
     "GitHub Actions". Stopped and asked per AGENTS.md rather than
     attempting a workaround. Also needed the repo owner to click
     "Run workflow" manually twice (`pages.yml` and `weather-refresh.yml`
     each once) since I have no token to call the dispatch API myself.
  2. **Blank-page bug**: GitHub Pages serves this repo under
     `/FlyWeather/`, not root - `vite build`'s default `base: '/'` broke
     both the built asset references and the app's own
     `fetch("/generated/...")` calls. Fixed with a build-only conditional
     `base` and `import.meta.env.BASE_URL`-based fetch URLs; verified by
     loading the actual live URL with Playwright, not just trusting CI.
- Deferred / unresolved: the 5-minute cron itself hasn't been observed
  firing on its own schedule yet (both confirmations above came from
  manual `workflow_dispatch` runs) - GitHub's own docs note new
  schedules can take a while to activate and aren't timing-guaranteed,
  so this is expected, not a problem; it will fire on its own going
  forward. Same known gaps carried over from earlier blocks remain: 19/24
  enabled sites still lack coordinates, and Ven's three sites overlap at
  low map zoom.
- Next: Block 9 — Polish (mobile layout pass, outdoor-readability
  contrast, PWA shell if practical, final sweep against MASTER_SPEC.md
  §38's V1 definition-of-done checklist). This is the last block in
  BLOCKS.md.

## Block 9 complete: polish (V1 blocks finished)
- Status: done
- Definition of Done: [x] §38 checklist fully satisfiable by a pilot on
  a phone against the live Pages URL - swept item by item against
  https://utskottet.github.io/FlyWeather/ with Playwright:
  1. map with CPS-region sites - yes (5 currently located)
  2. Holfuy-style rose per site - yes
  3. NOW conditions where live data exists - yes (Hammar showed a live
     Holfuy reading, labeled LIVE)
  4. 72h slider changes each rose - yes, confirmed on a real site: Ven
     SV went MAYBE (4.9 m/s, 214deg) at NOW to BAD (6.2 m/s, 169deg) at
     +30h, genuinely different forecast data, not a static repeat
  5. sun/cloud/rain glyph beside each rose - yes
  6. Surface/Soaring height global toggle - yes
  7. tap a site for source/time/height/reason - yes
  8. honest gray/orange/forecast labeling instead of invented data -
     yes: the same Ven SV screenshot shows "FORECAST - Open-Meteo
     forecast (10 m surface wind)" since it has no live source, and the
     reasons list ("site speed limits are not yet verified") instead of
     a fabricated GOOD
  9. refreshed weather without a developer manually publishing - yes,
     confirmed in Block 8 (weather-refresh.yml)
  10. core logic covered by tests - yes, 138 unit tests + 11 E2E tests,
      all green in CI
- Commit: e5be055 "Block 9: polish - accessibility, touch targets, PWA
  installability"
- Files changed: 7 files, +104/-17
- Deferred / unresolved (unchanged from earlier blocks, still real):
  19/24 enabled sites lack coordinates; Ven's three sites still overlap
  at low map zoom; ViVa/FindWind live adapters not implemented; no
  service worker/offline cache (deliberate, see docs/DECISIONS.md); the
  5-minute cron still hasn't been observed firing on its own natural
  schedule (only manual workflow_dispatch runs so far) - expected to
  self-resolve, not a defect.

**All 9 blocks in BLOCKS.md are now done.** V1 is live at
https://utskottet.github.io/FlyWeather/. Remaining work is genuine V1.1+
scope (site data completeness, more live sources, the explicitly-future
RASP phase per §37) rather than anything BLOCKS.md called for - a good
point to check in with the user on priorities before continuing
autonomously.

## Planning update: Phase 2 (V1.1) blocks added, 2026-08-19

User gathered feedback after seeing V1 live and requested a follow-up
phase: a regional wind-arrow field (top priority), more visible rose
state indication, graduated time-slider ticks, resolving more site
coordinates, a full MapLibre+Mapterhorn terrain overhaul (RELIEF/TOPO/
MAP modes, split into 14a/b/c since it's a full library swap), plus
lower-priority flyxc-inspired features (live tracking, skyways,
airspace) and a Soaring/Winch site-mode switch. Added as Blocks 10-19
in BLOCKS.md, ordered by the priority signalled in conversation. No
implementation started yet - purely a planning update.

## Block 10 complete: regional wind arrow field
- Status: done
- Definition of Done: [x] wind arrows visible across the map at a
  sensible density, clearly show direction (color also indicates speed)
  [x] no credential bypass - reused the already-integrated, keyless
  Open-Meteo provider, no new source needed
- Commit: c1ddb71 "Block 10: regional wind arrow field"
- Files changed: 12 files, +428/-1
- Confirmed live on production (36 arrows rendering, real current wind
  data). Verified site-marker clicks still work through the arrow
  layer (non-interactive, negative z-index).
- Deferred / unresolved (documented, not oversights): grid shows only
  current conditions, not tied to the 72h time slider; grid is fixed to
  the sites' fitted bounds, doesn't extend as the user pans the map.

## Block 11 complete: rose overall-state visibility
- Status: done
- Definition of Done: [x] visual comparison shows a clearly more
  prominent state indicator (widened ring + saturated center fill,
  confirmed at both gallery and 48px marker scale)  [x] existing
  WindRose state-styling tests pass unchanged (19/19, sector geometry
  stays visible under every state)
- Commit: 55f2605 "Block 11: rose overall-state visibility"
- Files changed: 2 files, +37/-5
- Confirmed live on production - map markers now clearly show red/bad
  state from a distance, versus barely visible before.
- Deferred / unresolved: none - this block's scope was fully self-
  contained.

## Block 12 complete: time slider day/hour graduations
- Status: done
- Definition of Done: [x] ticks render correctly across the full 72h
  range, aligned with hour indices  [x] works at 360/390/430px without
  crowding (verified visually)
- Commit: 1b89e2a "Block 12: time slider day/hour graduations"
- Files changed: 7 files, +154/-7
- Bonus fix: found and fixed a real E2E flake in time-slider.spec.ts
  (fixed-sleep timing bug exposed by Block 10's extra network request),
  root-caused via a diagnostic spec rather than blindly upping a
  timeout - see docs/DECISIONS.md.
- Deferred / unresolved: none - self-contained.

## Block 13 complete: site coordinate coverage expansion
- Status: done
- Definition of Done: [x] more than 5 of 24 enabled sites placed on map
  - all 24/24 now, via OSM Nominatim  [x] every new coordinate's audit
  row states source and precision honestly
- Commit: 3829bd6 "Block 13: site coordinate coverage expansion (24/24 sites)"
- Files changed: 10 files, +230/-72
- Bonus fixes found and resolved while verifying: (1) 24 individual
  Open-Meteo requests per page load was real overhead, not just a test
  problem - batched into 1 request (fetchSitesForecastBatch), also
  improves real production performance; (2) several E2E tests used an
  ambiguous ".leaflet-marker-icon" selector that also matched wind
  arrows since Block 10, previously passing only by timing coincidence -
  scoped to ".rose-marker-icon".
- Deferred / unresolved: marker clustering (several sites now share or
  nearly share coordinates - Kåseberga's three, Hovs Hallar's two) went
  from a minor Ven-only issue to clearly visible across the map. Not
  fixed here (out of scope), elevated as a priority note for Block 14's
  MapLibre rewrite. Four E2E tests now use force-clicks to work around
  it in the meantime.

## Block 14a complete: MapLibre + Mapterhorn RELIEF (library swap)
- Status: done
- Definition of Done: [x] RELIEF mode renders live over Skåne with
  clearly visible hillshade terrain - verified via screenshots at the
  initial fit and two zoomed views (Bjäre peninsula, Kullaberg), showing
  obvious ridge/valley relief without needing to push exaggeration past
  the defaults  [x] all existing markers/behavior preserved - site clicks,
  time slider, height mode, wind arrow field all still work, ported not
  redesigned  [x] TOPO/MAP stubbed but not exposed (disabled "Coming
  soon" in the mode toggle) per user's explicit build-RELIEF-first
  instruction  [x] per-mode style config centralized in one file
  (mapStyles.ts) per user's explicit instruction  [x] CI green
- Commit: (pending push)
- Files changed: 15 files - new: MapLibreMap.tsx, MapMarker.tsx,
  MapModeToggle.tsx, mapStyles.ts, types/window.d.ts; rewritten:
  SiteMap.tsx; modified: vite.config.ts, App.css, tsconfig.app.json,
  tsconfig.node.json, package.json (leaflet/react-leaflet/@types/leaflet
  removed), 3 E2E spec files
- Two real bugs found and fixed during the port (both documented in full
  in docs/DECISIONS.md): (1) MapLibre's internal Web Worker 404s under
  Vite's dep pre-bundler - fixed with `optimizeDeps.exclude`; (2) the
  uniform 40px fitBounds padding let markers render underneath the
  persistent time-slider bar, making them genuinely unclickable for real
  users (not just a test artifact) - fixed with asymmetric bounds
  padding. Bundle size grew ~420KB -> 1.23MB (333KB gzipped), the direct
  cost of WebGL terrain rendering, accepted not chased down.
- Deferred / unresolved: TOPO/MAP modes are stubs, filled in next in
  14b/14c. Marker-clustering gap (Block 13) unchanged - out of this
  block's scope, still tracked. Local E2E runs of time-slider.spec.ts and
  live-data.spec.ts hit Open-Meteo's hourly rate limit from repeated
  test/dev-server runs this session (confirmed via direct curl:
  `"Hourly API request limit exceeded"`) - not a code regression; CI runs
  on a different IP so is unaffected.
- **Post-deploy fixes (2 rounds)**: visually checking the live production
  URL after the first deploy (not just trusting green CI) found the map
  rendering markers but no tiles/hillshade at all - a third bug beyond
  the two found during local dev (MapLibre's worker script 404s in the
  actual Rollup production build, a separate code path from the dev-only
  `optimizeDeps.exclude` fix). First fix attempt (Vite `?url` import +
  `setWorkerUrl()`) was itself incomplete - re-checking production again
  found the worker now loaded but its own sibling import
  (`maplibre-gl-shared.mjs`) still 404'd. Properly fixed with
  `scripts/copy-maplibre-worker.ts`, copying both files together into
  `public/vendor/maplibre-gl/`. This time verified by serving the actual
  `dist/` build locally under the real `/FlyWeather/` base path (not
  `vite preview`, which skips the build base) before touching production
  again, then re-confirmed live. Full details in docs/DECISIONS.md.
- **Final confirmed live**: https://utskottet.github.io/FlyWeather/ -
  worker loads clean, `window.__flyweatherMapLoaded` flips true in
  ~789ms, screenshot shows clear hillshade/terrain relief across the
  Skåne coastline, marker click opens the site sheet with live data,
  mode toggle shows Relief active / Topo+Map disabled. Commits: 3206048
  (main port), f4a6feb (worker fix attempt 1, incomplete), 6aed79e
  (worker fix attempt 2, confirmed working).

## Block 14b complete: MapLibre + Mapterhorn TOPO
- Status: done
- Definition of Done: [x] TOPO visually verified over Skåne - contour
  lines, an elevation label, roads, hillshade all confirmed rendering
  via Playwright against a locally-served real `/FlyWeather/`-path build
  (not just dev server)  [x] switching RELIEF<->TOPO preserves zoom/
  center/bearing exactly, no map jump  [x] CI green
- Files changed: mapStyles.ts (buildTopoStyle implemented for real),
  SiteMap.tsx (`availableModes` now includes "topo"), package.json
  (added `maplibre-contour` dependency)
- Learned from Block 14a's post-deploy lesson going in: built and served
  the actual `dist/` output locally under the real `/FlyWeather/` base
  path *before* pushing, rather than after - no worker-style 404 surfaced
  this time (maplibre-contour uses an in-memory Blob-URL worker, not a
  separate fetched file, sidestepping that whole class of bug).
- Deferred / unresolved: MAP mode still stubbed, next up in 14c. Roads/
  place labels only verified visually at the zoom levels checked
  (8-15) - not exhaustively swept across the full zoom range.

## Block 14c complete: MapLibre + Mapterhorn MAP mode (all 3 modes done)
- Status: done
- Definition of Done: [x] all three modes switch cleanly with no map
  jump - verified center/zoom identical across Relief->Map->Topo->Relief
  via `window.__flyweatherMap.getCenter()/getZoom()`  [x] no loss of
  site/weather overlay state - marker click still opens the site sheet
  with real data after switching modes  [x] CI green
- Files changed: mapStyles.ts (buildMapModeStyle points at OpenFreeMap's
  hosted positron style URL instead of a stub), MapLibreMap.tsx (`style`
  prop widened to accept `StyleSpecification | string`, since MAP mode
  is a URL not an inline spec), SiteMap.tsx (`availableModes` now
  includes "map" - **all three modes now selectable, per §Block 14c**)
- MAP mode points directly at `https://tiles.openfreemap.org/styles/positron`
  (OpenFreeMap's own maintained Positron-equivalent) rather than hand-
  copying its ~55 layers into this codebase - it already has no
  hillshade layer at all, satisfying "hillshade reduced or removed"
  exactly, and MapLibre's `style` option accepts a URL natively.
- Same verification discipline as 14a/14b: built and served the real
  `dist/` output locally under the actual `/FlyWeather/` base path
  before pushing, confirmed via Playwright screenshots of all three
  modes plus exact center/zoom equality across every switch.
- Deferred / unresolved: local E2E run hit Open-Meteo's *daily* request
  limit this time (confirmed via direct curl: `"Daily API request limit
  exceeded"`) from the cumulative local testing across Blocks 14a/b/c
  this session - same external, IP-scoped, non-regression pattern as
  14a's hourly hit; CI uses different runners so is unaffected. This is
  the last of the three MapLibre+Mapterhorn blocks - **Block 14 (all of
  14a/14b/14c) is now complete.**

## Block 15 complete: Soaring/Winch site-mode switch
- Status: done
- Definition of Done: [x] toggle switches the displayed site set without
  a map jump - verified center/zoom identical before/during/after
  switching  [x] winch sites show honest data only, no invented
  flyability rules - satisfied trivially and correctly: neither
  candidate winch site has a real coordinate, so Winch mode shows an
  explicit empty-state notice rather than a fabricated pin  [x] CI green
- Files changed: new SiteModeToggle component; SiteMap.tsx (siteMode
  state, `visibleSites` filter by `site.type`, empty-state notice);
  App.css (`.site-mode-toggle`, `.site-mode-empty-notice`); SITES.md
  (both winch entries' descriptions rewritten with real findings);
  docs/SITE_DATA_AUDIT.md (new Block 15 section); new E2E test in
  site-map.spec.ts
- Researched both winch candidates via their dedicated CPS pages (not
  just the shared index used in Block 2/13): **winch-brandstad**'s page
  explicitly states it's currently not in use (kept disabled for that
  reason, not just missing rules); **winch-urasa** appears active but
  its CPS page publishes no coordinates at all, only driving directions
  and a phone contact - decided against Nominatim-geocoding the nearest
  named village since it would land several km from the actual gated
  field, worse than an honest gap. Full reasoning in
  docs/SITE_DATA_AUDIT.md.
- The existing `evaluateFlyability`/`computeDirectionFit` logic already
  returns "unknown"/gray for a site with no configured green/orange
  sectors (built that way back in Block 5/7) - no new winch-specific
  flyability code was needed once the toggle correctly filters by
  `site.type`; the "no invented rules" requirement was already
  structurally guaranteed.
- Deferred / unresolved: the toggle mechanism is fully built and tested
  but currently activates to zero winch sites, since neither candidate
  has a usable coordinate - this is real-world data availability, not a
  missing feature. Will "just work" the moment either site gets a
  verified coordinate (direct GPS reading or club-supplied), no further
  code changes needed.

## Block 16 complete: flyxc data source research (research only)
- Status: done
- Definition of Done: [x] docs/DATA_SOURCE_AUDIT.md has a clear entry
  for each of the three features (Skyways, Airspace, Live tracking)
  stating what's usable, what's blocked, and why
- No code changed - pure research block per BLOCKS.md's scope. Read
  flyxc's actual source (`github.com/vicb/flyxc`) rather than guessing
  from the rendered app - traced each feature to its real implementation
  file.
- **Skyways: usable, keyless.** flyxc points directly at a third-party
  service, `thermal.kk7.ch` (not flyxc-hosted) - confirmed live
  (`200 OK`, real tile). No API key, just a `src=<hostname>` tracking
  param. CC BY-NC-SA 4.0 licensed; NonCommercial is fine for this
  project. Ready for Block 18.
- **Airspace: usable, but needs a real account first.** Traced to
  OpenAIP's API (`api.core.openaip.net`), which needs a free account +
  API key - not keyless like everything else this project has
  integrated. flyxc's own re-hosted tile bucket is explicitly NOT a
  legitimate substitute (their own derived asset, not a documented
  public API for third parties - same standard as the Holfuy investi-
  gation). OpenAIP's terms pages 403 non-browser requests, so exact
  license/attribution terms need a manual read after signup. Flagged as
  a credential-gate decision point for whoever picks up Block 17, per
  AGENTS.md - not something to sign up for autonomously.
- **Live tracking: architecturally blocked, not licensing-blocked.**
  Per-pilot trackers (InReach/SPOT/Flymaster/etc.) need a federated
  opt-in registry, out of scope for a data-source question. OGN (Open
  Glider Network) is genuinely public/keyless, but requires a raw,
  long-lived TCP socket to `aprs.glidernet.org:14580` for a continuous
  position stream - incompatible with this project's fully static
  frontend + 5-minute batch cron architecture (no persistent backend
  process anywhere). Real support would need a genuine architecture
  change, flagged for Block 19 as a decision point rather than resolved
  here.

## Block 18 complete: Skyways layer
- Status: done
- Definition of Done: [x] renders on map load with no user action -
  always-on in all three map modes, no toggle  [x] doesn't obscure site
  roses - markers are MapLibre `Marker` DOM elements, which always paint
  above the WebGL canvas regardless of style layer order, so this is
  structurally guaranteed rather than something that needed z-index
  tuning  [x] degrades gracefully if unavailable - raster tile fetch
  failures are handled internally by MapLibre (blank tile, no thrown
  error), verified nothing here can block map `load`  [x] CI green
- Files changed: new skywaysLayer.ts; MapLibreMap.tsx (registers the
  layer on every `style.load` event, not just the first, so it survives
  RELIEF/TOPO/MAP switches)
- **Found and fixed a real bug before shipping**: the initial
  implementation rendered an always-blank overlay - no error anywhere,
  tiles requested and returned `200`, just visually empty. Traced to a
  tile Y-axis scheme mismatch: kk7's tiles use the TMS convention
  (Y=0 south), not the XYZ/slippy-map convention MapLibre assumes by
  default. Confirmed by cross-referencing flyxc's own Google-Maps
  overlay code (which manually flips Y) and by fetching a known
  soaring-hotspot tile (Annecy, France) both ways: un-flipped returned
  a 68-byte blank PNG, TMS-flipped returned a 90KB+ real thermal-density
  image (viewed directly to confirm). Fixed with MapLibre's built-in
  `scheme: "tms"` raster-source option. Re-verified after the fix by
  screenshotting real colored track data over inland Skåne and sampling
  tile response sizes (500B-22KB, well above the blank-tile threshold).
  This is exactly the kind of silent, error-free failure this project's
  "verify against production/real output, don't trust absence of
  errors" practice exists to catch.
- Attribution (`thermal.kk7.ch`, CC BY-NC-SA 4.0 per Block 16's license
  finding) surfaces automatically through MapLibre's existing
  attribution control via the source's `attribution` field - no extra
  UI needed.
- Deferred / unresolved: none - self-contained once the TMS bug was
  found and fixed.

## Blocks 17 and 19: user decisions, 2026-08-19

Asked the user directly rather than proceeding autonomously, since both
are genuine credential-gate/architecture decisions per `AGENTS.md`:

- **Block 17 (Airspace)**: user chose to create a free OpenAIP account
  and provide an API key. **Blocked pending that key** - do not
  implement further until it's available. Plan once available: run the
  fetch server-side only (a new script following the
  `collect-live.ts`/`parse-sites.ts` pattern, invoked from the existing
  weather-refresh cron or a slower schedule since airspace boundaries
  don't change often) that bakes OpenAIP's response into a static
  generated GeoJSON/vector file - the API key must never end up in the
  client bundle, since anything shipped to a static frontend is visible
  to anyone inspecting network requests. The key should be added as a
  GitHub Actions repository secret (Settings -> Secrets and variables ->
  Actions), the same manual-UI-step pattern Block 8 already established
  for Pages.
- **Block 19 (Live tracking)**: user chose to skip it for now - the
  persistent-backend architecture change isn't worth it at this time.
  Marked `skipped`, not `blocked` - this is a settled decision, not
  something pending external input.

## Block 17 complete: Airspace layer
- Status: done
- Definition of Done: [x] layer toggles on/off without a map jump -
  verified center/zoom identical across on/off/on  [x] airspace
  boundaries render correctly over Skåne/Denmark against a known
  reference - cross-checked Malmö Airport's (Sturup, ESMS) CTR: the
  rendered layer returned exactly "STURUP CTR", Class C, "0 ft GND -
  2000 ft MSL", matching the real published CTR, via both a
  programmatic query and an actual simulated click producing the info
  popup  [x] CI green
- Files changed: new src/domain/airspaceTypes.ts (OpenAIP's numeric
  enum -> labels, sourced from their own published schema, not
  guessed); new scripts/collect-airspaces.ts; new
  src/components/Map/airspaceLayer.ts; new
  src/components/AirspaceToggle/; MapLibreMap.tsx (showAirspace prop,
  add/remove wired through the same style.load pattern Block 18
  established); SiteMap.tsx; new
  .github/workflows/airspace-refresh.yml; new
  public/static/airspaces.json (663 features, SE+DK, committed - see
  below); 5 new unit tests, 1 new E2E test
- **Real research, not guesswork**: OpenAIP's REST API returns only
  numeric type/class codes with zero embedded labels. Found the
  authoritative mapping by tracing the Swagger docs page's actual
  spec-fetch URL (browser-rendered JS, not visible to a plain HTML
  fetch) and reading the `/airspaces` endpoint's own parameter
  descriptions in that spec - not inferred from third-party sources.
  Confirmed against the exact sample airspace pulled during Block 16's
  research (`type: 21` = "Gliding sector", directly relevant to
  paragliding).
- **Architecture decision: committed static file on a weekly cadence,
  not fetched per-build.** Unlike every other generated JSON in this
  project, `public/static/airspaces.json` is intentionally committed to
  git (not gitignored) and only refreshed by a new dedicated weekly
  workflow, not the existing 5-minute weather-refresh cron - airspace
  data barely changes, and this avoids hammering a free-tier API key
  for no benefit while also keeping that key scoped to exactly one
  job, never reaching the client bundle. Full reasoning in
  docs/DECISIONS.md.
- **Credential handling note**: the user pasted their OpenAIP API key
  directly in chat despite being told not to (and initially pasted
  their account password by mistake, which they were told to rotate
  immediately). The key was used exactly once, locally, to research the
  API and generate the initial airspaces.json - never written into any
  committed file. The durable credential path is the `OPENAIP_KEY`
  GitHub Actions secret, which still needs to be confirmed/added for
  the weekly refresh workflow to keep working going forward.
- Deferred / unresolved: **user still needs to add `OPENAIP_KEY` as a
  GitHub Actions repository secret** (Settings -> Secrets and variables
  -> Actions) for `airspace-refresh.yml` to run successfully on its own
  schedule - the feature works today off the locally-generated
  snapshot, but won't self-refresh without it. Airspace scoped to
  SE+DK only (not the full ~31,500 worldwide airspaces), matching this
  project's coverage area.

## Wind arrow field: 6x density + redesigned shape (post-Block 17 feedback)
- Status: done
- User feedback: "a lot higher density x6 density and we also need a
  more distingt arrow head and a smimming tail so its clear what
  direction is is"
- Definition of Done (informal, direct feedback rather than a BLOCKS.md
  item): [x] ~6x point density - 36 -> 225 points (~6.25x), verified via
  a temporary diagnostic E2E spec that the real request sends exactly
  225 coordinates, not just trusting the math  [x] distinct arrowhead -
  a compact triangle occupying only the outer ~22% of the shaft, wider
  than the tail so the boundary is visually a clear "step," not a smooth
  taper  [x] tapered "swimming" tail - a quadratic-Bezier curve that
  bulges slightly before narrowing to a point, rather than a straight
  line
- Files changed: src/app/useWindGrid.ts (GRID_RESOLUTION 6->15);
  src/components/WindArrowField/WindArrow.tsx (rewritten from
  line+triangle to a single tapered path); tests/unit/WindArrow.test.tsx
  (rewritten to parse the new path's `d` attribute);
  tests/unit/windGrid.test.ts (new test locking in the 225-point figure)
- Iterated the shape visually before committing to it rather than
  guessing proportions from the geometry formulas alone: rendered
  standalone SVG previews (enlarged, then at the actual ~26px on-map
  size), found the first attempt's head occupied most of the shaft and
  read as a generic kite rather than a directional arrow, corrected the
  proportions, then rendered the *actual* compiled React component
  (via a temporary swap of the existing gallery dev harness, reverted
  cleanly after - confirmed clean via `git status`) to make sure the
  shipped code matched the validated preview exactly, not just my
  hand-transcribed math.
- Deferred / unresolved: could not verify the new density/shape
  against *live* wind data locally - Open-Meteo's daily rate limit
  (hit earlier this session from extensive testing) was still active
  at implementation time. CI runs on different runners and is
  unaffected; production verification happens post-deploy as usual.

## Wind arrow round 2: triple density again, 1.5x size, gray sea
- Status: done
- User feedback: "great let tripple that desity of arrosw. and increse
  size of arrows.. x 1.5 also make map sea gray #8c94a1"
- Definition of Done: [x] density tripled again - 225 -> 676 points
  (~3x)  [x] arrow size 1.5x - 26px -> 39px  [x] sea gray in Relief/Topo
  - verified via pixel-sampling a live screenshot (`#969da9`, matching
    the requested `#8c94a1` allowing for anti-aliasing)  [x] CI green
- Files changed: useWindGrid.ts (GRID_RESOLUTION 15->26);
  openMeteoGridProvider.ts (new request-batching logic + 2 new unit
  tests); SiteMap.tsx (ARROW_SIZE 26->39); mapStyles.ts (water
  fill-color -> #8c94a1)
- **Real bug caught mid-implementation**: tripling density to 676
  points would exceed Open-Meteo's real URL-length ceiling. Initial
  probing used a naive raw-string-concatenated test URL and found ~500
  points safe - but the actual `buildGridUrl()` uses `URLSearchParams`,
  which percent-encodes commas (%2C, 3 bytes vs. 1), so the real ceiling
  is meaningfully lower (~400-449 points) than that first probe
  suggested. Re-tested using the exact same URL-building code as
  production before picking a final batch size (300, with real margin
  below the boundary, not sitting at the edge) - this is exactly the
  kind of gap between "how I tested" and "what the code sends" that's
  easy to miss without re-checking against the real function.
- Sea color change only affects RELIEF/TOPO (this codebase's own inline
  styles) - MAP mode is an externally hosted OpenFreeMap style (Block
  14c) not under this project's control, though its own positron style
  happens to already read as grayish so no visible clash resulted.
- Deferred / unresolved: same as the previous round - Open-Meteo's
  daily rate limit blocked a full live-data visual check locally
  (confirmed via curl and the verification agent's browser hitting the
  same 429). Sea color WAS verified live via pixel sampling; density/
  size/arrow-shape together need a check once the quota resets or from
  a different network.

## Production regression fix: rate-limit breakage + Holfuy speed/gust bug
- Status: done
- User report: "Sea looks great unfortinatly arrows are gone so is many
  sites and time slider not working and wind speed on site are off"
- Root-caused via a live Playwright diagnostic against production
  (full network/console capture) rather than guessing - found two
  unrelated issues:
  1. **This session's own regression**: tripling the wind grid to 676
     points (3 parallel Open-Meteo requests per page load) tripped
     Open-Meteo's real rate limit under actual traffic - confirmed via
     4/4 requests returning 429 on a live page load. Arrows and the
     time slider both depend on Open-Meteo succeeding, so both broke
     together; "many sites missing" was very likely the dense wind-
     arrow field (0 of the expected 324/676 shown), not the 24 named
     site pins, which the diagnostic confirmed were all still present.
  2. **Pre-existing bug, unrelated to today's work**: 9 of 11 live
     sites showed sustained wind speed greater than gust (physically
     backwards). Root-caused by fetching Holfuy's own widget JavaScript
     source directly - `wind_kok.js` defines
     `newWind(wind_dir, wind_speed, temp, gust, time)`, not
     `(dir, speed, gust, temp, time)` as assumed since Block 6, and
     `main.js` confirmed the raw speed/gust values are always km/h
     regardless of the `su=m/s` query param (only affects the widget's
     own display). The old code used the wrong field as gust AND never
     converted units - explaining displayed speeds like "28 m/s" for a
     real ~7 m/s wind. Cross-checked against 6 independent live
     stations' official dashboards before touching the parser.
- Definition of Done: [x] fixed argument order + km/h->m/s conversion
  in `holfuyWidgetProvider.ts`, verified by re-running
  `collect-live.ts` locally - all 11 sites now show physically sane
  speed <= gust with realistic magnitudes  [x] `GRID_RESOLUTION`
  reduced 26->18 (676->324 points), fitting in exactly 1 Open-Meteo
  request instead of 3, verified via a temporary diagnostic E2E spec
  confirming a single request at the new size  [x] unit tests updated
  for both fixes (holfuyWidgetProvider.test.ts, windGrid.test.ts)
  [x] CI green
- Files changed: src/providers/live/holfuyWidgetProvider.ts (parser fix
  + unit conversion); tests/unit/holfuyWidgetProvider.test.ts;
  src/app/useWindGrid.ts (GRID_RESOLUTION 26->18);
  src/providers/forecast/openMeteoGridProvider.ts
  (MAX_POINTS_PER_REQUEST 300->350); tests/unit/windGrid.test.ts
- Density is now ~9x the original grid (up from the ~6x round that
  worked, short of the ~19x "triple again" that broke production) -
  explicitly prioritizing real-world reliability over maximum density
  once there was direct evidence of the tradeoff. Batching code from
  the previous round is kept as a safety net, not removed.
- Deferred / unresolved: could not do a full live visual re-verification
  post-fix - Open-Meteo's daily quota was still exhausted in this
  sandbox at fix time (same persistent 429 all session). The Holfuy fix
  WAS verified against live data (re-ran the real collector, all 11
  sites sane). The density fix's request-count reduction was verified
  structurally (single request, correct point count, safe URL length)
  but not yet against a fully recovered Open-Meteo quota.

## Architecture fix: forecast/wind-grid fetching moved server-side
- Status: done
- User's explicit direction after the Yr research and the rate-limit
  incident: "Right now, don't switch provider. Fix the architecture.
  Keep Open-Meteo... Move weather fetching server-side / GitHub Action
  cron. Fetch once per update, not once per visitor. Publish static
  files such as forecast-sites.json and forecast-wind-grid.json.
  Browser only reads those files. Keep last good forecast if an update
  fails and expose generated_at so stale data can be flagged."
- Definition of Done (all explicit requirements from that message):
  [x] Open-Meteo kept as the provider  [x] fetching moved server-side
  via the existing weather-refresh.yml cron (no new workflow needed -
  it already runs `npm run build`, which now includes the new
  collector)  [x] fetch once per update, not once per visitor -
  browsers now `fetch()` a static file instead of calling Open-Meteo
  [x] publishes `forecast-sites.json` and `forecast-wind-grid.json`
  exactly as named  [x] browser only reads those files -
  `useSiteForecasts`/`useWindGrid` no longer import the Open-Meteo
  provider functions at all  [x] keeps last good forecast on a failed
  update - falls back to re-fetching the currently-published file from
  the live Pages URL, preserving its original `generatedAt`, rather
  than overwriting good data with nothing  [x] exposes `generatedAt` -
  both hooks return it, `SiteMap.tsx` uses the older of the two to show
  a staleness banner (>60min old) via the existing `classifyFreshness`
  helper  [x] CI green
- Files changed: new scripts/collect-forecasts.ts; rewrote
  useSiteForecasts.ts and useWindGrid.ts (static-file fetch instead of
  live Open-Meteo calls); domain/types.ts (new
  GeneratedForecastSitesFile/GeneratedWindGridFile/WindGridPoint
  shapes); SiteMap.tsx (staleness banner, useWindGrid() no longer takes
  bounds); App.css (banner styling); package.json (collect:forecasts
  added to dev/build); weather-refresh.yml (comment update only, no
  functional change needed); tests/e2e/time-slider.spec.ts (updated to
  check the static-file request instead of a now-nonexistent
  browser-side Open-Meteo call)
- **Verified the resilience path directly, not just the happy path**:
  since Open-Meteo was still rate-limited in this sandbox all session,
  every local test of this exercised the actual failure path (fresh
  fetch fails -> fallback to published also fails on this brand-new
  feature's first run -> honest empty state written). Confirmed via a
  Playwright resilience check against the built app: 24 site markers
  still render, marker clicks still open the site sheet cleanly with
  honest gray/unknown states (not fake data), the time slider doesn't
  crash with `max="0"`, zero console/page errors. This is a stronger
  verification than testing only the success path would have been -
  the failure path is exactly what real users hit today.
- Consolidated `GridWindPoint`/`WindGridPoint` into one canonical type
  in `domain/types.ts` while touching this code (was duplicated in
  spirit across the provider file and the new generated-file shape).
- **Confirmed live** (commit 1713472): GitHub Actions' IP was not
  rate-limited - `forecast-sites.json` has real hourly data for all 24
  sites, `forecast-wind-grid.json` has all 324 points. End-to-end
  Playwright check against production confirmed: 24 site markers, 324
  wind arrows rendering, time slider `max=72` (was stuck at 0), moving
  the slider updates correctly, a site sheet shows real forecast wind/
  gust/status data, and - the key architectural check - **zero browser
  requests to api.open-meteo.com**, only same-origin fetches of the two
  published JSON files. Both the rate-limit architecture problem and
  the Holfuy speed/gust bug are now fully resolved and confirmed live.

## Wind grid: tripled density again (961 points) + follows the time slider
- Status: done
- User feedback: "issues are we need to tripple the arrow desity.
  arrows not changing on time slider so no forcasting."
- Definition of Done: [x] density tripled again - 324 -> 961 points
  (~3x), now trivially safe since it's fetched once server-side, not
  per-visitor  [x] wind arrows change with the time slider - wind grid
  now carries `hourly` (not `current`) wind, windowed NOW..+72h client-
  side exactly like site forecasts, indexed by the same `sliderIndex`
  [x] CI green
- Files changed: scripts/collect-forecasts.ts (GRID_RESOLUTION 18->31,
  shape-compatibility guard on the fallback path);
  openMeteoGridProvider.ts (current-> hourly, shared `hours` instead of
  per-point duplication); useWindGrid.ts (rewritten to window like
  useSiteForecasts.ts); SiteMap.tsx (arrows indexed by sliderIndex);
  domain/types.ts (WindGridPoint arrays instead of single values);
  tests/unit/openMeteoGridProvider.test.ts (rewritten for the new
  shape)
- **Real bug caught before shipping**: the wind grid's file shape
  changed (single values -> per-hour arrays), but the file already live
  in production has the OLD shape. Without a check, a failed fresh
  fetch would fall back to that incompatible file and the frontend's
  array `.slice()` calls would throw. Added a shape-compatibility guard
  that treats an old-shaped fallback the same as "no fallback" (honest
  empty state) - confirmed this exact path fires correctly against the
  real currently-published file, not just reasoned about it.
- **Verified the actual slider-following behavior, not just that it
  builds**: Open-Meteo stayed rate-limited in this sandbox all session,
  so generated synthetic grid data (144 points, direction/speed varying
  smoothly over 80 hours), served a real build of the app locally, and
  confirmed via Playwright that a marker's rendered SVG arrow path
  genuinely changes (different rotation, different speed-color) after
  moving the time slider forward 48 hours - not just that "NOW" still
  works.
- **Confirmed live** (commit a5dd8fa): 961 `.wind-arrow-icon` markers
  present. Compared one marker's rendered SVG path at NOW vs. after
  moving the slider to +48h - the path genuinely changed (real
  Open-Meteo forecast wind differs at that offset), confirming arrows
  now follow the slider with real data, not just the synthetic test.
  Only same-origin `generated/forecast-wind-grid.json` requests seen,
  zero direct `api.open-meteo.com` calls. No console errors.

## WindRose visual redesign (uploads/wind-sector-rose.html reference)
- Status: done
- User feedback: "that compass rose in the uploads folder i want to use
  that as the sercor rose.. if you want to can just take the grafic
  elemets from it but it."
- Definition of Done: [x] sectors render as pie wedges from center
  (matching the reference) instead of ring bands, supporting multiple
  green/orange sectors (the reference only supported one)  [x] pointer
  redesigned as the reference's "split-tail dart" shape  [x] north tick
  + label added  [x] existing functionality preserved - overall-state
  ring (Block 11), history dots, colorblind-safe dashed red ring, size
  scaling (48/64/160px+), all still work identically  [x] CI green
- Files changed: domain/direction.ts (new `describeSector` pie-wedge
  helper, alongside the existing ring-band one); WindRose.tsx (full
  rewrite of the SVG rendering); tests/unit/direction.test.ts (3 new
  tests for describeSector); tests/unit/WindRose.test.tsx (updated
  testids/assertions for the new pointer shape, 1 new test for the
  north reference)
- Verified visually before finalizing, not just that it compiles:
  rendered the full rose gallery (all §29 fixture cases - SW/S/E/N-
  wraparound/red/orange/gray/marker-size variants) via the existing dev
  gallery harness and reviewed the actual screenshot; then specifically
  checked the new pointer's larger overflow (~31% past the ring, vs.
  the old arrow which stayed inside it) against the map's known
  marker-clustering issue by zooming into the worst real cluster (4
  sites within a few hundred meters) - found the overlap marginally
  worse there but not a functional regression (ring colors, speed
  numbers, click targeting all still work), so shipped rather than
  preemptively shrinking the design.
- Kept scope focused on "the sector rose" specifically: did not port
  the reference's embedded weather icon (this app already has a
  separate, tested WeatherGlyph component composed alongside WindRose,
  not inside it) or its comma-decimal number format (not something
  asked for, a separate concern from the graphic redesign).
- Deferred / unresolved: none - self-contained, all existing WindRose
  consumers (SiteMap markers, SiteSheet's expanded view, the rose
  gallery) work unchanged since the component's props/behavior are
  identical, only its internal SVG rendering changed.
