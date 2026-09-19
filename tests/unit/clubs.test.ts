import { describe, expect, it } from "vitest";
import { CLUBS, canonicalClubName, isKnownClub, matchClub, normaliseClub, type Club } from "../../src/domain/clubs.ts";

/**
 * The club field is the gate on editing, so what it accepts is the whole
 * question. Generous on spelling, strict on being a real club.
 */

describe("normaliseClub", () => {
  it("folds Swedish letters and drops everything that is not a letter or digit", () => {
    expect(normaliseClub("C.P.S.")).toBe("cps");
    expect(normaliseClub("c p s")).toBe("cps");
    expect(normaliseClub("Åre Skärm- & Drakflygklubb")).toBe("areskarmdrakflygklubb");
    expect(normaliseClub("  CPS  ")).toBe("cps");
  });
});

describe("matchClub", () => {
  it("recognises a club by its abbreviation, however it is typed", () => {
    for (const typed of ["CPS", "cps", "C.P.S.", " cps ", "c-p-s"]) {
      expect(matchClub(typed)?.name, typed).toBe("Club Parapente Syd");
    }
  });

  it("recognises a club by its full name, hyphens and accents and all", () => {
    expect(matchClub("Club Parapente Syd")?.name).toBe("Club Parapente Syd");
    expect(matchClub("club parapente syd")?.name).toBe("Club Parapente Syd");
    expect(matchClub("Åre Skärm- & Drakflygklubb")?.name).toBe("Åre Skärm- & Drakflygklubb");
    expect(matchClub("are skarm drakflygklubb")?.name).toBe("Åre Skärm- & Drakflygklubb");
  });

  it("does not mind extra words around the name", () => {
    // Somebody writing where they are as well as who they fly with should
    // not be turned away for it.
    expect(matchClub("Club Parapente Syd, Skåne")?.name).toBe("Club Parapente Syd");
    expect(matchClub("CPS (Malmö)")?.name).toBe("Club Parapente Syd");
  });

  it("accepts a distinctive fragment of a name", () => {
    expect(matchClub("parapente")?.name).toBe("Club Parapente Syd");
    expect(matchClub("dalmåsarna")?.name).toBe("Skärmflygklubben Dalmåsarna");
  });

  it("turns away what is not a club at all", () => {
    for (const typed of ["", "   ", "asdf", "Manchester United", "ingen", "x"]) {
      expect(matchClub(typed), typed).toBeNull();
    }
  });

  it("ignores a fragment too short to mean anything", () => {
    // "sk" is inside half the list; matching on it would let anything in.
    expect(matchClub("sk")).toBeNull();
    expect(matchClub("a")).toBeNull();
  });

  it("prefers the most specific club when several could match", () => {
    const clubs: Club[] = [
      { name: "Skärmflygklubben Sydost", abbreviation: "Sydost" },
      { name: "Sydost" },
    ];
    // An exact hit on the shorter name still wins - it is exact.
    expect(matchClub("Sydost", clubs)?.name).toBe("Sydost");
    expect(matchClub("Skärmflygklubben Sydost", clubs)?.name).toBe("Skärmflygklubben Sydost");
  });

  it("covers every club in the shipped list, by name and by abbreviation", () => {
    // A club nobody can type their way into is a club whose members
    // cannot contribute.
    for (const club of CLUBS) {
      expect(matchClub(club.name)?.name, club.name).toBe(club.name);
      if (club.abbreviation) {
        expect(matchClub(club.abbreviation)?.name, club.abbreviation).toBe(club.name);
      }
    }
  });

  it("has a list that actually loaded", () => {
    expect(CLUBS.length).toBeGreaterThan(20);
    expect(CLUBS.every((c) => c.name.length > 0)).toBe(true);
  });
});

describe("canonicalClubName", () => {
  it("records the club's own spelling, not the pilot's", () => {
    // Otherwise the same club counts as several different ones in the log
    // depending on how each person typed it.
    expect(canonicalClubName("cps")).toBe("Club Parapente Syd");
    expect(canonicalClubName("CPS (Malmö)")).toBe("Club Parapente Syd");
  });

  it("leaves unrecognised text alone - refusing it is validation's job, not this one's", () => {
    expect(canonicalClubName("  Nya Klubben  ")).toBe("Nya Klubben");
  });
});

describe("isKnownClub", () => {
  it("is the yes/no form of the same question", () => {
    expect(isKnownClub("cps")).toBe(true);
    expect(isKnownClub("Manchester United")).toBe(false);
  });
});
