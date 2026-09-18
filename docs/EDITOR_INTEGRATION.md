# EDITOR_INTEGRATION.md — folding the site editor into Startvind

What it takes to put an **Edit site** button on every site and an **Add
site** button on the main map, with the editor running *inside* the app.

Written 2026-09-18 against `admin-experiment/` as built on 2026-08-25.
Nothing here is implemented yet.

## What `admin-experiment/` actually is

A prototype shell around a real piece of work. The valuable part is the
editing UI; the Cloudflare parts were scaffolding to let it run somewhere
while it was being built, and are **not** part of what gets integrated.

| Keep (plain React + zod + yaml) | Discard (prototype hosting scaffolding) |
|---|---|
| `components/CompassRoseEditor/` — drag handles, push-to-resolve, hit-testing | `worker/index.ts`, `worker/kv.ts`, `worker/auth.ts`, `worker/types.ts` |
| `components/SiteForm/` — all field components | `domain/api.ts` (33 lines of `fetch("/api/…")`) |
| `domain/siteDraft.ts`, `domain/bandOverlap.ts`, `domain/options.ts` | `pages/LoginPage.tsx` |
| `domain/yamlExport.ts` | `wrangler.toml`, `@cloudflare/workers-types`, `wrangler` |

The main app already depends on React 19, `zod` and `yaml`, so lifting
these in adds **no new dependencies**. `react-router-dom` is only needed
if the editor keeps its own routes; opening it as a panel over the map
doesn't need it.

The password wall is also scaffolding: it exists because the prototype was
a separately-hosted public URL. Inside the app there is nothing to
authenticate until the editor can write somewhere (§3).

## 1. Tier 1 — in-app editor, YAML out

Everything below runs on GitHub Pages exactly as it is today. No backend,
no deployment, no auth, no KV.

1. Move the "keep" files into `src/components/SiteEditor/` and
   `src/domain/` (merging `siteDraft.ts` into the production schema — §2).
2. **Edit button** at the bottom of `SiteSheet.tsx`, near `links`. Opens
   the editor over the map, prefilled from the site's entry in the
   already-loaded `sites.json`.
3. **Add button** in the tool stack, opening an empty editor — prefilled
   with the map's current centre as lat/lon, which is the cheapest and
   nicest part of the whole feature.
4. Save = the Copy/Download YAML the prototype already does. The file goes
   into `sites/<country>/<region>/<group>/<id>.yaml`, gets pushed, and
   `pages.yml` rebuilds the catalogue.

The only manual step left is step 4's copy-paste-push. That's what tier 2
removes.

## 2. Schema differences that have to be resolved first

`src/domain/siteFile.ts` (production) vs
`admin-experiment/src/domain/siteDraft.ts` (editor). Counts are against
the 30 real site files as of 2026-09-18.

| Field | Production | Editor | Severity |
|---|---|---|---|
| `id` | human slug (`hovs-hallar-nv`); equals the filename; appears in tests and URLs | `crypto.randomUUID()`, server-assigned | **Blocker.** Needs slug generation from `name` plus a uniqueness check against the catalogue. |
| `country` / `region` / `group` | **derived from the file's path** by `parseSitePath()` | authored form fields | **Blocker.** The editor's values must *produce* the path. Its dropdown offers 25 Swedish landskap; production has only ever used `skane`, `nordjylland`, `nordsjaelland`. |
| `sector` vs `bands` | one `sector` with `ranges[]` plus `verified`; marginal zone derived at runtime from the fixed `MARGINAL_SECTOR_PADDING_DEG` (11.25°) | `bands[]`: green core plus per-side `margin_under_deg` / `margin_over_deg`; no `verified` at all | **Blocker.** See §4. |
| `coordinates.source` | free-text provenance — **used by 25 of 30 files** | cut from the editor | **Silent data loss** on every round-trip. |
| `wind.notes` | free text — 1 file (`lernacken`, archived) | cut | Silent loss. |
| `wind.hard_max_gust_ms` | read by `computeSpeedFit()` | cut | 0 files use it, but it would be uneditable. |
| `station.provider` | **required** (`z.string().min(1)`) | optional | Editor could produce a file the build then rejects. |
| `images` | supported | cut entirely | 0 files use it — harmless. |
| `pilot_level` | free string | closed enum `easy` / `medium` / `difficult` | 0 files use it — harmless. |
| archived state | derived: file sits under `archive/` | `status` field, `active` or `hidden` | Maps cleanly: hidden becomes the `archive/` folder. |
| `schema_version` | literal `2` | literal `1` | Trivial constant. |
| `createdAt` / `updatedAt` | no equivalent | present | Drop on write; they were KV bookkeeping. |

Once the editor lives in the app there is no reason to keep two schemas.
`siteDraft.ts` should be **merged into** `siteFile.ts` rather than mapped
to it — one schema, one validator, the same one `build-sites-catalogue.ts`
already runs at build time. That also means the editor gets production's
validation for free instead of drifting from it again.

The good news buried in the table: production **already supports multiple
sector ranges** (added for Klamby's bidirectional winch strip), so the
editor's several-independent-green-cores model is not a mismatch. The only
genuinely homeless concept is the per-side authored margin.

## 3. Tier 2 — writing to the repo without a server

Tier 1 leaves you copying a YAML file by hand. To close that loop from a
static site, the browser itself commits:

- A fine-grained GitHub PAT (contents: write, this repo only), pasted once
  and kept in `localStorage`.
- Save calls the GitHub Contents API: either a direct commit to `main` or
  a branch plus PR. PR is safer — `pages.yml` validates the catalogue
  before anything reaches the live site; direct is faster.
- Still a static site. Still no server, no Cloudflare, no KV.

This is also the point where "who can edit" becomes a real question,
because before it there is nothing to protect: without a token, Save only
ever produces a file on your own machine.

## 4. Decisions that gate the work

### a. The wind-sector margin model

The editor's centrepiece is a green core with authored orange margins per
side. Production derives its orange from one fixed constant.

1. **Extend production** — optional `margin_under_deg` / `margin_over_deg`
   per range in `siteFile.ts`, defaulting to `MARGINAL_SECTOR_PADDING_DEG`
   when absent. Backward-compatible with all 30 existing files, roughly 30
   lines across `flyability.ts` and `WindRose.tsx` plus tests.
2. **Drop margins on save** — the editor silently discards the one thing
   it was built to author.
3. **Cut the feature** — throw the work away.

**Recommended: option 1.** Small, backward-compatible, and it gives a
`BACKLOG.md` item a real answer: authored margins let "borderline
direction" and "speed not verified yet" stop sharing the same orange.

### b. Fields the editor doesn't model

Rather than re-adding UI for `coordinates.source`, `wind.notes` and
`hard_max_gust_ms` one at a time, the writer should **read the existing
YAML, merge the edited fields, and write back**, so anything the editor
doesn't model survives untouched — including fields added later that it
has never heard of.

This matters most for `coordinates.source`: real provenance prose on 25 of
30 sites, directly serving AGENTS.md's "never invent production data".

### c. Who sees the buttons

The site is public and has real visitors. Gate both buttons behind
`?admin=1` remembered in `localStorage` — invisible to pilots, one URL for
you, no auth code in the public app.

A "suggest an edit" flow for pilots is a legitimate product idea, but it
needs moderation, spam handling and attribution, and shouldn't be smuggled
in through this door.

## 5. Known limits

- **24 of 30 sites can't be reached from the map.** 19 are archived and 5
  have `lat: null`; neither renders a marker. So an Edit button on the map
  covers the 11 active located sites, and the editor needs its own list
  view for the rest — the prototype's `SiteListPage.tsx` is worth keeping
  for exactly this reason.
- **`admin-experiment` has no automated tests.** Its PROGRESS.md log was
  verified with ad-hoc Playwright scripts that were discarded. Once these
  components live in the main app they fall under its existing Vitest +
  Playwright setup and need real coverage — especially `bandOverlap.ts`
  and the drag/push logic.
- **Live station sourcing is still unexplored** (PROGRESS.md item 1).
  `StationFields.tsx` is a placeholder. A separate conversation; it should
  not block the buttons.
