# AGENTS.md — Autonomous Development Rules

Read `MASTER_SPEC.md` first. It is the product authority.

## Mission

Build and deploy the South Sweden Paragliding Weather Map with minimal human supervision.

The Holfuy-style site rose is the product's central visual language. Do not replace it with generic pins.

## Block discipline (token/session budget)

Work is split into checkpointed blocks defined in `BLOCKS.md`. This section
overrides "continue autonomously until a real blocker" below **at block
boundaries** — that rule still governs behavior *within* a block.

- Before starting work, read `PROGRESS.md` to find the current block.
- Work exactly one block per session. Do not start the next block in the
  same run, even if token budget remains — the stop is for human
  verification, not just to conserve tokens.
- Within a block, follow the normal autonomy rules below (don't ask about
  libraries, CSS, file layout, etc).
- At the end of a block: run its Definition of Done checks, update
  `PROGRESS.md`, commit, and stop.
- If a block is too large to finish cleanly in one session, stop at a clear
  sub-point, split it in `PROGRESS.md` (e.g. "Block 4a done, 4b next"),
  commit, and report — do not push through with degraded quality or leave
  work uncommitted.
- If genuinely blocked mid-block (see "Questions to user" below), stop
  immediately, commit whatever is coherent, and report the blocker instead
  of skipping ahead to a later block.

### End-of-block report

Every time a block (or sub-block, e.g. `2a`) finishes — whether done or
blocked — post this report as the final chat message of the session, and
append the same content as a new entry under `PROGRESS.md`'s `## Log`:

```
## Block <N> complete: <name>
- Status: done | blocked
- Definition of Done: [x] item  [x] item  [ ] item (unmet — see notes)
- Commit: <short hash> "<subject line>"
- Files changed: <N files, +X/-Y>
- Deferred / unresolved: <notes, or "none">
- Next: Block <N+1> <name>
```

This is the single place the human checks to know a block finished — do
not rely on the user reading `PROGRESS.md`'s status column alone.

## Work mode

Continue autonomously until a real blocker is reached.

For every meaningful change:

1. inspect current code and spec;
2. implement;
3. test;
4. run production build;
5. inspect in browser;
6. test phone layout;
7. fix;
8. rerun;
9. commit.

Keep `PROGRESS.md` current.

## Never invent production data

Never invent:
- live station readings;
- forecast values;
- site coordinates presented as verified;
- wind sectors presented as verified;
- wind speed limits presented as verified;
- legal/open/closed site status.

Provisional site data must be explicitly marked `verified: false`.

If direction is known but speed limits are unverified, the app may show ORANGE/MAYBE, not GREEN due to guessed thresholds.

## Data-source behavior

Prefer original/official feeds over scraping an aggregator.

Public scraping is a fallback only when technically and legally appropriate.

Never bypass:
- authentication;
- anti-bot controls;
- passwords;
- rate limits;
- terms intended to restrict access.

Provider failure must degrade gracefully to stale/forecast/unknown state.

## Questions to user

Do not ask the user about:
- library selection;
- CSS;
- repo layout;
- TypeScript patterns;
- tests;
- minor UI spacing;
- routine refactors.

Ask only when:
- a credential/permission is required;
- a source is unusable and no fallback exists;
- site-specific flying values require pilot authority and the product cannot honestly proceed without them;
- requirements directly conflict.

## Definition of progress

A feature is not done because code was written.

It is done only when:
- tests pass;
- production build passes;
- the browser version works;
- mobile behavior was inspected;
- no fixture/fake data leaks into production.

## Git discipline

Commit coherent milestones.

Do not make automated five-minute weather-data commits to Git history.

Use GitHub Pages artifact deployments for generated weather where practical.

## Product priority

When tradeoffs occur, prioritize:

1. correct rose semantics;
2. honest data/provenance;
3. fast map glanceability;
4. mobile usability;
5. reliable NOW / +72h behavior;
6. maintainability;
7. visual decoration.

Do not begin RASP implementation until V1 acceptance criteria in `MASTER_SPEC.md` are met.
