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

Sources (per `MASTER_SPEC.md` §21, §41):
- `https://www.cps.to/flygstallen/` — canonical index, confirms which sites
  are real flying-site pages vs. articles.
- Each individual CPS site page for coordinates, stated direction, ridge
  height, description, restrictions.
- `https://m.cps.to/` — cross-check against existing Holfuy roses/sectors
  where a site has one, and confirm Holfuy station IDs already recorded in
  `SITES.md`/`MASTER_SPEC.md` §11 are still current.

Deliverables:
- Update `SITES.md`: fill in `coordinates.lat/lon` for currently-null sites,
  set `coordinates.verified: true` only when taken directly from a CPS page
  or other reliable source (record which in the audit, not just in a commit
  message).
- Do **not** flip `rose.verified` or `wind_speed.verified` to true from CPS
  prose alone — §24 is explicit that compass-label sectors stay provisional
  until independently checked. Leave the wrap-around/orange bands as-is
  unless a page gives an exact degree.
- Create `docs/SITE_DATA_AUDIT.md` with the table specified in §21
  (coordinates verified? / sector verified? / speed limits verified? / live
  source verified? / soaring height verified? / unresolved notes) for every
  enabled site.
- Note any CPS entries that don't match `SITES.md` (new sites, renamed
  sites, removed sites) as findings, not silent edits — adding/removing a
  site from the map is a `SITES.md`-owner decision (§4), not something to
  do automatically.

Definition of done:
- Every enabled site has a coordinate (verified or explicitly still
  unresolved with a reason in the audit).
- `npm run validate:sites` still passes.
- `docs/SITE_DATA_AUDIT.md` covers all enabled sites.

If CPS pages are unreachable or a site's page can't be found, mark it
unresolved in the audit and move on — do not guess coordinates.

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
