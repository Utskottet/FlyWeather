import { describe, expect, it } from "vitest";
import {
  MARGINAL_SECTOR_PADDING_DEG,
  computeDirectionFit,
  computeOverallState,
  computeSpeedFit,
  evaluateFlyability,
} from "../../src/domain/flyability.ts";
import type { Sector } from "../../src/domain/siteFile.ts";

const SECTOR: Sector = { ranges: [{ from_deg: 213.75, to_deg: 236.25 }], verified: false };

describe("computeDirectionFit (§5.2, § FlyWeather Site Catalogue Migration single-sector redesign)", () => {
  it("is good inside the sector", () => {
    expect(computeDirectionFit(225, SECTOR)).toBe("good");
  });

  it("is maybe within the derived marginal padding just outside the sector", () => {
    expect(computeDirectionFit(207, SECTOR)).toBe("maybe"); // 213.75 - 6.75, within the 11.25deg pad
  });

  it("uses exactly MARGINAL_SECTOR_PADDING_DEG on each edge, not a moment more", () => {
    const justInsidePad = SECTOR.ranges[0].from_deg - MARGINAL_SECTOR_PADDING_DEG + 0.01;
    const justOutsidePad = SECTOR.ranges[0].from_deg - MARGINAL_SECTOR_PADDING_DEG - 0.01;
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
    const wrap: Sector = { ranges: [{ from_deg: 330, to_deg: 30 }], verified: true };
    expect(computeDirectionFit(0, wrap)).toBe("good"); // due north, inside the wrap
    expect(computeDirectionFit(340, wrap)).toBe("good");
    expect(computeDirectionFit(35, wrap)).toBe("maybe"); // 5deg past 30, within the 11.25deg pad
    expect(computeDirectionFit(322, wrap)).toBe("maybe"); // 8deg before 330, within the 11.25deg pad
    expect(computeDirectionFit(315, wrap)).toBe("bad"); // 15deg before 330, outside the pad
    expect(computeDirectionFit(180, wrap)).toBe("bad");
  });
});

describe("computeDirectionFit with multiple sector ranges (e.g. a winch site launchable from either end)", () => {
  // Klamby-like: two opposite-facing ranges, neither wrapping 0/360 nor
  // adjacent to each other (a real gap on both sides).
  const dual: Sector = {
    ranges: [
      { from_deg: 45, to_deg: 145 },
      { from_deg: 225, to_deg: 315 },
    ],
    verified: true,
  };

  it("is good inside either range", () => {
    expect(computeDirectionFit(90, dual)).toBe("good");
    expect(computeDirectionFit(270, dual)).toBe("good");
  });

  it("is maybe within padding of either range's edge", () => {
    expect(computeDirectionFit(40, dual)).toBe("maybe"); // just below range 1's from_deg
    expect(computeDirectionFit(320, dual)).toBe("maybe"); // just above range 2's to_deg
  });

  it("is bad in the real gap between the two ranges (not near either edge)", () => {
    expect(computeDirectionFit(185, dual)).toBe("bad"); // roughly midway between 145 and 225
    expect(computeDirectionFit(0, dual)).toBe("bad"); // roughly midway between 315 and 45 (wrapping)
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

describe("computeDirectionFit with authored per-side margins", () => {
  it("uses each side's own margin, so an asymmetric ridge can finally say so", () => {
    const asym: Sector = {
      ranges: [{ from_deg: 200, to_deg: 250, margin_under_deg: 5, margin_over_deg: 20 }],
      verified: true,
    };
    expect(computeDirectionFit(196, asym)).toBe("maybe"); // 4deg under, inside the 5deg margin
    expect(computeDirectionFit(194, asym)).toBe("bad"); //   6deg under, past it
    expect(computeDirectionFit(265, asym)).toBe("maybe"); // 15deg over, inside the 20deg margin
    expect(computeDirectionFit(275, asym)).toBe("bad"); //   25deg over, past it
  });

  it("treats an authored 0 as a real answer - no marginal zone at all on that side", () => {
    const hard: Sector = {
      ranges: [{ from_deg: 200, to_deg: 250, margin_under_deg: 0, margin_over_deg: 0 }],
      verified: true,
    };
    expect(computeDirectionFit(225, hard)).toBe("good");
    expect(computeDirectionFit(199, hard)).toBe("bad"); // one degree out is already a hard no
    expect(computeDirectionFit(251, hard)).toBe("bad");
  });

  it("falls back to MARGINAL_SECTOR_PADDING_DEG per side, independently", () => {
    // Only the over side is authored; the under side must still behave
    // exactly as the whole catalogue did before margins existed.
    const halfAuthored: Sector = {
      ranges: [{ from_deg: 200, to_deg: 250, margin_over_deg: 0 }],
      verified: true,
    };
    expect(computeDirectionFit(200 - MARGINAL_SECTOR_PADDING_DEG + 0.01, halfAuthored)).toBe("maybe");
    expect(computeDirectionFit(200 - MARGINAL_SECTOR_PADDING_DEG - 0.01, halfAuthored)).toBe("bad");
    expect(computeDirectionFit(251, halfAuthored)).toBe("bad"); // authored 0 on this side
  });

  it("applies margins per range, not per site, across multiple ranges", () => {
    const dual: Sector = {
      ranges: [
        { from_deg: 45, to_deg: 145, margin_under_deg: 0, margin_over_deg: 0 },
        { from_deg: 225, to_deg: 315, margin_under_deg: 30, margin_over_deg: 30 },
      ],
      verified: true,
    };
    expect(computeDirectionFit(44, dual)).toBe("bad"); //  tight range, no margin
    expect(computeDirectionFit(200, dual)).toBe("maybe"); // generous range, 25deg under 225
  });
});

describe("computeSpeedFit marginal tier (the speed axis's orange)", () => {
  const band = { verified: true, min_ms: 4, max_ms: 8 };

  it("is maybe just past max_ms when an over-margin is authored", () => {
    const wind = { ...band, margin_over_ms: 2 };
    expect(computeSpeedFit(8, null, wind)).toBe("good");
    expect(computeSpeedFit(8.5, null, wind)).toBe("maybe");
    expect(computeSpeedFit(10, null, wind)).toBe("maybe");
    expect(computeSpeedFit(10.1, null, wind)).toBe("bad");
  });

  it("is maybe just below min_ms when an under-margin is authored", () => {
    const wind = { ...band, margin_under_ms: 1 };
    expect(computeSpeedFit(3.5, null, wind)).toBe("maybe");
    expect(computeSpeedFit(2.9, null, wind)).toBe("bad");
  });

  it("clamps the marginal floor at 0 - never invents a band below calm", () => {
    const wind = { verified: true, min_ms: 1, max_ms: 5, margin_under_ms: 10 };
    expect(computeSpeedFit(0, null, wind)).toBe("maybe");
    expect(computeSpeedFit(5.1, null, wind)).toBe("bad"); // no over-margin authored
  });

  it("has no marginal tier at all when no margins are authored (the pre-margin rule)", () => {
    expect(computeSpeedFit(8.1, null, band)).toBe("bad");
    expect(computeSpeedFit(3.9, null, band)).toBe("bad");
  });

  it("keeps a hard gust limit hard - a margin must never soften it", () => {
    const wind = { ...band, margin_over_ms: 5, hard_max_gust_ms: 10 };
    expect(computeSpeedFit(9, 14, wind)).toBe("bad"); // base speed is inside the margin, gust is not
  });

  it("is still unknown when unverified, however generous the margins", () => {
    expect(computeSpeedFit(9, null, { ...band, verified: false, margin_over_ms: 5 })).toBe("unknown");
  });
});

describe("computeOverallState with a marginal speed", () => {
  it("is orange when the speed is only marginal", () => {
    expect(computeOverallState("good", "maybe")).toBe("orange");
    expect(computeOverallState("maybe", "maybe")).toBe("orange");
  });

  it("is still red when the direction is bad, however good the speed", () => {
    expect(computeOverallState("bad", "maybe")).toBe("red");
  });
});

describe("evaluateFlyability with Klamby's real numbers", () => {
  // The site's own description has carried these as prose because the
  // schema had nowhere to put them: green 0-5 m/s, orange 5-6, red above 6.
  const klamby: Sector = {
    ranges: [
      { from_deg: 45, to_deg: 145 },
      { from_deg: 225, to_deg: 315 },
    ],
    verified: true,
  };
  const wind = { verified: true, min_ms: 0, max_ms: 5, margin_over_ms: 1 };

  it("reads 5.5 m/s on a good direction as orange, not red", () => {
    const result = evaluateFlyability(90, 5.5, null, klamby, wind);
    expect(result.speedFit).toBe("maybe");
    expect(result.state).toBe("orange");
    expect(result.reasons.join(" ")).toContain("marginal allowance");
  });

  it("still reads 6.5 m/s as red", () => {
    expect(evaluateFlyability(90, 6.5, null, klamby, wind).state).toBe("red");
  });

  it("reads 3 m/s on a good direction as green", () => {
    expect(evaluateFlyability(90, 3, null, klamby, wind).state).toBe("green");
  });
});
