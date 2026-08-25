# FlyWeather admin editor (experiment)

Standalone prototype of a password-protected, visual site editor. This is
**not wired into the main FlyWeather site's build or deploy** - it lives in
this folder purely to prove out the UX and a new authored wind-sector
"green core + orange margin" concept before deciding whether/how to fold it
into the real site.

Nothing here reads or writes `sites/**` or `src/domain/siteFile.ts`. Its own
data model (`src/domain/siteDraft.ts`) is a separate, evolving schema stored
in Cloudflare KV; the only bridge to production data is a manual "Copy/
Download YAML" export button - never an automatic write.

See `PROGRESS.md` for what's been built so far, the reasoning behind the
current sector model, and where to pick this up next.

## Local development

```
cp .dev.vars.example .dev.vars   # edit the placeholder password/secret
npm install
npm run dev:worker               # wrangler dev, serves the API on :8787
npm run dev                      # vite, serves the UI on :5173, proxies /api -> :8787
```

Log in with whatever `ADMIN_PASSWORD` you set in `.dev.vars`.

## Deploying for real

Not done as part of building this prototype - requires your own Cloudflare
account:

```
npx wrangler login
npx wrangler kv namespace create SITE_DRAFTS
npx wrangler kv namespace create SITE_DRAFTS --preview
# paste the returned ids into wrangler.toml's [[kv_namespaces]] block
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npm run deploy
```
