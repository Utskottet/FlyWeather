import type { StationCatalogue } from "../domain/stations.ts";
import type { WindSample } from "../domain/types.ts";
import { PUBLISH_TARGET } from "./editorApi.ts";

/**
 * What the station finder talks to.
 *
 * Two different things, for two different reasons:
 *
 *  - The catalogue is a static file. It is fetched once, on demand, when
 *    somebody actually opens the finder - never bundled, since it is
 *    130 kB that a visitor looking at the map has no use for.
 *  - A live reading goes through the server (the publishing Worker in
 *    production, the dev server locally). Not for secrecy: SMHI and ViVa
 *    would allow a direct browser fetch, but the Aviation Weather Center,
 *    Holfuy and club feeds send no CORS headers at all, so three of five
 *    sources are simply unreadable from a page. One path for all five
 *    beats a finder that can preview some stations and not others.
 */

let cached: Promise<StationCatalogue> | null = null;

export function loadStationCatalogue(): Promise<StationCatalogue> {
  // Memoised rather than re-fetched: the finder can be opened and closed
  // several times while editing one site, and this file does not change
  // within a session.
  cached ??= fetch(`${import.meta.env.BASE_URL}static/stations.json`).then((response) => {
    if (!response.ok) throw new Error(`Station catalogue unavailable (HTTP ${response.status}).`);
    return response.json() as Promise<StationCatalogue>;
  });
  return cached;
}

/** Test seam - lets a test supply a catalogue without a network call. */
export function __setStationCatalogue(catalogue: Promise<StationCatalogue> | null): void {
  cached = catalogue;
}

export type StationPreview =
  | { status: "ok"; sample: WindSample }
  | { status: "unavailable"; message: string };

interface PreviewQuery {
  provider: string;
  station_id?: string | null;
  url?: string | null;
}

function previewBaseUrl(): string {
  // A configured Worker wins, including in dev, so the real path gets
  // exercised. Otherwise the dev server serves the same route.
  return PUBLISH_TARGET?.kind === "worker" ? PUBLISH_TARGET.baseUrl : "";
}

/**
 * Fetches one live reading, so somebody can see what a station actually
 * says before saving it.
 *
 * Never throws: an unreachable station is an ordinary answer here, not an
 * error. "This station is not reporting" is exactly the thing the check
 * exists to reveal, and it should read the same whether the source is
 * down, the id is wrong or the network failed.
 */
export async function previewStation(query: PreviewQuery): Promise<StationPreview> {
  const params = new URLSearchParams({ provider: query.provider });
  if (query.station_id) params.set("station_id", query.station_id);
  if (query.url) params.set("url", query.url);

  try {
    const response = await fetch(`${previewBaseUrl()}/api/station-observation?${params.toString()}`);
    const body = (await response.json()) as {
      status?: string;
      sample?: WindSample;
      error?: string;
    };
    if (body.status === "ok" && body.sample) return { status: "ok", sample: body.sample };
    return { status: "unavailable", message: body.error ?? "The station did not return a usable wind reading." };
  } catch (err) {
    return { status: "unavailable", message: `Could not reach the station check. ${(err as Error).message}` };
  }
}

export type ObservationFreshness = "fresh" | "stale" | "unknown-age" | "suspect";

/**
 * How much a reading is worth, right now.
 *
 * `unknown-age` is a first-class answer rather than a shrug. A Holfuy
 * widget reading has no date on it, so it may be two minutes old or two
 * days old, and saying "fresh" would be a guess dressed as a fact. The
 * finder shows that state plainly and lets the person decide.
 */
export function observationFreshness(sample: WindSample, now: number = Date.now()): ObservationFreshness {
  if (sample.quality === "suspect") return "suspect";
  if (sample.ageConfirmed === false) return "unknown-age";

  const age = now - Date.parse(sample.timestamp);
  if (!Number.isFinite(age)) return "unknown-age";
  // A reading from the future is a broken clock somewhere, not fresh data.
  if (age < -120_000) return "suspect";
  return age > (sample.staleAfterMinutes ?? 15) * 60_000 ? "stale" : "fresh";
}
