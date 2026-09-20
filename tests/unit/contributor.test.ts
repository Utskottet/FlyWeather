import { describe, expect, it } from "vitest";
import {
  EMPTY_CONTRIBUTOR,
  contributorLabel,
  isFullName,
  validateContributor,
  type Contributor,
} from "../../src/domain/contributor.ts";

function ok(over: Partial<Contributor> = {}): Contributor {
  return { name: "Edvin Buregren", club: "Club Parapente Syd", affirmed: true, trap: "", ...over };
}

function fields(c: Contributor) {
  return validateContributor(c).map((p) => p.field);
}

describe("contributor validation", () => {
  it("accepts a named pilot who ticked both boxes", () => {
    expect(validateContributor(ok())).toEqual([]);
  });

  it("requires a club, which is the part that actually stops a script", () => {
    // Naming a real Swedish club is something any pilot does without
    // thinking and a bot cannot do at all. A shibboleth, not a password -
    // see domain/clubs.ts.
    expect(fields(ok({ club: "" }))).toContain("club");
    expect(fields(ok({ club: "   " }))).toContain("club");
    expect(fields(ok({ club: "Manchester United" }))).toContain("club");
  });

  it("is generous about how the club is written", () => {
    for (const club of ["CPS", "cps", "c.p.s.", "Club Parapente Syd", "club parapente syd, Skåne"]) {
      expect(validateContributor(ok({ club })), club).toEqual([]);
    }
  });

  it("never leaves an unrecognised club as a dead end", () => {
    // A club that is genuinely new must not silently lose the first pilot
    // who comes from it.
    const message = validateContributor(ok({ club: "Nystartade Klubben" })).find((p) => p.field === "club")?.message;
    expect(message).toContain("Hör av dig");
  });

  it("requires a first name and a surname", () => {
    expect(fields(ok({ name: "Edvin" }))).toContain("name");
    expect(fields(ok({ name: "x y" }))).toContain("name");
    expect(fields(ok({ name: "   " }))).toContain("name");
  });

  it("requires the tickbox", () => {
    expect(fields(ok({ affirmed: false }))).toEqual(["affirmed"]);
  });

  it("rejects a filled honeypot, and never says why", () => {
    const problems = validateContributor(ok({ trap: "https://buy-now.example" }));
    expect(problems.map((p) => p.field)).toContain("trap");
    // A bot told which field gave it away simply stops filling that one in.
    expect(problems.find((p) => p.field === "trap")?.message).not.toMatch(/honeypot|trap|bot/i);
  });

  it("treats a missing honeypot as empty, not as suspicious", () => {
    const withoutTrap: Contributor = {
      name: "Edvin Buregren",
      club: "Club Parapente Syd",
      affirmed: true,
    };
    expect(validateContributor(withoutTrap)).toEqual([]);
  });

  it("starts empty, so nothing is pre-ticked on the contributor's behalf", () => {
    expect(EMPTY_CONTRIBUTOR.affirmed).toBe(false);
    // Name, club, and the box.
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
    expect(contributorLabel("Edvin Buregren", "Club Parapente Syd")).toBe("Edvin Buregren (Club Parapente Syd)");
  });

  it("is just the name when there is not", () => {
    expect(contributorLabel("Edvin Buregren")).toBe("Edvin Buregren");
    expect(contributorLabel("Edvin Buregren", "   ")).toBe("Edvin Buregren");
  });

  it("tidies the spacing a phone keyboard leaves behind", () => {
    expect(contributorLabel("  Edvin   Buregren ", "Club Parapente Syd")).toBe("Edvin Buregren (Club Parapente Syd)");
  });
});
