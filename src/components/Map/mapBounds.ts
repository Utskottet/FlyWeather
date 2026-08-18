import type { LocatedSite } from "../../domain/sites.ts";

export interface LatLonBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * Geographic bounds covering every located site, per MASTER_SPEC.md §3:
 * "compute their geographic bounds; fit the map to those bounds". Returns
 * null when there are no located sites (nothing to fit to) rather than an
 * arbitrary default region.
 */
export function computeSiteBounds(sites: LocatedSite[]): LatLonBounds | null {
  if (sites.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const site of sites) {
    minLat = Math.min(minLat, site.coordinates.lat);
    maxLat = Math.max(maxLat, site.coordinates.lat);
    minLon = Math.min(minLon, site.coordinates.lon);
    maxLon = Math.max(maxLon, site.coordinates.lon);
  }

  return { minLat, maxLat, minLon, maxLon };
}
