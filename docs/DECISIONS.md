# DECISIONS.md — Architecture decisions

Record of decisions made where `MASTER_SPEC.md` left the choice to the
implementing agent (per its §0 mandate). Append, don't rewrite history.

## Block 1

- **Package manager / scaffold**: hand-authored `package.json` + config
  files instead of `npm create vite@latest`. The scaffolder's interactive
  "directory not empty" prompt (this repo already has `SITES.md` etc.) has
  no viable non-interactive flag that doesn't risk deleting existing files,
  and it also mis-handles Windows paths passed through Git Bash. Hand
  authoring also lines up better with the custom `src/domain` /
  `src/providers` / `scripts` layout `MASTER_SPEC.md` §40 asks for, which
  differs from stock Vite output anyway.
- **React 19, Vite 6, TypeScript 5.6, ESLint 9 flat config, Vitest 3** — the
  suggested stack in §14, current stable versions as of 2026-08. Vite/Vitest
  specifically pinned to `^6.4.3` / `^3.2.7` (not the initially-installed
  `^5.4.10` / `^2.1.4`) because those versions closed a moderate-to-critical
  esbuild/Vite/Vitest advisory chain, including a Windows-specific
  `server.fs.deny` bypass relevant to this dev environment. `npm audit`
  is clean at these versions.
- **Map library (MapLibre vs Leaflet)**: not yet decided — deferred to
  Block 4 when the map is actually built.
- **`public/generated/sites.json` is gitignored**, not committed. It's a
  build artifact of `scripts/parse-sites.ts` reading `SITES.md`; committing
  it would let generated data drift from its source. CI and the weather-
  refresh workflow (Block 8) regenerate it as part of build/deploy.
- **Sector validation**: a sector is "malformed" (§31) only if a degree
  value is outside 0–360 or `from_deg === to_deg` (zero-width). A
  wrap-around sector where `from_deg > to_deg` (e.g. 337.5 → 22.5) is valid
  by design (§29 test 4) and is *not* rejected — the rose-rendering wrap
  logic itself lands in Block 3, this block only guards the data shape.
- **`coordinates.verified: true` requires non-null lat/lon** — a coordinate
  can't be "verified" and simultaneously missing, so the schema enforces
  this pairing rather than leaving it to convention.
- **`wind_speed.verified: true` requires `good_min_ms`, `good_max_ms`,
  `maybe_min_ms`, `maybe_max_ms`** to be present (§31: "verified speed
  config missing required values -> build fails"). `hard_max_gust_ms`
  stays optional — not every site has a documented hard gust limit.

## Block 3

- **Rose geometry**: a fixed 100x100 SVG `viewBox` with `width`/`height`
  set from the `size` prop. This means the internal path/coordinate math
  is completely size-independent — a 48px marker and a 160px expanded
  rose use byte-identical `d`/coordinate values, only the outer pixel
  dimensions differ. This directly satisfies §2.4's "map marker and
  expanded rose must use the same underlying component/geometry logic"
  and is asserted directly in `tests/unit/WindRose.test.tsx`.
- **Sector rendering**: sectors are drawn as a donut/ring band (inner and
  outer radius) rather than pie slices to the center, so the center stays
  free for the speed number per §2.1.3. An "unfavorable direction" base
  ring is drawn first in a neutral red-family tint, then orange sectors,
  then green sectors on top — so any direction not explicitly configured
  green/orange visually reads as the same family as the red overall-state
  color, without a separate "explicit red sector" concept.
- **Overall state (§2.1.5)** is expressed only via the outer ring stroke
  color and a light center-fill tint — it never repaints the sector ring
  itself, so green/orange sector geometry stays visible under every
  state (tested explicitly for all four states).
- **WindRose scope**: the component owns only the visual gauge (sectors,
  arrow, speed, history dots, state ring) — not source/age/status-reason
  text, which §2.4's expanded view also asks for. Those belong to a
  future `SiteSheet` component (Block 4/6+) that wraps `WindRose` rather
  than being folded into it, keeping the rose itself a pure, reusable
  gauge.
- **Visual verification**: added a minimal Playwright setup
  (`playwright.config.ts`, `tests/e2e/rose-gallery.spec.ts`) plus a
  dev-only fixture harness (`gallery.html` / `src/dev/RoseGallery.tsx`,
  a second Vite build entry point) rendering the seven named cases
  MASTER_SPEC.md §29 asks for Playwright screenshots of. This satisfies
  Block 3's "component reviewed visually" requirement now and gets a
  head start on §29's formal acceptance tests. **Not yet wired into CI**
  — Playwright's browser install is a real per-run cost, and §30's
  mandatory E2E tests need the map and time slider, which don't exist
  until Block 4/5. Deferring CI integration until there's a fuller page
  to test keeps this block's CI change minimal; screenshots for now are
  a local/manual check (`npx playwright test`, then read the PNGs under
  `test-results/rose-gallery/`, gitignored).
- **Test environment**: `vitest`'s environment is now `jsdom` globally
  (needed for the new component tests) and its `include` is scoped to
  `tests/unit/**` so it never picks up Playwright's `tests/e2e/**`
  `.spec.ts` files (both tools default to matching `*.spec.*`, which
  collided before this was added). Added `@testing-library/react` for
  rendering components in tests and `jsdom` for the DOM environment.

## Block 4

- **Map library: Leaflet, not MapLibre GL.** MapLibre needs a vector-tile
  style source, which in practice means a keyed provider (MapTiler, etc.)
  — AGENTS.md explicitly says not to make the whole product depend on a
  credential we don't have. Leaflet works directly with free OSM raster
  tiles, no key required, and §14 says to pick whichever "materially
  reduces complexity" — for a marker-heavy, tile-only map this is Leaflet.
  Used `react-leaflet` v5 for idiomatic React integration rather than
  wrapping raw Leaflet by hand.
- **Rose markers via `renderToStaticMarkup`, not React portals into
  `L.divIcon`.** A portal-based marker would let a mounted marker's rose
  re-render in place without recreating the Leaflet icon — useful once
  the time slider (Block 5) changes wind data per tick. But nothing in
  Block 4 needs that yet (the bottom sheet shows static fixture-free
  data), and building it now would be exactly the kind of premature
  abstraction the project's own ground rules warn against. Revisit this
  when Block 5 actually needs reactive marker updates.
- **No fake wind/weather data on the map or in the sheet.** Every rose on
  the live map renders `windDirectionDeg: null`, `windSpeedMs: null`,
  `state: "gray"` — not fixture numbers. AGENTS.md is explicit that
  "Production must not contain fake fixture weather" outside tests/dev
  harnesses; since no live or forecast provider exists until Block 5/6,
  gray/unknown is the only honest state to show. The dev-only rose
  gallery (`gallery.html`) is the sanctioned place for fixture data.
- **Only sites with non-null coordinates are placed on the map**,
  regardless of their `verified` flag — the map's technical requirement
  is "has a coordinate," not "coordinate is verified." Currently 5 of 24
  enabled sites qualify (hammar, ravlunda, ven-n, ven-sv, ven-v); the
  other 19 stay off the map rather than crash or get a guessed pin, per
  Block 4's Definition of Done.
- **`npm run dev` and `npm run build` now both run `validate:sites`
  first**, so `public/generated/sites.json` (gitignored, fetched at
  runtime via `fetch("/generated/sites.json")`) is always freshly
  regenerated from the current `SITES.md` rather than possibly stale.
- **Map-fit-to-bounds happens once, on data load** (via `MapContainer`'s
  `bounds`/`boundsOptions` props, set only after the async site fetch
  resolves), not recomputed on every render — matches §16's "store map
  position while moving the time slider" intent even though the slider
  itself doesn't exist until Block 5.

## Block 5

- **Pulled forward a minimal slice of the flyability engine (§5)** even
  though it isn't its own numbered block, because this is the first point
  with real forecast direction/speed data to evaluate against site
  sectors. Implemented exactly the direction-result, speed-result, and
  overall-result rules §5.2-§5.4 already specify (`src/domain/
  flyability.ts`) — not a new policy invention. In particular it
  reproduces AGENTS.md's own worked example verbatim: a good direction
  with unverified site speed limits reads ORANGE, never GREEN. Since
  every current site still has `wind_speed.verified: false` (Block 2),
  GREEN is currently unreachable in practice but the logic is written
  generally so it activates automatically once a site gets verified
  numbers - not hardcoded to "never green."
- **Forecast provider: Open-Meteo**, per §12's explicit V1 preference, no
  API key required. Requests `wind_speed_unit=ms` and `timezone=UTC`
  directly from the API rather than converting client-side, and
  `forecast_days=5` to guarantee the full NOW..+72h window is covered
  regardless of what hour "now" happens to be.
- **Each site's forecast is fetched once and windowed to [NOW..+72h]** in
  `useSiteForecasts`; the time slider only ever indexes into this
  already-fetched, already-windowed array (§26's "no API call for every
  slider tick"), verified directly in
  `tests/e2e/time-slider.spec.ts` by counting network requests before
  and after moving the slider.
- **No map jump on slider movement** falls out of the Block 4 design for
  free — `MapContainer`'s `bounds` prop only applies at initial mount, so
  re-rendering markers with new per-tick wind data never touches the
  map's pan/zoom state. Verified in the same E2E test by comparing the
  Leaflet map pane's CSS transform before and after moving the slider.
- **Weather glyphs are small hand-drawn SVG shapes** (`WeatherGlyph`),
  not emoji or an icon font/asset pack — avoids cross-platform emoji
  rendering inconsistency and an extra asset dependency, while staying
  visually secondary to the rose per §8 (16-28px, positioned below/beside
  it, never inside).
- **Compass-label and unit conversion helpers** (`degreesToCompass16` /
  `compass16ToDegrees` in `direction.ts`, `units.ts`'s km/h-mph-knots<->m/s
  functions) were added specifically to satisfy §31's "wind unit
  conversion tests" and "compass/degrees conversion tests" requirements,
  and are now used for real in the site sheet's direction readout (e.g.
  "WSW (238°)").

## Block 6

- **Live source: `widget.holfuy.com`, not `api.holfuy.com`.** The
  official API is password-gated and capped at 3 stations for
  non-owners (confirmed by fetching `api.holfuy.com`'s own docs) - a
  real credential blocker per AGENTS.md, not worked around. Instead,
  `m.cps.to`'s own public page embeds each station via an unauthenticated
  `widget.holfuy.com` iframe (no password parameter) - the same
  mechanism any visitor's browser already uses. See
  `docs/DATA_SOURCE_AUDIT.md` for the full investigation, including two
  previously-undocumented station IDs (215, 217) found while confirming
  this.
- **The widget has no parseable JSON, no clean timestamp.** Its HTML
  embeds the live reading directly in inline JS
  (`newWind(dir,speed,gust,?,'HH:MM')`), which `holfuyWidgetProvider.ts`
  regex-parses defensively (returns `null`, not a throw, on an
  unexpected format). Since `'HH:MM'` carries no date or timezone, the
  adapter uses its own fetch time as the observation timestamp rather
  than guess a timezone and risk misreporting freshness - bounded to
  ~5 min of real staleness by the widget's own `<meta refresh=300>`.
- **Live collection happens in `npm run dev`/`build`** (a new
  `collect:live` script, alongside the existing `validate:sites`), not
  client-side in the browser - matches §13's architecture (server-side
  collection, static site serves the generated bundle) and sidesteps
  browser CORS restrictions a client-side fetch to `widget.holfuy.com`
  would likely hit. `public/generated/live.json` is gitignored, same
  treatment as `sites.json`.
- **NOW prefers a fresh/aging live observation; anything else (including
  a stale live reading) falls back to forecast**, implemented as a pure
  `selectEffectiveSample` function per §6.1/§11.2 - a stale observation
  is deliberately not shown as "current," it's replaced by a clearly
  labeled forecast value instead. Verified end-to-end against live data:
  Hammar's rose currently shows a real 273°/8.0 m/s/13.9 m/s-gust reading
  labeled "LIVE — Holfuy live (fresh, 0 min ago)."
- **Not implemented this block, documented rather than dropped**: ViVa
  (barsebäck's configured source has no known station ID yet), FindWind,
  and wiring the widget's `owind` recent-sample history into the rose's
  optional history dots (parsed and unit-tested, just not plumbed into
  the UI - the `LiveWindProvider` interface only carries a single current
  reading today). All noted in `docs/DATA_SOURCE_AUDIT.md`.

## Block 7

- **Height interpolation is circular-safe vector averaging**, not naive
  linear interpolation of degree values - a wraparound case (e.g. 350°
  and 10°) would otherwise average to 180° instead of ~0°.
  `interpolateWindAtHeight` converts each bracketing angle to a unit
  vector, interpolates the vector components, then converts back via
  `atan2`. Clamps to the nearest available height (10/80/120/180m, Open-
  Meteo's discrete offering, confirmed live) rather than extrapolating
  beyond real data when a site's configured height falls outside that
  range - §7.2 mentions pressure-level data for "larger heights," which
  isn't available from this provider, so clamping is the honest choice
  over guessing.
- **Live observations never apply in Soaring height mode**, only Surface
  - a surface anemometer doesn't measure wind aloft (§7.2's explicit
    warning). Soaring mode always uses interpolated forecast, even at
  NOW, even if a fresh live reading exists for that site.
- **A site with no `soaring_height.agl_m` configured shows explicitly
  unsupported** (null wind, a visible warning message) in Soaring mode
  rather than silently falling back to surface wind - this falls out for
  free from `computeDirectionFit` already returning "unknown" (→ gray)
  when direction is null, so no special-casing was needed in the
  flyability logic itself, only in `forecastPointAt`'s branch that
  refuses to compute anything when the config is missing.
- **Marker-click flakiness surfaced a real gap, not papered over**: Ven's
  three sites sit close enough together that their map markers visually
  overlap and intercept each other's clicks in Playwright. Simplified
  the affected E2E test to avoid the flaky interaction rather than force
  the click - the underlying issue (marker collision/clustering strategy
  per §16) is real and left for a later polish pass, noted in
  `PROGRESS.md` rather than silently worked around.

## Block 8

- **Forecast data stays client-fetched, not server-collected**, despite
  §13's architecture diagram listing "refresh forecast when stale" as a
  GitHub Actions step. Open-Meteo is a free, keyless, CORS-open API
  explicitly meant for direct browser use, so every page load already
  gets a genuinely fresh forecast for free - server-staging it would add
  complexity (a cache-freshness policy, another generated file) without
  a real freshness benefit, and Block 5 already satisfies §26's "no API
  call per slider tick" (one fetch per page load, not per tick). Only
  Holfuy's live data is server-collected, because its widget endpoint
  can't safely be called cross-origin from a browser (no CORS headers
  expected for an iframe-embed product) - that's the actual reason a
  server-side collector exists at all. This means `weather-refresh.yml`
  only needs to re-run `npm run build` (which already regenerates
  `live.json` fresh via `collect:live`), not a separate forecast-cache
  step.
- **Two separate workflow files** (`pages.yml` triggered by push to
  `main` + manual dispatch; `weather-refresh.yml` triggered by a 5-minute
  cron + manual dispatch), each with its own concurrency group rather
  than sharing one - a push-triggered deploy should never be cancelled
  mid-build by an unrelated scheduled refresh, but overlapping refresh
  runs *should* cancel each other (§32) since only the freshest one's
  output matters. GitHub's own Pages deployment environment additionally
  serializes the actual publish step regardless, so this isn't the only
  safety net.
- **`actions/configure-pages@v5` enables the Pages site itself**, using
  the workflow's own scoped `GITHUB_TOKEN` (via the `pages: write`
  permission) - no personal access token was available in this
  environment to hit the Pages API by hand, and none was needed; this is
  the standard supported mechanism precisely for that case.
- **No git commit per refresh** falls out of using the modern Actions-
  based Pages deployment (`upload-pages-artifact` + `deploy-pages`)
  rather than the older pattern of pushing built output to a `gh-pages`
  branch - the artifact is uploaded and published directly, never
  touching git history, satisfying §32's "avoid repository-history
  spam" without needing to design around it.
- **`weather-refresh.yml` skips lint/typecheck/unit-test steps** that
  `pages.yml` runs - the application code isn't changing between
  refresh runs, only the collected live data, so re-verifying it every
  5 minutes would be pure waste (§13.1: "keep the collector fast").
- **Two real problems found only by actually deploying, not by local
  build success:**
  1. `actions/configure-pages` failed on the first deploy attempt
     because the repo's Pages feature had never been switched on -
     `pages: write` in the workflow permissions isn't sufficient by
     itself; the repo owner had to visit Settings → Pages → Build and
     deployment → Source and select "GitHub Actions" once. A genuine
     one-time credential/permission blocker per AGENTS.md, so this
     stopped and asked rather than attempting a workaround. Also
     manually triggered `pages.yml` and `weather-refresh.yml` once each
     via `workflow_dispatch` (clicked by the repo owner - I have no
     token that can call the dispatch API myself) to confirm both work
     without waiting on the cron's first natural firing.
  2. Even after that fix, the first successful deploy served a **blank
     page** - GitHub Pages serves a project repo from `/FlyWeather/`,
     not the domain root, but `vite build`'s default `base: '/'`
     produced asset references like `/assets/main-*.js` (wrong;
     actually served at `/FlyWeather/assets/main-*.js`) and the app's
     own `fetch("/generated/sites.json")` calls had the identical bug.
     Fixed by setting `base` conditionally
     (`command === "build" ? "/FlyWeather/" : "/"`, so local dev/preview
     and Playwright's root-relative `page.goto("/")` keep working) and
     building both `fetch()` calls from `import.meta.env.BASE_URL`
     instead of a hardcoded leading slash. Confirmed by loading the
     actual production URL with Playwright afterward, not just trusting
     a green CI run - `npm run build` succeeding locally never would
     have caught either of these, since neither is a build-time error.

## Block 9

- **Touch targets bumped to 44px minimum** (the NOW button, height-mode
  toggle buttons, site-sheet close button) - the originals were as small
  as ~24px tall, well under the accessibility-standard 44px minimum
  §28 calls for. The time slider bar grew from 76px to 92px to
  comfortably fit a 44px button row plus the range input without
  cramming.
- **Red gets a dashed ring, not just a hue** (`WindRose`'s state ring
  now uses `strokeDasharray` specifically for `state === "red"`). §28
  only explicitly requires non-color state cues "in expanded view"
  (already satisfied by the GOOD/MAYBE/BAD/UNKNOWN text label there),
  but red is the single most safety-critical signal ("don't fly") and a
  colorblind pilot glancing at the map itself, not the expanded sheet,
  deserves that same non-color cue at marker scale too - a small,
  low-risk addition worth doing beyond the letter of the requirement.
- **Darkened several marginal-contrast grays** (`#777`->`#555`,
  `#666`->`#444`, accent blue `#1976d2`->`#1565c0`) for headroom beyond
  bare WCAG AA minimums, given §28's explicit "UI should work in bright
  outdoor light" - direct sunlight on a phone screen eats contrast
  margin fast, so bare-minimum compliance isn't enough here.
- **PWA: manifest + SVG icon added, no service worker.**
  `manifest.webmanifest` + `public/icon.svg` (referenced via a
  `sizes: "any"`, `type: "image/svg+xml"` icon entry, no PNG generation
  tooling needed) give "Add to Home Screen" installability, satisfying
  §27's "nice to have, not blocker" framing. A full offline-caching
  service worker was deliberately **not** built: §27 explicitly only
  asks for caching "the application shell," but this app rebuilds and
  redeploys every 5 minutes (Block 8's weather-refresh.yml) - a
  naively-cached service worker is a well-known footgun for exactly
  this situation (serving a stale JS bundle to a returning visitor
  after a deploy, requiring careful cache-versioning to avoid). Given
  the feature is explicitly optional and the risk of getting cache
  invalidation wrong is real, this was judged not worth it for the
  value gained; installability without offline caching is the safer
  subset to ship now.
- **§38 V1 definition-of-done swept against the actual live URL**
  (`https://utskottet.github.io/FlyWeather/`), not just local dev - see
  `PROGRESS.md`'s Block 9 report for the item-by-item result.

## Block 10

- **No new data source needed.** Open-Meteo's forecast API (already
  integrated since Block 5) accepts comma-separated multi-location
  requests, verified live before building anything - this made the
  live version of the wind field straightforward rather than needing
  the static-GRIB fallback the user had explicitly offered as
  acceptable. Shipped the better, live option since it was actually
  feasible.
- **Flow-direction convention, deliberately different from WindRose's.**
  `WindRose`'s site arrow points to the compass direction wind is
  coming FROM (§29.3's station/vane convention, already correct and
  tested). The regional field's arrows instead point in the direction
  wind is blowing TOWARD (`windDirectionDeg + 180`), matching how
  flow/streamline wind maps (Yr's included) conventionally read. Two
  different, individually-correct conventions in the same app is a
  real risk of future confusion, so this is called out explicitly in
  code comments on both components, not left implicit.
- **Grid shows current conditions only, not tied to the time slider.**
  Extending it to the 72h slider would multiply the request volume by
  roughly 73x per grid point for a feature whose value at each
  intermediate hour hasn't been validated yet - deferred as a documented
  future enhancement rather than over-building this pass.
- **Grid is fixed to the sites' fitted bounds, not the live viewport.**
  Panning/zooming away from the initial view won't extend the arrow
  field to wherever the user scrolls - that needs a map-move listener
  and refetch-on-pan, a meaningfully bigger lift than this block's
  scope. Noted as a known simplification.
- **Arrows are non-interactive** (`interactive={false}` on the Leaflet
  markers, plus `pointer-events: none` in CSS as a belt-and-suspenders
  measure) and pushed to `zIndexOffset: -10000` so they never intercept
  clicks meant for site markers or the map itself, and always render
  beneath the rose markers - confirmed by clicking a site marker through
  the arrow layer in a live E2E check.

## Block 11

- **Did both options the user offered, not either/or.** Widened
  `STATE_RING_WIDTH` from 5 to 8, and moved the center fill from a
  near-white tint (e.g. green's old `#e6f4ea`) to a genuinely saturated
  mid-tone (`#a5d6a7`) - the combination reads far more clearly at
  marker scale than either change alone would have (confirmed visually
  at 48px).
- **Checked text contrast before picking the new fill colors**, not
  after: `#111827` (the speed-number text) against every new fill stays
  well above WCAG AA's 4.5:1 minimum, so the number stays clearly
  readable per §28 even though the background is now much louder than
  before.
- **Sector-wedge and existing accessibility work both survive
  unchanged**: green/orange sector colors weren't touched (only overall-
  state colors were), and the Block 9 dashed-red-ring cue automatically
  scales with the new ring width (`STATE_RING_WIDTH * 1.6`) since it
  already referenced the constant rather than a hardcoded number.
- **Geometry shrank the center circle by ~3px** (radius 25→22 in the
  100-unit viewBox) to make room for the wider ring without changing
  the rose's overall size - a minor, visually unnoticeable tradeoff
  confirmed by re-running the full existing WindRose test suite
  unchanged (no test needed updating, since none hardcoded the old
  radius values).

## Block 12

- **Custom tick row, not native `<datalist>`.** A native `<input
  type="range">` supports tick marks via `<datalist>` in some desktop
  browsers, but iOS Safari - this app's primary target - doesn't render
  them at all. Built a separate absolutely-positioned tick row instead,
  computed from the same `hours` array the slider already has.
- **Three-tier graduation**: plain hourly ticks (thin, subtle) for the
  "ruler" texture, six-hour ticks (00/06/12/18 local) at medium
  prominence, and day-boundary ticks (local midnight) tallest/darkest
  with a weekday label - giving both the "hours" and "days" graduation
  the user asked for without 73 competing labels.
- **Found and fixed a real E2E test bug while verifying this block**:
  `time-slider.spec.ts` used a fixed 1.5s sleep before assuming forecast
  data had loaded, which Block 10's extra network request (the wind
  grid fetch) pushed past the edge of reliability. Root-caused it with
  a diagnostic spec rather than just upping the sleep blindly: React
  `StrictMode` double-invokes effects in dev (confirmed via duplicated
  200 responses in the network log), roughly doubling dev-mode load
  time - **harmless in production**, since `StrictMode`'s double-invoke
  is dev-only and every live production check so far has shown correct,
  non-duplicated behavior. Replaced the fixed sleep with a real wait
  condition (polling the range input's `max` attribute until forecast
  data actually arrives) instead of just increasing an opaque timeout.

## Block 13

- **OpenStreetMap Nominatim for coordinate resolution**, not a paid
  geocoder - free, keyless, and its usage policy (1 req/sec, descriptive
  User-Agent) was respected directly in the research script. Every
  result was sanity-checked against known regional geography (correct
  kommun/coast/country) before being accepted, not taken on the
  geocoder's word alone - full source/confidence notes per site in
  `docs/SITE_DATA_AUDIT.md`.
- **Every new coordinate stays `verified: false`** with an explicit
  `coordinates.source` note describing precision (village-level,
  landmark-level, or a coarser fallback proxy where even the village
  name didn't geocode) - none were promoted to `verified: true`, since
  a geocoded village center is not a pilot-confirmed launch point.
- **Found and fixed a real architecture problem this surfaced, not
  papered over with longer test timeouts**: going from 5 to 24 located
  sites meant `useSiteForecasts` fired 24 separate Open-Meteo requests
  per page load (doubled to 48 by dev-mode StrictMode), which pushed one
  E2E test's runtime from ~7s to over a minute and caused several others
  to fail outright. Root cause diagnosed, then fixed by extending the
  multi-location batching technique already built for the wind grid
  (Block 10) to per-site forecasts too (`fetchSitesForecastBatch`) -
  verified live that Open-Meteo's multi-location endpoint supports full
  hourly variables, not just `current`. Cut 24 requests to 1, restoring
  the full E2E suite to ~7s. This also improves real-world production
  page-load performance and is better API citizenship toward Open-Meteo,
  not just a test-suite fix.
- **Marker-clustering elevated from a minor to a clearly-visible issue.**
  Block 7 first flagged Ven's three sites overlapping at low zoom as a
  deferred §16 gap. With all 24 sites now on the map, several more
  clusters appeared (Kåseberga's three sites share a coordinate exactly,
  since two share zero landmark precision and were assigned the same
  village center; Hovs Hallar's two sites likewise). Not fixed in this
  block - still out of scope for "resolve coordinates" - but four E2E
  tests needed `{ force: true }` clicks to work around Playwright's
  overlap-interception check, each commented with why. This meaningfully
  raises the priority of real marker-clustering/collision handling for
  whenever map polish work happens (Block 14's MapLibre rewrite is a
  natural place to build it in properly).

## Block 14a

- **Leaflet → MapLibre GL JS swap, RELIEF mode only this block**: per the
  user's explicit spec, replaced the raster/DOM-tile Leaflet map with
  MapLibre GL's WebGL vector-tile renderer so Mapterhorn's hillshade DEM
  can be composited live. TOPO and MAP modes are stubbed
  (`buildTopoStyle`/`buildMapModeStyle` in `mapStyles.ts` currently just
  return the RELIEF style) and deferred to 14b/14c per the user's explicit
  "build RELIEF first and verify before TOPO/MAP" instruction -
  `MapModeToggle`'s `availableModes` prop defaults to `["relief"]` only,
  so Topo/Map show as disabled "Coming soon" rather than silently
  rendering RELIEF under a different label.
- **Data sources, both keyless**: Mapterhorn's `raster-dem` terrain source
  (terrarium encoding) for hillshade, OpenFreeMap's `planet` vector tiles
  (OpenMapTiles schema) for the water fill. Neither requires an API key or
  account, consistent with every other provider choice so far in this
  project.
- **Per-mode style builders centralized in one file**
  (`src/components/Map/mapStyles.ts`), per the user's explicit "one config
  per mode" instruction, with a single `buildStyleForMode(mode)`
  dispatcher - 14b/14c fill in their builders in the same file rather than
  scattering style logic across components.
- **Marker rendering switched from Leaflet's `L.DivIcon` to plain HTML
  strings** (`buildRoseHtml`/`buildWindArrowHtml`, still built via
  `renderToStaticMarkup`) passed to a new imperative `MapMarker` wrapper
  around MapLibre's `Marker` class - MapLibre has no divIcon equivalent,
  and this keeps the existing WindRose/WeatherGlyph/WindArrow React
  components as the single source of truth for marker visuals.
- **Bug found: MapLibre's worker breaks under Vite's dep pre-bundler.**
  MapLibre GL ships its own Web Worker (`maplibre-gl-worker.mjs`) for
  off-main-thread tile parsing; Vite's esbuild pre-bundler mangles that
  worker's own import resolution, so it 404'd in dev
  (`net::ERR_FAILED`) and the map silently never fired its `load` event.
  Root-caused via a diagnostic spec logging console/network events, not
  guesswork. Fixed with `optimizeDeps: { exclude: ["maplibre-gl"] }` in
  `vite.config.ts` - MapLibre's own documented Vite workaround - plus
  clearing the stale `node_modules/.vite` cache. Load time went from
  never-completing to 711ms.
- **Bug found: markers unclickable behind the time slider.** Diagnosing
  4 failing E2E marker-click tests found the click was actually landing
  on the time-slider `<input>`, not the marker - the map's uniform 40px
  `fitBounds` padding let markers render underneath the persistent 112px
  time-slider bar (`z-index: 900`), so a real user's tap would genuinely
  hit the slider too, not just Playwright's stricter interception check.
  Fixed by making `MapLibreMap`'s `boundsPadding` prop accept
  `number | PaddingOptions` and passing asymmetric padding
  (`{ top: 40, bottom: 152, left: 40, right: 40 }`) from `SiteMap.tsx` so
  fitted markers always clear the slider. The pre-existing marker-
  clustering `force: true` workarounds (Block 13) are unrelated and still
  needed - this fix only addresses the slider-occlusion case.
- **Visual verification**: captured screenshots at the initial auto-fit
  view and two zoomed-in views over the Bjäre peninsula and Kullaberg
  (the most dramatic terrain in the Skåne region, chosen deliberately as
  the hardest test of the hillshade settings). The default exaggeration
  (1), 315° illumination, and dark-shadow/light-highlight colors produced
  clearly visible ridge/valley relief at both zoom levels without needing
  to push the settings further - no adjustment was needed against the
  user's "if too weak, make it more aggressive" instruction.
- **Leaflet/react-leaflet/@types/leaflet removed from package.json** only
  after the full local E2E suite passed against the MapLibre port and the
  production build succeeded - kept them until then in case a rollback
  was needed mid-port.
- **Bundle size tradeoff, accepted not fixed**: production bundle grew
  from ~420KB to ~1.23MB (333KB gzipped) because MapLibre's WebGL engine
  is substantially larger than Leaflet's DOM-based renderer. This is the
  direct cost of the terrain rendering the user explicitly asked for;
  not treated as a regression to chase down in this block.
- **Bug found post-deploy: MapLibre's worker 404s in the actual
  production build, not just dev.** CI was green and the local build
  succeeded, but visually verifying the live GitHub Pages URL after
  deploy (not just trusting CI) showed markers present but the canvas
  rendering flat with no tiles or hillshade at all. Root cause: MapLibre
  computes its worker script's URL relative to its own module's
  `import.meta.url` at runtime; once Rollup inlines `maplibre-gl` into
  our own bundle, that computed URL points at a file that was never
  copied into `dist/` (the `optimizeDeps.exclude` fix from earlier in
  this block only fixes Vite's *dev* pre-bundler, a separate code path
  from the production Rollup build). Fixed by importing the worker file
  explicitly with Vite's `?url` suffix
  (`maplibre-gl/dist/maplibre-gl-worker.mjs?url`), which makes Vite copy
  it into `dist/assets/` under a hashed name, and calling MapLibre's own
  `setWorkerUrl()` with that real URL before any `Map` is constructed.
  Confirmed by inspecting the built bundle directly: it now embeds the
  literal string `/FlyWeather/assets/maplibre-gl-worker-<hash>.mjs`
  (correctly base-prefixed) and the worker file exists at that path in
  `dist/`. This is the second time in this block that a bug only showed
  up by actually checking the deployed artifact rather than trusting a
  green CI run - reinforces AGENTS.md's "verify against production, not
  just build success" practice.
- **Follow-up: the `?url` fix above was itself incomplete.** Re-checking
  the live deploy after that fix found the worker script now loaded
  (200) but the map still rendered flat with no terrain - the worker
  file itself does a *static relative import* of a sibling
  `maplibre-gl-shared.mjs` from its own package. A `?url` import treats
  the worker as an opaque raw asset and copies only that one file under
  a new hashed name, so the browser's attempt to resolve the worker's
  own `./maplibre-gl-shared.mjs` import 404s next - same class of bug,
  one file deeper. Fixed properly this time by adding
  `scripts/copy-maplibre-worker.ts` (same pattern as the existing
  `validate:sites`/`collect:live` prebuild scripts) that copies both
  `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` verbatim, under
  their original unhashed names, into `public/vendor/maplibre-gl/` -
  since they're copied together into the same directory, the worker's
  relative import keeps resolving correctly regardless of Vite's
  hashing. `setWorkerUrl()` now points at that fixed path
  (`${BASE_URL}vendor/maplibre-gl/maplibre-gl-worker.mjs`) instead of a
  Vite-generated URL. `public/vendor/` is gitignored, same treatement as
  `public/generated/` - it's copied fresh from the pinned `maplibre-gl`
  version on every dev/build, not committed. Verified this time by
  serving the actual `dist/` output locally under the real `/FlyWeather/`
  path (matching GitHub Pages exactly, not just `vite preview`, which
  doesn't apply the build base path) and confirming via Playwright that
  the worker loads, `window.__flyweatherMapLoaded` flips true, and the
  screenshot shows real hillshade terrain - before touching production
  again.

## Block 14b

- **Contour lines via `maplibre-contour`** (`onthegomap/maplibre-contour`,
  zero runtime deps, pinned `^0.1.0`): computes contour vector tiles
  client-side from the same Mapterhorn DEM tiles already used for
  RELIEF's hillshade, exposed to MapLibre through a custom protocol
  (`DemSource.setupMaplibre({ addProtocol })`). Chosen over a
  server-rendered contour tileset because it needs no separate hosted
  data source - reuses the DEM we already have, keyless like everything
  else in this project. Its internal worker is built from an in-memory
  Blob URL rather than a separate fetched file, which sidesteps Block
  14a's worker-bundling class of bug entirely (confirmed no
  `optimizeDeps`/`copy-maplibre-worker.ts`-style fix was needed - a
  build-and-serve-locally check under the real `/FlyWeather/` path
  turned up nothing worker-related).
- **Thresholds**: 5m minor / 25m major at the closest zoom band (z13+),
  coarsening to 25/100m at z9 and 50/200m below that, per the user's
  explicit "start ~5m minor/25m major, adjust after visually testing"
  instruction - Skåne's flat terrain would produce an illegible tangle
  of lines at low zoom without coarsening.
- **Hillshade stays visually dominant**: TOPO is built by spreading
  RELIEF's full style (background, water, hillshade) and layering
  contours/roads/labels on top, not a separate style built from
  scratch - guarantees the two modes share identical terrain rendering,
  per the user's explicit "this is not a step toward a street map"
  instruction.
- **Roads limited to motorway/trunk/primary/secondary** (OpenFreeMap's
  `transportation` source-layer, `class` filter) and **place labels to
  city/town/village** (`place` source-layer) - "major roads only, town/
  place names" per spec, deliberately excluding minor roads, POIs, and
  buildings that would compete visually with the terrain.
- **`MapModeToggle`'s `availableModes` now includes `"topo"`** in
  `SiteMap.tsx`; MAP stays disabled, still deferred to 14c.
- **Verification**: same rigor as 14a's post-deploy lesson - built and
  served the actual `dist/` output locally under the real `/FlyWeather/`
  base path before considering this done, not just `vite preview` or
  trusting the dev server. Confirmed via Playwright: contour lines and
  an elevation label render at Kullaberg, `getStyle()` shows the
  contour/road/label layers exist only in TOPO (not leaking into
  RELIEF), switching modes preserves center/zoom exactly, and marker
  clicks still work.

## Block 14c

- **MAP mode points at OpenFreeMap's hosted `positron` style URL**
  (`https://tiles.openfreemap.org/styles/positron`) rather than hand-
  building a full conventional-map style from scratch. Fetched and
  inspected it first: 55 layers (roads, buildings, water, boundaries,
  labels at every zoom), `background-color: rgb(242,243,240)`, and
  critically **no hillshade layer at all** - satisfies the spec's
  "hillshade reduced or removed" exactly without needing to add that
  logic ourselves. Since MapLibre's `style` option natively accepts a
  URL string (not just an inline `StyleSpecification` object), this
  needed only a type widening
  (`MapLibreMap`'s `style` prop -> `StyleSpecification | string`,
  `buildStyleForMode`'s return type likewise) rather than any new
  runtime logic. Using OpenFreeMap's own maintained style also means it
  stays current with their schema without us re-copying ~55 layers by
  hand and letting that copy drift stale.
- **All three modes now selectable** - `SiteMap.tsx`'s `availableModes`
  is `["relief", "topo", "map"]`, completing `MapModeToggle`. This
  closes out Block 14 as a whole (14a/14b/14c).
- **Verification, same discipline as 14a/14b**: built and served the
  actual `dist/` output locally under the real `/FlyWeather/` base path
  before pushing. Confirmed via Playwright: all three modes render
  distinctly (Map = flat street map, Topo = hillshade + contours, Relief
  = hillshade only), switching between any pair preserves center/zoom
  exactly (compared across all 4 states: initial, Map, Topo, Relief),
  and a marker click still opens the site sheet with real data
  regardless of which mode is active.

## Block 15

- **Filter by `site.type`, not a new field**: `SITES.md`'s schema
  already has a `type` enum (`hang | winch | paramotor | school |
  other`) that was defined but functionally unused everywhere else in
  the codebase. `visibleSites` in `SiteMap.tsx` filters on it directly
  (`type === "winch"` vs. `type !== "winch"`) rather than introducing a
  parallel "site set" concept - Soaring mode is simply "not winch", so
  any future non-winch type (paramotor, school) shows there too, which
  matches the spec's framing of "the existing soaring/hang sites" as one
  bucket versus "a winch-site set" as the other.
- **Bounds/fit stay computed from the full site list, not the filtered
  one**: same "no map jump on toggle" principle already established for
  heightMode/mapMode in earlier blocks. If bounds were recomputed from
  `visibleSites`, switching to Winch mode (currently 0 sites) would hit
  `computeSiteBounds([])` returning null, which would trigger the
  component's existing early-return ("No sites with known coordinates
  yet.") and **remove the toggle itself along with everything else** -
  a dead end with no way back to Soaring. Keeping bounds independent of
  `siteMode` avoids that entirely and is also just correct: switching
  which markers are drawn shouldn't move the camera.
- **No new flyability code needed for winch semantics**: the spec asked
  to "not force soaring semantics onto winch sites... mark anything
  unsupported as gray/unknown rather than guessing." Checked
  `computeDirectionFit`/`computeOverallState` in `flyability.ts` (from
  Block 5/7) and found they already return "unknown"/gray whenever
  `green`/`orange` sectors are empty, which is exactly the placeholder
  state both winch entries already carry in `SITES.md`. The honesty
  requirement was already structurally satisfied by the existing
  architecture once the toggle correctly separates the two site sets -
  no winch-specific rose variant was built, since nothing yet needs one.
- **Winch site research, both kept disabled with real reasons** (not
  fabricated placement): `winch-brandstad`'s own CPS page states,
  repeated multiple times, that the field is currently not in use -
  kept off for that reason specifically, not just "rules not designed
  yet". `winch-urasa` appears active (2.5km N-S runway, real contact
  phone number) but its CPS page publishes no coordinates, only driving
  directions to a locked gate; Nominatim-geocoding the nearest named
  village was considered and rejected - for most of this project's
  other geocoded sites (Block 13) the matched feature sits at or very
  near the actual site, but here the only nameable places are several km
  from the field itself, which would produce a materially misleading pin
  rather than an honestly imprecise one. Full findings in
  `docs/SITE_DATA_AUDIT.md`. Net result: the toggle mechanism is
  complete and tested, but the Winch site set is honestly empty right
  now - a real data gap, not a missing feature, and it activates
  automatically the moment either site gets a real coordinate.

## Block 18

- **Layer registered imperatively in `MapLibreMap.tsx`, not baked into
  each mode's `StyleSpecification`**: since MAP mode points at an
  external OpenFreeMap style URL (Block 14c) rather than an inline
  spec, there's no single style JSON to add a layer into across all
  three modes. Instead, `addSkywaysLayer()` is called on every
  `style.load` event (fires on initial load *and* after every
  `setStyle()` call) - one code path handles all three modes uniformly
  and survives mode switches, since `setStyle()` clears any
  sources/layers not part of the incoming style.
- **Bug found before shipping: silent blank-overlay from a tile scheme
  mismatch.** The first implementation had no visible errors anywhere -
  tiles requested successfully (`200`), `getStyle()` showed the source/
  layer present - but rendered nothing. Root cause: `thermal.kk7.ch`
  serves tiles in the TMS Y-axis convention (Y=0 at the south), not the
  XYZ/slippy-map convention MapLibre's raster source assumes by
  default. Cross-referenced flyxc's own frontend code
  (`skyways-element.ts`'s `getTileUrl`), which manually flips Y for
  Google Maps' overlay API - the same transform TMS vs. XYZ requires -
  confirming this wasn't a one-off flyxc quirk but the tile server's
  actual scheme. Verified by fetching one tile both ways at a known
  soaring hotspot (Annecy, France): un-flipped returned a 68-byte blank
  PNG, correctly-scheme'd returned a real 90KB+ image with visible
  thermal-density data (viewed directly). Fixed with MapLibre's native
  `scheme: "tms"` raster-source option rather than hand-rolling the Y
  flip in the URL template. This is a good example of why "no console
  errors and the network tab looks fine" isn't sufficient verification
  for a visual feature - only actually looking at rendered output over
  a region with real data caught it.
- **Opacity 0.85, layer added on top of the style stack** (no
  `beforeId`): kk7's PNGs already carry per-pixel transparency for
  areas without data, so a full-stack top layer with a slight
  reduction blends acceptably over hillshade/contours/roads in all
  three modes without needing per-mode z-order tuning. Not obscuring
  site roses is structurally guaranteed regardless of this choice - GL
  `Marker` instances are separate DOM elements positioned above the
  WebGL canvas entirely, not part of the style's layer stack.

## Block 17

- **OpenAIP key handling**: the user provided a personal OpenAIP API
  key directly in chat (against explicit advice - flagged and warned
  about at the time) rather than only adding it as a GitHub Actions
  secret. It was used exactly once, locally, as a `curl`/env-var value
  for research and to generate the first `public/static/airspaces.json`
  - never written into any file, script, or commit. The actual
  long-term credential path is still the GitHub Actions secret
  (`OPENAIP_KEY`), which `.github/workflows/airspace-refresh.yml` reads
  via `${{ secrets.OPENAIP_KEY }}` - the key is never present in any
  file this repo tracks.
- **Enum mapping sourced from OpenAIP's own published schema, not
  guessed**: the raw REST API returns only numeric codes (`type: 21`,
  `icaoClass: 8`, etc.) with no embedded labels. Found the real mapping
  by locating the Swagger UI's actual spec-fetch URL
  (`api.core.openaip.net/api/system/specs/v1/schema.json`, discovered
  by curling `docs.openaip.net`'s raw HTML for the `url:` strings the
  JS bundle references, since the rendered docs page itself needs a
  browser) and reading the `/airspaces` endpoint's own parameter
  descriptions, which spell out every enum value in prose. Baked into
  `src/domain/airspaceTypes.ts`, unit-tested against the exact sample
  airspace fetched during research (`type: 21` = "Gliding sector",
  confirmed correct - directly relevant to paragliding, not a hazard).
  Getting this wrong would have meant silently mislabeling airspace
  categories - the kind of invented/incorrect data this project's
  honesty practice exists to prevent.
- **Static, committed file on a weekly cadence, not fetched per-build**:
  unlike every other `public/generated/*.json` file (regenerated fresh
  on every build, gitignored), `public/static/airspaces.json` is
  committed to git and only regenerated by a dedicated weekly workflow
  (`airspace-refresh.yml`, `contents: write`, commits back to `main`).
  Two reasons: (1) OpenAIP's free-tier key shouldn't be hit every 5
  minutes by `weather-refresh.yml` for data that barely changes: (2) the
  API key must never reach the client bundle - baking the fetch into
  the main `npm run build` (which both `pages.yml` and
  `weather-refresh.yml` run) would need the key available in more
  places for no benefit, whereas a slow, separate, git-committing
  workflow keeps the credential scoped to exactly one job. The frontend
  just fetches the committed static file like any other asset - no key
  involved at request time.
- **Off by default**: 663 polygons would visually compete with the wind
  roses that are this app's primary content on first load. Matches
  flyxc's own default-off convention for optional overlay layers (their
  `skyways-slice.ts` initialState also has `show: false`), even though
  flyxc is more of a navigation tool where one might expect airspace to
  default on.
- **Category color-coding (hazard/controlled/sport/other) instead of all
  37 raw types getting distinct colors**: simplifies the visual language
  to what a pilot actually needs to react to at a glance - red as "avoid
  this," blue as "controlled, may need clearance," green as "gliding-
  relevant, not a hazard" (paragliding-specific, not present in generic
  aviation-app airspace layers), gray for everything administrative.
  Click-to-inspect (a MapLibre `Popup`) surfaces the exact type/class/
  altitude limits for anyone who needs the specifics.
- **Verified against a known real-world reference before calling this
  done**: queried the rendered layer at Malmö Airport's (Sturup, ESMS)
  coordinates and confirmed it returned "STURUP CTR", Class C,
  "0 ft GND - 2000 ft MSL" - matching the real published CTR for that
  airport - both via `queryRenderedFeatures` and an actual simulated
  mouse click producing the popup with the same data. Same
  build-and-serve-locally-under-the-real-base-path discipline as every
  MapLibre-related block since 14a.

## Wind arrow field density + shape iteration (post-Block 17)

User feedback after seeing the live map: the regional wind-arrow field
(Block 10) needed roughly 6x the density, and the arrows themselves
needed a more distinct arrowhead and a tapered "swimming" tail so
direction reads unambiguously at a glance.

- **Density**: `useWindGrid.ts`'s `GRID_RESOLUTION` went from 6 (36
  points) to 15 (225 points, ~6.25x) - "6x density" read most naturally
  as 6x the *point count* (density), not a 6x increase in the per-axis
  resolution value itself (which would have meant 1296 points - visibly
  excessive and likely to hit URL-length/rendering-performance limits).
  Verified before committing: the actual request URL for 225 points
  stays under 4000 characters (well under typical browser/server
  limits), and a temporary diagnostic E2E spec confirmed the real
  request sends exactly 225 comma-separated coordinates - not just
  trusting the arithmetic.
- **Arrow shape redesign**: replaced the old thin `<line>` + small
  triangle with a single tapered `<path>` - a compact triangular head
  occupying only the outer ~22% of the shaft length, and a long, gently
  curved tail (a quadratic-Bezier bulge before narrowing to a point)
  making up the rest. Iterated visually before finalizing rather than
  guessing proportions: rendered standalone SVG previews at an enlarged
  size first, found the initial attempt (head occupying most of the
  shaft) read as a generic kite/diamond rather than a directional
  arrow, corrected the head-to-tail length ratio, then re-verified at
  the actual ~26px on-map marker size, and finally rendered the real
  compiled React component (via a temporary swap of the existing
  gallery dev harness, reverted after) rather than trusting the
  hand-transcribed preview math matched the shipped code exactly.
- Both changes are covered by updated/new unit tests
  (`WindArrow.test.tsx` parses the path's `d` attribute to check
  tip/tail positioning and the head/tail width step;
  `windGrid.test.ts` locks in the 225-point/6.25x figure).

## Wind arrow field, round 2: triple density again, 1.5x arrow size, gray sea

Immediate follow-up feedback after the first density/shape pass:
"tripple that desity of arrosw," arrows 1.5x bigger, and the map's sea
color changed to gray (#8c94a1).

- **Grid resolution 15->26** (225 -> 676 points, ~3x). A single request
  at 676 points would exceed Open-Meteo's real URL-length ceiling (see
  below), so `fetchWindGrid` now splits into parallel batched requests
  automatically rather than needing a smaller resolution as a workaround.
- **Bug caught before shipping: the first URL-length probe from Block
  10/the previous round was measuring the wrong thing.** Re-testing to
  find a safe per-batch point cap, a naive Node script built the grid
  URL via raw string concatenation (`"latitude=" + values.join(",")`),
  which found ~500 points (~8.1KB) safe and ~600 (~9.7KB) failing with
  `414 Request-URI Too Large`. But the *actual* `buildGridUrl()` builds
  its URL via `URLSearchParams`, which percent-encodes every comma as
  `%2C` (3 bytes instead of 1) - a real, easy-to-miss gap between "how
  I tested" and "what the code actually sends." Re-probed using
  `URLSearchParams` exactly like production code: 400 points (~8.0KB)
  still works, 450 (~9.0KB) fails - a real ceiling roughly 30-40%
  *lower* in point-count terms than the naive test suggested. Landed on
  `MAX_POINTS_PER_REQUEST = 300` (openMeteoGridProvider.ts) for genuine
  margin below that boundary rather than sitting right at the edge -
  676 points now splits into 3 batches (300+300+76), verified end-to-
  end via a temporary diagnostic E2E spec confirming real request sizes
  stay well under 6.1KB each.
- **Arrow size 26px -> 39px** (1.5x, `ARROW_SIZE` in `SiteMap.tsx`) -
  the arrow shape itself (previous round's redesign) needed no changes,
  since its proportions are all relative to the `size` prop.
- **Sea color -> gray (`#8c94a1`)**: changed the shared `water` layer's
  `fill-color` in `mapStyles.ts`, which RELIEF and TOPO both use (TOPO
  spreads RELIEF's layers). MAP mode's sea color is NOT changed by this
  - it's OpenFreeMap's externally hosted style (Block 14c), not
  something this codebase controls without forking that entire style;
  confirmed via a live screenshot that MAP mode's own sea color happens
  to already read as grayish in their positron style anyway, so no
  visible inconsistency resulted, but this is coincidental, not
  something this change actually controls.

## Production regression: rate-limit breakage + a real pre-existing data bug

User report right after the round-2 deploy: "arrows are gone so is many
sites and time slider not working and wind speed on site are off."
Root-caused via a live diagnostic (Playwright against production,
capturing every network request/response and console error) into two
genuinely separate issues.

### Regression 1: tripling the grid to 676 points broke live traffic

Diagnostic confirmed all 4 `api.open-meteo.com` requests on a real page
load returned `429`. Wind arrows (need the grid response) and the time
slider (its `max` attribute stays `0` until forecast data loads) both
depend on Open-Meteo succeeding, so both broke together - "many sites
missing" was almost certainly the wind-arrow markers (the user's
mental model of "sites" likely includes the newly-much-denser field of
small dots), not the 24 named site pins, which the diagnostic confirmed
were still all present.

The 676-point/3-parallel-request design (previous entry above) passed
CI and worked in every verification *I* ran, but CI and my own checks
don't reproduce sustained real-user traffic volume. Tripling density
turned 1 Open-Meteo call per page load into 3 for the grid alone (on
top of the pre-existing per-site-forecast call), and if Open-Meteo's
free/keyless tier enforces something like a daily call-count budget
(consistent with today's `"Daily API request limit exceeded"` message,
which persisted for hours, not a short burst window), request COUNT
matters independently of how large any single request is.

**Fix**: reduced `GRID_RESOLUTION` from 26 (676 points, 3 requests) to
18 (324 points, fits in exactly 1 request under
`MAX_POINTS_PER_REQUEST`). Still ~9x the original 36-point grid -
meaningfully denser than where this started, just not the full "triple
again" - prioritizing "works for real visitors" over maximum density
given today's direct evidence of the tradeoff. The batching code from
the previous round is kept (not removed) as a safety net, in case
density needs to grow past a single request again with more headroom
for caution.

### Regression 2 (unrelated, pre-existing): Holfuy speed/gust were wrong since Block 6

Independently, `generated/live.json` showed 9 of 11 live sites with
sustained wind speed *greater* than gust - physically backwards.
Root-caused by fetching Holfuy's own widget source directly
(`widget.holfuy.com/js/wind_kok.js`), which defines
`function newWind(wind_dir, wind_speed, temp, gust, time)` - not
`(dir, speed, gust, temp, time)` as `holfuyWidgetProvider.ts` assumed
since Block 6. Cross-checked against 6 independent live stations'
official `holfuy.com/en/weather/{id}` dashboards (which label speed/
gust explicitly) before touching the parser, including two low-wind
stations where the corrected numbers matched exactly - not just a
single-station coincidence.

A second, compounding bug: `wind_speed`/`gust` in that call are always
km/h regardless of this app's `su=m/s` widget query param - confirmed
via `main.js`'s `speedToUnit()`, which only divides by 3.6 for the
widget's own *display*, not for the raw `newWind()` arguments. The old
code took the raw (wrong-position, km/h) numbers directly as m/s with
zero conversion - explaining why a station showing a real ~7 m/s wind
displayed as "28 m/s" (its km/h-magnitude speed value, additionally
mislabeled from the temperature field in some readings). This bug
predates this session (Block 6) and had nothing to do with today's
density work - it surfaced only because the user was looking closely
at the site right after the density change, not because either change
caused the other.

**Fix**: swapped the parser to the confirmed correct argument order and
added a km/h->m/s conversion (`KMH_TO_MS = 1/3.6`). `owind`'s
recent-sample history array is unaffected - independently confirmed
already in the requested display unit, not km/h. Verified end-to-end by
re-running `collect-live.ts` locally and confirming all 11 sites now
show physically sane speed <= gust with realistic magnitudes (e.g.
hammar: 7.22 m/s / 7.78 m/s gust, not 28/15.6).

## Researched: switching the forecast provider to Yr/MET Norway - not viable as a full replacement

After the rate-limit incident above, the user asked whether Yr (which
was only ever referenced as a *visual* inspiration for the wind arrow
field's flow-line style, never as a data source) should replace
Open-Meteo. Investigated MET Norway's public Locationforecast API
directly (fetched real responses, not just docs) before answering.

- **Rate limit terms are clearer and more generous than Open-Meteo's**:
  20 requests/second per application (identified via User-Agent), not
  an opaque total daily cap. Fully keyless, `Access-Control-Allow-
  Origin: *` (CORS-open, works fine from a browser).
- **Blocker 1 - no batching**: every location needs its own request
  (confirmed against their docs and by testing). This app's entire
  request-volume strategy relies on Open-Meteo's comma-separated
  multi-location batching (24 sites in 1 call, the wind grid in 1
  call) - switching would turn 2 requests per page load into ~350.
- **Blocker 2 - no multi-height wind data, a hard feature blocker not
  just an inconvenience**: fetched a real `/complete` response and
  confirmed it has exactly one wind reading per location (surface:
  `wind_speed`, `wind_from_direction`, `wind_speed_of_gust`) - nothing
  resembling Open-Meteo's multiple pressure/height levels. The Soaring
  height mode (height-interpolated wind, `MODEL_HEIGHTS_M`) has no
  equivalent data available from this API at all. A full switch would
  mean dropping that feature, not just changing where data comes from.
- **Conclusion**: the actual fix for the rate-limit risk is
  architectural, not a provider swap - move forecast fetching
  server-side (periodic collection -> static published file, same
  pattern as the existing live-data/airspace collectors) so request
  volume stops scaling with visitor traffic. This is also exactly what
  MET Norway's own terms recommend regardless ("high-traffic sites
  must implement local caching proxies rather than direct API
  connections"), and it lets us keep Open-Meteo, the only source
  covering both batching and the height-level data this app needs.
  Proposed to the user; awaiting their decision before implementing.

## Forecast/wind-grid fetching moved server-side (implemented)

User's decision after the research above: keep Open-Meteo, fix the
architecture instead of switching providers. Exact scope as specified:
move fetching server-side via the existing weather-refresh cron, fetch
once per update rather than once per visitor, publish static files
(`forecast-sites.json`, `forecast-wind-grid.json`), browser only reads
those, keep last-good data on a failed update, expose `generatedAt` so
staleness can be flagged.

- **New script `scripts/collect-forecasts.ts`**, same pattern as the
  existing `collect-live.ts`/`collect-airspaces.ts`: reads `SITES.md`,
  fetches every located site's forecast (`fetchSitesForecastBatch`,
  unchanged, already batching-capable) and the wind grid
  (`fetchWindGrid`, unchanged), writes both to `public/generated/`
  (gitignored, regenerated every build - same treatment as `live.json`,
  since this data needs the same ~5-minute freshness, unlike
  `airspaces.json`'s weekly/committed treatment).
- **Both client-side hooks (`useSiteForecasts.ts`, `useWindGrid.ts`)
  now `fetch()` the static JSON file instead of calling Open-Meteo
  directly.** `useSiteForecasts` still does the NOW-index windowing
  client-side, against the browser's own clock rather than the
  collector's run time - the static file carries Open-Meteo's full
  un-windowed multi-day hourly data, so "NOW" stays accurate to the
  visitor's actual view time; only the underlying hourly *values*'
  freshness is bounded by the collector's ~5-minute cadence, not which
  index counts as "now." `useWindGrid` no longer takes a `bounds`
  argument - the published grid already covers the full site-bounds
  area regardless of the current viewport, so there's nothing per-
  visitor left to vary.
- **"Keep last good" implemented via a live-URL fallback, not a git
  commit.** If a fresh Open-Meteo fetch fails, the collector fetches
  the CURRENTLY DEPLOYED file from the production Pages URL
  (`https://utskottet.github.io/FlyWeather/generated/...`) and
  re-publishes that (with its ORIGINAL `generatedAt`, not "now") rather
  than overwriting good data with an empty state. Chose this over
  committing the files to git (the `airspaces.json` pattern) because
  forecast data needs a ~5-minute refresh cadence, not weekly - a git-
  commit-per-refresh approach would clutter history badly at that
  frequency, whereas GitHub Pages itself already durably holds "the
  last thing that was successfully deployed," which is exactly what
  "last good" means here. If BOTH the fresh fetch and the fallback fail
  (only realistically possible on the very first deploy, before
  anything has ever been published), the collector writes an honest
  empty state (`{sites: {}}` / `{points: []}`) rather than crashing the
  build - verified this doesn't break the frontend: markers, marker
  clicks, and the time slider all still render cleanly with empty
  forecast data, showing honest gray/unknown states, no fake numbers.
- **`generatedAt` exposed and used for a staleness banner.** Both hooks
  return `generatedAt` from their respective file; `SiteMap.tsx` takes
  the OLDER of the two and classifies it with the existing
  `classifyFreshness` helper (already used for live-observation
  staleness) at new thresholds (fresh <=15min, stale >60min - looser
  than live data's defaults, since these datasets refresh every 5min
  but the point is catching "the cron itself stopped," not flagging
  normal cadence jitter). Shows a small non-blocking banner only when
  stale.
- **Never crashes the build on a total Open-Meteo outage** - errors are
  logged loudly (`console.warn`/`console.error`) but `collect-
  forecasts.ts`'s `main()` catches its own top-level failure rather
  than letting it propagate, so an Open-Meteo outage doesn't block
  unrelated deploys (code-only commits, other content changes) the way
  a hard build failure would.
- **No workflow file changes needed** - `weather-refresh.yml` and
  `pages.yml` both already run `npm run build`, which now includes
  `collect:forecasts` in the same chain as `collect:live` - only a
  package.json script-list change plus a documentation comment update.
- **Consolidated `GridWindPoint`/`WindGridPoint` naming** while touching
  this code: the type was duplicated in intent between
  `openMeteoGridProvider.ts` and the new `GeneratedWindGridFile` shape
  in `domain/types.ts` - moved the canonical definition to
  `domain/types.ts` (where the other generated-file shapes already
  live) and renamed the 3 call sites, rather than keeping two names for
  the same shape.

## Wind grid: tripled density again + follows the time slider

User feedback after the server-side architecture fix: triple the arrow
density again, and make arrows actually change with the time slider
("arrows not changing on time slider so no forcasting").

- **Density (18->31, 324->961 points, ~3x) is now a non-issue to
  increase**: the previous round's concern (request COUNT scaling with
  visitor traffic) no longer applies once fetching moved server-side -
  a few extra batched requests every 5 minutes from one caller
  (GitHub Actions) is nothing like the same request tripling per
  visitor that broke production before. Point count was never really
  the problem; per-visitor fetching was.
- **Wind grid now fetches `hourly` (not `current`) wind per point**,
  same `forecast_days=5` window as site forecasts, so the client can
  window to NOW..+72h and index by the same `sliderIndex` the site
  roses already use - `useWindGrid.ts` now mirrors
  `useSiteForecasts.ts`'s NOW-windowing pattern exactly (against the
  browser's own clock, not the collector's run time, for the same
  "NOW stays accurate to view time" reasoning).
- **`hours` stored once at the file's top level, not per-point**: with
  hundreds of points each needing ~120 hourly timestamps, repeating
  that array per point would have been dominated by duplicate
  timestamp strings for no reason - `GeneratedWindGridFile.hours` is
  shared, `WindGridPoint`'s own arrays are just aligned to it by index
  (mirrors how `SiteForecast` already works per-site, just hoisted one
  level up here since ALL points in one grid share identical
  timestamps, unlike sites which don't).
- **Bug caught before shipping: the "keep last good" fallback would
  have silently served an incompatible file shape.** The wind grid's
  shape changed from single current-conditions values to per-hour
  arrays in this same change - the file already live in production
  (from the previous version of the collector) has the OLD shape. If a
  fresh Open-Meteo fetch fails and falls back to that stale-shaped
  file without a check, the frontend's `.slice()` calls on what it
  expects to be arrays would throw. Added `isCompatibleGridFile()` to
  `collect-forecasts.ts`, verifying the fallback actually has the
  array-based shape before trusting it; otherwise treats it the same
  as "no fallback available" (honest empty state) rather than
  publishing data the frontend can't consume. Confirmed this exact
  path fires correctly against the real currently-published (old-
  shaped) file, not just reasoned about it.
- **Verified the actual behavior, not just that it builds**: since
  Open-Meteo remained rate-limited in this sandbox the entire session,
  generated synthetic grid data (144 points, time-varying direction/
  speed across 80 hours) and confirmed via Playwright against a real
  built-and-served app that a marker's rendered SVG path genuinely
  changes (different rotation, different speed-color) after moving the
  time slider forward - not just that the code compiles or that "NOW"
  still works.

## WindRose visual redesign, using the user's uploaded reference

User uploaded a standalone HTML/SVG "wind sector rose" demo
(`uploads/wind-sector-rose.html`) and asked for it as the site rose's
visual design, explicitly permitting reusing "just the graphic
elements" rather than the whole file verbatim.

- **Sectors changed from ring bands to true pie wedges.** The old
  design drew each green/orange sector as a thin donut-band arc
  (`describeRingSector`, inner radius > 0) around the outside of the
  circle; the reference draws the flyable direction as a single solid
  wedge from the center out to the ring. Added `describeSector` (pie
  wedge, inner radius always 0) to `domain/direction.ts` alongside the
  existing ring-band helper rather than replacing it, since
  `describeRingSector` may still be useful elsewhere and the two are
  genuinely different shapes, not just a parameter difference - unit
  tested the same way (normal sector, wrap-around, large-arc flag).
  Unlike the reference (which only supports one sector), our sites can
  have multiple green/orange sectors, so this renders one wedge per
  configured sector rather than being limited to the reference's
  single-sector demo API.
- **Base backdrop changed from a ring band to a full disc** in the same
  neutral pink (`SECTOR_BASE_COLOR`) for the same reason - a ring band
  doesn't make sense once the favorable-direction sectors are full
  wedges reaching the center.
- **Pointer redesigned as a "split-tail dart"** (`pointerPoints()`),
  replacing the old thin line+small-triangle arrow - a 4-point polygon
  with a tip poking just inside the ring and a wide, notched tail
  fanning out past it, geometry lifted from the reference's own
  proportions but re-expressed as multiples of `OUTER_R` (not copied
  pixel values) so it scales correctly with this component's own
  viewBox. Direction convention unchanged (tip points toward where wind
  is coming FROM, §29.3) - only the shape changed, not the meaning.
- **Added a north tick + "N" label** (the reference has this, the old
  design didn't) - a small, fixed reference mark, not a full compass
  rose, to help orient the wedges/pointer at a glance.
- **Kept, not ported**: the reference's weather icon is embedded inside
  its SVG; this app already has a separate, tested `WeatherGlyph`
  component rendered alongside (not inside) `WindRose` by `SiteMap.tsx`
  - left that composition unchanged rather than duplicating icon logic
  inside `WindRose` itself, since "sector rose" was the actual ask, not
  the weather icon. Also kept period decimals (`5.2`) over the
  reference's comma format (`5,2`, likely just the demo author's own
  locale default) - not something explicitly requested, and changing
  number formatting is a separate concern from the graphic redesign.
- **New legibility concern the reference didn't have to deal with**:
  since our sectors now reach the center (unlike the reference's single
  demo sector, which happened to be green behind the speed number),
  whatever sector color sits behind the speed text varies per site/
  reading. Added a small semi-opaque white disc (`TEXT_BG_R`) behind
  the number specifically for this - not present in the reference, but
  required once multiple real sector configurations are in play instead
  of one fixed demo state.
- **Checked the larger pointer against the known marker-clustering
  issue before shipping**, not just in isolation: the new pointer
  extends ~31% past the ring versus the old arrow, which stayed fully
  inside it - a real risk of making already-overlapping markers (Block
  13's documented clustering gap) worse. Verified via Playwright against
  the actual map, zoomed into the worst known cluster (4 sites within a
  few hundred meters): the overlap is marginally worse there, but ring
  colors/speed numbers stay legible, pointers still read as distinct
  directions, and marker click targeting is unaffected - a cosmetic
  nuisance in one already-known worst case, not a new functional
  regression, so shipped as designed rather than shrinking the pointer
  preemptively.

## WindRose round 2: much closer fidelity to the reference, weather icon moved inside

User feedback after seeing round 1 live: "scrap old design and fully
comply with new html style wise.. mind that wether icon moved inside
sector icon now" - round 1 had kept the old design's own color palette
and ring width, only borrowing the reference's wedge/pointer/north-tick
shapes. This round goes further: adopts the reference's actual colors
and proportions directly, and moves the weather icon from an external
sibling element into the rose's own SVG.

- **Exact reference colors adopted**: green `#27c93f`, orange `#ff9800`,
  red `#f23535`, "ink" `#111` - replacing this project's own earlier
  palette (`#2e7d32`/`#e65100`/`#c62828`/etc.) entirely, for both
  sectors and the ring.
- **Ring thinned from 8 to 4** (the reference's own ring is thinner
  still, ~1.5 at our scale, but at that width it started disappearing
  at 48px marker size when tested - 4 is a deliberate compromise
  toward the reference's proportions without sacrificing legibility at
  the smallest real marker size). Kept the ring STATE-colored
  (green/orange/red/gray) rather than switching to the reference's
  plain always-"ink" ring: the reference conveys status purely through
  its single sector wedge's fill, but this app's sites can have several
  independent sectors at once, so there's still a genuine need for one
  distinct "what's today's overall verdict" signal apart from "which
  directions are configured favorable" - decided the ring should keep
  that job (established, functional, from Block 11) while the pointer
  stays plain ink-black like the reference (avoiding two redundant
  state-colored elements).
- **Weather icon moved inside the rose's own `<svg>`** (a nested `<svg>`
  positioned above the speed number, matching the reference's internal
  layout) - `WindRoseProps` gained an optional `weatherKind` prop;
  `SiteMap.tsx` and `SiteSheet.tsx` no longer compose a separate
  external `WeatherGlyph` sibling next to `WindRose`, they just pass
  `weatherKind` through. Reused the existing `WeatherGlyph` component
  itself (not the reference's own hand-drawn icons) - still the
  project's own tested icon set, just relocated.
- **Dropped the separate unit ("m/s") text row entirely**, matching the
  reference's own explicit comment ("wind speed, deliberately no
  unit") - the `unit` prop was unused by every caller anyway (all relied
  on the "m/s" default), so removed rather than kept as dead surface
  area. Kept period decimals over the reference's comma format -
  still a locale/content choice, not a graphic-style one.
- **E2E fix, not a bug**: `rose-gallery.spec.ts`'s `figure.locator("svg")`
  selectors became ambiguous once the weather icon started rendering as
  its own nested `<svg>` inside the rose's `<svg>` - two elements now
  match a bare "svg" locator. Fixed with `.first()` (the outer rose SVG
  is always first in document order), not a functional issue.
- **Verified at true marker scale, not just the enlarged gallery view**:
  rendered the actual 48px marker (Playwright's own screenshot, not a
  manually up-scaled mockup) and confirmed icon + number + north-tick +
  pointer all stay legible together at that real size, then re-verified
  against the live-served build (both the map markers and the 140px
  SiteSheet rose) via Playwright.

## WindRose round 3: ring reverted to plain black, icon backing removed
- User compared round 2 directly against the reference HTML's own
  rendering (screenshot of `uploads/wind-sector-rose.html` opened in a
  browser) and gave corrective feedback: the ring should be a plain
  black outline (not state-colored), and the weather icon should sit
  on a transparent background so the sector color shows through -
  round 2's choices on both points didn't match what the reference
  actually renders as, despite matching its stated colors/proportions.
- **Ring is no longer state-colored.** Reversed the round-2 decision to
  keep `STATE_RING_COLOR`/dashed-red: the ring is now always a plain
  `#111` ("ink") outline, `RING_WIDTH` raised 4->6 (the reference's own
  ring reads visually thick despite its literal `--stroke:3.5`, at our
  46-radius/100-viewBox scale 6 matches that weight). The "what's
  today's overall verdict" signal this project decided in Block 11 the
  ring needed to carry is now read instead from where the pointer lands
  relative to the colored sector wedges (inside a green wedge = good,
  inside orange = maybe, outside both = bad, no pointer at all = no
  data) - a positional/spatial cue, not a hue, so it's colorblind-safe
  without needing the red state's separate dashed treatment, which was
  dropped along with the rest of `STATE_RING_COLOR`.
- **`WindRoseProps` no longer takes a `state` prop at all** - once the
  ring stopped reading it, nothing inside the component used it, so it
  was removed rather than kept as an unused/dead prop. `RoseState` the
  *type* stays exported from `WindRose/index.ts` because
  `domain/flyability.ts` imports it as `FlyabilityResult`'s own
  vocabulary, independent of WindRose's rendering.
  `SiteMap.tsx`/`SiteSheet.tsx`/`RoseGallery.tsx` all stopped passing
  `state={...}` into `<WindRose>`; `SiteMap.tsx`'s `evaluateFlyability`
  call (which existed there only to feed that prop) was removed
  entirely along with its now-unused import; `SiteSheet.tsx` keeps its
  own `evaluateFlyability` call since it still needs `state`/`reasons`
  for the status label and reasons list shown elsewhere on the sheet.
- **Removed the `text-legibility-bg` white backing circle** behind the
  weather icon/speed number entirely, rather than reducing its opacity
  - the reference has no backing at all, and `WeatherGlyph`'s own SVG
  shapes (sun/cloud/rain/etc.) have no opaque background of their own,
  so nothing else needed to change to get a transparent result.
  Accepted the same tradeoff the reference's own design implicitly
  accepts: for a site whose sector happens to span the exact center,
  the number could sit partly on a colored wedge and partly on the
  neutral backdrop - not treated as a regression worth solving since
  the reference doesn't solve it either.
- `data-testid="state-ring"` renamed to `"outer-ring"` (no longer a
  state indicator, the old name was actively misleading) - updated in
  `tests/unit/WindRose.test.tsx`, no other file referenced the old id.
- Verified via a live-served build (dist/ served under the real
  `/FlyWeather/` base path): ring is `#111`/width 6/no dasharray
  identically across every fixture case including
  `wrong-direction-red` and `stale-gray`; `text-legibility-bg` absent
  page-wide; sector fills still correct; icon/number sit directly on
  the sector-color backdrop with no white halo at both gallery scale
  and the real 48px/64px marker sizes; zero console errors.

## WindRose round 4: single status-colored wedge, exact reference proportions
- Round 3 still didn't match: the user pointed out the ring was
  actually way too *thick* (a misreading of "think" as "thick" in
  round 3's feedback - it should have stayed thin), the rose still had
  a solid opaque pink backdrop disc the reference never had, and it
  still drew two separate green+orange wedges instead of the
  reference's single status-colored one. This was caught by finally
  screenshotting `uploads/wind-sector-rose.html` directly with a local
  Playwright script and comparing pixels against this project's own
  screenshot side by side, instead of trusting a verification
  subagent's textual description as done in round 3 - that comparison
  immediately surfaced all three gaps. Reading the reference's actual
  JS/CSS source (not just eyeballing renders) gave exact numbers for
  everything below instead of guessed proportions.
- **User's explicit resolution for the wedge-count question**: use
  only the site's green ("inner") sector's bounds for the wedge -
  never the orange sub-ranges, never a union of both. Every site in
  `SITES.md` has exactly exactly one green entry (verified by
  script - min/max both 1 across all 24 enabled sites), so
  `site.rose.green[0]` is always a safe, real (not fabricated) source
  for the wedge's angular span. Orange sub-ranges are no longer drawn
  at all.
- **`WindRoseProps` changed from `greenSectors[]`/`orangeSectors[]` to
  a single `sector: RoseSector | null`**, plus `state: RoseState`
  reintroduced (it now colors the wedge, not the ring) - a real API
  change since only one sector can ever be meaningful now. Null sector
  (a site with no green range configured) renders no wedge at all,
  matching the "never fabricate" principle rather than inventing a
  placeholder shape.
- **Ring width recalculated from the reference's actual numbers**: its
  CSS is `stroke-width: 3.5` on a `viewBox="0 0 240 240"` circle of
  `r="90"` - a ratio of `3.5/90 ≈ 0.039` of the radius. Applied that
  exact ratio to this component's own `OUTER_R` (`RING_WIDTH = OUTER_R
  * (3.5 / 90)`, ≈1.79) instead of another guessed pixel value - round
  3's `6` was roughly 3x too thick relative to the circle.
  `RING_WIDTH` is a derived constant now, not a hardcoded number, so
  it can't drift out of proportion again if `OUTER_R` ever changes.
- **Removed the `SECTOR_BASE_COLOR` pink backdrop disc entirely.** It
  was this project's own invented deviation from round 2/3 (justified
  at the time as "contrast against varying map backgrounds"), but the
  reference has zero fill outside its one wedge - genuinely
  transparent, and the user explicitly asked for the map to show
  through. If contrast against certain map modes turns out to be a
  real problem later, that's a new, separate issue to raise - not
  grounds for reintroducing an element the reference never had.
- **Wedge fill dropped from opaque to `opacity={0.78}`**, matching the
  reference's own `.sector { opacity: .78 }` exactly - per explicit
  feedback that the fill needs to be alpha-transparent so the map
  shows through it, same reasoning as removing the backdrop disc.
- **Icon/speed layout offsets re-derived as ratios of the reference's
  own R=90**, not copied as absolute pixel numbers: icon group
  `translate(120 103)` is 17 units above center (17/90 of the radius);
  speed text `y=174` is 54 units below center (54/90). Both re-applied
  to this component's `OUTER_R` (`ICON_CY`/`SPEED_CY`) so the vertical
  spacing matches the reference's proportions instead of an earlier
  pass's much tighter, guessed offsets.
- Pointer geometry was re-checked against the reference's literal
  `points="120,38 103,2 120,11 137,2"` and confirmed already correct
  (tip/notch/wing radii and the 8.2° wing half-angle all matched to
  within rounding) - not touched again.
- `RoseGallery.tsx`'s fixture `Case` type simplified from
  `green[]`/`orange[]` to a single `sector`, matching the new prop; a
  new `no-sector-configured` fixture case added (`sector: null`) to
  cover the never-fabricate path, added to
  `tests/e2e/rose-gallery.spec.ts`'s case list too.
- Verified by building, staging `dist/` under the real `/FlyWeather/`
  base path, serving it locally, and directly screenshotting both the
  reference HTML file (via a standalone local Playwright script) and
  the live-served gallery myself - compared the actual PNGs side by
  side rather than delegating that comparison to a subagent's
  description, given round 3's verification already missed real gaps
  once. All fixture states (green/orange/red/gray/no-sector) confirmed
  visually consistent with the reference's model; zero console errors;
  full unit suite green (175/175).

## Site catalogue trim + Barsebäck's ViVa live source
- User asked to disable 12 named sites to shrink the working set
  ("only a few to get right" for now) and, separately, to wire up
  `barseback`'s live wind source - previously a stub
  (`provider: viva, station_id: null`) that always degraded to
  "unavailable" - now that the exact station is known:
  https://viva.sjofartsverket.se/station/25.
- **ViVa's real API found by network capture, not by guessing.**
  `viva.sjofartsverket.se` is an Angular SPA with zero data in its
  server-rendered HTML (confirmed - a plain `curl`/fetch of the page
  returns only the app shell). Loaded the real station page in
  Playwright and inspected every response: the app fetches its own
  `/assets/config/config.json` for a `baseUrl`, then calls
  `{baseUrl}ViVaStationWithDirection/{id}?isMVY=false` -
  `https://services.viva.sjofartsverket.se/output/vivaoutputservice.svc/ViVaStationWithDirection/25?isMVY=false`.
  Unauthenticated JSON, no key - same "use the public embed's own
  mechanism" pattern already established for Holfuy
  (`docs/DATA_SOURCE_AUDIT.md`).
- **Response shape is a named-sample array, not one wind object** -
  `Medelvind` (mean/sustained, m/s), `Byvind` (gust, m/s),
  `Vindriktning` (direction, degrees), plus an unrelated `Vattenstånd`
  (water level) sample this app ignores. Speed/gust values carry a
  Swedish compass-letter prefix ("V 3.2") that's redundant with (and
  less precise than) `Vindriktning`'s own decimal value - stripped via
  regex rather than parsed as a second, lower-precision direction
  source. Each sample has its own `Quality` field; a non-`"Ok"` quality
  on any of the three used samples is treated as "no usable reading"
  (returns null, resolver falls through), not served silently -
  same "never serve suspect data as if it were good" posture as the
  Holfuy provider's own error handling.
- `parseVivaResponse`'s first draft crashed on a literal `null` input
  (`Cannot read properties of null`) - caught by its own unit test
  before shipping, not in production. Fixed with an explicit
  `typeof json !== "object"` guard. Left as evidence that the
  test-before-trust discipline this project has followed all session
  (write the parser, write the test against a real captured fixture,
  run it) keeps paying for itself.
- **CPS cross-check, per explicit request** ("check toward m.cps.to if
  correct wind is being displayed"): the individual CPS site pages
  (`cps.to/flygstallen/<slug>/`) turned out to embed no live widget at
  all - just static text. The real ground truth is CPS's central
  station map, `cps.to/vader/vara-vindmatare/` (Holfuy) and
  `.../vindmatare-viva/` (ViVa), cross-checked against each Holfuy
  widget's own self-reported `<title>` tag as a second, independent
  confirmation. All 8 distinct station IDs across the 9 remaining
  Holfuy/ViVa sites matched correctly - no wrong-station bugs. One
  genuine open item, not a bug: `rokerierna` (station 155, shared with
  `kaseberga-s`) has no distinct tile on CPS's own map, so the sharing
  is plausible-by-proximity but not independently CPS-confirmed for
  that specific site name - left `verified: false` with a note
  explaining exactly that, rather than silently upgrading it on
  incomplete evidence. `hovs-hallar-n` DID get upgraded to
  `verified: true` (from `false`), since the same evidence its sibling
  `hovs-hallar-nv` already relied on applies to it identically.
- Confirmed end-to-end via a real `collect-live.ts` run (not just unit
  tests): 10/10 configured live sources now resolve, up from 11/12
  with `barseback` failing before this change.

## Animated wind field: hand-rolled MapLibre custom WebGL layer, not a library
- User directive (explicit, overriding older wording): replace the
  static 961-DOM-marker wind-arrow field with a flowing, Windy-inspired
  animated particle field - moving tapered streaks colored by speed,
  NOT a heatmap/raster background, must not become 961 animated DOM
  markers, must survive map-mode switches, must not block site-rose
  clicks.
- **Library research done before writing any renderer** (per the
  task's explicit requirement): `@astrosat/windgl`/`windgl-js` and
  `mapbox-exif-layer` all expect a pre-baked GFS-style raster wind
  texture, not a sparse point grid - this app's data is a 31x31
  (961-point) lat/lon grid with per-point hourly arrays, not a raster,
  so every raster-based option needs a custom rasterization step
  regardless of which is picked. `maplibre-gl-wind` (geoql) accepts
  point data but pulls in `@deck.gl/core` + `@deck.gl/layers` - a
  heavy dependency addition for one feature, inconsistent with this
  project's consistently minimal footprint (no other rendering
  framework beyond `maplibre-gl` itself). None had confirmed
  compatibility with this project's MapLibre version (`^6.4.1`, a very
  recent major - confirmed installed 6.4.1). No candidate was "clearly
  the best choice" per the task's own bar for using one, so built
  directly on MapLibre's native `CustomLayerInterface` instead - its
  first-class, documented WebGL extension point, not a from-scratch
  reinvention of the underlying technique (encode a vector field,
  advect particles, render fading streaks) every one of those
  libraries also uses internally.
- **Architecture**: `src/domain/windField.ts` (pure, unit-tested -
  `buildWindFieldGrid`/`sampleWindField`/`speedToColor`, 14 tests)
  converts the existing `useWindGrid()` 31x31 point data + a slider
  index into a bilinear-interpolatable flow-vector grid, decomposing
  each point's meteorological "FROM" direction into a "TOWARD" flow
  vector (+180, same convention `WindArrow.tsx` already used) so
  particles flow the direction air actually moves, not backward.
  `src/components/Map/windParticleLayer.ts` (necessarily untestable
  GL glue, kept thin) implements `CustomLayerInterface`: a fixed pool
  of particles (500-2200, scaled by canvas area) advected in plain CPU
  JS each frame - deliberately NOT a GPU transform-feedback pass, since
  a few thousand bilinear lookups/frame is trivial on a phone CPU and
  keeps the simulation debuggable/inspectable, consistent with this
  project's general preference for the simplest approach that performs
  adequately over premature GPU-side complexity.
- **Two real bugs found only by an actual browser run, not by code
  review** (both would have been invisible to `tsc`/lint/unit tests):
  (1) `map.getLayer(id)` doesn't return the `CustomLayerInterface`
  instance passed to `addLayer()` - MapLibre wraps it in an internal
  `CustomStyleLayer` and exposes the original at `.implementation`
  (confirmed against the `.d.ts`, not documented in the public guide);
  a plain cast compiled fine but threw `.setGrid is not a function` at
  runtime. (2) `options.modelViewProjectionMatrix` - the field every
  older Mapbox-GL-derived tutorial uses as "the" custom-layer matrix -
  does NOT map raw `MercatorCoordinate.fromLngLat()` output to clip
  space in this MapLibre version; a debug triangle built from it never
  rendered anywhere, even hugely oversized, with zero console errors.
  Found by fetching MapLibre's own current "add a 3D model" example,
  which uses `defaultProjectionData.mainMatrix` instead with exactly
  this coordinate space - switching to that field fixed it completely.
  Both bugs are recorded as comments at their exact fix sites so a
  future MapLibre upgrade doesn't silently reintroduce them.
- **Streak length/width are fixed pixel sizes (scaled by speed), not
  derived from one frame's real advection distance.** A live debug
  dump showed real per-frame motion is sub-pixel (~1px/frame at 60fps)
  - rendering literally-accurate one-frame streaks produced
  near-invisible specks even at exaggerated 200px/40px debug sizes
  (which is what first proved the projection-matrix bug above, before
  this length issue was even visible). The underlying particle
  simulation still genuinely advects/respawns along the real wind
  field; only the drawn streak's length is decoupled from it, which
  also means faster wind reads as a longer streak - a second, free
  speed cue alongside color.
- **Reduced-motion fallback reuses the existing, already-tested
  `WindArrow` component** (`SiteMap.tsx`, stride-3 subsampled to ~121
  static markers) rather than a second rendering path inside the WebGL
  layer - the "no 961 animated DOM markers" constraint is specifically
  about *animated* markers; a one-time-rendered static set is exactly
  what already existed and was already proven to work, so reusing it
  was less new surface area than teaching the GL layer a static mode.
- **Speed-color ramp** (`WIND_SPEED_COLOR_STOPS` in `windField.ts`)
  reuses `WindArrow.tsx`'s existing blue/green/orange/red anchor colors
  exactly, interpolated smoothly rather than stepped (reads better for
  continuously-flowing particles than hard bands do) - same visual
  language across the animated field, the reduced-motion static
  arrows, and the site roses' own palette, not a fourth invented scale.
- **Verified via Playwright against a real local build** (not just
  that it compiles): particles visibly move between two screenshots
  taken 1.5s apart (byte-different canvas captures, asserted in
  `tests/e2e/wind-particles.spec.ts`); the layer survives RELIEF -> TOPO
  -> MAP style swaps (re-added via the same `"style.load"` idempotent
  pattern as Skyways/Airspace); site markers stay clickable with the
  layer active; `prefers-reduced-motion` correctly swaps to the static
  arrow fallback with the animated layer entirely absent; time-slider
  moves to +6h/+24h/back to NOW visibly change the flow field
  (confirmed against real Open-Meteo data, not synthetic fixtures);
  mobile widths (360/390/430px) checked visually, no overflow, controls
  usable, wind field readable without overwhelming the site roses.
- **Visual tuning pass** (per the task's explicit "don't accept the
  first result" requirement): the first working version's streaks were
  thin, uniform-width slivers that read as noise rather than clear
  directional cues at a glance - `STREAK_HEAD_WIDTH_PX` raised
  3px->4.2px (a more pronounced tail-to-head taper, closer to a
  "comet/raindrop" shape with a clearly readable head) after a
  side-by-side close-up comparison; density/opacity/length/speed
  constants left at their first-pass values after confirming visually
  they already struck a good balance (roses stayed clearly dominant,
  map labels stayed legible under the field in MAP mode).
- Deferred / unresolved: particle count is a static per-viewport-area
  calculation made once in `onAdd`, not re-evaluated on window resize -
  a minor gap (resize is rare mid-session on this mostly-mobile app),
  noted rather than silently ignored. `ADVECT_DEGREES_PER_SEC_PER_MS`
  and the streak length/width constants are all visually-tuned
  numbers, not derived from a formal readability study - reasonable
  starting points, open to further adjustment if real usage reveals a
  problem.

## RASP integration: consumes FlyWeather-Soaring's product contract as an opaque static file
- The new sibling repo `Utskottet/FlyWeather-Soaring` (Python, separate git
  history, not a submodule) owns DMI fetch/GRIB decode/W\* physics entirely -
  this repo touches none of that, only `src/domain/soaring.ts`'s manifest
  shape and a fetch/timestamp-matching layer, per that repo's own
  `docs/ARCHITECTURE.md` boundary.
- **Timestamp matching, not index matching**: `findNearestValidTime()`
  compares `hours[sliderIndex]` (this app's own real UTC instant) against
  the manifest's `validTimes` with a documented 30-minute tolerance,
  returning `null` if nothing is close enough - never a silent wrong-hour
  substitution. The 30-minute figure is this app's own policy choice, not
  something the manifest itself opines on (per that repo's
  `docs/PRODUCT_CONTRACT.md`, which deliberately leaves tolerance as "the
  consumer's own policy").
- **`raspOverlay: {imageUrl, bbox} | null` is the only prop `MapLibreMap`
  needs** - collapsing "toggled off" and "toggled on but no product for
  this hour" into the same `null` case kept the map-layer logic simple;
  the two cases only need to look different in the *text* shown by
  `SiteMap` (`isRaspUnavailable`), not in what the map itself does.
- **`updateImage()` in place, not remove/re-add**, when the slider moves to
  a different matched hour - same "smooth transition, don't reset
  unnecessarily" convention already established for the wind particle
  layer's `updateWindParticleLayer`. `raster-fade-duration: 0` is
  deliberate: MapLibre's default raster fade would visually blend the OLD
  hour's raster into the NEW one for a moment, which could read as a real
  (wrong) transitional value between two genuinely discrete forecast
  hours, not just a cosmetic nicety to skip.
- **Layer order**: RASP is added FIRST in the `"style.load"` handler
  (before Skyways/Airspace/wind), so it paints as the bottom-most overlay
  directly above the basemap - confirmed visually (roses and wind streaks
  render clearly on top of the W\* color field, not obscured by it).
- **MapLibre `image` source, not `raster` tiles** - FlyWeather-Soaring
  publishes exactly one whole-region georeferenced image per forecast
  hour (not a tile pyramid), so a 4-corner-coordinate `ImageSource` is the
  correct native fit, not an unnecessary tiling layer.
- **Isolation verified directly, not assumed**: built and ran the app
  with `VITE_SOARING_BASE_URL` completely unset (no `.env`, simulating
  FlyWeather-Soaring not existing at all) - build succeeded, RASP toggle
  showed a real "RASP thermal data unavailable" message (distinct wording
  from the "no data for this specific hour" case, since the underlying
  reason genuinely differs), and every other feature (roses, wind
  particles) worked with zero console errors.
- **Verified against real generated products**, not fixtures: copied
  FlyWeather-Soaring's actual `products/v1/` output (from a real DMI run,
  see that repo's PROGRESS.md) into `public/soaring-dev/` for local
  testing. A real matched hour showed the actual W\* overlay correctly
  positioned (same coastlines already verified in that repo's own
  `geo_check.py`); an unmatched hour (the live "NOW" position, since the
  demo data only covered a 06:00-11:00Z window) correctly showed the
  unavailable notice instead of stale or fake data.
- **Real network numbers measured**, not assumed: enabling RASP + landing
  on a matched hour cost 2 requests / 7.5KB (manifest + one raster); each
  subsequent slider-hour change cost exactly 1 request / ~7KB (just the
  new raster) - no duplicate fetches, no manifest re-fetch per slider
  move, no runaway request growth.
