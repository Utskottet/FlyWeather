# Backlog

Small ideas and future improvements for FlyWeather (both this repo and
FlyWeather-Soaring) that aren't being actioned right now. Add a line
whenever something comes up mid-work that's worth remembering but not
worth stopping for. Prune freely - this is a list to revisit, not a
commitment log.

- **Wind rose weather-icon placement for multi-sector sites**: `weatherAngleFor`
  in `WindRose.tsx` picks the preset farthest from the *nearest* sector's
  midpoint (maximin) - correct for typical cases, but not exhaustively
  optimized for exotic multi-sector geometries (e.g. 3+ ranges clustered
  close together). Cosmetic only, not a correctness issue.
- **Orange color meaning is ambiguous**: `computeOverallState` returns
  "orange" for three different situations - borderline wind direction
  (inside a range's authored `margin_*_deg`), borderline speed (inside
  `wind.margin_*_ms`), and unverified speed data on a site whose band has
  never been confirmed. The first two are real "marginal, your call"
  warnings; the third is simply missing data, and showing it in the same
  color overstates what the app knows. Now that both marginal tiers are
  authored per site rather than derived from one constant, separating
  "borderline" from "no data yet" (a different shade or pattern) is worth
  more than it was - `FlyabilityResult` already carries the distinction
  in `directionFit`/`speedFit`, so only the rendering is missing.
- **Multiple sector ranges support was just added** (see WindRose.tsx/
  siteFile.ts/flyability.ts) - most sites still only need one range, but
  worth revisiting `weatherAngleFor` and rose layout if more multi-sector
  sites get added and the maximin placement starts looking wrong in
  practice.
- **`sjoboflyg` live-data provider not implemented**: Klamby's station
  config (`provider: sjoboflyg`, WeeWX/Ecowitt at vader.sjoboflyg.se) is
  wired in but inert - `providers/live/resolver.ts` only recognizes
  `holfuy`/`viva`. Needs a real provider implementation once the actual
  API/data format at that URL is inspected.
- **Site wind-verification backlog**: only Hovs Hallar N/NV have
  `wind.verified: true` so far. Every other site in the catalogue still
  shows `speedFit: "unknown"` (never green) until its real min/max safe
  wind speed is confirmed and entered, site by site.
- **`admin-experiment/` - standalone visual site editor prototype**:
  password-protected CRUD editor with a draggable compass-rose wind-sector
  tool (green core + authored orange margins on each side), built and
  iterated 2026-08-25. Isolated from this app's build/deploy (own
  package.json, own schema) - not connected to real site data yet, by
  design. See `admin-experiment/PROGRESS.md` for what was built and where
  to pick it up, `admin-experiment/README.md` to run it locally, and
  `docs/EDITOR_INTEGRATION.md` for what connecting it to the live site
  would actually take - the schema gaps and the three decisions that gate
  any of it.

- **Editor reliability — still open, and not touched by the Startvind UX
  Direction redesign** (the redesign only moved Add site into the header;
  none of these were fixed by it):
  - a site **move through the publishing Worker against the real
    repository is still unverified** - the move bug (commit e3767dc) is
    proven fixed by unit test and through the dev server only;
  - **19 of 32 sites are unreachable from the map** (archived or
    unlocated), so the editor cannot open them - a list view is still
    missing;
  - `admin-experiment/` is superseded by `src/components/SiteEditor/` and
    can be deleted whenever.
- **Add site is now visible to every visitor** wherever a publish target is
  configured (§ Startvind UX Direction chunk 1). Publishing is still gated
  by the Worker's sign-in, but the editor UI itself is now public - worth a
  deliberate yes/no at the chunk 1 visual review.
