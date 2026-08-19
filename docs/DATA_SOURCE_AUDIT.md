# DATA_SOURCE_AUDIT.md — Live wind source investigation

Required V1 deliverable per `MASTER_SPEC.md` §11.1 / Block 6 (`BLOCKS.md`).
Records what was tried, what works, and what's blocked — including
sources that turned out unusable, per AGENTS.md's rule that a blocked
source must be documented, not silently dropped.

## Holfuy

### `api.holfuy.com` (the official live-data API) — blocked, credential-gated

Fetched `https://api.holfuy.com/` directly and confirmed the official
documentation's own words: *"The API-s are protected with a password.
The API-s are mainly for station owners, but we can open the actual data
API for other users also for maximum 3 stations."* Third-party access
requires emailing `info@holfuy.hu`, is capped at 3 stations, and can be
revoked by the station owner at any time.

We have neither a password nor pre-arranged approval, and the project
already has more than 3 candidate stations (12 configured across
`SITES.md`). Per `AGENTS.md`, this is a genuine credential blocker, not
something to work around — no password was guessed, forged, or bypassed.

### `widget.holfuy.com` (the public embed widget) — used, not a bypass

`https://m.cps.to/`'s own public page embeds each station via
`<iframe src="https://widget.holfuy.com/?station=<id>&su=m/s&t=C&lang=en&mode=rose&size=400">`
— fetched the raw HTML directly (not through a browser-rendering tool) to
confirm this. Critically, **this URL carries no password parameter** —
it's a separate, intentionally public embed product from Holfuy (their
support docs call these "web modules"), distinct from the password-gated
API above. Requesting it directly returns `200 OK` with no login/session
requirement beyond an incidental auto-assigned `PHPSESSID` cookie.

This is the same mechanism any visitor's browser uses when loading CPS's
public page — not scraping a restricted endpoint, not forging a
credential, not exceeding any documented rate limit. The response is
server-rendered HTML with the live reading embedded directly in inline
JavaScript:

```js
var stattr = {"id":126,"short_name":"Ravlu","o_s":65,"o_e":110,"w_s":50,"w_e":125,...};
var owind=[[2.5,253],[3.1,246],[3.1,251],[3.1,252]]; // last 4 [speed, dir] samples
newWind(254, 7, 13.3, 10, '23:23'); // direction, speed(m/s), gust(m/s), ?, local HH:MM
```

Implemented as `src/providers/live/holfuyWidgetProvider.ts`, parsing
`newWind(...)` for the current reading and `owind` for recent-direction
history (see caveats below). No JSON API exists here — this is reading a
public embed's rendered output, which is the only mechanism available
without the restricted API's password.

**Caveats, documented rather than silently worked around:**
- The widget has no clean data timestamp — only a local `'HH:MM'` string
  with no date or explicit timezone. Rather than guess a timezone and
  risk silently misreporting freshness, the adapter uses the **time we
  fetched the widget** as the observation timestamp. This is honest and
  bounded: the widget's own `<meta http-equiv="refresh" content="300">`
  means the underlying reading is never more than ~5 minutes older than
  our fetch, matching the project's own 5-minute refresh cadence.
- `stattr`'s `o_s`/`o_e`/`w_s`/`w_e` fields look like Holfuy's own
  configured optimal/warning direction sectors (e.g. station 126 /
  Ravlunda: `o_s:65, o_e:110`, close to but not identical to our
  CPS-label-derived provisional 78.75–101.25° green sector). This is a
  potentially valuable cross-check for `SITE_DATA_AUDIT.md`'s sector
  verification, **not acted on in this block** — using it to flip
  `rose.verified: true` needs deliberate review, not an incidental
  byproduct of a live-wind block.
- `owind`'s recent-sample history is parsed and unit-tested
  (`parseHolfuyWidgetHtml`) but **not yet wired into the rose's history
  dots** — that needs extending the `LiveWindProvider` interface beyond
  Block 6's scope (single current reading). Deferred, noted as a
  follow-up rather than silently dropped.
- No station coordinates are present in the widget response, so
  `WindSample.lat`/`lon` stay `undefined` for Holfuy samples (the site's
  own `SITES.md` coordinates are used for map placement instead).

### Station ID coverage

Re-confirmed via the raw `m.cps.to` HTML (2026-08-18): stations `126,
127, 128, 155, 214, 215, 216, 217, 596, 597` are embedded. `215` and
`217` were **not previously recorded** anywhere in `MASTER_SPEC.md` or
`SITES.md` — likely corresponding to "Skäret" and "Hässleholm" from the
station-name list in `MASTER_SPEC.md` §11 (10 names, now 10 confirmed
IDs). Neither has a matching enabled `SITES.md` entry today, so no
station ID was added speculatively — this is left as a note for whoever
next extends the site catalogue, not acted on here (a scraper must never
auto-create sites, §4).

Collector run against all 12 currently-configured Holfuy sources
(2026-08-18): **11 succeeded, 1 failed** (`barseback`, whose configured
source is `viva`, not `holfuy` — see below, not a Holfuy failure).

## ViVa

Referenced in `SITES.md` for `barseback` (`provider: viva, station_id:
null`) but no adapter exists yet — `station_id` isn't even known. Not
investigated this block; the resolver skips unrecognized provider names
gracefully (tested in `tests/unit/resolver.test.ts`), so `barseback`
correctly degrades to "unavailable" rather than crashing anything.
Flagged as a real gap for a future block, not silently ignored.

## FindWind and other original station sources

Not investigated this block — no `SITES.md` entry currently names
`findwind` as a provider. Deferred.

## Summary

| Source | Status | Notes |
|---|---|---|
| `api.holfuy.com` (official API) | Blocked | Password-gated, 3-station cap for non-owners, requires email approval we don't have. Documented, not bypassed. |
| `widget.holfuy.com` (public embed) | **In use** | No password required; same mechanism CPS's own public page uses. 11/12 configured stations resolve successfully. |
| ViVa | Not implemented | `barseback`'s configured source; no station ID known yet. Degrades gracefully. |
| FindWind | Not investigated | No `SITES.md` entry references it yet. |

## Open-Meteo regional wind grid (Block 10)

Reuses the already-integrated Open-Meteo forecast API (no new source) -
verified live that it accepts comma-separated multi-location requests
(`latitude=55.4,55.9,56.2&longitude=...`), returning one entry per point
in request order. This lets the regional wind-arrow field (§9) work as a
genuinely live grid of current-wind samples rather than needing a
separate GRIB pipeline, which the user had explicitly offered as an
acceptable fallback if a live version proved too hard - it didn't.

Scope note: the grid shows **current** wind only, not tied to the time
slider (which drives per-site forecasts). Extending it to the slider
would multiply the request volume by ~73x per grid point for no proven
need yet - noted as a possible future enhancement, not built now.
