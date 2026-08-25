# PROGRESS.md — admin-experiment

Log for this standalone prototype only. It is not part of the main site's
block system (`../PROGRESS.md`/`../BLOCKS.md`) - see `README.md` for what
this folder is and how to run it, and the root repo's `BACKLOG.md` for the
one-line pointer to this file from the main project's docs.

## 2026-08-25: built and iterated M1-M4 in one session

Full password-protected site editor prototype, built end-to-end and
verified in a real browser (Playwright) plus raw API calls at every step -
not just typechecked. Went through several rounds of user feedback the same
day; this log captures the *final* state each piece ended up in, with the
reasoning for why, not a blow-by-blow of every intermediate draft.

### What exists right now

- **Auth**: single shared password (`ADMIN_PASSWORD` env var / `.dev.vars`
  locally), stateless HMAC-signed session cookie (`worker/auth.ts`) -
  no session store needed. `POST /api/login`, `POST /api/logout`.
- **Storage**: Cloudflare KV (`worker/kv.ts`), one `site:<id>` key per
  draft + a single `index` summary key for the list view. Full CRUD:
  `GET/POST /api/sites`, `GET/PUT/DELETE /api/sites/:id`,
  `PATCH /api/sites/:id/status` (hide/unhide).
- **Schema** (`src/domain/siteDraft.ts`): a superset of production's real
  `../src/domain/siteFile.ts`, deliberately never imported by or importing
  from it. Notable divergences and why:
  - `country`/`region` are free strings validated only by the frontend
    dropdown (`src/domain/options.ts`) - Sweden's region list is the 25
    traditional landskap (Skåne, Halland, Blekinge, etc.), not the modern
    21 län, per explicit feedback that pilots think in landskap. Denmark
    still just has `nordjylland`/`nordsjaelland`. Extending either list is
    a one-line edit to `options.ts`.
  - `pilot_level` is a closed `"easy"|"medium"|"difficult"` enum (dropdown).
  - **No `images` field at all** - explicitly cut, not deferred: "let's not
    even add images for now, remove that completely."
  - **No `hard_max_gust_ms`, no wind `notes`** - both cut as unnecessary
    for what the user called "format data."
  - **No `coordinates.source`** - cut after repeated confusion about what
    it was for; not worth keeping a field whose value isn't landing.
  - **`verified` fields are never user-toggled.** Each Fields component
    (`Coordinates`/`Wind`/`StationFields.tsx`) derives `verified` itself:
    coordinates verify once both lat and lon are typed, wind once both
    min/max are typed, station once a provider is typed. No checkboxes
    anywhere.
  - **`bands[]` is the real design centerpiece** and went through two
    full model changes today - see below.

### The wind-sector model: two iterations

**First cut** (now superseded): each band was independently colored,
either green or orange, freely mixed. Rejected by the user once they'd
actually used it - main-mode was still "hand-author every colored patch,"
not meaningfully easier than production's own YAML editing.

**Current model**, which stuck: a "band" is *always* a green core
(`from_deg`/`to_deg`), with two additional optional numbers -
`margin_under_deg` (orange padding extended **backward** from `from_deg`)
and `margin_over_deg` (orange padding extended **forward** from `to_deg`),
both defaulting to `0` and never required. Example from the spec
conversation, verified working exactly as described: core 130-250 with
`margin_under_deg: 5` and `margin_over_deg: 10` renders orange 125-130 and
250-260. Multiple independent green cores on one site are fully supported
(that's the actual point - "this way we easy add sectors and can have more
than one green sectors").

This is a much closer match to production's real model than the first cut:
production already derives a single marginal zone at runtime around one
authored `sector` (`../src/domain/flyability.ts`) - this prototype just
makes that margin's width authorable per side and per sector, instead of a
fixed constant. **It's still not a 1:1 match** - production only supports
one sector's worth of ranges (not several independent cores) and its
margin is a fixed constant, not per-side authored. `yamlExport.ts` reflects
this honestly: bands are emitted as a commented block, not force-fit into
a real `sector:` key.

Overlap rules (`src/domain/bandOverlap.ts`): green **cores** must not
overlap each other - enforced in the UI (live warning, red outline, Save
disabled) *and* server-side (`siteDraftSchema`'s `superRefine`, so a raw
API call gets a 400 too). Margins are cosmetic/derived and are
deliberately **not** included in the overlap check.

**Push-to-resolve, drag only**: dragging one core's edge into a neighbor
pushes the neighbor's edge out to match instead of just erroring
(`resolveBandPush`) - explicit feedback that erroring alone wasn't
intuitive. This is drag-only, not applied to typed numbers - a real bug
was found and fixed here: applying push to typed input let a value typed
mid-edit (e.g. "from" briefly reading past "to"'s stale default) read as a
huge wraparound sweep and push an unrelated band. Typed overlaps still just
show the warning; only continuous drag pushes live. Push itself only
resolves the clean single-shared-boundary case (XOR: exactly one of the
neighbor's two edges intrudes) - a full swallow (dragging one core all the
way over another) intentionally does **not** auto-resolve, since there's no
safe single-edge fix without collapsing the neighbor to zero width; it
falls back to the warning instead.

**Handle hit-testing bug, fixed**: when two bands touch (the normal
adjacent case), their `from`/`to` handles used to land on the exact same
pixel, and raw pointer coordinates only ever hit whichever was painted on
top - "impossible to redrag unless remove one band and start again." Fixed
by rendering `from`-handles at a slightly smaller radius (just inside the
ring, white fill) and `to`-handles at a slightly larger radius (just
outside the ring, black fill) - always two distinguishable, independently
grabbable targets regardless of angle. Verified in Playwright by dragging
each handle of two touching bands independently and confirming only the
intended one moved.

**No per-band labels** - cut, explicit feedback: "we don't need for this."

### Explicit non-goals (still true, unchanged since the original plan)

No writes to `sites/**`, `../src/domain/siteFile.ts`, or the production
build/deploy pipeline - `../eslint.config.js`'s `ignores` array (one line)
is the only file outside this folder this work has ever touched. No real
`wrangler login`/`wrangler deploy` - local `wrangler dev` only. No image
upload (no images field at all now, not even URL-only). No per-user auth.
No band-overlap resolution beyond the single-boundary push case.

### Where to start next

1. **Live station sourcing** was explicitly deferred - "important, needs
   exploring further, can range from a site with a simple URL to
   scraping.. chill until we understand." `StationFields.tsx` is currently
   just a placeholder record (name/provider/station_id/url/note) with no
   real design thought behind it. Worth a dedicated conversation before
   building further, not a quick follow-up.
2. **Deciding whether/how any of this hooks into the real site** was
   always deferred to "after testing capabilities" - that's still true.
   The natural next artifact, if/when that conversation happens, is a real
   mapping from `siteDraft.ts` + margin-model bands into
   `../src/domain/siteFile.ts`'s actual `sector`/`wind` shape - the YAML
   export's commented-block approach is a deliberate stand-in for that
   decision, not a solution to it.
3. **Full-swallow drag doesn't auto-resolve** (see above) - falls back to
   the warning, which is safe but not as smooth as the single-boundary
   case. Revisit only if it comes up as an actual friction point in use,
   not preemptively.
4. **Never actually deployed** - everything so far has run under local
   `wrangler dev` + `vite dev` (see `README.md`). Deploying for real needs
   the user's own Cloudflare account (`wrangler login`) - not something
   this session could do.
5. **No automated tests** - every check in this log was a manual
   Playwright smoke script run ad hoc and discarded, not a committed test
   suite. Worth adding real `tests/` coverage (the main repo already has
   both Vitest and Playwright set up - `admin-experiment/package.json`
   doesn't pull either in yet) if this prototype keeps growing.
