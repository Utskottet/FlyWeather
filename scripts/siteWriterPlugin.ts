import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve, relative, sep } from "node:path";
import type { Plugin } from "vite";
import { mergeSiteYaml } from "./siteWriter.ts";
import { buildCatalogue } from "./build-sites-catalogue.ts";

/**
 * Dev-only endpoint that lets the in-app site editor write a real file
 * into sites/ and immediately rebuild the catalogue, so a save shows up on
 * the map without restarting anything.
 *
 * Deliberately a *dev server* plugin and nothing else. GitHub Pages serves
 * static files with no server behind them, so this endpoint simply does
 * not exist in a production build - there is no code path that ships it,
 * no flag that could switch it on by accident, and nothing to authenticate
 * because Vite's dev server is bound to localhost. Saving to the live site
 * is a different mechanism entirely (a GitHub API commit from the browser)
 * and would live somewhere else.
 *
 * Saving here is not publishing: it writes a file into the working tree,
 * exactly as editing the YAML by hand would. Committing and pushing is
 * still what puts a change on the real site.
 */

const SITES_ROOT_NAME = "sites";

interface SaveRequest {
  /** Path relative to sites/, e.g. "se/skane/ridge/hammar.yaml". */
  path: string;
  /** The file's previous path, when an edit renamed or moved it. */
  previousPath?: string;
  /** The editor-owned fields, merged over any existing file. */
  fields: Record<string, unknown>;
}

/**
 * Refuses anything that could escape sites/ - a traversal (`..`), an
 * absolute path, or a non-.yaml target. The endpoint only ever runs on a
 * developer's own machine, but a path check is cheap and a bug here would
 * write anywhere in the repo.
 */
function resolveWithinSites(sitesRoot: string, relPath: string): string {
  if (!relPath.endsWith(".yaml")) throw new Error(`refusing a non-.yaml path: ${relPath}`);
  const full = resolve(sitesRoot, relPath);
  const rel = relative(sitesRoot, full);
  if (rel.startsWith("..") || rel.split(sep).includes("..") || resolve(sitesRoot, rel) !== full) {
    throw new Error(`refusing a path outside sites/: ${relPath}`);
  }
  return full;
}

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolvePromise(data));
    req.on("error", reject);
  });
}

export function siteWriterPlugin(repoRoot: string): Plugin {
  const sitesRoot = resolve(repoRoot, SITES_ROOT_NAME);
  const cataloguePath = resolve(repoRoot, "public/generated/sites.json");

  return {
    name: "startvind-site-writer",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/site", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "POST only" }));
          return;
        }

        try {
          const body = JSON.parse(await readBody(req)) as SaveRequest;
          const target = resolveWithinSites(sitesRoot, body.path);
          const existing = existsSync(target) ? readFileSync(target, "utf-8") : null;

          // Enforced here as well as in the form. The schema has to keep
          // last_edited_by optional (all 30 files pre-date it), so without
          // this check "you cannot save without signing" would be a UI
          // convention that any other caller could skip - and a provenance
          // rule that only holds when the UI cooperates is not a rule.
          const signature = body.fields.last_edited_by;
          if (typeof signature !== "string" || signature.trim().split(/\s+/).filter((p) => p.length >= 2).length < 2) {
            throw new Error("save rejected, nothing written - a first name and surname are required");
          }

          // Stamped here, at the moment of writing, rather than taken from
          // the payload: a browser with a wrong clock, or a form left open
          // for an hour, would otherwise record a time the edit did not
          // happen at. See siteFile.ts's last_edited_at.
          const fields = { ...body.fields, last_edited_at: new Date().toISOString() };
          const yamlText = mergeSiteYaml(existing, fields);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, yamlText, "utf-8");

          // A rename or a move (different id, region or group) leaves the
          // old file behind, and two files with one id fail the build with
          // a duplicate-id error - so the move has to be completed here.
          let removed: string | null = null;
          let removedText: string | null = null;
          const previous =
            body.previousPath && body.previousPath !== body.path
              ? resolveWithinSites(sitesRoot, body.previousPath)
              : null;
          if (previous && existsSync(previous)) {
            removedText = readFileSync(previous, "utf-8");
            rmSync(previous);
            removed = body.previousPath!;
          }

          // Validates every site, not just this one - the same call the
          // build runs - so a save that would break the catalogue is
          // reported now rather than at deploy time. On failure the write
          // is rolled back: a rejected save must leave the working tree
          // exactly as it was, never half-applied.
          let catalogue;
          try {
            catalogue = buildCatalogue();
          } catch (buildErr) {
            if (existing === null) rmSync(target, { force: true });
            else writeFileSync(target, existing, "utf-8");
            if (previous && removedText !== null) writeFileSync(previous, removedText, "utf-8");
            throw new Error(`save rejected, nothing written - ${(buildErr as Error).message}`);
          }

          mkdirSync(dirname(cataloguePath), { recursive: true });
          writeFileSync(cataloguePath, JSON.stringify(catalogue, null, 2) + "\n", "utf-8");

          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, path: body.path, removed, siteCount: catalogue.sites.length }));
        } catch (err) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
        }
      });
    },
  };
}
