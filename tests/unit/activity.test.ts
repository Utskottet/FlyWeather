import { describe, expect, it } from "vitest";
import { activityByline, buildActivity, totals } from "../../src/domain/activity.ts";
import type { EditLogEntry } from "../../src/domain/editLog.ts";
import type { Issue } from "../../src/domain/issues.ts";

function edit(over: Partial<EditLogEntry> = {}): EditLogEntry {
  return {
    at: "2026-09-20T10:00:00.000Z",
    site: "hammar",
    path: "se/skane/ridge/hammar.yaml",
    by: "Anna Andersson",
    club: "Club Parapente Syd",
    action: "edit",
    ...over,
  };
}

function issue(over: Partial<Issue> = {}): Issue {
  return {
    at: "2026-09-20T11:00:00.000Z",
    by: "Bo Bengtsson",
    text: "The timeline is hard to read on a phone.",
    ...over,
  };
}

describe("one story out of two files", () => {
  it("merges edits and suggestions, newest first", () => {
    // They are kept apart on disk because they are different things with
    // different rules. To a reader they are one story.
    const feed = buildActivity(
      [edit({ at: "2026-09-19T10:00:00.000Z" })],
      [issue({ at: "2026-09-20T11:00:00.000Z" })],
    );
    expect(feed.map((i) => i.kind)).toEqual(["issue", "edit"]);
  });

  it("names the site an edit touched, and nothing for a suggestion", () => {
    const [anEdit] = buildActivity([edit()], []);
    expect(anEdit.site).toBe("hammar");
    const [anIssue] = buildActivity([], [issue()]);
    expect(anIssue.site).toBeUndefined();
  });

  it("says what somebody did, in Swedish", () => {
    expect(buildActivity([edit({ action: "add" })], [])[0].summary).toBe("la till en plats");
    expect(buildActivity([edit({ action: "move" })], [])[0].summary).toBe("flyttade en plats");
    expect(buildActivity([], [issue()])[0].summary).toBe("skrev ett förslag");
  });

  it("carries an edit's change lines and a suggestion's own text", () => {
    expect(buildActivity([edit({ changes: ["Vind 4–8 m/s"] })], [])[0].detail).toEqual(["Vind 4–8 m/s"]);
    expect(buildActivity([], [issue()])[0].detail).toEqual(["The timeline is hard to read on a phone."]);
  });
});

describe("counting from the evidence", () => {
  it("counts edits, suggestions and the sites touched", () => {
    const feed = buildActivity(
      [edit(), edit({ site: "molle" }), edit({ site: "molle" })],
      [issue(), issue({ at: "2026-09-21T10:00:00.000Z" })],
    );
    const counts = totals(feed);
    expect(counts.edits).toBe(3);
    expect(counts.issues).toBe(2);
    expect(counts.sitesTouched).toBe(2);
  });

  it("counts one person once, however they typed their name", () => {
    const feed = buildActivity([edit({ by: "Anna Andersson" }), edit({ by: "  anna   andersson " })], []);
    expect(totals(feed).contributors).toBe(1);
  });

  it("counts somebody who both edited and suggested once", () => {
    const feed = buildActivity([edit({ by: "Anna Andersson" })], [issue({ by: "Anna Andersson" })]);
    expect(totals(feed).contributors).toBe(1);
  });

  it("reports the most recent thing that happened", () => {
    const feed = buildActivity([edit({ at: "2026-09-19T10:00:00.000Z" })], [issue({ at: "2026-09-21T10:00:00.000Z" })]);
    expect(totals(feed).latestAt).toBe("2026-09-21T10:00:00.000Z");
  });

  it("is all zeroes and null on an empty log rather than throwing", () => {
    expect(totals([])).toEqual({ edits: 0, issues: 0, contributors: 0, sitesTouched: 0, latestAt: null });
  });
});

describe("bylines", () => {
  it("match the ones used everywhere else", () => {
    expect(activityByline(buildActivity([edit()], [])[0])).toBe("Anna Andersson (Club Parapente Syd)");
    expect(activityByline(buildActivity([], [issue()])[0])).toBe("Bo Bengtsson");
  });
});
