# TODO — Forecast accuracy (forecast vs. real measured wind)

**Prepared:** 2026-09-23 · **updated:** 2026-10-06 (method fixed v1, §14)
**Type:** analysis and advice, plus an isolated local lab (built 2026-09-28).
The lab is committed but deliberately **not wired into the site** — no badge or
accuracy card is shown to visitors until the data has earned it. See §13 for the
"add more sites" behaviour and the one-week review plan.
**Audience:** the repo owner (sections 1 and 2), the coding agent (section 11), and a
non-technical reader (section 1).

---

## 0. The very short version (plain words, for anyone)

Startvind shows two different kinds of wind:

- a **forecast** — a computer's guess of the wind at a place and a time;
- a **measurement** — what a real spinning-cup wind meter at a flying site is
  reading right now.

The plan is simple to say: **keep both numbers for the same place and the same
hour, and over months count how often the guess was close to the meter.** That
gives every flying site a score answering *"how much can I trust the forecast
here?"*, and lets us look closer: is it better in light wind or strong wind, in
summer or in February?

The good news: **the hard part is already built and has been running.** The
software that saves "what we said" next to "what the meter measured", every two
hours, exists today (it is called the observation recorder). What is missing is
only the **counting-and-reporting** part and the **button to look at it**.

One caution: the recorder has apparently gone quiet in the last day (section 1b).
That is the single most urgent thing to check, because the measurements it is
not saving are gone forever.

And the cost worry is unfounded: **this can be finished with no new paid
services, no database, and no change to the Cloudflare worker.** The repository
itself is the database, exactly as it already is for the edit log.

---

## 1. What exists today (situation analysis)

### 1.1 The two repositories and Cloudflare

The setup is three connected pieces, and they do different jobs:

```
   FlyWeather (this repo)                 FlyWeather-Soaring (separate repo)
   ──────────────────────                 ────────────────────────────────
   TypeScript/React static site           Python, produces RASP thermal maps
   Builds to GitHub Pages                 Publishes its output as static files
   startvind.se                           this app just reads the result
          │  ▲
          │  │  publishing (site edits) + on-demand live wind
          ▼  │
   Cloudflare Worker "startvind-editor"
   ─────────────────────────────────────
   Stateless. Holds no data of its own.
   Holds the GitHub token for the browser, and reads stations on demand.
```

- **GitHub Pages / `startvind.se`** — where the app is served. Built and
  redeployed by `.github/workflows/weather-refresh.yml` roughly every five
  minutes of *scheduled* time (in practice GitHub runs it every 2–5 hours; the
  docs already say this and it matters here).
- **Cloudflare Worker `startvind-editor`** (in `editor-worker/`) — does two
  things: (a) lets anyone publish a site edit, which writes a commit to *this*
  repo, and (b) reads live station wind on demand (`/api/live`, 2-minute edge
  cache). It **stores nothing**, deliberately. See `docs/PUBLISHING.md`.
- **FlyWeather-Soaring** — a separate repo producing the RASP layer. It is not
  part of this request; mentioned only so the boundary is clear. It publishes
  static files that this app reads.

### 1.2 Where the weather numbers come from

**Forecast (the "guess").**

- Produced server-side by `scripts/collect-forecasts.ts`, run during the build
  (and therefore by the weather-refresh cron), never from a visitor's browser.
- Written to `public/generated/forecast-sites.json` (gitignored; published as
  part of the Pages artifact) and read by the app.
- Shape: 120 hourly hours per enabled site; wind at a stack of model heights
  (`MODEL_HEIGHTS_M` = 10 m … 2000 m).
- Important detail: the **surface (10 m) value is the Open-Meteo point
  forecast**, but the **150 m-and-above values come from the coarse regional
  raster** (ICON-EU). The 100/150 m seam is a known, documented wart
  (`docs/FORECAST_INTEGRITY.md` §8). Only the 10 m value is comparable to a
  ground anemometer — which is exactly what the recorder uses.

**Live measurement (the "truth" we compare against).**

- `src/providers/live/collectLive.ts` (`collectLiveSamples`) reads each site's
  attached station from Holfuy / ViVa / SMHI / WeeWX, with a small concurrency
  pool and per-site failure isolation.
- At build time it writes `public/generated/live.json` (fallback), and the
  Worker serves the same shape on demand from `/api/live`.
- Freshness rules exist (`ageConfirmed`, stale-after-minutes), and the code is
  careful never to present a download time as a measurement time. This honesty
  matters directly for scoring (see §5 and §11).

**User-created sites with attached stations.**

There is no separate database of user sites. A site *is* a YAML file under
`sites/<country>/<region>/<ridge|winch|archive>/<id>.yaml`, and a station is
attached by a `station:` block inside it, e.g. `sites/se/skane/ridge/hammar.yaml`:

```
station:
  provider: holfuy
  station_id: "214"
  verified: true
```

Edits made in the browser go Worker → GitHub and land in that same repo. So
"user-created site with an attached station" and "hand-made site file" are the
same thing, and the recorder picks both up automatically. Current catalogue:
**40 site files, 21 enabled, 18 enabled sites carry a station, 3 do not**
(`dk-dokkedal`, `dk-lokken`, `valfjall-ulebergshamn`).

### 1.3 The recorder — ALREADY BUILT (this is the key finding)

The thing this request asks for ("on a cron, check forecast against measured
wind") **already exists**. It was designed on 2026-09-21 in
`docs/FORECAST_VERIFICATION.md` and implemented as Phase 4, Chunk A, in
`BLOCKS.md`:

- `src/domain/observationLog.ts` — the row shape, pairing rules, dedupe (18 tests).
- `scripts/record-observations.ts` — `npm run record:observations`.
- `.github/workflows/observations.yml` — runs every 2 hours (7–12 runs/day in
  practice), commits only when rows were added.
- `data/observations/YYYY-MM.jsonl` — one row per (site, hour), appended,
  never rewritten. The repository is the database.

Row shape (real example from `data/observations/2026-09.jsonl`):

```
{"at":"...","site":"alabodarna","hour":"2026-09-21T19:00Z",
 "obs":{"ms":4.44,"deg":338,"gust":6.11,"src":"holfuy","ageConfirmed":false},
 "fc":{"ms":6,"deg":326,"gust":9.7}}
```

Where `obs` = the meter, `fc` = our published 10 m forecast for the same hour,
`issued` = when that forecast file was generated (so lead time is recoverable).
It deliberately records only **concurrent pairs** (no +6/+24/+48 h) because the
question asked needs only that, and it stays free: no VPS, no Worker changes, no
KV, no monthly bill.

**So: do not rebuild this.** The remaining work is analysis (§7) and display
(§8). Chunks B–E in `BLOCKS.md` Phase 4 describe the rest.

### 1.4 One thing that is NOT the same — `check:forecast`

`scripts/check-forecast.ts` (`npm run check:forecast`) also compares numbers,
but it compares **our forecast against met.no's forecast** — model against
model. The repo's own docs are explicit that this measures *pipeline
correctness, not forecast accuracy*, because Open-Meteo's `best_match` **is**
met.no across this region. It cannot tell us whether the forecast is *true*; only
the anemometer can. Keep the two tools conceptually separate: `check:forecast`
is a code-correctness ruler; **this** request is a truth ruler.

### 1b. URGENT — the recorder appears to have stopped

As of this analysis:

- the newest row in `data/observations/2026-09.jsonl` is
  **2026-09-22T06:30:58Z** — more than 24 hours old;
- 81 rows total, 17 distinct stations, 2026-09-21 → 2026-09-22;
- the last commit touching the file predates the workflow change in `f7ad4af`
  ("Stop the recorder calling Open-Meteo…").

Why it can stop **silently**, which is the dangerous part: the workflow runs
`npm run record:observations` with **no build step**. `public/generated/` is
gitignored, so in a fresh checkout there is no local forecast file, and the
script depends entirely on fetching the published copy from
`https://startvind.se/generated/forecast-sites.json`. If that fetch fails, the
script logs a warning, records nothing, and **exits 0** — so the workflow
"succeeds", commits nothing, and no one is told.

The published URL is reachable right now and its `generatedAt` is current
(2026-09-23T06:47Z), so this is most likely a scheduling/run failure rather than
a dead URL — but it must be confirmed. **Every day the recorder is not running
is a day of real measurements permanently lost.** This is the only time-critical
item in this whole document.

---

## 2. The weather concepts, kept separate

The request itself mixed several ideas. Separating them is most of the work:

| Concept | What it actually is | Why it matters here |
|---|---|---|
| **Forecast** | A model's prediction; has an **issue time** and a **valid time**; is an **area average** (a grid cell), not a point. | It is the thing being tested. |
| **Observation** | A physical sensor's reading; has a **measurement time**; is a **point** in space. | It is what we test *against*. |
| **Station vs. site vs. launch** | The anemometer may be 1.9 km away on a different aspect from the launch. | A score describes *forecast vs. that station*, never *forecast vs. the launch*. Must be labelled. |
| **Surface vs. height** | 10 m surface wind vs. wind at 50–2000 m. | Only surface can be compared to a ground anemometer. Higher levels have no comparable sensor here. |
| **NOW vs. lead time** | `hour` − `issued`. | Mixing a forecast issued 10 minutes ago with one issued 8 hours ago measures two different things. The concurrent pair is closer to a **nowcast check** than a day-3 skill check. |
| **Verification vs. calibration** | *Reporting* a bias (chunk C/D) vs. *applying* a correction (chunk E). | The repo already decided these are different decisions; E is not approved. Keep it that way. |
| **Model vs. model** | `check:forecast` (ours vs. met.no). | Correctness of the pipeline, not truth. |
| **Direction is circular; speed is skewed** | 350° and 10° are 20° apart, not 340°; speed never goes below 0 and has a long tail. | Ordinary averages and percentages lie on both. See §4/§5. |

---

## 3. What "accuracy in percent" can honestly mean

The request is "accuracy in percent on each site". A single percentage is
tempting and almost always misleading, and this repo already learned why once:
the original `check:forecast` counted 66 "dangerous" hours, and most turned out
to be direction noise at near-calm where nobody flies. Filtering to launchable
wind cut it to 21, and filtering to *over the site's own limit* cut it to ~6
(then to 0 after the fix). **A number without those layers made a fix look
different from what it was.**

Recommendation: **do not lead with one %.** Lead with a small, fixed set of
figures, each with a sample count, and *define the % on screen*:

- **Bias (signed, m/s)** — "the forecast runs 1.2 m/s low here on average".
- **MAE and RMSE (m/s)** — typical and worst-case size of the miss.
- **Direction error** — circular mean absolute error, and **% of hours within
  ±30°** (and ±45°).
- **Verdict agreement** — % of hours where our GOOD/MAYBE/BAD matched a verdict
  computed from the meter. Report *both directions* (we said greener; we said
  redder).
- **The safety number already established** — hours where we showed a greener
  verdict *and* the meter was over the site's own limit. This must be zero, and
  is the one number that is about risk rather than convenience.

If a headline % is genuinely wanted, define it explicitly and unchanged forever,
for example:

> **"Accuracy = the share of measured hours where the forecast was within
> ±2 m/s AND ±30°, out of N comparable hours."**

Always print N and the tolerance next to it. Never print a % for a site whose N
is below the minimum (suggested: refuse below ~100 hours; prefer 30+ days).

Two more honesty rules this project already lives by, which apply here too:

- **Never invent a score for a site with no station.** 3 enabled sites have no
  station and can never be scored. They must say so rather than borrow a
  neighbour's.
- **A station is not the launch.** The existing "distance to station" line stays
  exactly as important as it is now.

---

## 4. Meteorology best practices — the honest subset

Keep these (cheap, and they are what makes the number mean something):

1. **Co-located, co-temporal pairing.** Already done: same site, same hour,
   within a ±30-minute tolerance (`PAIRING_TOLERANCE_MINUTES`).
2. **Separate bias from error.** A consistent 1 m/s low is very different from
   random scatter.
3. **Stratify.** By wind band, by month/season, by direction, by lead time.
   This is literally the feature requested ("better in low winds?", "better in
   February?").
4. **Show sample counts everywhere** and refuse small-n figures.
5. **Quality-control the observations.** Exclude or foot-note
   `ageConfirmed: false` (Holfuy cannot prove its measurement time — 45 of the
   first 81 rows are `false`); watch for stuck sensors, icing, and
   physically impossible gust < mean.
6. **Circular statistics for direction.** Use vector means/absolute differences,
   never plain arithmetic means of degrees.
7. **Persist raw rows; derive statistics on demand.** Matches the repo's existing
   rule "counts are recounted, never stored". Do not keep running totals.
8. **Keep the recorder independent of the thing it verifies.** It already reads
   the *published* forecast and deliberately does not call Open-Meteo itself,
   precisely so it cannot rate-limit the product it measures.

Skip for now (it is the "beast" that is not worth it yet):

- Full **MOS / bias correction** (chunk E — not approved).
- Formal significance testing / confidence intervals beyond "here is n".
- Downscaling / interpolating the model to the exact launch point.
- Advanced scores (Brier, ROC) — there is no binary product worth scoring yet.

---

## 5. Storage: recommendation — do NOT add a database

**Recommendation: keep the repository as the database (it already is), and add a
single small derived summary file for the UI. Do not add Cloudflare D1/KV, and do
not change the Worker.**

Why:

- It is **already decided and implemented** — `data/edit-log.jsonl`,
  `data/issues.jsonl`, and now `data/observations/*.jsonl`. A `Cloudflare D1`
  database was explicitly considered and rejected in `docs/DECISIONS.md`
  ("the edit log is a file in the repository, not a database").
- A database would be a **second source of truth** that can disagree with the
  repo, needs its own backups and access control, and makes a revert a
  two-place operation. The file is backed up by every clone, readable by anyone,
  and revertable with one `git revert`.
- At this volume a database buys **nothing**: see the arithmetic below. It
  would add quota, a schema, a migration path, and state where there is
  deliberately none today.
- It would **contradict the existing architecture decisions** and add the exact
  class of "beast" the owner wants to avoid.

The arithmetic (measured from the current file):

- ~200 bytes per row; 17–18 stations × 7–12 runs/day ≈ **120–200 rows/day**;
- ≈ **1 MB per month**, ≈ **12 MB per year**;
- monthly files already bound any single file's size.

Real, honest costs of the repo approach (small, but say them):

- **Commit frequency**: ~7–12 commits/day to `data/observations/`. Already
  mitigated: `pages.yml` ignores that path so recording never triggers a deploy,
  and the workflow commits only when rows were added.
- **Git history growth** over years. Mitigations: monthly files (done), and an
  optional yearly archive after several years. **Do not rewrite history** — the
  repo's own rule.

For the UI: **do not ship the raw `.jsonl` to the browser.** Derive a small
`public/generated/forecast-accuracy.json` (per-site + per-stratum stats + counts
+ provenance) from the raw rows, and have the frontend read it exactly like it
already reads `forecast-sites.json` and `live.json`. Raw rows stay the single
source of truth; the summary is a generated view, never authoritative (the same
principle as `SITES_INDEX.md`).

---

## 6. Proposed architecture (described, not coded)

```
GitHub Actions
  ┌────────────────────────────────────────────────────────────┐
  │ observations.yml (exists, every ~2h)                       │
  │   read stations ──► compare to PUBLISHED forecast          │
  │   append data/observations/YYYY-MM.jsonl ──► commit        │
  └────────────────────────────────────────────────────────────┘
                              │ (raw rows, source of truth)
                              ▼
  ┌────────────────────────────────────────────────────────────┐
  │ NEW: analyze-accuracy.ts (pure domain module + script)      │
  │   read data/observations/**.jsonl                          │
  │   per site, and split by band / month / direction / lead   │
  │   refuse figures below minimum n                           │
  │   write public/generated/forecast-accuracy.json            │
  └────────────────────────────────────────────────────────────┘
                              │ (small generated file)
                              ▼
  Build (weather-refresh / pages) ──► deployed with the site
                              │
                              ▼
  Frontend
   • a line in each site panel:  "Accuracy: 78% (n=412, ±2 m/s/±30°)"
   • a new "Accuracy" page:      per-site table + drill-down + filters
   • honest empty state:         "collecting — n=12, not enough yet"
```

Two scheduling choices, both free:

- **Cheapest / recommended first:** run the analysis inside the existing build
  (`npm run build`). The compute is trivial (read a few hundred KB, do
  arithmetic), and the refresh cron already rebuilds several times a day, so the
  summary is never stale.
- **Alternative if build time ever matters:** a slow `accuracy.yml` (daily) that
  writes the summary; keeps build light and gives a change history of the
  outputs. Not needed at current volume.

Plus a small but important addition the current design lacks:

- **Liveness.** Make the recorder **fail loudly** when its forecast source is
  unreachable (instead of exiting 0), and add a check that fails/warns if no new
  rows appeared in N hours. This is what would have surfaced §1b automatically.

---

## 7. The "accuracy report" button and drill-down (UX)

The app is phone-first and the site detail sheet already exists, so put the
report in two places:

1. **In the site panel (compact).** One line under the existing source/age
   block:
   `Forecast vs. this station: 78% within ±2 m/s (±30°) over 412 hours.`
   with a "Details" affordance. If n is too small: `Collecting — 12 hours so
   far, not enough to score yet.`

2. **A dedicated "Accuracy" page**, reached from the header menu next to
   **Log** (same visual language, same mobile layout). Contents:
   - a site table: name, score/agreement %, N, last observation, "no station";
   - select a site → cards:
     - **Overall** (bias, MAE/RMSE, direction error, verdict agreement, safety
       hours);
     - **By wind strength** (calm/light/moderate/strong bands) — the "is it
       better in low winds?" question;
     - **By month / season** — the "is it better in February?" question;
     - **By direction** — does it do better in the site's ideal sector?;
     - **By lead time** — only once `issued` is reliably present;
     - **Scatter**: forecast (x) vs. measured (y) with the 1:1 line;
     - **Provenance & caveats**: which stations, `ageConfirmed` share, station
       distance, "this is forecast vs. station, not vs. the launch".
   - A short plain-language legend so a pilot who has never seen the feature can
     say what the number means (this is chunk D's actual Definition of Done).

Honesty rules baked into the UI: no % without N; no score for a stationless
site; small-n figures replaced by "collecting"; always show the tolerance
definition; always date the last observation.

---

## 8. Free-tier budget (the "don't get forced out" check)

- **GitHub Actions:** for a public repo, standard-runner minutes are free. The
  observation job is seconds-to-a-minute, four to twelve times a day. Adding the
  analysis to the build adds negligible time. If the repo is private, minutes
  apply, but the jobs remain tiny. **The design does not multiply CI cost.**
- **Cloudflare:** the recommended design adds **nothing** — no KV, no D1, no new
  endpoint, no Worker change. The Worker stays stateless. Its existing free
  request quota is untouched.
- **Repository size:** ≈1 MB/month of observation rows, ≈12 MB/year. Fine for
  now; §5 lists the cheap mitigations.
- **Bottom line:** the recommended design adds **≈0 recurring cost**. The only
  way to "get forced out" is to choose a database/VPS path that is unnecessary
  here.

---

## 9. Recommended work plan (mapped onto the existing Phase 4)

`BLOCKS.md` Phase 4 already sequences this as chunks A–E. The request is mostly
chunks C and D. Proposed order, smallest first:

| Step | What | Status / notes |
|---|---|---|
| **A** | The recorder | **Built, but apparently stopped — fix/verify first (§1b).** |
| **A2** | Liveness: fail loudly when the forecast source is unreachable; alert on a gap in rows. | New, small, high value. |
| **C** | The numbers: `analyze-accuracy` — per-site + strata, min-n guard, circular direction stats. | **Core of the request.** |
| **C2** | Define and freeze the headline "accuracy %" (tolerance + rule) in `docs/DECISIONS.md`. | Needs one owner decision. |
| **D** | Show it: site-panel line + Accuracy page + legend. | The requested "button". |
| **B** | Lead time: make `issued` mandatory and decide how to treat rows without it. | Needed before "skill by lead time". |
| **E** | Apply a correction to displayed wind. | **NOT approved. Do not start as a continuation of D.** |

Notes that change the old plan slightly:

- Chunk B is partly overtaken: `issued` is already written on new rows, so lead
  time is recoverable going forward; the job is to make it consistent and decide
  what to do with the 66/81 rows that lack it.
- `ageConfirmed: false` (Holfuy) is 45/81 of current rows. Decide whether to
  exclude, or include with a visible footnote, **before** publishing a number.
- Nothing meaningful can be shown until there are weeks of rows. The UI must be
  built to say "collecting" gracefully from day one.

---

## 10. Risks and open questions (need the owner)

1. **Recorder silent for ~24h — investigate immediately.** (Highest priority.)
2. **Headline metric definition.** Is the headline a "% within ±2 m/s and ±30°",
   or "% of verdicts that agreed"? Pick one and freeze it; mixed definitions
   across the UI will undermine trust.
3. **`ageConfirmed: false` policy.** Include with a note, or exclude? Honesty
   rule says at minimum it must be disclosed.
4. **Station-less sites.** 3 enabled sites can never be scored. Confirm they
   should say "no station" rather than be hidden.
5. **Representativeness.** Owning that a score is forecast-vs-station (not
   vs.-launch) is a product statement, not just a footnote.
6. **Repo visibility** (public vs. private) changes the exact CI cost, not the
   design.
7. **Do not drift into calibration.** Chunk E stays unapproved.

---

## 11. Handoff to the coding client

**Read first, in this order:** `AGENTS.md`, `MASTER_SPEC.md` §10–§12 and §20,
`BLOCKS.md` Phase 4, `docs/FORECAST_VERIFICATION.md`, `docs/FORECAST_INTEGRITY.md`,
then `src/domain/observationLog.ts`, `scripts/record-observations.ts`,
`scripts/check-forecast.ts`, `.github/workflows/observations.yml`.

**Do this, in one block at a time, stopping for review per `AGENTS.md`:**

1. **Verify the recorder is running** and fix why it stopped. Make it fail
   loudly when the published forecast cannot be fetched (today it warns and
   exits 0). Add a "no new rows in N hours" warning. Confirm on the real
   schedule, not just a manual dispatch. *(This is the urgent one.)*
2. **Build `analyze-accuracy`** as a pure domain module plus a thin script:
   read `data/observations/**.jsonl`; per site compute bias, MAE, RMSE, circular
   direction error, verdict-agreement both ways, and the safety hours; split by
   wind band, month, direction, and (where `issued` exists) lead time; **refuse
   to emit a figure below the minimum sample count**; write a small
   `public/generated/forecast-accuracy.json`. Unit-test the arithmetic against
   hand-checked rows, including a wraparound-direction case.
3. **Define the headline %** (tolerance + rule) and record it in
   `docs/DECISIONS.md` before building the UI around it.
4. **Build the UI**: the compact line in the site panel and the Accuracy page
   with drill-down and a plain-language legend. Reuse the existing generated-file
   fetch pattern and the existing page/menu conventions. Ship graceful
   "collecting" states.
5. **Do not** add D1/KV, a VPS, or any per-visitor fetch. Do not start chunk E.

**Guardrails (from `AGENTS.md` and the repo's own rules):**

- Never invent a reading, score, or station for a site that has none.
- Raw rows are append-only; never rewrite `data/observations/`.
- Derive every displayed number from the rows; never store a running total.
- Keep the recorder independent of Open-Meteo's rate limit (it reads the
  *published* forecast; keep it that way).
- One block per session; run its Definition of Done, update `PROGRESS.md`,
  commit, stop.
- Prefer the repo-as-database already established; treat any database proposal
  as out of scope until the owner says otherwise.

**Definition of done for the whole feature (proposed):**

- The recorder demonstrably accumulates rows on its own schedule, and a broken
  run is visible rather than silent.
- `npm run` analysis produces a per-site summary with counts and refuses
  small-n figures; unit tests pass; production build passes.
- The site panel and Accuracy page show the score only with N and the tolerance,
  say "no station" where true, and say "collecting" where warranted.
- Verified live on a phone, not just locally; `PROGRESS.md` updated; committed.

---

## 12. Prototype strategy — in-repo "local lab", not a separate project

Follow-up question (2026-09-24): should this be built inside WeatherApp, or as a
side project that runs locally for a few days and is merged later?

**Recommendation: build it inside this repository, but as an isolated,
local-only, disposable harness — a "lab". Not a separate repo, and not straight
into the shipping app.**

### Why not a separate repo

A separate project would have to re-read the site YAML, the observation rows and
the flyability rules, and re-implement the pairing and scoring. That is a
guaranteed second copy of the arithmetic, which will drift from the shipping
copy — exactly the "second source of truth" failure this repo has already
rejected for the edit log. It also means writing the analysis twice: once for the
prototype, once for real. The thing being tuned *is the arithmetic*, so the
prototype should run the arithmetic that is going to ship.

### Why not straight into the app

Because the requirement is to see it working offline before it is public. Raw
experimental UI inside `src/` ends up in the production bundle, gets picked up by
the build, and is hard to throw away. Keep it out of the shipped app until it
has earned its place.

### The shape: one analysis module, one local harness

- **The arithmetic lives once, in `src/domain/`** (or a new
  `scripts/analyze-accuracy.ts`). That module *is* the deliverable; the lab and
  the shipping app both call it. Building it in-repo from day one means the
  "merge" is a move, not a rewrite.
- **The lab is a folder that never enters the production build** — its own entry
  point and its own dev command, not imported by `src/`. It imports the real
  domain modules directly, so what it proves is what ships.
- **It reads the real rows** from `data/observations/**.jsonl` by default.
- **It can also run a local collector loop** (reusing the existing
  `collectLiveSamples` + pairing rules, writing to a lab-only file) so you can
  generate *fresh* days of data fast without waiting weeks, and so the tuning
  does not depend on GitHub's scheduler. This is optional and touches nothing in
  the canonical data.
- **It serves a small local web page**: a table of all sites with the score and
  N, and drill-down per site (by wind band, by month, by direction, scatter with
  the 1:1 line). Runs offline once data is cached.
- **A local "cron"** on Windows is either a Task Scheduler entry running the
  collect command on an interval, or a single long-running loop while you
  iterate. It costs nothing and consumes no GitHub minutes.

### What "merge later" then means

1. The analysis module (already written and tuned in the lab) stays where it is
   and gets called by the build.
2. Add the generated `public/generated/forecast-accuracy.json` and the real
   Accuracy page to the app.
3. Delete the lab folder, or keep it as a development tool — it is not shipped
   either way.

### The free-tier reassurance, restated

- **Local lab:** $0, no GitHub usage at all while running locally.
- **Production analysis:** pure arithmetic over ~1 MB/year of text; runs inside
  the build that already happens. No database, no Cloudflare change, no new
  workflow, no per-visitor fetch. Added recurring cost ≈ 0.
- **The only recurring cost that exists today is the recorder's commits, and
  that already exists.** Do not raise its frequency, and nothing here can push
  the project out of the free tier. The "beast" to avoid is a database / VPS /
  always-on server, and this plan adds none.

### One honesty rule for the lab

It may use synthetic or injected-bias data to test that the math is right, but
synthetic rows must stay in the lab and never enter `data/observations/` or any
generated file a visitor can see. The canonical rows are real measurements only.

### What the lab does NOT replace

**Fix and keep the real recorder running.** The lab is for iterating on the
maths and the UI; the canonical dataset is the one the production cron
accumulates, and it is the one that matters in a year. The lab should not become
the place the data lives.

---

## 13. Growing the catalogue — adding sites needs no new code

A requirement as the catalogue grows (sites are added through the editor): the
accuracy system must pick up new sites by itself.

It already does, and the reason is structural rather than something to remember:

- **The recorder** iterates every enabled site that has a `station:` block
  (`collectLiveSamples`), so a newly added site begins contributing rows on the
  next cron run with nothing to configure here.
- **The analyzer** rebuilds the site list from `sites/**/*.yaml` on every run, so
  a new site appears in the report immediately - with `n=0` and a "Collecting"
  note until rows arrive.
- **A site with no station** is shown as "No station attached - this site can
  never be scored", not silently omitted.
- **A site renamed, archived or moved** leaves rows behind; the analyzer now
  reports those ids in an `unknownSites` warning (and on the lab page) instead
  of dropping their history silently.

One real precondition, worth stating because it is easy to assume otherwise: a
new site needs **both** a station **and** coordinates. Coordinates are what let
the collector fetch a forecast to compare against; a site with a station but no
coordinates will have nothing to pair with and will simply stay at `n=0`. That
is honest behaviour, not a bug - but it is a reason to make sure new sites are
placed on the map.

### The one-week review

Nothing is shown on the site yet, deliberately. After roughly a week of rows:

1. `git pull` (the machine's clone is not the source of truth - the repo is).
2. `npm run lab:analyze && npm run lab:serve`.
3. Read the output honestly before trusting it: how many **hours** per site, how
   much of that is **independent days**, how many hours in the **strong-wind
   band**, how many `falseGreen`, and whether the bias is consistent enough to
   be a site property rather than weather noise.
4. Only then decide whether a beta badge on the site is justified.

---

## 14. The scoring method, fixed v1 (2026-10-06)

The first pass scored every site the same way and produced two kinds of
misleading number: a site dragged down by hours nobody flies, and a site
("Arild") showing **100% from two windy hours**. This section is the method
that replaces it. It is deliberately spelled out in full, because the badge
that eventually reaches a pilot must be explainable in the same words.

### The rules

1. **Speed is scored at every wind speed.** The model's light-wind over-read
   (+0.8 m/s observed) is a real finding and is kept.
2. **Direction is scored only at or above a cutoff.**
   `cutoff = max(3 m/s, the site's own verified min_ms)`. Below ~3 m/s a cup
   anemometer barely turns and the model is guessing, so a direction "miss"
   there is noise, not a forecast failure. Measured: direction agreement runs
   42% (0–1 m/s), 63% (1–2), 71% (2–3), then jumps to 81% at 3–4 and flattens
   at 90%+ above 4.
3. **The headline is accuracy in launchable wind** — the share of hours at or
   above the cutoff within **both** ±2 m/s and ±30°. Light-wind hours are still
   recorded, still counted for speed, and still shown as their own band; they
   are simply not in the headline denominator.
4. **A headline is not shown at all with fewer than 10 launchable hours** — a
   percentage from two windy hours is worse than none, because it looks like a
   result.
5. **Reference quality is reported per site.** `good` = verified and ≤5 km;
   `provisional` = unverified, unknown distance, 5–15 km, or the same station
   attached to two sites; `unusable` = no station or >15 km. Unusable sites are
   flagged, not silently scored.
6. **Confidence** requires ≥100 paired hours *and* ≥10 launchable hours; below
   that a site says "collecting".
7. **Stability** compares the first half of the period with the second. A large
   swing means the figure is not yet settled.
8. Reported per site: n, distinct days, launchable n, bias, MAE, **median**
   absolute error (robust to one bad pairing), RMSE, **signed** circular
   direction bias, direction MAE, speed-within %, direction-within %, verdict
   agreement, optimistic hours, and **falseGreen** (we showed flyable while the
   meter was over the site's own limit — must be zero).
9. Rows for a site id the catalogue no longer knows are surfaced as
   `unknownSites`, never dropped.

### The transparency info box (text for the badge)

To be shown whenever the badge is: a short, plain explanation, in the same
spirit as the rest of the app.

> **How this is measured.** We compare what the forecast said for this site
> against the nearest wind meter, hour by hour. The percentage is the share of
> those hours the forecast got within 2 m/s and 30°, counting only hours windy
> enough to fly (below about 3 m/s, wind direction is meaningless). It is
> forecast-versus-that-meter, not versus the launch — the meter can be up to a
> few kilometres away on a different slope. We show how many hours the number
> is based on, and say "collecting" until there are enough.

### Status

Fixed and implemented 2026-10-06 in `src/domain/accuracy.ts` (17 tests). To be
re-read in 2–3 days on fresh data, and only then considered for a badge on the
site. The method belongs in `docs/DECISIONS.md` at the moment the badge ships.

---

## Appendix A — measured facts behind this report

| Item | Value |
|---|---|
| Site files | 40 (`sites/**/*.yaml`) |
| Enabled sites | 21 |
| Enabled sites with a station | 18 |
| Enabled sites with no station | 3 (`dk-dokkedal`, `dk-lokken`, `valfjall-ulebergshamn`) |
| Observation rows recorded | 81 |
| Distinct stations in rows | 17 |
| Observation date range | 2026-09-21T19:22Z → 2026-09-22T06:30Z |
| Rows with `ageConfirmed: false` | 45 of 81 |
| Rows with `issued` (lead time) | 15 of 81 |
| Observation file size | ~16 KB (≈200 bytes/row) |
| Recorder schedule | `.github/workflows/observations.yml`, every 2h |
| Published forecast reachable | yes; `generatedAt` 2026-09-23T06:47Z |

## Appendix B — key files referenced

- `docs/FORECAST_VERIFICATION.md` — the design of this feature; why it exists.
- `docs/FORECAST_INTEGRITY.md` — the two forecast bugs and the model-vs-model
  caveat.
- `BLOCKS.md` → "Phase 4 — Forecast verification" — chunks A–E.
- `src/domain/observationLog.ts`, `scripts/record-observations.ts`,
  `.github/workflows/observations.yml` — the recorder.
- `scripts/check-forecast.ts` — the (different) pipeline-correctness ruler.
- `scripts/collect-forecasts.ts`, `src/providers/forecast/*` — the forecast.
- `src/providers/live/collectLive.ts` — reading the stations.
- `editor-worker/` + `docs/PUBLISHING.md` — Cloudflare publishing, stateless.
- `data/observations/2026-09.jsonl` — the rows.
- `docs/DECISIONS.md` — "the repository is the database" and related decisions.
