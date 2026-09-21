# FORECAST_VERIFICATION.md — scoring the forecast against real anemometers

**Status:** designed 2026-09-21. Chunk A (the recorder) shipped the same
day and is collecting. Chunks B-E not started.
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

As shipped, in `data/observations/YYYY-MM.jsonl`:

```json
{"at":"2026-09-21T19:22:22.420Z","site":"alabodarna","hour":"2026-09-21T19:00Z",
 "obs":{"ms":4.44,"deg":338,"gust":6.11,"src":"holfuy","ageConfirmed":false},
 "fc":{"ms":6,"deg":326,"gust":9.7}}
```

**Not a time series.** Each row is a complete, self-contained
forecast-versus-measurement pair, which is what makes the whole thing free:
the only scheduler available at no cost (GitHub Actions cron) honours a
schedule at two-to-five-hour intervals, and for a month's or a year's bias
figure it does not matter *when* the samples landed, only how many there
are. Roughly 7-12 runs a day across 17 stations is several hundred rows a
month per site — far more than a bias figure needs, and about 1 MB a year.

Lead-time forecasts (+6/+24/+48 h) were deliberately left out — see chunk B.
The question actually asked needs only the concurrent pair, and carrying
four forecasts per row would double the file for an answer nobody is waiting
on.

**Storage, settled:** straight into the repository, like the edit log and
the suggestion list. No Cloudflare KV, no Worker cron, no VPS, no monthly
bill. `observations.yml` commits only when rows were added, and `pages.yml`
ignores the path so recording never triggers a site deploy — the default
`GITHUB_TOKEN` cannot trigger workflows anyway, and the ignore keeps that
true if it is ever changed to a PAT.

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
