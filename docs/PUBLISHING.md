# PUBLISHING.md — editing Startvind from the public website

How a site edit made in a browser becomes a live change, and what has to
be set up once for that to work.

## The shape of it

```
phone/browser          Cloudflare Worker            GitHub
─────────────          ─────────────────            ──────
edit a site        →   read the current file    →   contents API
sign the edit          check name + club
press Publish      →   merge + validate
                       one atomic commit:       →   git data API
                       site file + log line          ↓
                                                    Pages deploy
                                                    ↓
progress shown     ←   read workflow run        ←   actions API
                                                    ↓
                                                    live site updated
```

**There is no sign-in.** Anybody can edit; what a save carries instead
of a password is a name, a club that has to be a real Swedish one, and
one affirmation - recorded in `data/edit-log.jsonl` in the same commit
as the site file. See `docs/DECISIONS.md` for why that trade is the
right one here, and `docs/CLUBS.md` for the club list and its matching
rules.

The **GitHub repository stays the single source of truth.** The Worker
caches nothing and stores nothing; every publish reads the current file,
merges into it, and writes it straight back. If the Worker is down, the
website, the weather collection and the Soaring site all carry on
untouched — no visitor traffic passes through it.

A published commit triggers the normal Pages deploy, so **a new site
receives its forecast through the existing collection process** with
nothing extra to run.

Do not rely on `weather-refresh.yml`'s five-minute cron for anything
time-sensitive. Measured over 48 hours it produced 15 runs - gaps of 117
to 318 minutes, every run successful. GitHub honours a high-frequency
schedule when it feels like it. That is why **live station wind no
longer comes from the build at all**: the Worker reads the stations on
demand (`/api/live`), and the built `live.json` is only a fallback.

## Why a Worker rather than a token in the browser

A GitHub token that can write to the repository must never reach a
browser: anything in frontend code or `localStorage` is readable by
anyone who gets the device, and cannot be scoped down usefully. So the
Worker alone holds the GitHub credential — in Cloudflare's secret store,
never in this repository. The browser asks; the Worker writes.

`ADMIN_PASSWORD` and `SESSION_SECRET` are still configured and still
work, but **nothing on the ordinary path uses them**. They issue a
session that marks an edit as an admin's in the log, and they are there
for the admin layer (revert, hide, block) that has not been built yet —
see `BACKLOG.md`. When a session is used it is a bearer token rather
than a cookie: the website and the Worker are on different hosts, so any
session cookie would be a third-party cookie, blocked outright by
Safari and therefore on the iPhone this has to work from.

## What the Worker serves

| Endpoint | Auth | What it does |
|---|---|---|
| `/api/health` | none | Is publishing available, and the repo head to base an edit on |
| `/api/publish` | signed edit | Site file + log line in one commit |
| `/api/verify` | signed edit | A log line saying a site is still accurate. No caller today |
| `/api/issue` | signed edit | Appends to `data/issues.jsonl` |
| `/api/live` | none | Reads every site's station on demand, edge-cached 2 min |
| `/api/station-observation` | none | One station's current reading, for the finder's preview |
| `/api/deployment` | none | Where a published commit has got to |
| `/api/login`, `/api/session` | password | The admin session. Nothing on the ordinary path uses it |

Every write endpoint checks the request's `Origin` against
`ALLOWED_ORIGINS`. That is a speed bump rather than a security boundary —
anything that is not a browser sends whatever it likes — but it costs
nothing and stops another site quietly driving a visitor's browser.

The two read endpoints that fetch third-party data (`/api/live`,
`/api/station-observation`) go through the host allowlist in
`src/providers/live/sourceUrl.ts`, shared with the collector so the two
cannot drift. Redirects are never followed.

## One-time setup

### 1. A GitHub token for the Worker

Create a **fine-grained personal access token**:

- Repository access: **only** `Utskottet/FlyWeather`
- Permissions: **Contents: Read and write**, and **Actions: Read** (for
  the deploy-progress display). Nothing else.
- Expiry: whatever you are willing to rotate. The Worker reports a clear
  "could not reach GitHub" error when it lapses; nothing is lost.

### 2. Cloudflare

Use the existing Cloudflare Builds GitHub integration in the separate
Startvind account. The public website stays on GitHub Pages.

- Repository: `Utskottet/FlyWeather`
- Production branch: `main`
- Worker name: `startvind-editor`
- Root directory: repository root
- Build command: empty
- Deploy command: `npx wrangler deploy --config editor-worker/wrangler.toml`
- Non-production branch builds: disabled

Cloudflare deploys on push. Do not add a second GitHub Actions Worker
deployment workflow or a `CLOUDFLARE_API_TOKEN` repository secret for it.
In Cloudflare, inspect the build log and deployed commit to verify that a
specific fix shipped. A healthy endpoint alone does not prove its version.
If build watch paths are narrowed later, include shared domain modules and
package manifests as well as `editor-worker/`.

Set `GITHUB_TOKEN`, `ADMIN_PASSWORD`, and `SESSION_SECRET` as runtime
Secrets in the Worker's Cloudflare settings. They persist across code
deployments. Never put their values in source code or chat.
`SESSION_SECRET` should be a long random string; rotating it signs out
existing sessions.

The production backend address is
`https://startvind-editor.startvind.workers.dev`.
Manual `npm run worker:deploy` is only a troubleshooting fallback, not
the normal publishing workflow.

### 3. Tell the website where the Worker is

In GitHub: **Settings → Secrets and variables → Actions → Variables**, add

```
VITE_EDITOR_API_URL = https://startvind-editor.<subdomain>.workers.dev
```

A repository *variable*, not a secret — it is only an address, and it is
compiled into the public bundle either way.

It is read by **both** `pages.yml` and `weather-refresh.yml`. That is
deliberate: the refresh workflow rebuilds and redeploys the whole site,
so a build-time setting present in only one of them gets switched back
off the next time the other runs.

Any push, or the next scheduled refresh, then serves a site with
publishing enabled.

### 4. Origins

`ALLOWED_ORIGINS` in `editor-worker/wrangler.toml` is an exact-match
allowlist and never `*`. Any new address the site is served from has to
be added there and the Worker redeployed.

## Using it

**Add site** and **Issues and improvements** are in the header menu,
**Log** below them, and **Edit site** at the bottom of any site's panel.
They are visible to every visitor wherever a Worker is configured — no
flag, no password.

The editor opens on an instruction screen that has to be acknowledged,
then the form. Saving asks for a name and a club every time: nothing is
remembered between visits, deliberately, so a borrowed phone never
offers somebody else's name (see `docs/DECISIONS.md`).

Progress is reported in two parts, because they fail independently:

| Shown | Means |
|---|---|
| Saved to GitHub | The commit exists. Your work is safe from here on. |
| Deploying | The Pages workflow is running. |
| Live on the site | Done. |
| Deploy failed | **The commit is still safe.** Only the deploy needs attention. |

A failed publish never costs work: the draft stays on screen and is also
mirrored into `sessionStorage`, so a reload or a backgrounded phone can
be resumed.

A refused publish says which of the two it is. **"Someone else changed
this site"** means the file moved under you — reload and re-apply. It
compares the file's own content, not the branch head, so an unrelated
commit landing mid-edit does not throw your work away. **"Ingenting har
ändrats"** means the form was saved untouched, which is refused rather
than committed: a no-op commit would claim an edit that did not happen.

## Editing locally instead

With no `VITE_EDITOR_API_URL` set, `npm run dev` gives the same editor
writing straight into `sites/` — no account, no network, instant. Still
needs a commit and push to reach anyone. Both paths share
`src/domain/siteYaml.ts`, so a file written either way comes out
identical.

To exercise the real publishing path locally, put the Worker's URL in
`.env` and run both `npm run dev` and `npm run worker:dev`.

## Safety properties, and where each is enforced

| Property | Where |
|---|---|
| A move keeps fields the editor never models | `publish.ts` merges against the **original** file |
| A move cannot half-apply | One commit writes and deletes together (Git Data API) |
| A concurrent edit cannot be silently overwritten | `baseSha` check, plus a non-forcing ref update |
| A bad file cannot break the deploy | The **merged** document is validated against `siteFileSchema` |
| A duplicate id cannot break every site | Checked against the repo tree before committing |
| Writes require authentication | Bearer session on every publishing endpoint |
| Every change is attributable | `last_edited_by` required; `last_edited_at` stamped server-side |
| Nothing escapes `sites/` | Path shape validated before any repository call |
