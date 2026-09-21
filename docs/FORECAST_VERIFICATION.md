# FORECAST_VERIFICATION.md — scoring the forecast against real anemometers

**Status:** designed 2026-09-21, not started.
**Execution plan:** `BLOCKS.md` → Phase 4, chunks A–E.

## Why this exists

On 2026-09-21 a pilot noticed Startvind saying 2.8 m/s where YR said 6.
Following that thread turned up two independent bugs
(`docs/FORECAST_INTEGRITY.md`): the regional raster overwriting each site's
surface forecast, and forecast hours being read two hours early. Both had
been live for months. Both were invisible from inside the app — one showed a
plausible wind, the other a plausible clock — and **neither was caught by any
test, because everything in the repository was self-consistent.**

What caught them was a person with another forecast open in a second tab.

That is the problem this feature solves. Not "is the code correct", which
tests already answer, but **"is the number true"**, which nothing here can
currently answer. The only way to answer it is to compare what we predicted
against what actually happened.

### We already own the instruments and throw the readings away

Seventeen sites have live anemometers — Holfuy, ViVa, SMHI, WeeWX. The
collector reads them every five minutes and writes `live.json`, which is
**overwritten on the next run**. A full day of real measurements across
seventeen stations is discarded every day.

Nothing else needs to be bought, installed or negotiated. The measurements
exist; we simply do not keep them.

## What it would tell a pilot

### Per-site bias, split by wind strength

A single average error per site is close to useless, because the error is not
constant. Models systematically over-read light wind and under-read strong
wind at exposed sites, which is exactly backwards from what is safe.

A snapshot on 2026-09-21 at 17:20Z already hints at the size of it:

```
site             model says   anemometer says
hovs-hallar-nv      ~6.0            9.2
hoganas             ~6.5            9.7
grimeton            ~7.0           10.7
klamby              ~4.0            4.1
```

The coastal cliffs read far higher than the model; the inland field matches
almost exactly. That is ridge and venturi speedup a 2.5 km model cannot
resolve, and it is a permanent property of each site's terrain.

If that holds over weeks, the honest statement is not "the forecast runs a
bit low here". It is:

> **Above 6 m/s, Hovs Hallar's anemometer reads about 40% higher than
> forecast, measured over 340 hours.**

That is a safety fact. Experienced pilots at a site know it in their bones
and have no way to hand it to a newcomer. This is that transfer.

### Skill by lead time

A forecast for Tuesday 16:00 made three hours ahead is a different animal
from the same hour forecast two days out. Recording the lead time lets the
site say how far ahead its forecast is actually worth trusting — per site,
because a sheltered inland field stays predictable far longer than a coastal
cliff in a frontal passage.

### And it would have caught both of this week's bugs

A surface wind 1–3 m/s low against seventeen anemometers, and a two-hour
timing offset showing as an unmistakable asymmetric lag. Neither needed a
person to notice.

## Does anything else do this?

Not for pilots, as far as we can tell.

- **Holfuy** sells the anemometer and shows what it reads, live and as
  history. It has no idea what anyone forecast for that station.
- **Windy** lets you switch between models but never scores them against
  anything.
- **YR / met.no** publish forecasts, not verification of them at a point.

In professional meteorology this is routine — verification is an entire
discipline and the correction step has a name, MOS (model output statistics).
It simply never reaches the people standing on the hill.

## The line between calibration and cosmetics

`docs/FORECAST_INTEGRITY.md` is emphatic that we must **never** scale one
model to resemble another. This feature looks like the opposite and is not,
so the distinction is worth stating plainly:

- Tuning Startvind toward YR would add **no information**. YR is the same
  model (Open-Meteo's `best_match` selects MET Nordic across this whole
  region — verified, see that document). It would only make a number look
  more agreeable.
- Tuning against a physical anemometer adds **real information** that exists
  nowhere in the model: what this particular hillside does to the wind.

The test is whether new facts enter the system. Here they do.

Even so, **showing the correction and applying it are different decisions.**
Everything up to and including chunk D only ever *reports* the bias. Actually
changing a displayed wind is chunk E, is deliberately last, and needs its own
argument — a site-corrected number that is wrong is more dangerous than a raw
model number that is honestly labelled.

## Shape of the data

One row per site per hour, appended, never rewritten — the same
repo-as-database pattern as `data/edit-log.jsonl` and `data/issues.jsonl`:
no database to disagree with the repository, backed up by every clone,
readable by anyone, revertable with one git command.

```json
{"at":"2026-09-21T17:00Z","site":"hovs-hallar-nv","obs":{"ms":9.2,"deg":322,"gust":12.1,"src":"holfuy","measuredAt":"2026-09-21T17:19:58Z"},
 "fc":[{"lead":1,"ms":6.1,"deg":316},{"lead":6,"ms":5.8,"deg":312},{"lead":24,"ms":4.9,"deg":305}]}
```

The `fc` entries are **forecasts issued now for hours 1/6/24/48 ahead**, not
the forecast for this hour. Storing them at issue time is what makes lead-time
skill computable later without keeping whole forecast files. The join happens
at analysis time: the observation for hour H meets the forecast that was made
for H at each lead.

Volume: 17 sites × 24 h × 365 ≈ 150k rows a year, roughly 15 MB. Fine, but
worth compacting per month once it is proven.

**Open decision for chunk A:** where the file lives between writes. The
weather cron runs every five minutes and publishes to Pages without
committing, so an hourly commit would mean ~4,400 commits a year.
Recommendation: hold the current day in the published artifact (the same
"fetch last published, fall back to it" pattern the forecast collector
already uses) and commit one row-block per day. Durable, and quiet in git
history.

## What it cannot do

- **It cannot verify a site with no station.** Four of twenty-one sites have
  none; they will have no skill score, and must say so rather than borrowing
  a neighbour's.
- **A station is not the launch.** An anemometer 1.9 km away on a different
  aspect measures its own wind. The bias figure describes *forecast versus
  that station*, and the existing "distance to station" line stays exactly as
  important as it is now.
- **It is slow.** Nothing useful can be said until weeks of rows exist. That
  is the argument for starting the recorder before anything else is built.
