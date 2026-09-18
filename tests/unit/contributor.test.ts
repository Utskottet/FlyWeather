import { describe, expect, it } from "vitest";
import {
  EMPTY_CONTRIBUTOR,
  contributorLabel,
  isFullName,
  validateContributor,
  type Contributor,
} from "../../src/domain/contributor.ts";

function ok(over: Partial<Contributor> = {}): Contributor {
  return { name: "Edvin Buregren", club: "Skåne FK", isHuman: true, goodFaith: true, trap: "", ...over };
}

function fields(c: Contributor) {
  return validateContributor(c).map((p) => p.field);
}

describe("contributor validation", () => {
  it("accepts a named pilot who ticked both boxes", () => {
    expect(validateContributor(ok())).toEqual([]);
  });

  it("does not turn away a pilot with no club", () => {
    // Visiting pilots and unaffiliated pilots fly these sites too, and a
    // club list that has not caught up must never block a correction.
    expect(validateContributor(ok({ club: "" }))).toEqual([]);
  });

  it("requires a first name and a surname", () => {
    expect(fields(ok({ name: "Edvin" }))).toContain("name");
    expect(fields(ok({ name: "x y" }))).toContain("name");
    expect(fields(ok({ name: "   " }))).toContain("name");
  });

  it("requires both tickboxes", () => {
    expect(fields(ok({ isHuman: false }))).toEqual(["isHuman"]);
    expect(fields(ok({ goodFaith: false }))).toEqual(["goodFaith"]);
  });

  it("rejects a filled honeypot, and never says why", () => {
    const problems = validateContributor(ok({ trap: "https://buy-now.example" }));
    expect(problems.map((p) => p.field)).toContain("trap");
    // A bot told which field gave it away simply stops filling that one in.
    expect(problems.find((p) => p.field === "trap")?.message).not.toMatch(/honeypot|trap|bot/i);
  });

  it("treats a missing honeypot as empty, not as suspicious", () => {
    const { trap: _trap, ...withoutTrap } = ok();
    expect(validateContributor(withoutTrap)).toEqual([]);
  });

  it("starts empty, so nothing is pre-ticked on the contributor's behalf", () => {
    expect(EMPTY_CONTRIBUTOR.isHuman).toBe(false);
    expect(EMPTY_CONTRIBUTOR.goodFaith).toBe(false);
    expect(validateContributor(EMPTY_CONTRIBUTOR)).toHaveLength(3);
  });

  it("speaks Swedish, like every other contributor-facing string", () => {
    for (const problem of validateContributor(EMPTY_CONTRIBUTOR)) {
      expect(problem.message).toMatch(/[åäöÅÄÖ]|^Skriv|^Kryssa/);
    }
  });
});

describe("isFullName", () => {
  it("allows the many shapes a real name takes", () => {
    expect(isFullName("Anna Andersson")).toBe(true);
    expect(isFullName("Jean-Luc Picard")).toBe(true);
    expect(isFullName("Ida von Krusenstjerna")).toBe(true);
    expect(isFullName("  Bo   Bengtsson  ")).toBe(true);
  });

  it("rejects what is not an audit trail", () => {
    expect(isFullName("")).toBe(false);
    expect(isFullName("admin")).toBe(false);
    expect(isFullName("E B")).toBe(false);
  });
});

describe("contributorLabel", () => {
  it("names the club when there is one", () => {
    expect(contributorLabel("Edvin Buregren", "Skåne FK")).toBe("Edvin Buregren (Skåne FK)");
  });

  it("is just the name when there is not", () => {
    expect(contributorLabel("Edvin Buregren")).toBe("Edvin Buregren");
    expect(contributorLabel("Edvin Buregren", "   ")).toBe("Edvin Buregren");
  });

  it("tidies the spacing a phone keyboard leaves behind", () => {
    expect(contributorLabel("  Edvin   Buregren ", "Skåne FK")).toBe("Edvin Buregren (Skåne FK)");
  });
});
