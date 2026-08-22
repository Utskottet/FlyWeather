import { describe, expect, it } from "vitest";
import {
  MARGINAL_SECTOR_PADDING_DEG,
  computeDirectionFit,
  computeOverallState,
  computeSpeedFit,
  evaluateFlyability,
} from "../../src/domain/flyability.ts";
import type { Sector } from "../../src/domain/siteFile.ts";

const SECTOR: Sector = { from_deg: 213.75, to_deg: 236.25, verified: false };

describe("computeDirectionFit (§5.2, § FlyWeather Site Catalogue Migration single-sector redesign)", () => {
  it("is good inside the sector", () => {
    expect(computeDirectionFit(225, SECTOR)).toBe("good");
  });

  it("is maybe within the derived marginal padding just outside the sector", () => {
    expect(computeDirectionFit(207, SECTOR)).toBe("maybe"); // 213.75 - 6.75, within the 11.25deg pad
  });

  it("uses exactly MARGINAL_SECTOR_PADDING_DEG on each edge, not a moment more", () => {
    const justInsidePad = SECTOR.from_deg - MARGINAL_SECTOR_PADDING_DEG + 0.01;
    const justOutsidePad = SECTOR.from_deg - MARGINAL_SECTOR_PADDING_DEG - 0.01;
    expect(computeDirectionFit(justInsidePad, SECTOR)).toBe("maybe");
    expect(computeDirectionFit(justOutsidePad, SECTOR)).toBe("bad");
  });

  it("is bad outside the sector and its padding", () => {
    expect(computeDirectionFit(45, SECTOR)).toBe("bad");
  });

  it("is unknown when direction is null (never NaN, §31)", () => {
    expect(computeDirectionFit(null, SECTOR)).toBe("unknown");
  });

  it("is unknown when no sector is configured at all", () => {
    expect(computeDirectionFit(225, null)).toBe("unknown");
  });

  it("handles a north-crossing sector (330 -> 30) including its wraparound padding", () => {
    const wrap: Sector = { from_deg: 330, to_deg: 30, verified: true };
    expect(computeDirectionFit(0, wrap)).toBe("good"); // due north, inside the wrap
    expect(computeDirectionFit(340, wrap)).toBe("good");
    expect(computeDirectionFit(35, wrap)).toBe("maybe"); // 5deg past 30, within the 11.25deg pad
    expect(computeDirectionFit(322, wrap)).toBe("maybe"); // 8deg before 330, within the 11.25deg pad
    expect(computeDirectionFit(315, wrap)).toBe("bad"); // 15deg before 330, outside the pad
    expect(computeDirectionFit(180, wrap)).toBe("bad");
  });
});

describe("computeSpeedFit (§5.3, simplified to a single min/max band)", () => {
  const verifiedConfig = { verified: true, min_ms: 4, max_ms: 7 };

  it("is unknown when unverified, regardless of the numbers present", () => {
    expect(computeSpeedFit(5, null, { verified: false, min_ms: 4, max_ms: 7 })).toBe("unknown");
  });

  it("is unknown when speed is null", () => {
    expect(computeSpeedFit(null, null, verifiedConfig)).toBe("unknown");
  });

  it("is good inside the verified band", () => {
    expect(computeSpeedFit(5.5, null, verifiedConfig)).toBe("good");
  });

  it("is bad outside the band", () => {
    expect(computeSpeedFit(15, null, verifiedConfig)).toBe("bad");
  });

  it("is bad when gust exceeds the hard limit even if base speed is in the good band", () => {
    expect(computeSpeedFit(5, 14, { ...verifiedConfig, hard_max_gust_ms: 10 })).toBe("bad");
  });
});

describe("computeOverallState (§5.4)", () => {
  it("is gray when direction is unknown (missing critical data)", () => {
    expect(computeOverallState("unknown", "unknown")).toBe("gray");
    expect(computeOverallState("unknown", "good")).toBe("gray");
  });

  it("is red when direction is bad, regardless of speed", () => {
    expect(computeOverallState("bad", "good")).toBe("red");
    expect(computeOverallState("bad", "unknown")).toBe("red");
  });

  it("is red when speed is bad even with a good direction", () => {
    expect(computeOverallState("good", "bad")).toBe("red");
  });

  it("is orange when direction is good but speed is unverified (AGENTS.md's explicit example)", () => {
    expect(computeOverallState("good", "unknown")).toBe("orange");
  });

  it("is orange when direction is only maybe", () => {
    expect(computeOverallState("maybe", "good")).toBe("orange");
  });

  it("is green only when both direction and speed are verified-good", () => {
    expect(computeOverallState("good", "good")).toBe("green");
  });
});

describe("evaluateFlyability (composition)", () => {
  it("matches AGENTS.md's explicit example: good direction + unverified speed = orange", () => {
    const result = evaluateFlyability(225, 5, null, SECTOR, { verified: false });
    expect(result.directionFit).toBe("good");
    expect(result.speedFit).toBe("unknown");
    expect(result.state).toBe("orange");
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons.join(" ")).toContain("speed limits are not yet verified");
  });

  it("is red for a bad direction even with a fully verified good speed", () => {
    const result = evaluateFlyability(45, 5, null, SECTOR, { verified: true, min_ms: 4, max_ms: 7 });
    expect(result.state).toBe("red");
  });
});
