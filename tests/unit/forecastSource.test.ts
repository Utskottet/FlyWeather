import { describe, expect, it } from "vitest";
import {
  POINT_FORECAST_HEIGHTS_M,
  forecastSourceAt,
  forecastSourceLabel,
} from "../../src/domain/forecastSource.ts";
import { MODEL_HEIGHTS_M } from "../../src/domain/types.ts";

describe("forecastSourceAt", () => {
  it("names the point forecast at the heights Open-Meteo actually answers at", () => {
    for (const h of POINT_FORECAST_HEIGHTS_M) {
      expect(forecastSourceAt(h)).toBe("open-meteo");
    }
  });

  it("names the regional grid at every other model height", () => {
    for (const h of MODEL_HEIGHTS_M.filter((x) => !POINT_FORECAST_HEIGHTS_M.includes(x))) {
      expect(forecastSourceAt(h)).toBe("regional-grid");
    }
  });

  it("claims nothing when no height is shown", () => {
    expect(forecastSourceAt(null)).toBeNull();
  });

  it("covers every model height with a source, so nothing can be shown unlabelled", () => {
    for (const h of MODEL_HEIGHTS_M) {
      expect(forecastSourceAt(h)).not.toBeNull();
    }
  });
});

describe("forecastSourceLabel", () => {
  it("still calls the surface value what it is", () => {
    expect(forecastSourceLabel(10)).toBe("Open-Meteo forecast (10 m surface wind)");
  });

  it("quotes the height for the point forecast's other level", () => {
    expect(forecastSourceLabel(100)).toBe("Open-Meteo forecast (100 m AGL)");
  });

  /**
   * The regression this module exists for: a value the regional grid
   * produced must not be presented under Open-Meteo's name.
   */
  it("never says Open-Meteo over a value the regional grid produced", () => {
    for (const h of MODEL_HEIGHTS_M.filter((x) => !POINT_FORECAST_HEIGHTS_M.includes(x))) {
      const label = forecastSourceLabel(h);
      expect(label).not.toMatch(/Open-Meteo/);
      expect(label).toMatch(/Regional model/);
      expect(label).toContain(`${h} m AGL`);
    }
  });
});
