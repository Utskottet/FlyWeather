# PUBLISHING.md — editing Startvind from the public website

How a site edit made in a browser becomes a live change, and what has to
be set up once for that to work.

## The shape of it

```
phone/browser          Cloudflare Worker            GitHub
─────────────          ─────────────────            ──────
sign in            →   check password
edit a site        →   read the current file    →   contents API
press Publish      →   merge + validate
                       one atomic commit        →   git data API
                                                    ↓
                                                    Pages deploy
                                                    ↓
progress shown     ←   read workflow run        ←   actions API
                                                    ↓
                                                    live site updated
```

The **GitHub repository stays the single source of truth.** The Worker
caches nothing and stores nothing; every publish reads the current file,
merges into it, and writes it straight back. If the Worker is down, the
website, the weather collection and the Soaring site all carry on
untouched — no visitor traffic passes through it.

A published commit triggers the normal Pages deploy, and
`weather-refresh.yml` rebuilds every 5 minutes regardless, so **a new site
receives weather through the existing collection process** with nothing
extra to run.

## Why a Worker rather than a token in the browser

A GitHub token that can write to the repository must never reach a
browser: anything in frontend code or `localStorage` is readable by
anyone who gets the device, and cannot be scoped down usefully. So the
browser authenticates to the Worker with a password, receives a
short-lived session token, and the Worker alone holds the GitHub
credential — in Cloudflare's secret store, never in this repository.

The session is a bearer token rather than a cookie. The website and the
Worker are on different hosts, which makes any session cookie a
third-party cookie — blocked outright by Safari, and therefore on the
iPhone this has to work from. A bearer token is unaffected by cookie
policy and cannot be sent by a cross-site form, so it is also immune to
CSRF.

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
deliberate: the refresh workflow rebuilds and redeploys the whole site
every 5 minutes, so a build-time setting present in only one of them gets
switched back off within minutes.

Any push, or the next 5-minute refresh, then serves a site with
publishing enabled.

### 4. Once startvind.se exists

Add it to `ALLOWED_ORIGINS` in `editor-worker/wrangler.toml` and redeploy
the Worker. The list is an exact-match allowlist and never `*`: the
endpoints are authenticated, but a wildcard would let any page on the
internet drive a signed-in operator's browser.

## Using it

Open the site with `?admin=1` (remembered afterwards; `?admin=0` clears
it). **Add site** is in the tool stack, **Edit site** at the bottom of any
site's panel. Publishing asks for the password once per browser session.

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
