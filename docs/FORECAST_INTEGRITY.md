# FORECAST_INTEGRITY.md — forecast data integrity

Two separate bugs, found in one afternoon by following the same thread: a
pilot noticing that Startvind and YR disagreed. The first put the wrong
number on screen; the second put the right number under the wrong hour.

**Status:** diagnosed 2026-09-21. Steps 0-2 implemented the same day, not yet
committed. The surface wind is correct and every value now names the model
that produced it. The permanent fix for the 100/150 m seam (section 8) is
outstanding.
**Severity:** safety-relevant. The error changes flyability verdicts in both
directions, including green where the real forecast is red.

This file holds one investigation end to end: what is wrong, how it was
measured, what the cure is, and how we will know the cure worked. It exists
as its own document rather than as a line in `BACKLOG.md` because the bug was
invisible for months — every test passed, every page rendered, and the number
on screen was simply wrong. Anything that can hide that well deserves a
written record of how it was caught.

---

## 1. The error

### What a pilot sees

Hovs Hallar NV, for 2026-09-22 16:00 local (14:00Z), as of 2026-09-21:

| Source | Mean wind | Direction | Gust |
| --- | --- | --- | --- |
| Startvind | **2.7 m/s** | 308° | 8.1 m/s |
| Open-Meteo point forecast (`best_match`) | **5.3 m/s** | 312° | 8.1 m/s |
| YR / met.no | **5.3 m/s** | 312° | — |
| Windy | ~6 m/s | — | — |

Startvind is alone. A 2.7 m/s mean carrying an 8.1 m/s gust is a 3:1 ratio no
real wind produces — that mismatch is the fingerprint of two different
forecasts being shown as one.

### The cause, in code

`scripts/collect-forecasts.ts` does two things in order:

1. Fetches a point forecast from Open-Meteo at each site's own coordinates.
   This is correct data, and it is what YR also returns.
2. Calls `mergeDmiWindIntoSiteForecast(...)` at `collect-forecasts.ts:214`,
   which at `src/providers/forecast/dmiWindProvider.ts:232` returns
   `{ ...forecast, heights }` — replacing **every** height, 10 m included,
   with values sampled from the coarse regional wind raster.

`windGustMs`, `weatherKind` and `sourceId` are spread through untouched. The
result is a single `SiteForecast` object whose fields disagree about where
they came from:

| Field | Actually from | Claimed |
| --- | --- | --- |
| mean wind + direction, all heights | regional raster (DWD ICON-EU, ~17 km) | Open-Meteo |
| gust | Open-Meteo point | Open-Meteo |
| weather symbol | Open-Meteo point | Open-Meteo |
| `sourceId` | — | `"open-meteo"` |

`SiteSheet.tsx:67-69` renders that as *"Open-Meteo forecast (10 m surface
wind)"*, which is false for the number printed beside it.

### Where the 2.6 m/s went

The gap decomposes into two roughly equal halves. This matters, because only
one of them is about the raster:

```
5.30  Open-Meteo point, best_match         (= YR exactly)
3.76  Open-Meteo point, models=icon_eu     -1.54  model choice
2.70  Startvind (raster sample of ICON-EU) -1.06  grid sampling
```

The FlyWeather-Soaring manifest declares its own source as **Open-Meteo / DWD
ICON-EU**. So the raster is already downstream of Open-Meteo, and **a perfect
raster would still read ~3.8, not 5.3.** Improving the grid producer cannot
fix this. Other models for comparison: `icon_seamless` and `icon_d2` 3.54,
`ecmwf_ifs025` 3.89.

The sampling half: the raster is 44×40 nodes over bbox
`[8.0, 54.2, 20.0, 60.7]` — cells of roughly **17.2 × 18.4 km**. The nearest
node to Hovs Hallar is **8.0 km away**, reading 3.3 m/s. A cell that size
averages cliff, shore and open sea into one number.

### A third symptom: half the forecast horizon is deleted

Found while building the checker. `mergeDmiWindIntoSiteForecast` maps each of
Open-Meteo's hours onto the nearest raster hour and writes `null` where there
isn't one. The raster is shorter than the point forecast, so:

- Open-Meteo publishes **120 hours** (5 days) per site.
- After the overwrite, 10 m wind survives only for hours **11 to 70** —
  2026-09-21 11:00 through 2026-09-23 22:00.
- **Exactly 50% of all 10 m hours are null, on all 20 sites.**

Gusts and weather symbols still cover all 120 hours, because the merge does
not touch them. So the last two days of the timeline show a weather icon and
a gust value beside no wind at all. The site's usable forecast horizon is
2.5 days, not the 5 it fetches and pays for.

### Scope

Measured across all 20 sites with a published forecast (section 3). The mean
absolute error is 0.4-1.4 m/s depending on site, and the sign is not uniform:
coastal cliffs read low, some inland sites read slightly high. The damage is
concentrated where a wrong number changes a decision.

### Why this is a safety issue, not a display nit

Over the next 72 hours the two sources disagree about whether a site is
flyable in **174 of 1100 compared hours** — 66 of them with Startvind showing
the greener verdict. Filtering to hours where met.no reads at least 3 m/s, so
somebody might actually have launched, leaves **21 genuinely dangerous
hours**, concentrated at Hovs Hallar (8), Valfjäll (5), Klamby (3),
Barsebäck (2) and Rörtången (2). The worst:

| Site | Hour (UTC) | Startvind shows | met.no | Verdict |
| --- | --- | --- | --- | --- |
| Barsebäck | 2026-09-21 16:00 | 6.4 m/s — green | 8.7 m/s | red |
| Barsebäck | 2026-09-21 17:00 | 6.2 m/s — green | 8.1 m/s | red |
| Hovs Hallar NV | 2026-09-21 19:00 | 6.7 m/s — green | 8.1 m/s | red |
| Hovs Hallar NV | 2026-09-21 20:00 | 6.1 m/s — green | 7.8 m/s | red |
| Hovs Hallar NV | 2026-09-21 21:00 | 5.6 m/s — green | 7.2 m/s | red |

Those hours are live on the site now.

---

## 2. The cure

### Decided

**The point forecast is the canonical site forecast at the surface. The
raster never again touches the value that decides whether a site is green.**

Heights are split, and the split is labelled on screen:

| Height | Source after the fix |
| --- | --- |
| 10 m (surface — the flyability height) | Open-Meteo point forecast |
| 100 m | Open-Meteo point forecast |
| 150 m – 2000 m | regional raster, **labelled as such** |

The raster keeps its original job — the animated map field — where 17 km
cells are entirely appropriate. Wind aloft decides nothing safety-critical;
it informs thermal and soaring expectations, where the coarse model is
acceptable as long as nobody is told it is a point forecast.

Rejected, with reasons:

- **Point forecast only, no raster at any height.** Cleanest, and what a
  strict reading of the bug report requires — but Open-Meteo's point API
  answers only at 10 m and 100 m. The altitude slider would lose 12 of its 14
  levels, its ceiling would drop from 2000 m to 100 m, and site roses would
  go blank whenever the slider is raised (`SiteMap.tsx:147-158`).
- **Calibrating the raster toward YR.** Not done, ever. Scaling one model to
  resemble another produces a number no model actually predicted.
- **Switching models to close the gap.** `best_match` already matches YR. The
  problem is not model selection; it is that the point forecast is being
  discarded after it is fetched.

### Known cost of the decision — the seam at 100/150 m

`interpolateWindAtHeight` blends between adjacent entries of
`MODEL_HEIGHTS_M`. After the fix, 100 m comes from one model and 150 m from
another, so that one band interpolates **across a source boundary** and may
show a non-physical step — possibly wind appearing to fall with height.

This is accepted for now and must be labelled, not smoothed. Smoothing it
would be calibration by another name. Section 8 carries the permanent fix.

### Steps

**Step 0 — build the ruler before changing anything. DONE 2026-09-21.**
`scripts/check-forecast.ts`, run as `npm run check:forecast`. Compares every
site's stored 10 m wind against met.no and counts verdict flips in each
direction. Baseline in section 3. Without this, "it looks better" is the only
available evidence, and that is how the bug survived this long.

**Step 1 — stop the overwrite at the surface. DONE 2026-09-21.**

- `dmiWindProvider.ts`: `POINT_FORECAST_HEIGHTS_M = [10, 100]` is now exported
  and `mergeDmiWindIntoSiteForecast` skips those heights entirely, filling only
  what Open-Meteo's point API cannot answer. The hour lookup is computed once
  per hour instead of once per hour per height per field, so the heights cannot
  disagree with each other about which raster hour they came from.
- `collect-forecasts.ts:203-207`: site coordinates are still appended to the
  grid query, because the aloft heights still need them.
- The grid file itself (`gridFile`, written at `collect-forecasts.ts:211`) is
  untouched. `src/app/useWindGrid.ts:6` reads it directly and never sees a
  site forecast, so **the animation cannot be affected by this change.**

**Step 2 — make provenance match the values. DONE 2026-09-21.**

- New `src/domain/forecastSource.ts` owns the question "which model produced
  the wind at this height", and `POINT_FORECAST_HEIGHTS_M` moved there from
  the provider. Every place that names a source now asks it instead of
  assuming.
- `SiteSheet`'s label reads "Open-Meteo forecast (10 m surface wind)" at the
  surface and "Regional model, coarse grid (350 m AGL)" above 100 m.
- `selectEffectiveSample` takes the displayed height and derives `sourceId`
  from it. The parameter is **required, not optional**: this field used to be
  the constant `"open-meteo"` whatever produced the number, and a default
  would let that quietly return.
- `SiteForecast.sourceId` keeps its value but its docstring now says what it
  actually describes - the surface series, not the whole object.

The grid is described as "coarse" rather than by a figure in kilometres on
purpose. A number in the UI would be a copy of a fact that lives in the grid
producer's manifest, and copies go quietly wrong the moment the producer
changes. What the reader needs is the part that cannot drift: this value was
not computed for this site.

**Step 3 — re-run the ruler.** Expect: coastal sites rise by 1–3 m/s, inland
sites barely move, and roughly nine verdicts at Hovs Hallar change — four of
them from green to red. **That is the fix working, not a regression.**

---

## 3. The baseline, measured 2026-09-21

`npm run check:forecast` (`scripts/check-forecast.ts`) compares every site's
stored 10 m wind against met.no for the same hour and counts flyability
verdict disagreements in each direction. Run before any fix, against
`forecast-sites.json` generated `2026-09-21T13:50:52Z`, over the next 72 h.
Full output saved to `reports/forecast-check-before.json`.

```
site                        cmp  miss   mean±   signed    max   same  OPTIM  FLYBL   pess
hovs-hallar-nv               55    17   1.2   -0.9    3.2     40      8      8      7
valfjall-ulebergshamn        55    17   0.6    0.3    2.1     36      9      5     10
klamby                       55    17   0.4   -0.2    1.3     36      6      3     13
barseback                    55    17   1.3   -1.2    3.8     46      2      2      7
rortangen-n                  55    17   0.6   -0.1    1.7     41     10      2      4
ven                          55    17   1.4   -1.3    3.5     46      1      1      8
(14 further sites: 0 flyable-wind optimistic hours each)
TOTAL                      1100   340          -0.2           926     66     21    108
```

**FLYBL = 21** is the number the fix has to drive down: hours where Startvind
shows a greener verdict than met.no *and* met.no reads at least 3 m/s, so
somebody might actually have launched on it. Worst examples:

```
barseback       2026-09-21T16:00  ours 6.4 (green)  met.no 8.7 (red)
barseback       2026-09-21T17:00  ours 6.2 (green)  met.no 8.1 (red)
hovs-hallar-nv  2026-09-21T19:00  ours 6.7 (green)  met.no 8.1 (red)
hovs-hallar-nv  2026-09-21T20:00  ours 6.1 (green)  met.no 7.8 (red)
hovs-hallar-nv  2026-09-21T21:00  ours 5.6 (green)  met.no 7.2 (red)
```

**miss = 340** is the truncation above: 17 of every site's 72 forecast hours
are published with no wind value in them.

### Why the flip count is filtered by wind speed

The checker's first run reported 66 optimistic hours, and the count was
misleading. Most were sites like Grimeton — mean signed error **0.02 m/s**,
yet 35 verdict flips, every one of them at near-calm where the two models put
an arbitrary wind direction on opposite sides of a sector. Nobody flies at
0.5 m/s, and counting those beside "6.4 shown green where met.no says 8.7 and
red" would let a fix look good or bad for reasons unrelated to this bug.

So flips are reported twice: all of them, and the subset in wind somebody
might launch in (`FLYABLE_SPEED_MS = 3`). Only the second is a target. This
correction is recorded because the unfiltered number was the tool's first
answer, and an unexamined yardstick is how the original bug survived.

## 4. Result of step 1, measured 2026-09-21

Re-run of `npm run check:forecast` after regenerating `forecast-sites.json`
with the fix. Saved to `reports/forecast-check-after-step1.json`.

| | before | after |
| --- | --- | --- |
| hours published with no wind (`miss`) | **340** | **0** |
| verdicts matching met.no | 926 / 1100 | **1144 / 1160** |
| optimistic verdicts (`OPTIM`) | 66 | 12 |
| …in flyable wind (`FLYBL`) | 21 | 2 |
| …**over the site's own limit** (`STRONG`) | ≥ 6 | **0** |
| pessimistic verdicts | 108 | 4 |
| mean signed error | −0.2 m/s | 0.0 m/s |

Hovs Hallar 2026-09-22 14:00Z went from **2.72 m/s @ 308°** to **5.80 m/s @
316°**, against met.no's 5.8 for the same hour.

### A second refinement to the ruler

The two flips left in `FLYBL` turned out to be met.no calling a site red for
being **too light**, not too strong — showing green there costs somebody a
drive, not their safety. A site goes red for both reasons and the tool was
counting them as one thing.

So `STRONG` was added: optimistic hours where met.no exceeds the site's own
`max_ms` or `hard_max_gust_ms`. That is the number that measures risk, and it
is now **zero**. Before the fix, the same test found at least six — and that
was from a sample of only the three worst hours per site, so the true figure
was higher:

```
barseback       2026-09-21T16:00  ours 6.4 green   met.no 8.7  (site max 8)
barseback       2026-09-21T17:00  ours 6.2 green   met.no 8.1  (site max 8)
hovs-hallar-nv  2026-09-21T19:00  ours 6.7 green   met.no 8.1  (site max 7)
hovs-hallar-nv  2026-09-21T20:00  ours 6.1 green   met.no 7.8  (site max 7)
hovs-hallar-nv  2026-09-21T21:00  ours 5.6 green   met.no 7.2  (site max 7)
rortangen-n     2026-09-21T16:00  ours 5.7 orange  met.no 5.5  (site max 5)
```

### Honest limits of this comparison

The before and after runs used **different model runs** — the baseline read a
forecast generated at 13:50Z, the re-run a fresh one. Weather moved between
them, so the two totals are indicative rather than controlled. Two pieces of
evidence do not depend on that:

- `miss` going 340 → 0 is structural, not meteorological.
- The seam is directly observable: Hovs Hallar at the same hour reads 6.22 m/s
  at 100 m (point forecast) and 3.33 m/s at 150 m (raster). Wind appears to
  halve across the boundary. This is the documented cost of the split, it is
  not smoothed, and section 8 carries its permanent fix.

### Verification run

- `npm test` — 50 files, **799 passed**.
- `npm run typecheck`, `npm run lint` — clean. The typecheck was confirmed to
  actually cover the new script by injecting a deliberate type error and
  watching it fail, rather than trusting a clean exit code.
- `npm run build` — succeeds.
- `tests/e2e/altitude-slider.spec.ts` — 5 passed. The slider keeps data at
  every height, because the raster still fills 150 m and above.
- The regression test was mutation-checked: re-enabling the old whole-heights
  replacement makes three tests fail, including the named one. A test that
  cannot fail proves nothing.

## 5. Result of step 2

Four independent guards now fail if a value is shown under the wrong model's
name - verified by mutation, by making `forecastSourceAt` always answer
`open-meteo` and watching them break:

```
forecastSourceAt      > names the regional grid at every other model height
forecastSourceLabel   > never says Open-Meteo over a value the grid produced
selectEffectiveSample > names the regional grid above the point heights
SiteSheet             > names the point forecast at surface, the grid above
```

They sit at three levels - the domain rule, the sample selection, and the
rendered label - so a change at any one of them is caught.

### Verification run (steps 1 and 2 together)

- `npm test` — 51 files, **810 passed**.
- `npm run typecheck`, `npm run lint`, `npm run build` — all clean.
- Playwright: `altitude-slider`, `site-map`, `rasp`, `wind-particles`,
  `time-slider`, `live-data` — **32 passed**. These cover the consumers the
  fix could plausibly have broken: markers, sheet, charts, the animated
  field, RASP and the timeline.

## 6. The tests

### Unit — the wiring

Given a point forecast of **5.3 m/s, 312°, gust 8.1** and a raster sample of
**2.7 m/s at a clearly different bearing**, assert on the pipeline output, not
on the merge helper in isolation:

- `forecast-sites.json` 10 m carries 5.3, 312°, gust 8.1.
- `forecast-wind-grid.json` carries 2.7.
- 2.7 appears nowhere in any site's 10 m or 100 m series.
- `sourceId` / provenance reflects the split.

The five existing merge tests at `tests/unit/dmiWindProvider.test.ts:178-242`
assert the old behaviour and must be rewritten, not left passing.

### Acceptance — the outcome

The unit test proves wiring; only this proves correctness. Regenerate against
the live API and check:

- Hovs Hallar 2026-09-22 16:00 reads **≈5.3 m/s**, matching YR.
- Inland sites move far less than coastal ones — Klamby's mean absolute
  error is already 0.4 m/s and should stay small.
- `npm run check:forecast` drives **FLYBL from 21 toward 0**, without a large
  rise in the pessimistic column (which would suggest overcorrection).
- **miss falls from 340 to 0** — the point forecast covers all 120 hours, so
  no site should publish an hour with no wind in it.

### Regression — what must not break

Verify every consumer of site forecast data: map markers, site sheets, charts,
comparisons, and effective-sample selection (`SiteMap.tsx:125-158`,
`SiteSheet.tsx`). Plus the wind animation, live wind stations, RASP, and the
forecast timeline. Then unit tests, typecheck, lint, production build, and
`tests/e2e/altitude-slider.spec.ts` specifically.

---

## 7. The second bug: forecast hours read two hours early

Found 2026-09-21, after the first fix was already live, when the same pilot
reported Hovs Hallar showing 4.4 m/s at Tuesday 17:00 where YR showed 6.

The stored data was correct — every hour matched met.no exactly. The hours
themselves were being read wrong.

Open-Meteo is asked for `timezone=UTC` and answers `2026-09-22T17:00`, with
nothing on the end saying so. JavaScript parses a bare date-time as **local**
time:

```
new Date("2026-09-22T17:00")   -> 2026-09-22T15:00Z   what the app believed
new Date("2026-09-22T17:00Z")  -> 2026-09-22T17:00Z   what it actually is
```

So under the label "17:00" the app displayed the row named `17:00`, which is
valid at **19:00 local** — two hours into the future, one hour in winter.
Eight call sites parsed hours this way: the slider label, which row counts as
NOW, the NOW marker's position, the tick and day labels, and the day/night
shading.

### Why it hid so well

The labels were **self-consistent**. The slider read the row name as local
time and printed it back, so "17:00" was always shown against the row called
`17:00`. Nothing on screen contradicted anything else on screen. Only an
outside source — a pilot with YR open — could see it.

The existing tests encoded the same assumption. `findNowIndex`'s test compared
`new Date("2026-08-18T11:30")` against hours in the same bare form: two wrongs
that agreed with each other, and therefore passed.

`npm run check:forecast` could not see it either. It normalises the zone
before comparing, deliberately, so it matches true instant to true instant —
which is right for measuring the data and blind to how the data is displayed.
**That is twice this session that the ruler's limits mattered.** A tool that
measures one thing well is not a tool that measures everything.

### The cross-source version, which was worse

The wind grid publishes `2026-09-21T15:00:00Z` — with the Z. The site forecast
does not. `nearestDmiHourIndex` compared them with naive `new Date()` on both,
so it paired rows **two hours apart** while believing they matched, entirely
inside its own 30-minute tolerance and without ever reporting a miss.

### The fix

New `src/domain/forecastTime.ts`. A bare timestamp is UTC — that is what was
asked for and what every producer here publishes — and anything carrying its
own zone is respected as written. Every consumer goes through it.

Hours are also **stamped on the way in** now (`normaliseForecastHour` in both
Open-Meteo providers), so data generated from here on says what it means. The
defensive parse stays regardless: already-published files lack the Z, and the
collector's own 429 fallback republishes them.

### Tests, and a trap in them

`tests/unit/forecastTime.test.ts`, plus two cross-source guards in
`dmiWindProvider.test.ts`. Eight tests across three files fail if the naive
parse returns.

These tests **only mean anything outside UTC** — on a UTC machine the naive
parse accidentally gives the right answer, so they would have passed on CI
while the bug shipped. `tests/unit-setup.ts` therefore pins every run to
Europe/Stockholm, verified by reintroducing the bug with `TZ=UTC` and watching
them fail anyway.

## 8. Remaining risk, and the permanent fix

1. **The 100/150 m seam** described above. The real cure is to request
   Open-Meteo **pressure levels** (1000/925/850/700 hPa) in the same point
   call and derive the whole profile from one coherent response, converting
   hPa to metres via geopotential height. That removes the raster from site
   forecasts entirely and satisfies the strict reading of the bug report
   without losing the slider. Deferred because it is 2–3x the work and the
   safety fix should not wait for it.
2. **The aloft flyability verdict stays raster-derived.** `SiteSheet` computes
   the verdict from whatever height the slider is on, so raising the slider
   still colours the rose from coarse data. It is now labelled as such
   (step 2), which is what makes it acceptable in the meantime; item 1
   resolves it properly. The surface verdict - the one everybody actually
   reads - is unaffected.
3. **The check is not independent, and this is now confirmed.** Open-Meteo's
   `best_match` selects MET Norway's Nordic model across this whole coverage
   area - verified 2026-09-21 at Hovs Hallar and at Lokken in Denmark, where
   `best_match`, `metno_seamless` and met.no's own API return identical
   values to the decimal and the degree:

   ```
   best_match      5.8 m/s @ 316deg
   metno_seamless  5.8 m/s @ 316deg
   met.no (YR)     5.8 m/s @ 316deg
   icon_eu         4.05 m/s @ 320deg
   ecmwf_ifs025    3.89 m/s @ 316deg
   gfs_seamless    4.55 m/s @ 310deg
   ```

   So Startvind and YR are the same forecast, not two that happen to agree.
   `npm run check:forecast` therefore measures **pipeline correctness, not
   forecast accuracy**: it catches this repository mangling, dropping or
   mislabelling the data it was given - which is exactly the bug it was
   built for, and it caught it decisively - but it cannot notice the model
   itself being wrong, because it is comparing the model against itself.

   A genuine second opinion means a different model: ECMWF, ICON or GFS,
   which at that same hour spanned 3.9-4.6 m/s against MET Nordic's 5.8. A
   2 m/s spread between models is itself useful information - it means the
   forecast is uncertain, whichever number is displayed.
4. **Nothing prevents a recurrence by construction.** The regression test
   catches this exact shape. A future merge of a different field would not be
   caught by it.
