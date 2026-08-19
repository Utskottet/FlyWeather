# BLOCKS.md — Token-budgeted execution plan

`MASTER_SPEC.md` defines *what* to build. This file defines *in what order and
in what size pieces* an autonomous agent session should build it.

## Why blocks exist

A single unattended run through all of `MASTER_SPEC.md` §35 (Milestones 0–7)
is too large for one session: it risks burning an entire day's token budget
in one go, and if the agent gets stuck deep inside it, nothing is left in a
reviewable, committed state.

Instead, work is split into **blocks** below. Each block is:
- small enough to comfortably finish, test, and commit in one session;
- large enough to be a coherent, demoable unit (not "create one file");
- independently verifiable by the human before the next block starts.

See `AGENTS.md` → "Block discipline" for the operating rule: **one block per
session, then stop.**

## How to use this file

1. Read `PROGRESS.md` to find the current block (`status: in_progress` or the
   first `status: not_started`).
2. Do only that block's work, per its Definition of Done.
3. Update `PROGRESS.md` (mark done, note anything deferred or discovered).
4. Commit.
5. Stop. Do not start the next block in the same run.

---

## Block 1 — Repo scaffold + SITES.md schema/parser

**Milestone:** 0 (partial)

Deliverables:
- TypeScript/Vite/React app skeleton per `MASTER_SPEC.md` §40 structure.
- `scripts/parse-sites.ts`: extracts the YAML block from `SITES.md`, validates
  with Zod, emits `public/generated/sites.json`.
- `npm run validate:sites`.
- Unit tests for schema validation (duplicate id, bad lat/lon, malformed
  wraparound sector — §31).
- CI workflow (`.github/workflows/ci.yml`): install, lint, typecheck,
  validate:sites, unit tests, build. No Playwright yet.
- `PROGRESS.md` and `docs/DECISIONS.md` created.

Definition of done:
- `npm run build` passes.
- `npm test` passes.
- `npm run validate:sites` passes against the current `SITES.md`.
- CI is green on GitHub.

Explicitly not in this block: map, rose, any UI.

---

## Block 2 — CPS site data research (coordinates + sector verification)

**Milestone:** 2, pulled forward because it unblocks the map and is a
fetch-heavy research task, not a coding task — keeping it separate avoids
mixing a large WebFetch/research budget with UI coding budget.

Pre-split by region into three sub-blocks (~24 enabled sites + the index +
m.cps.to is too many fetches for one confident session). Each sub-block ends
with its own commit and audit rows — do not combine sub-blocks even if
budget looks fine partway through.

Sources for all sub-blocks (per `MASTER_SPEC.md` §21, §41):
- `https://www.cps.to/flygstallen/` — canonical index, confirms which sites
  are real flying-site pages vs. articles. Fetch once, in Block 2a, and
  reuse the result (record it in `docs/SITE_DATA_AUDIT.md`) rather than
  re-fetching in 2b/2c.
- Each individual CPS site page for coordinates, stated direction, ridge
  height, description, restrictions.
- `https://m.cps.to/` — cross-check against existing Holfuy roses/sectors
  where a site has one, and confirm Holfuy station IDs already recorded in
  `SITES.md`/`MASTER_SPEC.md` §11 are still current. Fetch once, in 2a.

Shared rules for all three sub-blocks:
- Fill in `coordinates.lat/lon` for currently-null sites; set
  `coordinates.verified: true` only when taken directly from a CPS page or
  other reliable source (record which source in the audit, not just in a
  commit message).
- Do **not** flip `rose.verified` or `wind_speed.verified` to true from CPS
  prose alone — §24 is explicit that compass-label sectors stay provisional
  until independently checked. Leave the wrap-around/orange bands as-is
  unless a page gives an exact degree.
- Note any CPS entries that don't match `SITES.md` (new sites, renamed
  sites, removed sites) as findings, not silent edits — adding/removing a
  site from the map is a `SITES.md`-owner decision (§4), not something to
  do automatically.
- If a CPS page is unreachable or a site's page can't be found, mark it
  unresolved in the audit and move on — do not guess coordinates.

### Block 2a — index + m.cps.to + SE South/East region

Sites: `hammar`, `kaseberga-s`, `rokerierna`, `ales-stenar-sv`, `ravlunda`,
`vik`, `vitemolla` (7 sites).

Deliverables: fetch the index and m.cps.to once (per above), fetch each
listed site page, update `SITES.md`, create `docs/SITE_DATA_AUDIT.md` with
rows for this region plus a note of what the index/m.cps.to fetch found
(so 2b/2c don't need to re-fetch them).

Definition of done: all 7 sites have a coordinate or a documented
unresolved reason; `npm run validate:sites` passes; audit rows exist for
all 7.

### Block 2b — Öresund/West + Bjäre regions

Sites: `lernacken`, `brofastet`, `barseback`, `alabodarna`, `larod`,
`hoganas`, `molle`, `hovs-hallar-n`, `hovs-hallar-nv` (9 sites).

Deliverables/DoD: same shape as 2a, appended to the existing
`docs/SITE_DATA_AUDIT.md`. Do not re-fetch the index or m.cps.to; reuse
2a's findings.

### Block 2c — Ven + Denmark regions

Sites: `ven-n`, `ven-so`, `ven-sv`, `ven-v`, `dk-gilbjerg-hoved`,
`dk-strandbjerggard`, `dk-lokken`, `dk-dokkedal` (8 sites).

Deliverables/DoD: same shape as 2a, appended to the existing
`docs/SITE_DATA_AUDIT.md`. This sub-block completes Block 2 as a whole —
confirm all 24 enabled sites have audit rows before marking Block 2 done
in `PROGRESS.md`.

---

## Block 3 — Wind rose SVG component

**Milestone:** 1

Deliverables:
- Reusable SVG rose component (`src/components/WindRose/`) implementing
  §2.1–§2.4: sectors, wind arrow, center speed, history dots, overall-state
  styling, wrap-around sector math.
- Same component/geometry logic drives both marker-scale and expanded views.
- Unit/visual tests for the 12 acceptance criteria in §29 (north-up, 180°
  south sector, 225° arrow, wraparound 337.5°→22.5°, etc).
- Fixture-only data at this stage — no map, no live providers.

Definition of done:
- All §29 unit tests pass.
- Rose renders correctly at 48px, 64px, and expanded (120–200px) sizes.
- Component reviewed visually (screenshot or local preview) for at least the
  SW/S/E/N-wraparound fixture cases.

---

## Block 4 — Map integration

**Milestone:** 0 (remainder) + 2 (remainder)

Deliverables:
- MapLibre or Leaflet map (decide + record in `docs/DECISIONS.md`).
- Load `public/generated/sites.json`, place rose markers using the Block 3
  component and Block 2 coordinates.
- Auto-fit bounds to enabled sites (§3).
- Basic mobile-responsive full-screen map layout (§15.1, no time slider yet
  — that's Block 5).
- Tap-site opens a bottom sheet with static fixture data (§15.2 fields,
  wired to real site metadata, fixture weather values).

Definition of done:
- `npm run build` + local preview shows all enabled sites with valid
  coordinates on the map, correctly bounded.
- Sites still missing coordinates after Block 2 are visibly absent, not
  crashing the app.
- Mobile widths 360/390/430px checked.

---

## Block 5 — Forecast provider + time slider

**Milestone:** 3

Deliverables:
- Open-Meteo adapter behind the `ForecastProvider` interface (§10, §12).
- 72h hourly forecast, cached, normalized to the internal `WeatherKind` enum
  (§25) and `WindSample` shape.
- Time slider UI (§6, §15.1 bottom bar) driving rose + weather glyph updates
  without map viewport jumps.
- Weather glyph next to each rose (§8).

Definition of done:
- E2E: moving the slider NOW→+6h→+24h updates roses/glyphs without map
  jump (§30 items 3–4).
- No API call per slider tick after initial load (§26).
- Unit tests for wind unit and compass/degree conversions (§31).

---

## Block 6 — Live wind adapters

**Milestone:** 4

Deliverables:
- Investigate actual Holfuy access behind the CPS/m.cps.to display (§11.1)
  — document findings in `docs/DATA_SOURCE_AUDIT.md` regardless of outcome.
- `LiveWindProvider` adapter(s) for whatever sources prove legitimately
  usable (Holfuy and/or ViVa/other), source-priority resolver (§18).
- Freshness/staleness logic (§11.2) wired into NOW mode.
- Graceful degradation to forecast/unknown where no live source works.

Definition of done:
- NOW mode shows live data where a source works, clearly labeled
  observation vs. forecast fallback (§6.1, §30 items 9–11).
- `docs/DATA_SOURCE_AUDIT.md` records status of every source considered,
  including ones that were blocked/unusable and why.
- No credential bypass — if Holfuy needs auth we don't have, that's a
  documented blocker, not a workaround.

---

## Block 7 — Height mode

**Milestone:** 5

Deliverables:
- Surface / Soaring height global toggle (§7).
- Per-site `soaring_height.agl_m` wired to forecast-height extraction/
  interpolation.
- Sites without a configured/supported height show gray/unsupported, not
  silently surface wind (§30 item 6).

Definition of done:
- Toggle updates every rose without map jump.
- Effective height shown in detail panel.

---

## Block 8 — Autonomous deployment

**Milestone:** 6

Deliverables:
- `.github/workflows/pages.yml` — build + deploy on main push / manual
  dispatch.
- `.github/workflows/weather-refresh.yml` — ~5 min schedule, live refresh,
  conditional forecast refresh, concurrency guard, no history-spam commits
  (§13, §32).
- Health/diagnostics metadata in generated output (§33).

Definition of done:
- Public GitHub Pages URL serves the app.
- A scheduled refresh run completes successfully at least once and updates
  served data without a new commit per run.

---

## Block 9 — Polish

**Milestone:** 7

Deliverables:
- Mobile layout pass, outdoor-readability contrast pass (§28).
- PWA shell if practical (§27).
- Remaining `MASTER_SPEC.md` §38 "Definition of done for V1" items.

Definition of done:
- §38 checklist fully satisfiable by a pilot on a phone against the live
  Pages URL.

---

# Phase 2 — V1.1 blocks

V1 (Blocks 1–9 above) is done and live. These blocks are user-requested
additions gathered in a planning conversation on 2026-08-19, not part of
the original `MASTER_SPEC.md` scope for every item (flyxc-inspired
features and the Soaring/Winch mode are new scope; the map overhaul and
wind-arrow field extend §9's "regional wind indication," which V1
explicitly deferred). Same block discipline applies: one block per
session, commit, stop.

Ordered roughly by the priority signalled in that conversation — wind
arrows were called "the main thing"; flyxc features and Soaring/Winch
mode were explicitly flagged "maybe not this round."

## Block 10 — Regional wind arrow field

Deliverables:
- A field of wind-direction/speed arrows across the visible map area,
  in the spirit of Yr.no's wind map (tapered streak/arrow glyphs, not
  just site-marker roses).
- Investigate feasibility of a live/dynamic version first (e.g. a
  gridded wind-vector source rendered client-side). If that proves too
  costly for this stage, a static GRIB-derived arrow field is an
  explicitly acceptable fallback per the user - ship whichever is
  actually feasible rather than stalling on the ideal version.
- Must not visually compete with or obscure site roses (§9's existing
  constraint still applies): keep arrows visually secondary, sparse
  enough at typical zoom to stay legible, and site markers must render
  on top.
- Document the data source and its licensing/access terms in
  `docs/DATA_SOURCE_AUDIT.md`, same as every other external source in
  this project.

Definition of done:
- Wind arrows are visible across the map at a sensible density and
  clearly show direction (and ideally speed) independent of clicking
  any individual site.
- No credential bypass; if the chosen source needs a key/account, that's
  a documented decision, not a silent workaround.

## Block 11 — Rose overall-state visibility

Deliverables:
- Make the GOOD/MAYBE/BAD/UNKNOWN state read more clearly at a glance,
  per user feedback that the current outer-ring-only indicator is too
  subtle. Two concrete options raised: shift more of the state color
  into the center fill (where the speed number sits), or widen the
  ring. Pick whichever preserves rose legibility best; §2.1's
  "overall state visible mainly through border/background... without
  destroying the internal sector visualization" rule still applies -
  the green/orange sector wedges must stay clearly readable.
- Keep the existing red-dashed-ring accessibility cue (Block 9) working
  under whatever visual change is made here.

Definition of done:
- Visual comparison (before/after screenshots) shows a clearly more
  prominent state indicator.
- `tests/unit/WindRose.test.tsx`'s existing state-styling assertions
  still pass (sector geometry stays visible under every state).

## Block 12 — Time slider day/hour graduations

Deliverables:
- Add visible tick marks along the time slider track itself (not just
  the single floating label above it) marking hour and day boundaries
  across the 72h range, so a pilot can see at a glance where "tomorrow"
  or "+24h" falls without moving the slider.

Definition of done:
- Ticks render correctly across a full 72h range and visually align
  with the underlying hour indices.
- Works at the three tested mobile widths (360/390/430px) without
  crowding illegibly.

## Block 13 — Site coordinate coverage expansion

Deliverables:
- Attempt to resolve coordinates for as many of the 19 currently-
  uncoordinated enabled sites as legitimately possible, now using
  non-CPS sources (e.g. OpenStreetMap/Nominatim place-name lookups for
  villages/landmarks named in each site's description) - Block 2
  deliberately stayed CPS-only; this block is where that limitation
  gets revisited.
- Any coordinate resolved this way is inherently lower-precision than
  an on-site GPS reading (a village/landmark center, not the actual
  launch point) - mark `coordinates.verified: false` with a clear note
  explaining the source and its imprecision, never `true`, per §24's
  provisional-data rule extended to this new source type.
- Update `docs/SITE_DATA_AUDIT.md` per site, same format as Block 2.

Definition of done:
- More than 5 of 24 enabled sites are placed on the map.
- Every newly-added coordinate's audit row states its source and
  precision honestly.

## Block 14a — MapLibre + Mapterhorn: RELIEF mode (library swap)

This is the load-bearing block - swapping the map library itself. TOPO
and MAP (14b/14c) only add cartographic layers on top of what this
block establishes.

Deliverables:
- Replace Leaflet/react-leaflet with MapLibre GL, porting all existing
  functionality: site rose markers, click-to-open-sheet, zoom/bounds-
  fit behavior, the time slider and height-mode toggle's "no map jump"
  guarantee. Preserve existing application state/behavior - this block
  changes the basemap/terrain system only, per the user's own explicit
  instruction.
- Mapterhorn DEM (`https://tiles.mapterhorn.com/tilejson.json`) as a
  `raster-dem` source, rendered as a hillshade layer. Start around
  `hillshade-exaggeration: 1.0`, illumination ~315°, tuned aggressively
  (not subtly) so Skåne's modest terrain is actually obvious - if it
  looks too weak, push it further rather than reverting to plain
  cartography.
- A minimal water/land base (blue sea, pale land, coastline) - likely a
  stripped-down OpenFreeMap layer showing only water, with everything
  else (roads, labels, POIs, buildings) removed. RELIEF has no
  labels/roads/POIs at all.
- Overhead 2D view by default (no pitch), even if terrain geometry is
  enabled internally.
- The three-way `RELIEF | TOPO | MAP` mode selector UI, with RELIEF as
  the only working option this block - TOPO/MAP can be stubbed/disabled
  until 14b/14c land. Centralize each mode's style/config (one
  config/function per mode), not scattered per the user's instruction.
- Site rose/weather layers must render above terrain in every mode.

Definition of done:
- RELIEF visually verified (screenshots) at several zoom levels over
  Skåne - terrain differences must be obviously visible, not subtle.
- All existing E2E tests (site markers, click-to-sheet, time slider,
  height mode, no-map-jump) pass against the MapLibre implementation.
- Mode-switch UI exists and preserves zoom/center/bearing even with
  only RELIEF functional.

## Block 14b — MapLibre + Mapterhorn: TOPO mode

Deliverables:
- Contour lines generated from the Mapterhorn DEM (start ~5m minor /
  25m major, adjust after visually testing over Skåne's flat terrain),
  with elevation labels where practical.
- Major roads only, town/place names, lakes/rivers, quiet landcover.
- Hillshade stays present and visually dominant over the added roads/
  labels - this is not a step toward a street map.

Definition of done:
- TOPO visually verified over Skåne; contours are legible and useful
  given the flat terrain.
- Switching RELIEF ↔ TOPO preserves zoom/center/bearing, no map jump.

## Block 14c — MapLibre + Mapterhorn: MAP mode

Deliverables:
- Conventional clean orientation map via OpenFreeMap vector tiles
  (Positron-style starting point), hillshade reduced or removed.
- Roads, town names, normal labels, water, boundaries.
- Complete the three-way selector - all modes functional.

Definition of done:
- All three modes switch cleanly with no map jump and no loss of site/
  weather overlay state.
- Full E2E suite passes against the completed MapLibre implementation.

## Block 15 — Soaring/Winch site-mode switch

*Flagged by the user as "maybe not this round" - lower priority than
Blocks 10–14.*

Deliverables:
- A switch toggling which site set the map displays: the existing
  soaring/hang sites, or a winch-site set. `SITES.md` already has two
  winch entries (`winch-brandstad`, `winch-urasa`) sitting `enabled:
  false` specifically pending this - this block is where they activate.
- Winch sites likely need different rose/flyability semantics than
  ridge-soaring sites (e.g. runway direction/length, crosswind limits,
  not a green/orange soaring sector) - do not force soaring semantics
  onto winch sites; define what's honestly displayable for them, and
  mark anything unsupported as gray/unknown rather than guessing.

Definition of done:
- Toggle switches the displayed site set without a map jump.
- Winch sites show honest data only - no invented flyability rules.

## Block 16 — flyxc data source research

*Flagged by the user as "maybe not this round." Research only - no
implementation. Produces the groundwork for Blocks 17–19.*

Deliverables:
- Investigate flyxc.app's open-source repository for what it uses as
  data sources for: live pilot tracking, the Skyways thermal/soaring-
  route layer, and airspace boundaries.
- For each, determine: is it a public/free API or dataset, does it
  require a key/account, what are its licensing/attribution terms.
- Document findings in `docs/DATA_SOURCE_AUDIT.md`, same rigor as the
  Holfuy investigation - including anything that turns out blocked.

Definition of done:
- `docs/DATA_SOURCE_AUDIT.md` has a clear entry for each of the three
  features stating what's usable, what's blocked, and why.

## Block 17 — Airspace layer

Deliverables:
- A switchable (off by default or on - decide based on Block 16's
  findings and typical airspace-layer UX conventions) layer showing
  controlled/restricted airspace boundaries, per the source(s)
  identified in Block 16.

Definition of done:
- Layer toggles on/off without a map jump.
- Airspace boundaries render correctly over Skåne/Denmark against a
  known reference (e.g. cross-check a known controlled zone).

## Block 18 — Skyways layer

Deliverables:
- An always-on (no toggle, per the user's explicit instruction)
  thermal/soaring-route overlay, per the source identified in Block 16.

Definition of done:
- Layer renders on map load with no user action required, doesn't
  obscure site roses, degrades gracefully if the source is unavailable
  (never blocks the rest of the app from loading).

## Block 19 — Live tracking

Deliverables:
- Display live pilot positions on the map, per whatever mechanism
  Block 16 finds feasible (this may turn out to need its own tracker-
  integration decision beyond just reading flyxc's data, depending on
  what's actually available/licensable - treat that as a real open
  question, not an assumption).

Definition of done:
- At least one live (or near-live) pilot position renders on the map
  from a real data source, clearly labeled with its own freshness/age
  the same way live wind observations are (§11.2's pattern).

---

## Notes for whoever (human or agent) revises this list

- Blocks are ordered for dependency reasons (schema before data, rose before
  map, map before slider, etc.) except Block 2, which is deliberately
  pulled forward from its milestone-number position.
- If a block turns out too large mid-session, stop at a clean sub-point,
  record the split in `PROGRESS.md` (e.g. "Block 4a / 4b"), commit, and
  report rather than pushing through degraded or running out of budget with
  nothing committed.
- Do not silently merge two blocks into one session even if there's token
  budget left — the checkpoint is for human verification, not just to avoid
  running out of tokens.
