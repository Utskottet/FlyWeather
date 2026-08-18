# DECISIONS.md — Architecture decisions

Record of decisions made where `MASTER_SPEC.md` left the choice to the
implementing agent (per its §0 mandate). Append, don't rewrite history.

## Block 1

- **Package manager / scaffold**: hand-authored `package.json` + config
  files instead of `npm create vite@latest`. The scaffolder's interactive
  "directory not empty" prompt (this repo already has `SITES.md` etc.) has
  no viable non-interactive flag that doesn't risk deleting existing files,
  and it also mis-handles Windows paths passed through Git Bash. Hand
  authoring also lines up better with the custom `src/domain` /
  `src/providers` / `scripts` layout `MASTER_SPEC.md` §40 asks for, which
  differs from stock Vite output anyway.
- **React 19, Vite 6, TypeScript 5.6, ESLint 9 flat config, Vitest 3** — the
  suggested stack in §14, current stable versions as of 2026-08. Vite/Vitest
  specifically pinned to `^6.4.3` / `^3.2.7` (not the initially-installed
  `^5.4.10` / `^2.1.4`) because those versions closed a moderate-to-critical
  esbuild/Vite/Vitest advisory chain, including a Windows-specific
  `server.fs.deny` bypass relevant to this dev environment. `npm audit`
  is clean at these versions.
- **Map library (MapLibre vs Leaflet)**: not yet decided — deferred to
  Block 4 when the map is actually built.
- **`public/generated/sites.json` is gitignored**, not committed. It's a
  build artifact of `scripts/parse-sites.ts` reading `SITES.md`; committing
  it would let generated data drift from its source. CI and the weather-
  refresh workflow (Block 8) regenerate it as part of build/deploy.
- **Sector validation**: a sector is "malformed" (§31) only if a degree
  value is outside 0–360 or `from_deg === to_deg` (zero-width). A
  wrap-around sector where `from_deg > to_deg` (e.g. 337.5 → 22.5) is valid
  by design (§29 test 4) and is *not* rejected — the rose-rendering wrap
  logic itself lands in Block 3, this block only guards the data shape.
- **`coordinates.verified: true` requires non-null lat/lon** — a coordinate
  can't be "verified" and simultaneously missing, so the schema enforces
  this pairing rather than leaving it to convention.
- **`wind_speed.verified: true` requires `good_min_ms`, `good_max_ms`,
  `maybe_min_ms`, `maybe_max_ms`** to be present (§31: "verified speed
  config missing required values -> build fails"). `hard_max_gust_ms`
  stays optional — not every site has a documented hard gust limit.
