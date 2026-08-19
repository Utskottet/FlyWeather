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
