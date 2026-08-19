import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// MapLibre's worker script does a static relative import of
// maplibre-gl-shared.mjs (a sibling file in its own package). Vite has no
// built-in way to bundle a Web Worker's own module graph when the worker
// is only referenced via a runtime string URL (maplibre calls
// setWorkerUrl() itself rather than us doing `new Worker(...)`), so
// copying just the worker file (e.g. via a `?url` import) leaves that
// sibling import 404ing once Rollup hashes/relocates the worker alone
// (confirmed against a real GitHub Pages deploy - map rendered markers
// but no tiles or hillshade at all). Instead, both files are copied
// verbatim into public/ under their original names before dev/build so
// the worker's relative import keeps resolving correctly, and
// MapLibreMap.tsx points setWorkerUrl() at this fixed, un-hashed path.
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const maplibreDist = resolve(repoRoot, "node_modules/maplibre-gl/dist");
const outDir = resolve(repoRoot, "public/vendor/maplibre-gl");

mkdirSync(outDir, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(resolve(maplibreDist, file), resolve(outDir, file));
}
console.log(`Copied MapLibre worker files -> ${outDir}`);
