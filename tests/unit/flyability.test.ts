import { describe, expect, it } from "vitest";
import {
  computeDirectionFit,
  computeOverallState,
  computeSpeedFit,
  evaluateFlyability,
} from "../../src/domain/flyability.ts";
import type { Sector } from "../../src/domain/sites.ts";

const GREEN: Sector[] = [{ from_deg: 213.75, to_deg: 236.25 }];
const ORANGE: Sector[] = [
  { from_deg: 202.5, to_deg: 213.75 },
  { from_deg: 236.25, to_deg: 247.5 },
];

describe("computeDirectionFit (§5.2)", () => {
  it("is good inside a green sector", () => {
    expect(computeDirectionFit(225, GREEN, ORANGE)).toBe("good");
  });

  it("is maybe inside an orange sector", () => {
    expect(computeDirectionFit(207, GREEN, ORANGE)).toBe("maybe");
  });

  it("is bad outside all sectors", () => {
    expect(computeDirectionFit(45, GREEN, ORANGE)).toBe("bad");
  });

  it("is unknown when direction is null (never NaN, §31)", () => {
    expect(computeDirectionFit(null, GREEN, ORANGE)).toBe("unknown");
  });

  it("is unknown when no sectors are configured at all", () => {
    expect(computeDirectionFit(225, [], [])).toBe("unknown");
  });
});

describe("computeSpeedFit (§5.3)", () => {
  const verifiedConfig = { verified: true, good_min_ms: 4, good_max_ms: 7, maybe_min_ms: 3, maybe_max_ms: 8 };

  it("is unknown when unverified, regardless of the numbers present", () => {
    expect(computeSpeedFit(5, null, { verified: false, good_min_ms: 4, good_max_ms: 7 })).toBe("unknown");
  });

  it("is unknown when speed is null", () => {
    expect(computeSpeedFit(null, null, verifiedConfig)).toBe("unknown");
  });

  it("is good inside the verified good band", () => {
    expect(computeSpeedFit(5.5, null, verifiedConfig)).toBe("good");
  });

  it("is maybe inside the verified maybe band but outside good", () => {
    expect(computeSpeedFit(3.2, null, verifiedConfig)).toBe("maybe");
  });

  it("is bad outside every band", () => {
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
    const result = evaluateFlyability(225, 5, null, GREEN, ORANGE, { verified: false });
    expect(result.directionFit).toBe("good");
    expect(result.speedFit).toBe("unknown");
    expect(result.state).toBe("orange");
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons.join(" ")).toContain("speed limits are not yet verified");
  });

  it("is red for a bad direction even with a fully verified good speed", () => {
    const result = evaluateFlyability(45, 5, null, GREEN, ORANGE, {
      verified: true,
      good_min_ms: 4,
      good_max_ms: 7,
      maybe_min_ms: 3,
      maybe_max_ms: 8,
    });
    expect(result.state).toBe("red");
  });
});
