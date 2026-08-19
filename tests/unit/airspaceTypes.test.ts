import { describe, expect, it } from "vitest";
import {
  categorizeAirspaceType,
  formatAltitudeLimit,
  AIRSPACE_TYPE_LABELS,
  ICAO_CLASS_LABELS,
} from "../../src/domain/airspaceTypes.ts";

describe("airspace type labels (OpenAIP schema mapping)", () => {
  it("labels the sample airspace from Block 17's live API check", () => {
    // real response sample fetched during research: {"name":"22 MITT","type":21,"icaoClass":8}
    expect(AIRSPACE_TYPE_LABELS[21]).toBe("Gliding sector");
    expect(ICAO_CLASS_LABELS[8]).toBe("Unclassified / SUA");
  });

  it("categorizes hazard, controlled, sport, and other types distinctly", () => {
    expect(categorizeAirspaceType(1)).toBe("hazard"); // Restricted
    expect(categorizeAirspaceType(2)).toBe("hazard"); // Danger
    expect(categorizeAirspaceType(3)).toBe("hazard"); // Prohibited
    expect(categorizeAirspaceType(4)).toBe("controlled"); // CTR
    expect(categorizeAirspaceType(7)).toBe("controlled"); // TMA
    expect(categorizeAirspaceType(21)).toBe("sport"); // Gliding sector
    expect(categorizeAirspaceType(28)).toBe("sport"); // Aerial sporting/recreational
    expect(categorizeAirspaceType(15)).toBe("other"); // Airway
  });
});

describe("formatAltitudeLimit", () => {
  it("formats a feet/MSL limit", () => {
    expect(formatAltitudeLimit({ value: 1600, unit: 1, referenceDatum: 1 })).toBe("1600 ft MSL");
  });

  it("formats a flight level without a unit/datum suffix", () => {
    expect(formatAltitudeLimit({ value: 90, unit: 6, referenceDatum: 2 })).toBe("FL90");
  });

  it("formats a meters/GND limit", () => {
    expect(formatAltitudeLimit({ value: 500, unit: 0, referenceDatum: 0 })).toBe("500 m GND");
  });
});
