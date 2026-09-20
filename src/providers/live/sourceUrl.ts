/**
 * The only hosts this app will fetch a live observation from, and the
 * guarded fetch that enforces it.
 *
 * A station record is contributor-supplied: anybody who can edit a site
 * can type a URL into it, and that URL is later fetched by the collector
 * (a GitHub Actions runner) and by the publishing Worker. Fetching
 * arbitrary user-supplied URLs from either of those is how a public form
 * becomes a proxy - for scanning internal addresses, for laundering
 * requests, or simply for pointing our bandwidth at somebody else.
 *
 * So the rule is an allowlist of hosts we have actually looked at,
 * checked the terms of, and written a reader for. A URL that is not on it
 * is not fetched, no matter who saved it or how plausible it looks.
 *
 * Deliberately host-level rather than exact-URL: SMHI and ViVa URLs carry
 * station ids and parameter numbers that legitimately vary, and an exact
 * list would either be wrong the first time a provider changed a path or
 * so loose it stopped meaning anything. The readers themselves construct
 * every URL they use from a station id; the allowlist is what stops a
 * saved record redirecting one somewhere else.
 *
 * Shared by the collector and the Worker so there is one list, not two
 * that drift.
 */

export const ALLOWED_SOURCE_HOSTS: readonly string[] = [
  "opendata-download-metobs.smhi.se",
  "services.viva.sjofartsverket.se",
  "viva.sjofartsverket.se",
  "holfuy.com",
  "widget.holfuy.com",
  "aviationweather.gov",
  // Club-operated WeeWX/Belchertown feeds. One entry per club, added by
  // hand after somebody has looked at the feed - this is the part of the
  // list most likely to grow, and the part where "just add the host"
  // needs to stay a deliberate act.
  "vader.sjoboflyg.se",
];

/** Response bodies above this are refused rather than buffered. */
const MAX_BYTES = 4_000_000;
const TIMEOUT_MS = 12_000;

export function isAllowedSourceUrl(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  // Credentials and an explicit port are both refused: neither appears in
  // any legitimate source URL here, and both are standard ways of making
  // an allowlisted host string resolve somewhere else.
  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "") return false;
  return ALLOWED_SOURCE_HOSTS.includes(url.hostname);
}

export class SourceError extends Error {}

/**
 * Fetches an allowlisted source, with a timeout and a size cap.
 *
 * `redirect: "error"` rather than "follow": a redirect is how an
 * allowlisted host hands the request to one that is not, and following it
 * would quietly undo the check above.
 */
export async function fetchSource(url: string, format: "json" | "text" = "json"): Promise<unknown> {
  if (!isAllowedSourceUrl(url)) {
    throw new SourceError(`Refusing to fetch a source that is not on the allowlist: ${url}`);
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "error",
    headers: { "User-Agent": "Startvind/1.0 (+https://startvind.se)" },
  });
  if (!response.ok) throw new SourceError(`Source returned HTTP ${response.status}`);

  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new SourceError("Source response too large");
  }

  const text = await response.text();
  // Checked again after reading: content-length is optional, and a
  // chunked response can be any size at all.
  if (text.length > MAX_BYTES) throw new SourceError("Source response too large");

  if (format === "text") return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SourceError("Source did not return valid JSON");
  }
}
