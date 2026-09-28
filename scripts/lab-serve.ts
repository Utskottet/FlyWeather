import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A tiny local server for the accuracy lab dashboard.
 *
 * No framework, no dependency, no build: it serves tools/accuracy-lab/
 * (the dashboard plus the JSON that analyze-accuracy.ts writes) and
 * nothing else. The point is to be a local-only viewing surface that can
 * be deleted without touching the shipped app.
 *
 * Usage:
 *   npm run lab:serve
 *   npm run lab:serve -- --port 5200
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../tools/accuracy-lab");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".svg": "image/svg+xml",
};

function parsePort(argv: string[]): number {
  const i = argv.indexOf("--port");
  if (i !== -1 && argv[i + 1]) return Number(argv[i + 1]);
  return Number(process.env.LAB_PORT ?? 5199);
}

const port = parsePort(process.argv.slice(2));

const server = createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  const requested = url === "/" ? "/index.html" : url;
  const full = normalize(join(root, decodeURIComponent(requested)));

  // Never let a request escape the lab directory.
  if (!full.startsWith(root + sep) && full !== root) {
    res.writeHead(403).end("forbidden");
    return;
  }

  if (!existsSync(full) || !statSync(full).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" }).end(`not found: ${requested}`);
    return;
  }

  res.writeHead(200, {
    "content-type": MIME[extname(full)] ?? "application/octet-stream",
    // Always fresh: the whole point is to re-run analyze and reload.
    "cache-control": "no-store",
  });
  res.end(readFileSync(full));
});

server.listen(port, () => {
  console.log(`accuracy lab: http://localhost:${port}`);
  console.log(`serving ${root}`);
  if (!existsSync(resolve(root, "out/accuracy.json"))) {
    console.log("no out/accuracy.json yet - run `npm run lab:analyze` first.");
  }
});
