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
  "orange" both for genuinely borderline wind direction (near a sector
  edge) and for unverified speed data on any site that hasn't had its
  wind band confirmed yet. These are different situations shown as the
  same color. Options discussed: leave as-is, or visually distinguish
  "borderline" from "no data yet" (e.g. a different shade/pattern).
- **3-tier wind bands (green/orange/red)**: current schema only supports
  one min/max "good" band (`wind.min_ms`/`max_ms`); everything else is
  red. Klamby's real data (green 0-5, orange 5-6, red 6+ m/s) had to be
  approximated by folding the orange tier into red. Extending
  `windSchema`/`computeSpeedFit` to a real 3-tier band would let sites
  like this show a genuine "marginal" state instead.
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
