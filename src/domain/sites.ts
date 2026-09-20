import type { Sector, SiteFile, SiteGroup } from "./siteFile.ts";

export type { Sector, SiteGroup };

/**
 * One entry in the generated public/generated/sites.json catalogue -
 * a SiteFile's authored fields plus the metadata derived from its path
 * under sites/ (§ FlyWeather Site Catalogue Migration). The frontend only
 * ever reads this generated shape; it has no idea the human-maintained
 * source moved from a single SITES.md fenced block to sites/**\/*.yaml.
 *
 * `enabled` mirrors the old SITES.md field's meaning exactly (kept for
 * frontend compatibility) - true for sites under a ridge/ or winch/
 * folder, false for anything under archive/. Archived sites are still
 * included in the generated catalogue with enabled:false, the same way
 * SITES.md's own enabled:false sites always were - moving a file into/out
 * of archive/ is exactly equivalent to flipping the old enabled flag.
 */
export interface Site extends Omit<SiteFile, "schema_version"> {
  country: string;
  region: string;
  /**
   * How far the site's live station is from the site, in km.
   *
   * Derived at build time by looking the station up in the wind-station
   * catalogue (public/static/stations.json) and measuring from the site's
   * own coordinates - not stored in the site file. Deliberately: a
   * distance written into YAML is a snapshot that goes quietly wrong the
   * moment somebody corrects the site's position, and this is a fact
   * about two coordinates rather than a decision anybody made.
   *
   * Absent when the site has no station, when the station is not in the
   * catalogue (a provider directory can fail, and Holfuy does not publish
   * coordinates for every station), or when the site itself has none. No
   * distance is better than a guessed one.
   */
  station_distance_km?: number;
  /** null only for archived sites, whose original group isn't recoverable from the path alone - see SITE_MIGRATION_REPORT.md. */
  group: SiteGroup | null;
  enabled: boolean;
}

/** Shape of public/generated/sites.json as written by scripts/build-sites-catalogue.ts. */
export interface GeneratedSitesFile {
  generatedAt: string;
  schemaVersion: number;
  defaults: {
    timezone: string;
    units: string;
    live_fresh_minutes: number;
    live_stale_minutes: number;
  };
  sites: Site[];
}

/** A site with coordinates known to be present (narrows the nullable schema type). */
export type LocatedSite = Site & {
  coordinates: Site["coordinates"] & { lat: number; lon: number };
};

/** Enabled sites that have a non-null coordinate, regardless of verified status. */
export function locatedEnabledSites(sites: Site[]): LocatedSite[] {
  return sites.filter(
    (s): s is LocatedSite => s.enabled && s.coordinates.lat !== null && s.coordinates.lon !== null,
  );
}
