import type { LatLonBounds } from "../components/Map/mapBounds.ts";

export interface GridPoint {
  lat: number;
  lon: number;
}

/**
 * Evenly spaced lat/lon points across the given bounds, padded slightly
 * outward so arrows aren't clipped right at the map edge. `resolution`
 * is points per side (resolution=6 -> up to 36 points).
 */
export function buildWindGrid(bounds: LatLonBounds, resolution: number, paddingFraction = 0.15): GridPoint[] {
  const latSpan = bounds.maxLat - bounds.minLat;
  const lonSpan = bounds.maxLon - bounds.minLon;
  const latPad = latSpan * paddingFraction || 0.05;
  const lonPad = lonSpan * paddingFraction || 0.05;

  const minLat = bounds.minLat - latPad;
  const maxLat = bounds.maxLat + latPad;
  const minLon = bounds.minLon - lonPad;
  const maxLon = bounds.maxLon + lonPad;

  const steps = Math.max(1, resolution - 1);
  const points: GridPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      points.push({
        lat: minLat + ((maxLat - minLat) * i) / steps,
        lon: minLon + ((maxLon - minLon) * j) / steps,
      });
    }
  }
  return points;
}
