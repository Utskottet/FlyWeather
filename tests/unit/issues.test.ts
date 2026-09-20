import { describe, expect, it } from "vitest";
import {
  MAX_ISSUE_LENGTH,
  appendIssue,
  issueByline,
  parseIssues,
  serialiseIssue,
  sortedIssues,
  validateIssueText,
  type Issue,
} from "../../src/domain/issues.ts";

function issue(over: Partial<Issue> = {}): Issue {
  return {
    at: "2026-09-20T18:00:00.000Z",
    by: "Edvin Buregren",
    club: "Club Parapente Syd",
    text: "The timeline is hard to read on a phone.",
    ...over,
  };
}

describe("what counts as a usable suggestion", () => {
  it("wants a few words, not a keystroke", () => {
    expect(validateIssueText("The timeline is hard to read.")).toBeNull();
    expect(validateIssueText("x")).toBeTruthy();
    expect(validateIssueText("   ")).toBeTruthy();
  });

  it("caps the length so the list stays readable", () => {
    expect(validateIssueText("a".repeat(MAX_ISSUE_LENGTH))).toBeNull();
    expect(validateIssueText("a".repeat(MAX_ISSUE_LENGTH + 1))).toBeTruthy();
  });

  it("says why in both languages", () => {
    expect(validateIssueText("x")).toMatch(/Skriv/);
    expect(validateIssueText("x")).toMatch(/Say a few words/);
  });
});

describe("storing the list", () => {
  it("round-trips through one line of JSONL", () => {
    const [back] = parseIssues(serialiseIssue(issue()));
    expect(back).toEqual(issue());
  });

  it("omits a missing club rather than writing an empty one", () => {
    expect(serialiseIssue(issue({ club: undefined }))).not.toContain("club");
  });

  it("appends without disturbing what is already there", () => {
    const first = appendIssue(null, issue({ at: "2026-09-01T10:00:00.000Z" }));
    const both = appendIssue(first, issue({ at: "2026-09-02T10:00:00.000Z" }));
    expect(both.startsWith(first.trimEnd())).toBe(true);
    expect(parseIssues(both)).toHaveLength(2);
    expect(both.endsWith("\n")).toBe(true);
  });

  it("skips a corrupt line instead of losing the whole list", () => {
    const text = `${serialiseIssue(issue())}\n{"at": "broken\n${serialiseIssue(issue({ by: "Anna Andersson" }))}\n`;
    expect(parseIssues(text)).toHaveLength(2);
  });

  it("ignores a line that parses but is not an issue", () => {
    expect(parseIssues('{"hello":"world"}\n[]\n')).toEqual([]);
  });

  it("shows the newest first", () => {
    const list = sortedIssues([
      issue({ at: "2026-09-01T10:00:00.000Z", text: "older one here" }),
      issue({ at: "2026-09-20T10:00:00.000Z", text: "newer one here" }),
    ]);
    expect(list[0].text).toBe("newer one here");
  });

  it("bylines the same way the edit log does", () => {
    expect(issueByline(issue())).toBe("Edvin Buregren (Club Parapente Syd)");
    expect(issueByline(issue({ club: undefined }))).toBe("Edvin Buregren");
  });
});
