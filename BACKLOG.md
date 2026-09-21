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
  - (`admin-experiment/` has since been deleted.)

- **RASP data is stale at source (FlyWeather-Soaring, not this repo)**:
  as of 2026-09-18 the published manifest is still model run
  2026-09-16T21:00Z, generated 2026-09-17T00:02Z, with coverage ending
  2026-09-19T09:00Z - so the overlay only exists for the first ~14h of
  this app's 72h timeline and is honestly "unavailable" for the rest.
  The publishing cron in FlyWeather-Soaring needs investigating; this app
  now states the real horizon and publish time in its unavailable notice
  so the failure is legible rather than looking like a broken map.

## Opened by the contribution work (2026-09-19 to 21)

Everything below came out of building open editing, the station finder
and the live-wind fix. None of it blocks the club release; all of it is
known rather than discovered later.

- **The admin layer does not exist.** The password still works and still
  issues a session, and an admin session is recorded in the edit log -
  but nothing uses it. Revert, hide and block are all "use git" today,
  which is fine for one operator and will not be for long. `SignInForm`
  and `/api/verify` are both live code with no caller, waiting for it.
- **A suggestion can never be marked done.** `data/issues.jsonl` only
  grows, so the Log page's list becomes less useful the more it is used.
  The open question is who may close one - anyone, attributed, the way
  edits work; or only an admin once that layer exists.
- **The stale-forecast banner is still tuned wrong.** It fires at 180
  minutes, and measured gaps between publish runs reach 318 - so it will
  occasionally cry wolf about a pipeline that is behaving normally for
  GitHub's scheduler. Now that live wind no longer depends on that
  pipeline, the threshold should be something like six hours.
- **`skyBand.ts` throws above the Arctic Circle.** `sunriseSunsetForDay`
  deliberately refuses to guess when suncalc reports no sunrise or
  sunset, which is correct - but the caller has no handler, so a site
  north of ~66.5° in summer would crash its marker rather than render
  oddly. Nobody has hit it because the catalogue is all southern.
- **The timeline's day/night band is drawn for one fixed point**
  (`SOUTH_SWEDEN_REPRESENTATIVE_LOCATION`, central Skåne). Correct within
  a few minutes for everything in the catalogue today; an hour out for a
  site as far north as Sundsvall in June. The site markers and panel
  already use each site's own coordinates - only the band does not, and
  `classifySkyBand` already takes a location, so this is a call-site
  change.
- **19 of 37 sites are still unreachable from the map** (archived or
  unlocated), so the editor cannot open them. A list view is still
  missing. This number went up, not down, as sites were added.
- **`SITES_INDEX.md` / `sites-index.csv` drift** whenever a site is added
  through the editor - they are generated from `sites/` by
  `npm run sites:index`, which nothing runs automatically. Worth folding
  into the deploy build.
- **No visitor counter.** `src/app/analytics.ts` supports Cloudflare Web
  Analytics and GoatCounter and has never been switched on; it needs two
  repository variables and no code. A *public* counter is a different
  thing and deliberately not built - it needs somewhere to store a
  number, which is the one thing this design has avoided throughout.
- **Station identity is not deduplicated.** Some ViVa stations are also
  SMHI stations, and airport locations overlap SMHI ones. The finder
  lists source records, not distinct physical instruments, and says so -
  but two entries for one anemometer will eventually confuse somebody.
- **Trafikverket and Windy are not implemented.** Both appeared in the
  station-finder prototype as "setup needed"; neither reader exists, and
  neither is offered anywhere in the app.
