import { describe, expect, it } from "vitest";
import { computeSiteBounds } from "../../src/components/Map/mapBounds.ts";
import type { LocatedSite } from "../../src/domain/sites.ts";

function locatedSite(lat: number, lon: number): LocatedSite {
  return {
    id: "test",
    enabled: true,
    name: "Test",
    country: "SE",
    type: "hang",
    coordinates: { lat, lon, verified: true },
    rose: { verified: false, green: [], orange: [] },
    wind_speed: { verified: false },
    soaring_height: { agl_m: null, verified: false },
    live_sources: [],
    description: "test",
  } as LocatedSite;
}

describe("computeSiteBounds", () => {
  it("returns null for an empty site list", () => {
    expect(computeSiteBounds([])).toBeNull();
  });

  it("returns a degenerate box for a single site", () => {
    const bounds = computeSiteBounds([locatedSite(55.4, 14.0)]);
    expect(bounds).toEqual({ minLat: 55.4, maxLat: 55.4, minLon: 14.0, maxLon: 14.0 });
  });

  it("covers the min/max of multiple sites", () => {
    const bounds = computeSiteBounds([
      locatedSite(55.4, 14.0),
      locatedSite(57.5, 12.6),
      locatedSite(56.0, 14.2),
    ]);
    expect(bounds).toEqual({ minLat: 55.4, maxLat: 57.5, minLon: 12.6, maxLon: 14.2 });
  });
});
