import { describe, expect, it } from "vitest";
import {
  appendEntry,
  firstContributor,
  entriesForSite,
  parseEditLog,
  serialiseEntry,
  summariseChanges,
  type EditLogEntry,
} from "../../src/domain/editLog.ts";

function entry(over: Partial<EditLogEntry> = {}): EditLogEntry {
  return {
    at: "2026-09-19T10:00:00.000Z",
    site: "hammar",
    path: "se/skane/ridge/hammar.yaml",
    by: "Edvin Buregren",
    action: "edit",
    ...over,
  };
}

describe("edit log storage", () => {
  it("round-trips an entry through one line of JSONL", () => {
    const original = entry({ club: "Club Parapente Syd", changes: ["Vind 4–8 m/s (var 5–9 m/s)"] });
    const [back] = parseEditLog(serialiseEntry(original));
    expect(back).toEqual(original);
  });

  it("omits absent optional fields rather than writing nulls", () => {
    const line = serialiseEntry(entry());
    expect(line).not.toContain("club");
    expect(line).not.toContain("changes");
    expect(line).not.toContain("admin");
  });

  it("appends to an existing log without disturbing what is already there", () => {
    const first = appendEntry(null, entry({ at: "2026-09-01T10:00:00.000Z" }));
    const both = appendEntry(first, entry({ at: "2026-09-02T10:00:00.000Z" }));

    expect(both.startsWith(first.trimEnd())).toBe(true);
    expect(parseEditLog(both)).toHaveLength(2);
    expect(both.endsWith("\n")).toBe(true);
    expect(both).not.toContain("\n\n");
  });

  it("tolerates a file that does not end in a newline, and one with blank lines", () => {
    const ragged = `${serialiseEntry(entry())}\n\n${serialiseEntry(entry({ at: "2026-09-20T10:00:00.000Z" }))}`;
    expect(parseEditLog(ragged)).toHaveLength(2);
    expect(parseEditLog(appendEntry(ragged, entry()))).toHaveLength(3);
  });

  it("skips a corrupt line instead of losing the whole log", () => {
    // A half-written append or a hand-edit gone wrong must not take the
    // site panel down with it.
    const text = `${serialiseEntry(entry())}\n{"at": "broken\n${serialiseEntry(entry({ site: "molle" }))}\n`;
    const parsed = parseEditLog(text);
    expect(parsed).toHaveLength(2);
    expect(parsed.map((e) => e.site)).toEqual(["hammar", "molle"]);
  });

  it("ignores a line that parses but is not an entry", () => {
    expect(parseEditLog('{"hello": "world"}\n[]\n"a string"\n')).toEqual([]);
  });

  it("returns a site's entries newest first", () => {
    const entries = parseEditLog(
      [
        serialiseEntry(entry({ at: "2026-09-01T10:00:00.000Z" })),
        serialiseEntry(entry({ at: "2026-09-19T10:00:00.000Z" })),
        serialiseEntry(entry({ at: "2026-09-10T10:00:00.000Z", site: "molle" })),
      ].join("\n"),
    );
    const mine = entriesForSite(entries, "hammar");
    expect(mine.map((e) => e.at)).toEqual(["2026-09-19T10:00:00.000Z", "2026-09-01T10:00:00.000Z"]);
  });
});

describe("who added a site", () => {
  it("is nobody for a site older than the log", () => {
    // Most sites pre-date the log entirely. Better to say nothing than
    // to credit whoever happened to make the first edit after it began.
    expect(firstContributor([], "hammar")).toBeNull();
  });

  it("is whoever added it, not whoever has edited it most", () => {
    // This replaced a derived "maintainer". That read as an appointment
    // nobody had made, and changed under somebody's feet as soon as a
    // second pilot edited twice.
    const entries = [
      entry({ by: "Anna Andersson", action: "add", at: "2026-01-01T10:00:00.000Z" }),
      entry({ by: "Bo Bengtsson", at: "2026-09-01T10:00:00.000Z" }),
      entry({ by: "Bo Bengtsson", at: "2026-09-02T10:00:00.000Z" }),
    ];
    expect(firstContributor(entries, "hammar")?.by).toBe("Anna Andersson");
  });

  it("prefers an explicit add over merely the oldest entry", () => {
    // A site can be edited before anybody's edit was logged, so the
    // oldest line is not always the one that created it.
    const entries = [
      entry({ by: "Bo Bengtsson", at: "2026-01-01T10:00:00.000Z" }),
      entry({ by: "Anna Andersson", action: "add", at: "2026-02-01T10:00:00.000Z" }),
    ];
    expect(firstContributor(entries, "hammar")?.by).toBe("Anna Andersson");
  });

  it("claims nobody when the site was never added through the editor", () => {
    // Most sites pre-date the log. Calling whoever first edited one of
    // them its author would be a plain untruth about a named person -
    // exactly the confident small wrongness this log exists to avoid.
    const entries = [
      entry({ by: "Anna Andersson", at: "2026-01-01T10:00:00.000Z" }),
      entry({ by: "Bo Bengtsson", at: "2026-09-01T10:00:00.000Z" }),
    ];
    expect(firstContributor(entries, "hammar")).toBeNull();
  });

  it("never credits an admin action", () => {
    const entries = [
      entry({ by: "Admin Adminsson", action: "add", admin: true, at: "2026-01-01T10:00:00.000Z" }),
      entry({ by: "Anna Andersson", action: "add", at: "2026-02-01T10:00:00.000Z" }),
    ];
    expect(firstContributor(entries, "hammar")?.by).toBe("Anna Andersson");
  });

  it("only looks at the site asked about", () => {
    const entries = [
      entry({ by: "Bo Bengtsson", site: "molle", action: "add", at: "2026-01-01T10:00:00.000Z" }),
      entry({ by: "Anna Andersson", action: "add", at: "2026-02-01T10:00:00.000Z" }),
    ];
    expect(firstContributor(entries, "hammar")?.by).toBe("Anna Andersson");
  });
});

describe("change summaries", () => {
  const before = {
    name: "Hammar",
    coordinates: { lat: 55.9, lon: 14.3, verified: true },
    sector: { ranges: [{ from_deg: 180, to_deg: 260 }], verified: true },
    wind: { verified: true, min_ms: 5, max_ms: 9 },
    description: "En backe.",
  };

  it("spells out a wind band change with both values, because that is what people fly on", () => {
    const changes = summariseChanges(before, { ...before, wind: { verified: true, min_ms: 4, max_ms: 8 } });
    expect(changes).toContain("Vind 4–8 m/s (var 5–9 m/s)");
  });

  it("spells out a sector change with both values", () => {
    const changes = summariseChanges(before, {
      ...before,
      sector: { ranges: [{ from_deg: 200, to_deg: 260 }], verified: true },
    });
    expect(changes).toContain("Sektor 200–260° (var 180–260°)");
  });

  it("reports a moved pin in metres", () => {
    const changes = summariseChanges(before, {
      ...before,
      coordinates: { lat: 55.905, lon: 14.3, verified: true },
    });
    expect(changes.some((c) => /^Position flyttad \d+ m$/.test(c))).toBe(true);
  });

  it("stays quiet about a coordinate that only wobbled in the last decimal", () => {
    const changes = summariseChanges(before, {
      ...before,
      coordinates: { lat: 55.900002, lon: 14.300002, verified: true },
    });
    expect(changes.some((c) => c.startsWith("Position"))).toBe(false);
  });

  it("says nothing at all when nothing changed", () => {
    expect(summariseChanges(before, { ...before })).toEqual([]);
  });

  it("names the other fields without quoting them", () => {
    const changes = summariseChanges(before, {
      ...before,
      description: "En annan backe.",
      warnings: ["Nytt elstängsel"],
    });
    expect(changes).toContain("Beskrivning ändrad");
    expect(changes).toContain("Varningar ändrade");
  });

  it("describes a new site rather than diffing it against nothing", () => {
    const changes = summariseChanges(null, before);
    expect(changes).toEqual(["Ny plats (sektor 180–260°, vind 5–9 m/s)"]);
  });

  it("reports a move by path", () => {
    const changes = summariseChanges(before, before, {
      from: "se/skane/ridge/hammar.yaml",
      to: "se/skane/archive/hammar.yaml",
    });
    expect(changes[0]).toBe("Flyttad från se/skane/ridge/hammar.yaml till se/skane/archive/hammar.yaml");
  });

  it("reports verification being granted and withdrawn", () => {
    const granted = summariseChanges(
      { ...before, wind: { verified: false, min_ms: 5, max_ms: 9 } },
      { ...before, wind: { verified: true, min_ms: 5, max_ms: 9 } },
    );
    expect(granted).toContain("Vindvärden markerade som verifierade");

    const withdrawn = summariseChanges(before, { ...before, wind: { verified: false, min_ms: 5, max_ms: 9 } });
    expect(withdrawn).toContain("Vindvärden inte längre verifierade");
  });
});
