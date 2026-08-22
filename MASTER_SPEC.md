# South Sweden Paragliding Weather Map — Master Build Specification

**Working name:** PG South Weather  
**Version:** 0.1  
**Primary implementation agent:** Claude Code  
**Target hosting:** GitHub Pages  
**Primary users:** Paragliding pilots in southern Sweden and nearby Denmark  
**Primary device:** Phone / mobile browser; desktop also supported

---

## 0. Agent mandate

Build the application described here autonomously.

Do not stop after scaffolding or after producing a mockup. Continue through implementation, tests, browser verification, fixes, Git commits, GitHub Actions, and GitHub Pages deployment when repository access allows it.

The user should not have to supervise individual implementation decisions.

When a decision is not specified:
1. choose the simplest maintainable option;
2. record the decision in `docs/DECISIONS.md`;
3. continue.

Only stop and ask the user when:
- credentials or permissions are genuinely required;
- a data source cannot legally/technically be used and no reasonable fallback exists;
- two requirements directly contradict each other;
- a change would destroy existing user-maintained site data.

Never invent weather observations, station readings, site wind limits, or "safe" flying thresholds in production.

---

# 1. Product idea

The first question the application must answer is:

> **Where can I fly now, this afternoon, or tomorrow?**

This is not initially a RASP clone.

V1 is a fast, map-first paragliding weather tool built around a **Holfuy-style wind rose for every flying site**.

A pilot should be able to open the app, glance at the map, and immediately see:
- which sites fit the current/selected wind;
- wind direction;
- wind speed;
- whether the direction is ideal, marginal, or wrong for that site;
- whether the complete current condition is GOOD / MAYBE / BAD;
- current or forecast sun/cloud/rain condition;
- what happens as the time slider is moved forward;
- what the wind is expected to be near practical soaring height instead of only at surface level.

RASP / thermal / soaring forecast layers are explicitly a later phase.

---

# 2. Absolute core UI: the rose

> **Current, authoritative design note (FlyWeather Next UI milestone):**
> The rose's *concept* below (north-up, sector + direction + speed + state)
> is still current. Its *implementation detail* changed in one important
> way: only the site's single configured GREEN sector is drawn (there is no
> separate ORANGE wedge - marginal/uncertain conditions are conveyed by the
> whole-rose state color instead, per §2.2 as updated), the wedge is drawn
> semi-transparent (opacity ~0.78) so the map shows through it, and the
> weather graphic/speed number are no longer fixed above/below center - they
> adapt to the sector's position (see the new §2.5 below, which is the
> authoritative source for that behavior). Item 1 and parts of §2.2 below
> describing a *permanent green-AND-orange multi-wedge* rose are kept for
> archival context but are **obsolete** - do not implement against them.

This is the most important requirement in the project.

Do **not** replace it with:
- colored map pins;
- generic arrows;
- traffic-light dots;
- ParaglidingMap-style simple launch-sector icons;
- text-only wind indicators.

The icon must be conceptually modeled on the Holfuy `mode=rose` presentation used on `https://m.cps.to/`.

## 2.1 Rose contents

Each site rose is north-up and contains:

1. **Permanent site direction sectors** *(OBSOLETE - see the note at the top
   of §2. Kept for archival context; do not implement this multi-wedge
   version.)*
   - ~~GREEN sector(s): optimal wind directions for that physical flying site.~~
   - ~~YELLOW/ORANGE sector(s): acceptable but marginal wind directions.~~
   - ~~These sectors are site data and do not rotate with weather.~~
   - **Current behavior:** only the site's single GREEN sector is drawn
     (`RoseSector | null` in `WindRose.tsx`), filled with the *overall
     rose state* color (item 5 below), not a fixed green/orange scheme.
     There is no separate orange wedge. It is still site data and does
     not rotate with weather.

2. **Selected wind direction**
   - An arrow/pointer at or near the perimeter.
   - NOW: preferably fresh observed wind.
   - Future: forecast wind.
   - In soaring-height mode: model wind at the site's configured practical soaring height.

3. **Selected wind speed**
   - Large readable number in the center.
   - Unit: m/s by default.
   - Example: `5.2`.

4. **Recent direction history when actual observations support it**
   - Optional small dots around the perimeter for recent wind directions, following the useful Holfuy concept.
   - The latest samples should be visually distinguishable by size/opacity.
   - Do not invent history for forecast values.

5. **Overall rose state**
   - GREEN = weather fit is positively verified by configured site rules.
   - ORANGE = marginal / incomplete / uncertain but potentially usable.
   - RED = selected wind is outside configured usable conditions or violates a hard configured weather rule.
   - GRAY = no trustworthy data / stale data / no configured flyability rules.

**Current behavior:** the single green sector's fill color IS the overall
state color (`STATE_SECTOR_COLOR` in `WindRose.tsx`) - there is no separate
border/background treatment layered on top; the sector itself carries the
signal. The next subsection's "two independent color systems" framing is
obsolete for the same reason - there is now one sector, colored by state.

## 2.2 Important semantic distinction *(OBSOLETE framing - see above)*

~~There are two independent color systems~~ - this described the old
permanent-green-plus-orange-wedge design. Kept for archival context:

### A. Sector colors
Describe the **physical site orientation**:
- green direction wedges = optimal directions;
- orange/yellow wedges = marginal directions.

### B. Whole-rose state
Describes the **selected time's weather fit**:
- green = good;
- orange = maybe;
- red = bad;
- gray = unknown/stale.

**Current behavior:** there is only one sector (the site's GREEN range) and
it is always colored by (B), the whole-rose state - (A) as a separate
concept no longer exists in the implementation.

## 2.3 Direction convention

Wind direction follows meteorological convention:

`225°` means wind **coming from southwest**.

All internal directions use degrees:
- 0° / 360° = N
- 90° = E
- 180° = S
- 270° = W

The rose stays north-up.

Wrap-around sectors such as `337.5° → 22.5°` must work correctly.

## 2.4 Rose rendering

Implement the rose as reusable SVG/Canvas, preferably SVG for crisp rendering and testability.

Required at map-marker size:
- readable at approximately 48–64 px diameter;
- usable on high-DPI phones;
- still recognizable with many sites visible;
- label may be outside/below rose;
- selected site can enlarge.

Required expanded view:
- 120–200 px;
- site name;
- precise direction/speed/gust;
- source;
- observation/model age;
- status reason.

The map marker and expanded rose must use the same underlying component / geometry logic.

## 2.5 Adaptive weather/speed placement (current, authoritative)

Added in the FlyWeather Next UI milestone, on top of the single-sector
model in the note at the top of §2 - this is the current source of truth
for where the weather graphic and speed number sit inside the rose.

- The weather graphic is centered at `sectorMidpointDeg(sector) + 180°`
  (the point on the ring farthest from the colored sector) - computed via
  `src/domain/direction.ts`'s existing wraparound-safe
  `sectorMidpointDeg`/`polarToCartesian` helpers, not new angle math.
  It is **translated only, never rotated**.
- With no sector configured (`sector === null`), it falls back to the
  original fixed above-center position - there is nothing to avoid.
- The graphic is sized to roughly 35-40% of the rose's diameter (bold,
  high-contrast per `WeatherGlyph.tsx`) and is allowed to protrude ~10-15%
  past the outer ring - intentional, not a bug, so it stays large enough
  to read on small map markers.
- The speed number stays horizontally centered (never rotates) but nudges
  to whichever vertical half the weather graphic is *not* occupying, so
  the two never overlap regardless of sector position.
- Priority when space is tight (highest first): sector visible > weather
  readable > speed readable > weather may protrude past the ring > speed
  may move > N marker visible > never shrink everything to
  unreadability.
- Reference: `uploads/wind-sector-rose.html` is the visual authority for
  the rose's transparency/sector/pointer/weather+speed *composition*, but
  its fixed weather-above/speed-below placement is superseded by the
  adaptive placement described here.

---

# 3. Geographic scope

V1 should cover the actual CPS flying-site catalogue rather than an arbitrary rectangular "Skåne only" boundary.

Source seed:
`https://www.cps.to/flygstallen/`

The catalogue currently includes southern Swedish sites and several Danish sites.

The default map viewport should:
1. load enabled map sites from `SITES.md`;
2. compute their geographic bounds;
3. fit the map to those bounds with useful padding;
4. use a sensible max zoom-out so the map is not mostly empty sea.

Do not hard-code "Skåne" bounds if the enabled site catalogue changes.

Non-soaring CPS entries (winch fields, paramotor fields, school hills) may live in `SITES.md`, but V1 may set `enabled: false` until their map/flyability semantics are explicitly defined.

---

# 4. `SITES.md` is the human authority

`SITES.md` is the canonical, human-editable source defining what flying sites exist in this application.

A scraper must NEVER automatically create production map sites just because an external page contains them.

External sources may suggest updates, but `SITES.md` decides:
- whether a site exists in this app;
- whether it is enabled;
- coordinates;
- site type;
- description;
- source references;
- optimal/marginal direction sectors;
- wind thresholds;
- soaring-height setting;
- observation-source priority;
- special restrictions/notes.

This file will grow over time and eventually contain richer site knowledge.

## 4.1 Parsing strategy

`SITES.md` contains one fenced YAML data block.

Create a build tool that:
1. extracts the YAML block;
2. validates it against a schema;
3. produces generated JSON/TypeScript data for the app.

Do not parse arbitrary prose to determine safety/flyability.

Validation errors must fail CI.

---

# 5. Flyability / weather-fit engine

The app does not claim legal or operational safety.

It computes a **weather fit** from configured rules and displays it as GOOD / MAYBE / BAD / UNKNOWN.

UI language may simply show colors on the main map, but the detail panel must be able to explain the status.

## 5.1 Inputs

For a site and selected time:
- wind direction;
- average wind speed;
- gust speed if available;
- observation/model freshness;
- site ideal sector(s);
- site marginal sector(s);
- verified wind speed bands;
- optional gust limit;
- optional hard weather restrictions in future phases.

## 5.2 Direction result

- inside green sector -> `direction = good`
- inside orange sector -> `direction = maybe`
- outside all usable sectors -> `direction = bad`
- sector data missing -> `direction = unknown`

Boundary behavior must be deterministic and unit tested.

## 5.3 Speed result

Each site may define:

```yaml
wind_speed:
  verified: true
  good_min_ms: 4.0
  good_max_ms: 7.0
  maybe_min_ms: 3.0
  maybe_max_ms: 8.0
  hard_max_gust_ms: 10.0
```

**These numbers are only an example schema, not default flying values.**

If `verified: false`, do not silently substitute generic numbers and call the site green.

Suggested logic when speed limits are not verified:
- good direction + plausible live/forecast data -> overall ORANGE, reason `speed limits unverified`;
- bad direction -> RED is still allowed because direction is explicitly configured;
- no direction rules -> GRAY.

## 5.4 Overall result

A straightforward initial ruleset:

- Any hard-red rule -> RED
- Direction bad -> RED
- Missing/stale critical data -> GRAY
- Any important criterion uncertain/unverified -> ORANGE
- Any criterion marginal -> ORANGE
- All required criteria verified-good -> GREEN

Return structured reasons, e.g.:

```json
{
  "state": "orange",
  "reasons": [
    "direction is inside ideal sector",
    "site speed limits are not yet verified"
  ]
}
```

The UI must be able to show these reasons.

---

# 6. Time model

The time slider is a primary control, not a detail page feature.

Range:
- `NOW`
- through `+72 h`
- hourly forecast steps

The current-time part should feel immediate; future steps may be hourly.

Display useful local labels, e.g.:
- NOW
- 15
- 16
- 17
- ...
- MON 09
- MON 12

Timezone:
- Europe/Stockholm for Swedish display;
- internally store timestamps as ISO-8601 UTC;
- keep data timezone-safe around DST changes.

## 6.1 NOW

For `NOW`:
- prefer a fresh live observation associated with that site;
- expose observation age;
- if live data is stale/unavailable, allow model fallback but clearly mark the source as forecast/model;
- never present model data as an observation.

## 6.2 Future

For future positions:
- use forecast data;
- interpolate only when required and scientifically reasonable;
- do not fabricate minute-resolution precision from hourly forecasts.

---

# 7. Height mode

> **Current, authoritative design note (FlyWeather Interaction Model
> milestone):** The binary Surface/Soaring-height switch below is
> **obsolete** - replaced by a single nonlinear altitude slider running
> Surface -> 1500 m AGL (`AltitudeSlider.tsx` / `domain/altitudeAxis.ts`),
> shared globally across sites rather than each site's own
> `soaring_height.agl_m`. The underlying principles below still hold
> (Surface uses live/10m-model wind, other altitudes interpolate model
> data, never silently show surface wind as wind aloft) - only the *control
> shape* and *per-site vs. global* height source changed. Also see the new
> START button: moving the altitude slider above Surface now auto-enters
> Forecast mode, and START is the only way back to Surface + live wind
> together (superseding the standalone NOW button in §15.1 below).

Global two-state control:

`[ Surface ] [ Soaring height ]`

Changing this control updates every rose.

## 7.1 Surface

At NOW:
- use live station observation where available.

At future times:
- use model surface/near-surface wind (typically 10 m model wind).

## 7.2 Soaring height

Each site defines a practical target height in `SITES.md`, e.g.:

```yaml
soaring_height:
  agl_m: 150
  verified: false
```

This is **not necessarily the ridge height**. It is the height at which the pilot wants to understand the wind once established in the usable soaring air.

For soaring-height mode:
- use forecast/model wind at or interpolated to the configured site height;
- if a forecast provider offers discrete heights (e.g. 80, 120, 180 m AGL), interpolate where sensible;
- for larger heights use pressure-level/model-level data if available;
- show the effective model height in the detail panel;
- do not pretend a surface anemometer measures wind aloft.

If a site's soaring height is missing:
- keep the site visible;
- show gray/unsupported for that mode;
- detail reason: `soaring height not configured`.

---

# 8. Weather icon next to each rose

Every rose should have a small conventional weather-condition glyph close to it.

Examples:
- clear / sunny
- partly cloudy
- cloudy
- rain
- showers
- thunder
- snow if relevant

Use forecast/current condition for the selected time.

At map-marker scale this must remain secondary to the rose.

Do not clutter the rose interior with the weather glyph if it reduces wind readability.

---

# 9. Regional wind indication

Do NOT make Windy-style animated particles a V1 blocker.

The roses already provide site-specific wind direction and strength, which is the most useful signal.

V1 optional regional wind indication:
- sparse model wind arrows at a few map grid points or when sufficiently zoomed in;
- must be hideable;
- must not compete visually with site roses.

Animated particles / streamlines are a later enhancement only.

---

# 10. Data architecture

Use provider adapters.

Do not let UI code know how Holfuy, ViVa, FindWind, SMHI, Open-Meteo, or any other source is fetched.

Suggested interfaces:

```ts
type WindSample = {
  sourceId: string;
  sourceKind: "observation" | "forecast";
  stationId?: string;
  lat: number;
  lon: number;
  timestamp: string;
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
  temperatureC?: number | null;
  quality?: "good" | "suspect" | "stale";
};

interface LiveWindProvider {
  fetch(sourceConfig: SiteLiveSource): Promise<WindSample[]>;
}

interface ForecastProvider {
  fetchSiteForecast(site: Site): Promise<SiteForecast>;
}
```

Normalize everything to:
- m/s;
- degrees;
- UTC timestamps;
- explicit nulls rather than magic numbers.

---

# 11. Live observation sources

Seed observation research from:
- `https://m.cps.to/`
- Holfuy public station widgets
- CPS weather links / ViVa
- useful FindWind entries
- any better original/source station feed discovered during implementation

Current CPS mobile weather page exposes Holfuy widgets for:
- Hammar
- Kåseberga
- Ravlunda
- Vik
- Ålabodarna
- Skäret
- Höganäs
- Hovs Hallar
- Mölle/Kullens Fyr
- Hässleholm

Known Holfuy station IDs from the current CPS page:
- Hammar: 214
- Kåseberga: 155
- Ravlunda: 126
- Vik: 596
- Ålabodarna: 216
- Höganäs: 128
- Hovs Hallar: 127
- Mölle/Kullens Fyr: 597

The agent must verify these during implementation rather than treating this document as eternally current.

## 11.1 Holfuy limitation

Do not assume unrestricted official API access.

The official Holfuy API page states API access is mainly for station owners and other users may be limited to a small number of stations.

Therefore:
- build Holfuy as one adapter;
- investigate the actual legally/technically appropriate feed behind the public CPS/Holfuy display;
- do not bypass access controls;
- do not make the entire product depend on a private credential we do not have.

If Holfuy cannot be reliably fetched:
- continue building the whole app;
- use another legitimate nearby observation source where available;
- show unsupported/unknown rather than fake live values;
- record the blocked source in `docs/DATA_SOURCE_AUDIT.md`.

## 11.2 Freshness

Suggested defaults, configurable:
- `fresh`: <= 10 min
- `aging`: >10 and <=30 min
- `stale`: >30 min

Stale observation values may be shown in detail but must not masquerade as current.

---

# 12. Forecast provider

V1 preferred convenience provider: Open-Meteo, behind a provider abstraction.

Useful fields:
- wind speed/direction near surface;
- wind speed/direction at available above-ground heights;
- gusts;
- cloud cover;
- precipitation;
- weather code;
- temperature;
- later: pressure-level/model-level wind.

Do not hard-wire the domain model to a single API's field names.

Cache forecast requests.

72 hours of hourly site forecast is enough for V1.

---

# 13. Static hosting + scheduled data refresh

Target architecture:

```text
GitHub Actions
    |
    +-- validate SITES.md
    +-- collect/normalize live observations
    +-- refresh forecast when stale
    +-- build application
    +-- write generated data bundle
    +-- run tests
    +-- upload Pages artifact
    +-- deploy GitHub Pages
             |
             v
       phone / browser
```

GitHub Pages remains static.

Scheduled GitHub Actions may perform server-side fetching and generate the deployed data files.

Important:
- GitHub Actions supports a minimum scheduled interval of 5 minutes;
- scheduled jobs can be delayed, so treat this as near-live, not guaranteed telemetry;
- design the UI to show timestamps/age so delay is visible.

## 13.1 Avoid unnecessary work

A 5-minute workflow may:
- refresh live data;
- reuse cached forecast if forecast is still fresh;
- rebuild/deploy only required assets.

Forecast data does not need to be refetched every 5 minutes.

Keep the collector fast.

---

# 14. Suggested technology

Unless a clearly better reason is documented:

### Front end
- TypeScript
- React
- Vite
- MapLibre GL JS **or** Leaflet
- SVG rose component
- responsive CSS
- PWA-capable structure

Choose MapLibre if the selected basemap and marker strategy stay simple. Choose Leaflet if it materially reduces complexity. Record the decision and continue.

### Validation/data
- YAML parser
- Zod or equivalent runtime schema validator
- generated JSON from `SITES.md`

### Tests
- Vitest for pure logic
- Playwright for browser/e2e
- screenshot/visual checks for rose geometry and mobile map

No heavy backend framework in V1.

---

# 15. Main mobile UI

> **Current, authoritative design note (FlyWeather Interaction Model
> milestone):** The layout below is **obsolete** - there is no top control
> area at all now (kept clean per the new interaction model), and controls
> live in a compact two-row area directly above the timeline instead:
> row 1 is RIDGE/WINCH + single-label RASP/AIRSPACE/WIND/ROADS toggles +
> the live/forecast provenance line; row 2 is the START button + the
> Surface-1500m altitude slider (§7 as updated). The per-site
> Surface/Soaring segmented control and the standalone NOW button are both
> gone - START now resets time + altitude + live wind together in one tap,
> and is the app's only way back to live mode (moving either slider away
> from its START value auto-enters Forecast, and never auto-reverts even
> if the sliders happen to scrub back to their start values). The 3-way
> Relief/Topo/Map basemap selector introduced in a later block is also
> gone, replaced by a single ROADS toggle (off = Relief, on = Topo).

## 15.1 Initial screen

Full-screen map.

Top compact control area:
- app title or simple logo;
- Surface / Soaring height segmented control;
- optional layers button.

Map:
- custom rose marker for every enabled site;
- small weather glyph beside rose;
- site name at useful zoom;
- clustering should be avoided if it hides flyability; use collision/label strategy instead.

Bottom:
- time slider occupying most of width;
- selected time label;
- NOW button to jump back to current time.

## 15.2 Tap a site

Open a bottom sheet, not a full-page navigation by default.

Show:
- expanded rose;
- site name;
- GOOD / MAYBE / BAD / UNKNOWN;
- selected timestamp;
- wind direction;
- average wind;
- gust;
- weather;
- Surface/Soaring effective height;
- source name;
- observation/forecast age;
- short status explanation;
- site description;
- important site note/restriction if configured;
- link to original CPS site page.

Future feature: miniature 24 h strip for this site.

---

# 16. Map behavior

- Store map position while moving the time slider.
- Time changes must update markers without map jumps.
- Height-mode changes must update markers without map jumps.
- Initial viewport fits enabled sites.
- On mobile, markers must be touchable.
- Do not make markers enormous; preserve geographic overview.
- At low zoom, prioritize the rose over long labels.
- Selected marker comes to front.
- Respect coastline/geography; do not use a stylized pseudo-map as the operational map.

---

# 17. `SITES.md` maintenance UI philosophy

The app does not need a graphical site editor in V1.

`SITES.md` is intentionally easy to edit in Git.

Create:
- schema validation;
- human-friendly CI error messages;
- `npm run validate:sites`;
- generated `public/generated/sites.json`.

When adding a site:
1. edit `SITES.md`;
2. validate;
3. build;
4. map updates automatically.

No source-code edit should be necessary.

---

# 18. Data source selection per site

Each site can list sources in priority order:

```yaml
live_sources:
  - provider: holfuy
    station_id: "214"
    priority: 1
  - provider: viva
    station_id: "..."
    priority: 2
```

Support source metadata:
- station coordinates;
- distance from site;
- known exposure notes;
- reliability notes;
- whether source is on-site or proxy.

The first technically available station is not automatically the best.

Create a resolver that chooses the highest-priority fresh valid source.

For sites without on-site stations, research and document the best proxy station in `SITES.md`.

---

# 19. Site restriction model

Weather-fit is not the same as "site is open".

Add future-proof optional fields:

```yaml
restrictions:
  - type: military_range
    severity: hard
    message: "Check current firing status before flying."
    status_provider: null
```

For V1:
- show configured warnings;
- do not automatically scrape legal/restriction status unless a reliable source and explicit logic are added.

A future hard closure can override weather green.

---

# 20. Data quality and provenance

Every displayed dynamic value must know:
- source;
- timestamp;
- observation vs forecast;
- age;
- effective altitude.

Never blend values invisibly.

If live direction comes from one source and weather icon from a forecast source, that is okay, but the detail panel must make provenance inspectable.

Production must not contain fake fixture weather.

Fixture weather is allowed only:
- automated tests;
- Storybook/component development if used;
- explicit local demo mode.

---

# 21. Site research workflow for Claude Code

Before claiming V1 site data is complete:

1. Parse the CPS flygställe index.
2. Compare it with `SITES.md`.
3. Identify actual flying-site pages vs articles.
4. For each enabled site collect:
   - canonical name;
   - type;
   - coordinates;
   - CPS stated wind direction;
   - CPS ridge/site height if stated;
   - experience note if useful;
   - short description;
   - CPS source URL.
5. Compare existing Holfuy roses on `m.cps.to`.
6. Verify permanent rose direction sectors where possible.
7. Find the best live wind source:
   - on-site Holfuy first where appropriate;
   - CPS-linked station;
   - ViVa;
   - FindWind/original station source;
   - other legitimate nearby source.
8. Record provenance.
9. Do not infer verified speed limits from vague prose.
10. Mark unresolved values explicitly.

Create `docs/SITE_DATA_AUDIT.md` with a table:
- site
- coordinates verified?
- sector verified?
- speed limits verified?
- live source verified?
- soaring height verified?
- unresolved notes

This audit is a required V1 deliverable.

---

# 22. Initial CPS catalogue expectations

The CPS index currently exposes entries including:

### Denmark
- Dokkedal
- Gilbjerg Hoved
- Løkken
- Strandbjerggård / Rågeleje

### Swedish hang / soaring entries
- Hovs Hallar N
- Hovs Hallar NV
- Ven N
- Ravlunda / Haväng
- Vik
- Vitemölla
- Kåseberga S
- Lernacken
- Rökerierna / Kåseberga SO
- Ven SO
- Kullaberg / Mölle
- Ales stenar / Stenarna
- Hammar / Hammars backar
- Laröd / Larödbaden
- Ven SV
- Brofästet
- Ven V
- Ålabodarna
- Höganäs
- Barsebäck

The index also currently lists non-core entries such as paramotor and winch fields. Preserve them in the site catalogue if useful, but keep V1 map scope focused on rose-compatible soaring/hang sites unless the site record explicitly enables another type.

The agent must re-check the live CPS index because the catalogue can change.

---

# 23. Site direction seeds from CPS

The existing CPS pages provide useful textual seeds such as:
- Hammar: SV
- Kåseberga: S
- Ravlunda: O/E
- Vik: O/E
- Vitemölla: ONO/ENE
- Lernacken: SSO–SSV/SSE–SSW
- Kullaberg/Mölle: SSV–VSV/SSW–WSW
- Ålabodarna: V–SV/W–SW
- Höganäs: VNV/WNW
- Barsebäck: VNV–NNV/WNW–NNW
- Hovs Hallar N: N
- Hovs Hallar NV: NV–NNV/NW–NNW
- Gilbjerg Hoved: NNV/NNW
- Løkken: V–NV/W–NW
- Strandbjerggård: NV/NW
- Dokkedal: O/E

These are seeds, not necessarily precise green/orange boundaries.

The job of the site audit is to turn them into explicit degree sectors with provenance.

---

# 24. Safety of inferred sector data

It is acceptable to create a **provisional direction geometry** from a CPS compass label so the UI can be developed.

It is NOT acceptable to mark such geometry `verified: true` unless it was checked against a reliable site source / existing Holfuy configuration / human review.

Provisional geometry should result in at most ORANGE overall status when another important site parameter is unverified.

This prevents Claude from creating false precision.

---

# 25. Weather icon rules

Map forecast weather codes into a small stable internal enum:

```ts
type WeatherKind =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "showers"
  | "thunder"
  | "snow"
  | "unknown";
```

Do not bind UI directly to provider-specific numeric codes.

---

# 26. Performance targets

On a normal modern phone:
- first useful map render: aim < 3 s on reasonable 4G/Wi-Fi;
- time-slider marker update: effectively immediate (<100 ms after data is loaded);
- height toggle update: effectively immediate;
- no full page reload when moving time;
- no API call for every slider tick after forecast bundle is loaded.

Precompute/cache site-time results as appropriate.

---

# 27. Offline / PWA behavior

Nice-to-have for V1, not a blocker:
- installable PWA;
- cache application shell;
- cache latest successfully fetched site/forecast bundle;
- clearly indicate when cached weather is old.

Never make offline cached data appear current.

---

# 28. Accessibility / visual rules

- Do not rely solely on red/green hue.
- Overall state also gets an icon/shape/text in expanded view.
- Keep central m/s number high contrast.
- Sector boundaries should remain visible in dark/light basemap conditions.
- Minimum touch target around markers should be larger than the visual rose if necessary.
- UI should work in bright outdoor light.

---

# 29. Acceptance tests — rose

> Items 5, 6 and 10 below predate the single-sector model (§2's current
> authoritative note) and are superseded as noted inline; kept for
> archival context rather than renumbered/deleted.

Mandatory unit/visual tests:

1. North-up geometry.
2. A 180° sector appears on south side.
3. A 225° wind arrow points to SW source direction correctly.
4. Wrap-around green sector 337.5°→22.5° renders correctly.
5. ~~Multiple green sectors render.~~ **OBSOLETE** - a site has exactly one
   (or zero) green sector now (`RoseSector | null`); this no longer
   applies.
6. Green site sector remains fixed when wind changes (its position is
   site data; only the weather graphic/speed number move, adaptively -
   see §2.5). *(Originally: "Green and orange site sectors remain fixed";
   there is no separate orange sector to test.)*
7. Wind arrow rotates with selected data.
8. Center speed changes with selected data.
9. Recent direction dots appear for observation history only.
10. Overall green/orange/red/gray state color does not hide the sector
    geometry, and the adaptively-placed weather graphic does not obscure
    the sector either (§2.5) - verified for the mandated sector-angle
    cases in `tests/e2e/rose-gallery.spec.ts`.
11. Rose remains readable at 48 px and 64 px.
12. Expanded rose uses identical angle semantics.

Take Playwright screenshots for:
- Hammar-like SW case;
- Kåseberga-like S case;
- Ravlunda-like E case;
- N wraparound case;
- wrong-direction red case;
- unverified orange case;
- stale gray case.

Additionally (FlyWeather Next UI, §2.5's adaptive placement) - synthetic
sector-angle cases covering every quadrant plus narrow/wide/wraparound
edges: 0-40°, 70-120°, 150-210°, 240-300°, 310-350°, a very narrow sector,
a very wide sector, and a wraparound sector (e.g. 330-30°). Implemented as
the `adaptive-*` fixtures in `src/dev/RoseGallery.tsx`, asserted in
`tests/e2e/rose-gallery.spec.ts`.

---

# 30. Acceptance tests — map/time

Mandatory E2E tests:

1. App opens to map with enabled sites.
2. Initial map bounds include enabled sites.
3. Moving NOW → +6 h updates roses without changing map viewport.
4. Moving +6 h → +24 h updates weather glyphs.
5. Surface → Soaring height updates every supported site.
6. Unsupported soaring height is visibly unknown, not silently surface wind.
7. Selecting a site opens detail sheet.
8. Detail sheet shows source and timestamp.
9. NOW with fresh observation labels it observation/live.
10. NOW with forecast fallback labels it forecast.
11. Stale live observation does not result in green current status.
12. Browser refresh preserves sane defaults and does not crash with missing data.

Test phone widths around:
- 360 px
- 390 px
- 430 px

Also test desktop.

---

# 31. Acceptance tests — data

- `SITES.md` duplicate ID -> build fails.
- invalid latitude -> build fails.
- invalid degree outside expected normalization rules -> build fails.
- malformed wraparound sector -> clear validation error.
- green/orange sector overlap can either be rejected or resolved by documented priority.
- verified speed config missing required values -> build fails.
- unverified speed config -> allowed.
- provider response with null direction -> site becomes unknown/maybe as rules dictate, never NaN.
- source timestamp in future -> flagged suspect.
- wind unit conversion tests.
- compass/degrees conversion tests.

---

# 32. GitHub Actions

Create at least:

### CI workflow
On push/PR:
- install
- lint
- typecheck
- validate `SITES.md`
- unit tests
- build
- Playwright critical tests

### Pages deployment workflow
On main push and manual dispatch:
- build
- upload Pages artifact
- deploy Pages

### Weather refresh workflow
Scheduled approximately every 5 minutes:
- collect live data;
- refresh forecast only when needed;
- validate normalized output;
- build/deploy Pages artifact or otherwise update the static data served by Pages;
- use concurrency so old overlapping refresh jobs are cancelled.

Do not create a Git commit every five minutes merely to update weather data.

The deployment design should avoid repository-history spam.

---

# 33. Logging / diagnostics

Generated data should include:

```json
{
  "generatedAt": "...",
  "liveCollector": {
    "status": "ok",
    "sourcesOk": 7,
    "sourcesFailed": 2
  },
  "forecast": {
    "generatedAt": "...",
    "provider": "..."
  }
}
```

App detail/debug panel may show data age.

GitHub Action logs should report source failures individually without necessarily failing the entire refresh if other sources still work.

Critical schema/build corruption should fail deployment.

---

# 34. Security

- no API passwords committed to repository;
- use GitHub Secrets if credentials later exist;
- sanitize parsed external text;
- treat weather source responses as untrusted input;
- use timeouts/retries with sensible limits;
- do not execute remote content;
- do not bypass authentication, anti-bot controls, or source terms.

---

# 35. Phase plan

## Milestone 0 — repository foundation
Deliver:
- repo structure;
- TypeScript/Vite app;
- map;
- `SITES.md` parser/schema;
- fixture dataset;
- CI.

Pass acceptance tests before continuing.

## Milestone 1 — exact rose component
Deliver:
- SVG rose;
- sectors;
- wind arrow;
- speed;
- state colors;
- history dots;
- visual tests.

This milestone is more important than styling the rest of the app.

## Milestone 2 — CPS site catalogue
Deliver:
- site research/audit;
- coordinates;
- descriptions;
- direction seeds;
- source URLs;
- enabled map site list;
- automatic fit bounds.

## Milestone 3 — forecast/time slider
Deliver:
- 72 h hourly forecast;
- weather icons;
- time slider;
- future rose updates;
- provider normalization/cache.

## Milestone 4 — live wind
Deliver:
- available legitimate live adapters;
- source priority;
- age/stale logic;
- NOW mode;
- station audit.

## Milestone 5 — height mode
Deliver:
- Surface / Soaring height control;
- site target heights;
- vertical wind extraction/interpolation;
- effective height display.

## Milestone 6 — autonomous deployment
Deliver:
- GitHub Actions;
- GitHub Pages;
- scheduled near-live refresh;
- health metadata.

## Milestone 7 — polish
Deliver:
- mobile layout;
- PWA if practical;
- details sheet;
- outdoor readability;
- performance pass.

---

# 36. Explicitly out of V1

Do not allow these to derail the first useful release:
- full local WRF/RASP model;
- thermal strength maps;
- BL height / cloudbase calculations;
- animated Windy particle field;
- login/accounts;
- chat/social system;
- native iOS/Android app;
- backend database;
- complex admin panel.

Design so RASP can be added later as map layers and derived forecast products.

---

# 37. Future RASP phase

After V1 is stable, add a separate derived soaring forecast layer with products such as:
- thermal strength;
- boundary layer depth;
- cloudbase;
- overdevelopment risk;
- convergence;
- upper wind;
- thermal/top-of-lift;
- sea-breeze indicators;
- site/day ranking.

Do not contaminate V1's simple site-weather engine with unfinished RASP logic.

---

# 38. Definition of done for V1

V1 is done when a pilot can open the public GitHub Pages URL on a phone and:

1. see the CPS-region flying sites on a geographically useful map;
2. understand each site primarily through the correct Holfuy-style rose;
3. see NOW conditions where live data exists;
4. move a slider through 72 h and watch each rose change;
5. see sun/cloud/rain state beside each site;
6. globally switch Surface ↔ Soaring height;
7. tap a site to see the data source, time, height and reason for its status;
8. see honest gray/orange states instead of invented data;
9. reload later and receive refreshed weather without a developer manually publishing anything;
10. have all core logic covered by tests.

---

# 39. Autonomy loop for Claude Code

For each milestone:

1. read this specification and current project state;
2. inspect existing code before changing it;
3. write/adjust tests first where practical;
4. implement;
5. run validation/lint/typecheck/unit tests;
6. build production bundle;
7. launch local production preview;
8. use Playwright/browser automation to inspect desktop and mobile;
9. capture screenshots for visual milestones;
10. fix problems found;
11. rerun tests;
12. update `PROGRESS.md`;
13. update `docs/DECISIONS.md` if architecture changed;
14. commit a coherent milestone;
15. continue to next unblocked task.

Do not ask the user to choose libraries, file names, CSS details, test frameworks, or routine engineering tradeoffs.

---

# 40. Required repository structure

A good starting structure:

```text
/
├─ AGENTS.md
├─ README.md
├─ SITES.md
├─ PROGRESS.md
├─ package.json
├─ vite.config.ts
├─ src/
│  ├─ app/
│  ├─ components/
│  │  ├─ WindRose/
│  │  ├─ Map/
│  │  ├─ TimeSlider/
│  │  └─ SiteSheet/
│  ├─ domain/
│  │  ├─ flyability.ts
│  │  ├─ direction.ts
│  │  ├─ weather.ts
│  │  └─ types.ts
│  ├─ providers/
│  │  ├─ live/
│  │  └─ forecast/
│  └─ generated/
├─ scripts/
│  ├─ parse-sites.ts
│  ├─ collect-live.ts
│  └─ collect-forecast.ts
├─ public/
│  └─ generated/
├─ tests/
│  ├─ unit/
│  └─ e2e/
├─ docs/
│  ├─ DECISIONS.md
│  ├─ DATA_SOURCE_AUDIT.md
│  └─ SITE_DATA_AUDIT.md
└─ .github/workflows/
   ├─ ci.yml
   ├─ pages.yml
   └─ weather-refresh.yml
```

Change this only for a concrete technical reason.

---

# 41. Source references to verify during implementation

CPS flying sites:
`https://www.cps.to/flygstallen/`

CPS compact Holfuy weather page:
`https://m.cps.to/`

Holfuy wind rose explanation:
`https://holfuy.com/en/support/wind-rose`

Holfuy API information:
`https://api.holfuy.com/`

Open-Meteo forecast docs:
`https://open-meteo.com/en/docs`

GitHub Actions workflow schedule docs:
`https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions`

GitHub Pages custom workflow docs:
`https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages`

---

# 42. Final product principle

The map must not merely tell the pilot "green" or "red".

It should make the reason visually obvious:

> **This is the site's flying sector. This is the wind at the selected time. This is its speed. Therefore this site looks good / marginal / wrong.**

If a future UI decision weakens that instant visual reasoning, reject the UI decision.
