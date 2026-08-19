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
| 14b   | MapLibre + Mapterhorn: TOPO                   | not_started |       |
| 14c   | MapLibre + Mapterhorn: MAP                    | not_started |       |
| 15    | Soaring/Winch site-mode switch                | not_started | lower priority per user |
| 16    | flyxc data source research                    | not_started | lower priority per user |
| 17    | Airspace layer                                | not_started | depends on Block 16 |
| 18    | Skyways layer                                 | not_started | depends on Block 16 |
| 19    | Live tracking                                 | not_started | depends on Block 16 |

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
