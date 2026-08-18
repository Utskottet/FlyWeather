# PROGRESS.md — Block status

Read `BLOCKS.md` for what each block means. Update this file at the end of
every block (see `AGENTS.md` → "Block discipline") and commit it alongside
the block's work.

| Block | Description                                  | Status      | Notes |
|-------|-----------------------------------------------|-------------|-------|
| 1     | Repo scaffold + SITES.md schema/parser        | done        | commit e337274; CI green |
| 2a    | CPS data: index + m.cps.to + SE South/East    | not_started |       |
| 2b    | CPS data: Öresund/West + Bjäre                | not_started |       |
| 2c    | CPS data: Ven + Denmark                       | not_started |       |
| 3     | Wind rose SVG component                       | not_started |       |
| 4     | Map integration                               | not_started |       |
| 5     | Forecast provider + time slider               | not_started |       |
| 6     | Live wind adapters                            | not_started |       |
| 7     | Height mode                                   | not_started |       |
| 8     | Autonomous deployment (Actions + Pages)       | not_started |       |
| 9     | Polish                                        | not_started |       |

Status values: `not_started`, `in_progress`, `blocked`, `done`.

## Log

- 2026-08-18: `BLOCKS.md` created, splitting `MASTER_SPEC.md` milestones
  into checkpointed blocks. Block 2 pre-split into 2a/2b/2c by region
  (24 enabled sites was too many CPS fetches for one confident session).
  Added a standard end-of-block chat report format to `AGENTS.md`. No
  implementation work started yet.

## Block 1 complete: repo scaffold + SITES.md schema/parser
- Status: done
- Definition of Done: [x] npm run build passes  [x] npm test passes
  (14/14)  [x] npm run validate:sites passes (29 sites, 24 enabled)
  [x] CI green on GitHub
- Commit: e337274 "Block 1: repo scaffold, SITES.md schema/parser, CI"
- Files changed: 16 files, +4876
- Deferred / unresolved: map library choice (MapLibre vs Leaflet) not
  decided yet — deferred to Block 4 per docs/DECISIONS.md. No Playwright
  yet (not needed until a block has UI to test).
- Next: Block 2a — CPS index + m.cps.to + SE South/East region sites
