/**
 * The wind-station directory the site editor searches, and the rules for
 * searching it.
 *
 * Built by scripts/build-station-catalogue.ts and served as a static file
 * (public/static/stations.json) rather than queried live: the finder then
 * needs no network round trip to answer "what is near this site", and the
 * providers' directories are crawled once a day instead of once per
 * curious pilot.
 *
 * A station being in here means a directory listed it with coordinates.
 * It does NOT mean the station is currently reporting, that its readings
 * are any good, or that it represents the wind at a flying site several
 * kilometres away. Those are separate questions, and the editor asks the
 * first one by actually fetching a reading before anybody saves anything.
 */

export interface StationRecord {
  /** "<provider>:<id>" - unique within the catalogue. */
  key: string;
  provider: string;
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Needed where the feed address is the station's identity (club WeeWX); absent where the id is enough. */
  url?: string;
  /** Human description of what kind of station this is, for the finder's list. */
  stationType?: string;
  intervalMinutes?: number;
  gustAvailable?: boolean;
  /** Where the coordinates came from - a scraped station page is not a survey. */
  locationSource?: string;
  note?: string;
}

export interface StationProviderStatus {
  id: string;
  name: string;
  status: "ok" | "failed";
  stationCount: number;
  note: string;
}

export interface StationCatalogue {
  generatedAt: string;
  providers: StationProviderStatus[];
  stations: StationRecord[];
}

export interface NearbyStation extends StationRecord {
  distanceKm: number;
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export const DEFAULT_RADIUS_KM = 25;
export const MAX_RADIUS_KM = 200;

/**
 * Stations within `radiusKm` of a point, nearest first.
 *
 * Ties break on key so the order is stable between renders - two stations
 * at the same airport should not swap places when the list redraws.
 */
export function nearbyStations(
  stations: StationRecord[],
  point: { lat: number; lon: number },
  radiusKm: number = DEFAULT_RADIUS_KM,
  providers: string[] | null = null,
): NearbyStation[] {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return [];
  if (Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return [];
  const limit = Math.min(Math.max(radiusKm, 1), MAX_RADIUS_KM);

  return stations
    .filter((s) => providers === null || providers.includes(s.provider))
    .map((s) => ({ ...s, distanceKm: distanceKm(point, s) }))
    .filter((s) => s.distanceKm <= limit)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.key.localeCompare(b.key));
}

/**
 * How far away a station stops being evidence about this site.
 *
 * Nothing enforces these - they are wording in the finder, because the
 * real answer depends on terrain nobody can read off a map. A coastal
 * station 3 km along the same shoreline may describe a ridge better than
 * one 1 km inland behind a hill.
 */
export function proximityAdvice(distanceKm: number): "close" | "nearby" | "far" {
  if (distanceKm <= 5) return "close";
  if (distanceKm <= 15) return "nearby";
  return "far";
}

/**
 * What the editor should put in a site's station record.
 *
 * verified is deliberately absent: it is not the finder's to set. A
 * connection that works proves the feed is readable, which is not the
 * same claim as this station describing the wind at this site well
 * enough to fly on - and conflating those two was the behaviour this
 * replaces.
 */
export function stationSelection(station: NearbyStation): {
  name: string;
  provider: string;
  station_id: string;
  url?: string;
  note: string;
} {
  const where = `${station.distanceKm.toFixed(1)} km from the site`;
  const kind = station.stationType ? `${station.stationType}. ` : "";
  return {
    name: station.name,
    provider: station.provider,
    station_id: station.id,
    ...(station.url ? { url: station.url } : {}),
    note: `${kind}${where}. Chosen with the station finder; suitability for this site not verified.`,
  };
}
