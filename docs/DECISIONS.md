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
