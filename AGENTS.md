# AGENTS.md — Autonomous Development Rules

Read `MASTER_SPEC.md` first. It is the product authority.

## Mission

Build and deploy the South Sweden Paragliding Weather Map with minimal human supervision.

The Holfuy-style site rose is the product's central visual language. Do not replace it with generic pins.

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
