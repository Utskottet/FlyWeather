import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  idFromPath,
  publishSite,
  validateSitePath,
  verifySite,
  type CommitInput,
  type PublishRequest,
  type RepoGateway,
} from "../../editor-worker/src/publish.ts";
import { parseEditLog } from "../../src/domain/editLog.ts";
import type { Contributor } from "../../src/domain/contributor.ts";
import { bearerFrom, issueToken, passwordMatches, verifyToken } from "../../editor-worker/src/auth.ts";

/**
 * The publishing Worker's rules, exercised against an in-memory repository
 * so every branch is covered without a GitHub account or a network call.
 */

const HAMMAR = `schema_version: 2
id: hammar
name: Hammars backar
short_name: Hammar
coordinates:
  lat: 55.41285
  lon: 13.993881
  verified: false
  source: CPS
sector:
  from_deg: 190
  to_deg: 255
  verified: false
wind:
  verified: true
  min_ms: 4
  max_ms: 8
  notes: A note the editor has no field for.
station:
  provider: holfuy
  station_id: "214"
  verified: true
ridge_height_m: 37
description: Long southwest-facing coastal ridge.
links:
  - label: CPS listing
    url: https://www.cps.to/flygstallen/sv-hammar/
`;

interface FakeRepo extends RepoGateway {
  files: Map<string, string>;
  commits: CommitInput[];
  headSha: string;
}

function fakeRepo(options: { files?: Record<string, string>; onCommit?: () => void } = {}): FakeRepo {
  const files = new Map<string, string>(Object.entries(options.files ?? { "sites/se/skane/ridge/hammar.yaml": HAMMAR }));
  const commits: CommitInput[] = [];
  const repo: FakeRepo = {
    files,
    commits,
    headSha: "head-1",
    async head() {
      return repo.headSha;
    },
    async listSitePaths() {
      return [...files.keys()];
    },
    async readFile(_sha, path) {
      return files.get(path) ?? null;
    },
    async commit(input) {
      options.onCommit?.();
      if (input.expectedHeadSha !== repo.headSha) {
        throw new Error("Update is not a fast forward");
      }
      commits.push(input);
      for (const write of input.writes) files.set(write.path, write.text);
      if (input.deletePath) files.delete(input.deletePath);
      repo.headSha = `head-${commits.length + 1}`;
      return { commitSha: `commit-${commits.length}` };
    },
  };
  return repo;
}

function hammarFields(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 2,
    id: "hammar",
    name: "Hammars backar",
    coordinates: { lat: 55.41285, lon: 13.993881, verified: false },
    wind: { verified: true, min_ms: 4, max_ms: 8 },
    description: "Long southwest-facing coastal ridge.",
    last_edited_by: "Edvin Buregren",
    ...overrides,
  };
}

/** A contributor who would pass the form, so each test states only what it is actually about. */
const CONTRIBUTOR: Contributor = {
  name: "Edvin Buregren",
  club: "Club Parapente Syd",
  affirmed: true,
  trap: "",
};

const LOG_PATH = "data/edit-log.jsonl";

function publishAs(
  repo: RepoGateway,
  request: Omit<PublishRequest, "contributor"> & { contributor?: Contributor },
  options?: { now?: Date; admin?: boolean },
) {
  return publishSite(repo, { contributor: CONTRIBUTOR, ...request }, options);
}

/** The site YAML a commit wrote - every commit also carries the log line. */
function siteText(commit: CommitInput): string {
  const write = commit.writes.find((w) => w.path.startsWith("sites/"));
  if (!write) throw new Error(`commit wrote no site file: ${commit.writes.map((w) => w.path).join(", ")}`);
  return write.text;
}

function sitePath(commit: CommitInput): string {
  const write = commit.writes.find((w) => w.path.startsWith("sites/"));
  return write?.path ?? "";
}

function logEntries(commit: CommitInput) {
  const write = commit.writes.find((w) => w.path === LOG_PATH);
  return parseEditLog(write?.text ?? "");
}

describe("validateSitePath", () => {
  it("accepts a well-formed site path", () => {
    expect(validateSitePath("se/skane/ridge/hammar.yaml")).toBeNull();
    expect(validateSitePath("se/skane/archive/vik.yaml")).toBeNull();
  });

  it("refuses traversal, absolute paths and backslashes", () => {
    expect(validateSitePath("se/skane/../../../etc/passwd.yaml")).not.toBeNull();
    expect(validateSitePath("/se/skane/ridge/hammar.yaml")).not.toBeNull();
    expect(validateSitePath("se\\skane\\ridge\\hammar.yaml")).not.toBeNull();
  });

  it("refuses the wrong depth or a non-yaml file", () => {
    expect(validateSitePath("se/skane/hammar.yaml")).not.toBeNull();
    expect(validateSitePath("se/skane/ridge/deeper/hammar.yaml")).not.toBeNull();
    expect(validateSitePath("se/skane/ridge/hammar.txt")).not.toBeNull();
  });

  it("refuses an unrecognised group segment, as parseSitePath does", () => {
    expect(validateSitePath("se/skane/paraglide/hammar.yaml")).not.toBeNull();
  });

  it("derives the id from the filename", () => {
    expect(idFromPath("sites/se/skane/ridge/hovs-hallar-nv.yaml")).toBe("hovs-hallar-nv");
  });
});

describe("publishSite: moving a site", () => {
  it("merges against the ORIGINAL file, so a move keeps fields the editor never sees", async () => {
    const repo = fakeRepo();
    const result = await publishAs(repo, {
      path: "se/skane/winch/hammar.yaml",
      previousPath: "se/skane/ridge/hammar.yaml",
      fields: hammarFields(),
    });

    expect(result.ok).toBe(true);
    const written = parseYaml(siteText(repo.commits[0]));
    // The regression this whole fix exists for. Neither of these is
    // modelled by the editor, neither is in the payload above, and before
    // the fix a move silently destroyed both by merging into a
    // destination file that did not exist yet.
    expect(written.coordinates.source).toBe("CPS");
    expect(written.wind.notes).toContain("no field for");
    // ...while the parts the payload DID carry are applied.
    expect(written.wind.max_ms).toBe(8);
    expect(written.name).toBe("Hammars backar");
  });

  it("still lets the operator clear a field the editor does own", async () => {
    // station and links are editable in the form, so their absence is an
    // instruction ("I removed them"), not an omission to be repaired -
    // otherwise a deleted station could never be deleted.
    const repo = fakeRepo();
    await publishAs(repo, { path: "se/skane/ridge/hammar.yaml", fields: hammarFields() });
    const written = parseYaml(siteText(repo.commits[0]));
    expect(written.station).toBeUndefined();
    expect(written.links).toBeUndefined();
    // But an unmodelled sibling of an owned key is still not collateral.
    expect(written.coordinates.source).toBe("CPS");
  });

  it("keeps a station the payload does carry, note and all", async () => {
    const repo = fakeRepo();
    await publishAs(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields({
        station: { provider: "holfuy", station_id: "214", verified: true, note: "Cliff-top mast" },
      }),
    });
    const written = parseYaml(siteText(repo.commits[0]));
    expect(written.station.station_id).toBe("214");
    expect(written.station.note).toBe("Cliff-top mast");
  });

  it("lets a wind margin be cleared, rather than merging the old value back", async () => {
    const repo = fakeRepo({
      files: {
        "sites/se/skane/ridge/hammar.yaml": HAMMAR.replace("  max_ms: 8", "  max_ms: 8\n  margin_over_ms: 2"),
      },
    });
    await publishAs(repo, { path: "se/skane/ridge/hammar.yaml", fields: hammarFields() });
    const written = parseYaml(siteText(repo.commits[0]));
    expect(written.wind.margin_over_ms).toBeUndefined();
    expect(written.wind.notes).toContain("no field for");
  });

  it("writes and deletes in a single commit, so a move cannot half-apply", async () => {
    const repo = fakeRepo();
    await publishAs(repo, {
      path: "se/skane/winch/hammar.yaml",
      previousPath: "se/skane/ridge/hammar.yaml",
      fields: hammarFields(),
    });

    expect(repo.commits).toHaveLength(1);
    expect(sitePath(repo.commits[0])).toBe("sites/se/skane/winch/hammar.yaml");
    expect(repo.commits[0].deletePath).toBe("sites/se/skane/ridge/hammar.yaml");
    // The old path is gone and the new one is there - one site, not two,
    // and not none. (The log file the same commit appends to is expected.)
    expect([...repo.files.keys()].filter((p) => p.startsWith("sites/"))).toEqual([
      "sites/se/skane/winch/hammar.yaml",
    ]);
  });

  it("never deletes anything when the destination is the same path", async () => {
    const repo = fakeRepo();
    await publishAs(repo, {
      path: "se/skane/ridge/hammar.yaml",
      previousPath: "se/skane/ridge/hammar.yaml",
      fields: hammarFields(),
    });
    expect(repo.commits[0].deletePath).toBeUndefined();
    expect(repo.files.has("sites/se/skane/ridge/hammar.yaml")).toBe(true);
  });

  it("refuses a move whose original has already gone", async () => {
    const repo = fakeRepo({ files: {} });
    const result = await publishAs(repo, {
      path: "se/skane/winch/hammar.yaml",
      previousPath: "se/skane/ridge/hammar.yaml",
      fields: hammarFields(),
    });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(repo.commits).toHaveLength(0);
  });

  it("renames the id together with the file, keeping the two in step", async () => {
    const repo = fakeRepo();
    const result = await publishAs(repo, {
      path: "se/skane/ridge/hammars-backar.yaml",
      previousPath: "se/skane/ridge/hammar.yaml",
      fields: hammarFields({ id: "hammars-backar" }),
    });
    expect(result.ok).toBe(true);
    expect(parseYaml(siteText(repo.commits[0])).coordinates.source).toBe("CPS");
    expect(repo.commits[0].deletePath).toBe("sites/se/skane/ridge/hammar.yaml");
  });
});

describe("publishSite: conflicting edits", () => {
  it("refuses when the branch moved since the editor loaded", async () => {
    const repo = fakeRepo();
    repo.headSha = "head-9";
    const result = await publishAs(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields(),
      baseSha: "head-1",
    });
    expect(result).toMatchObject({ ok: false, code: "conflict" });
    expect(repo.commits).toHaveLength(0);
  });

  it("proceeds when the editor's base is still current", async () => {
    const repo = fakeRepo();
    const result = await publishAs(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields(),
      baseSha: "head-1",
    });
    expect(result.ok).toBe(true);
  });

  it("reports a conflict when the branch moves mid-publish, rather than forcing", async () => {
    // Someone else's push lands after we read head but before the ref
    // update - the gateway refuses, and that must surface as a conflict
    // the operator can act on, not a generic failure.
    const repo = fakeRepo();
    const stolen = fakeRepo();
    stolen.headSha = "head-1";
    let first = true;
    const racy: RepoGateway = {
      ...repo,
      async commit(input) {
        if (first) {
          first = false;
          throw new Error("Update is not a fast forward");
        }
        return repo.commit(input);
      },
    };
    const result = await publishAs(racy, { path: "se/skane/ridge/hammar.yaml", fields: hammarFields() });
    expect(result).toMatchObject({ ok: false, code: "conflict" });
  });
});

describe("publishSite: rejections that protect the catalogue", () => {
  it("refuses a publish that is not properly signed", async () => {
    // The same rules the form applies, enforced again here: a rule that
    // holds only when the client cooperates is not a rule.
    const repo = fakeRepo();
    const bad: (Contributor | undefined)[] = [
      undefined,
      { ...CONTRIBUTOR, name: "" },
      { ...CONTRIBUTOR, name: "Edvin" },
      { ...CONTRIBUTOR, affirmed: false },
      { ...CONTRIBUTOR, affirmed: false },
      { ...CONTRIBUTOR, trap: "http://spam.example" },
      // The club is the one question a script cannot answer, so it has to
      // be asked again on this side - a shibboleth enforced only in the
      // browser is decoration.
      { ...CONTRIBUTOR, club: "" },
      { ...CONTRIBUTOR, club: "Manchester United" },
    ];
    for (const contributor of bad) {
      const result = await publishSite(repo, {
        path: "se/skane/ridge/hammar.yaml",
        fields: hammarFields(),
        contributor: contributor as Contributor,
      });
      expect(result, `${JSON.stringify(contributor)} should be refused`).toMatchObject({
        ok: false,
        code: "unsigned",
      });
    }
    expect(repo.commits).toHaveLength(0);
  });

  it("accepts a club however the pilot spells it, and records the club's own spelling", async () => {
    // "cps" and "Club Parapente Syd" must credit one club, or the same
    // person counts as several contributors depending on the day.
    const repo = fakeRepo();
    await publishSite(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields({ description: "A changed description." }),
      contributor: { ...CONTRIBUTOR, club: "c.p.s." },
    });
    expect(logEntries(repo.commits[0])[0].club).toBe("Club Parapente Syd");
    expect(repo.commits[0].message).toContain("(Club Parapente Syd)");
  });

  it("takes the recorded name from the contributor, not from the submitted fields", async () => {
    // Otherwise the name in the file and the name in the log could be
    // made to disagree, and the log would be worth nothing.
    const repo = fakeRepo();
    await publishAs(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields({ last_edited_by: "Someone Else", description: "A changed description." }),
    });
    expect(parseYaml(siteText(repo.commits[0])).last_edited_by).toBe("Edvin Buregren");
    expect(logEntries(repo.commits[0])[0].by).toBe("Edvin Buregren");
  });

  it("refuses an id that disagrees with its filename", async () => {
    const repo = fakeRepo();
    const result = await publishAs(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields({ id: "something-else" }),
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_site" });
  });

  it("refuses an id already used by a different site", async () => {
    const repo = fakeRepo({
      files: { "sites/se/skane/ridge/hammar.yaml": HAMMAR, "sites/se/skane/archive/molle.yaml": HAMMAR },
    });
    const result = await publishAs(repo, {
      path: "se/skane/ridge/molle.yaml",
      fields: hammarFields({ id: "molle" }),
    });
    expect(result).toMatchObject({ ok: false, code: "duplicate_id" });
    expect(repo.commits).toHaveLength(0);
  });

  it("allows re-saving a site over itself, which is not a duplicate", async () => {
    const repo = fakeRepo();
    const result = await publishAs(repo, { path: "se/skane/ridge/hammar.yaml", fields: hammarFields() });
    expect(result.ok).toBe(true);
  });

  it("refuses a path outside sites/, without calling the repository", async () => {
    const repo = fakeRepo();
    const result = await publishAs(repo, {
      path: "../../.github/workflows/pages.yaml",
      fields: hammarFields(),
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_path" });
    expect(repo.commits).toHaveLength(0);
  });

  it("refuses a document the catalogue build would reject", async () => {
    const repo = fakeRepo();
    const result = await publishAs(repo, {
      path: "se/skane/ridge/hammar.yaml",
      // verified with no numbers violates windSchema's own refinement
      fields: hammarFields({ wind: { verified: true } }),
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_site" });
    expect(repo.commits).toHaveLength(0);
  });

  it("stamps the publish time server-side, ignoring anything the client sent", async () => {
    const repo = fakeRepo();
    const when = new Date("2026-09-18T12:00:00.000Z");
    await publishAs(
      repo,
      { path: "se/skane/ridge/hammar.yaml", fields: hammarFields({ last_edited_at: "1999-01-01T00:00:00.000Z" }) },
      { now: when },
    );
    expect(parseYaml(siteText(repo.commits[0])).last_edited_at).toBe(when.toISOString());
  });

  it("creates a brand new site and says so in the commit message", async () => {
    const repo = fakeRepo();
    const result = await publishAs(repo, {
      path: "se/skane/ridge/new-place.yaml",
      fields: hammarFields({ id: "new-place", name: "New Place" }),
    });
    expect(result.ok).toBe(true);
    expect(repo.commits[0].message).toContain("Add New Place");
    expect(repo.commits[0].message).toContain("Edvin Buregren");
    expect(repo.commits[0].deletePath).toBeUndefined();
  });
});

describe("the edit log", () => {
  it("writes the log line in the SAME commit as the site file", async () => {
    // The whole reason the log is a file in the repo. There is no window
    // in which a site changed and nobody knows who did it, and one
    // `git revert` undoes both halves.
    const repo = fakeRepo();
    await publishAs(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields({ wind: { verified: true, min_ms: 3, max_ms: 9 } }),
    });

    expect(repo.commits).toHaveLength(1);
    expect(repo.commits[0].writes.map((w) => w.path).sort()).toEqual([
      "data/edit-log.jsonl",
      "sites/se/skane/ridge/hammar.yaml",
    ]);
  });

  it("records who, which site, and what actually changed", async () => {
    const repo = fakeRepo();
    await publishAs(
      repo,
      {
        path: "se/skane/ridge/hammar.yaml",
        fields: hammarFields({ wind: { verified: true, min_ms: 3, max_ms: 9 } }),
      },
      { now: new Date("2026-09-19T10:00:00.000Z") },
    );

    const [entry] = logEntries(repo.commits[0]);
    expect(entry).toMatchObject({
      at: "2026-09-19T10:00:00.000Z",
      site: "hammar",
      path: "se/skane/ridge/hammar.yaml",
      by: "Edvin Buregren",
      club: "Club Parapente Syd",
      action: "edit",
    });
    expect(entry.changes).toContain("Vind 3–9 m/s (var 4–8 m/s)");
  });

  it("appends rather than replacing, keeping every earlier entry", async () => {
    const repo = fakeRepo({
      files: {
        "sites/se/skane/ridge/hammar.yaml": HAMMAR,
        "data/edit-log.jsonl": `${JSON.stringify({
          at: "2026-01-01T00:00:00.000Z",
          site: "molle",
          path: "se/skane/ridge/molle.yaml",
          by: "Anna Andersson",
          action: "edit",
        })}\n`,
      },
    });
    await publishAs(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields({ description: "A changed description." }),
    });

    const entries = logEntries(repo.commits[0]);
    expect(entries).toHaveLength(2);
    expect(entries[0].site).toBe("molle");
    expect(entries[1].site).toBe("hammar");
  });

  it("calls a new site an add and a move a move", async () => {
    const added = fakeRepo();
    await publishAs(added, {
      path: "se/skane/ridge/new-place.yaml",
      fields: hammarFields({ id: "new-place", name: "New Place" }),
    });
    expect(logEntries(added.commits[0])[0].action).toBe("add");

    const moved = fakeRepo();
    await publishAs(moved, {
      path: "se/skane/winch/hammar.yaml",
      previousPath: "se/skane/ridge/hammar.yaml",
      fields: hammarFields(),
    });
    const entry = logEntries(moved.commits[0])[0];
    expect(entry.action).toBe("move");
    expect(entry.changes?.[0]).toContain("Flyttad från");
  });

  it("marks an admin's own change, and leaves an ordinary one unmarked", async () => {
    const asAdmin = fakeRepo();
    await publishAs(
      asAdmin,
      { path: "se/skane/ridge/hammar.yaml", fields: hammarFields({ description: "Admin edit." }) },
      { admin: true },
    );
    expect(logEntries(asAdmin.commits[0])[0].admin).toBe(true);

    const asPilot = fakeRepo();
    await publishAs(asPilot, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields({ description: "Pilot edit." }),
    });
    expect(logEntries(asPilot.commits[0])[0].admin).toBeUndefined();
  });

  it("names the contributor and their club in the commit message", async () => {
    const repo = fakeRepo();
    await publishAs(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields({ description: "A changed description." }),
    });
    expect(repo.commits[0].message).toContain("Edvin Buregren (Club Parapente Syd)");
  });

  it("refuses a save that changes nothing, rather than logging an edit that did not happen", async () => {
    // Pressing save on an untouched form is a normal accident. Committing
    // it would claim an edit in the log, trigger a deploy, and make the
    // history harder to read for no gain.
    const repo = fakeRepo();
    await publishAs(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields({ description: "A changed description." }),
    });
    const after = parseYaml(siteText(repo.commits[0]));

    const again = await publishAs(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: { ...after, last_edited_by: undefined, last_edited_at: undefined },
    });
    expect(again).toMatchObject({ ok: false, code: "no_change" });
    expect(repo.commits).toHaveLength(1);
  });
});

describe("verifySite", () => {
  it("writes only a log entry - the site file is not touched", async () => {
    // "Still right" is a different claim from "changed", and only one of
    // them should move last_edited_at.
    const repo = fakeRepo();
    const before = repo.files.get("sites/se/skane/ridge/hammar.yaml");

    const result = await verifySite(repo, { path: "se/skane/ridge/hammar.yaml", contributor: CONTRIBUTOR });

    expect(result.ok).toBe(true);
    expect(repo.commits[0].writes.map((w) => w.path)).toEqual(["data/edit-log.jsonl"]);
    expect(repo.files.get("sites/se/skane/ridge/hammar.yaml")).toBe(before);
    expect(logEntries(repo.commits[0])[0]).toMatchObject({ site: "hammar", action: "verify", by: "Edvin Buregren" });
  });

  it("needs the same signature a publish does", async () => {
    const repo = fakeRepo();
    const result = await verifySite(repo, {
      path: "se/skane/ridge/hammar.yaml",
      contributor: { ...CONTRIBUTOR, affirmed: false },
    });
    expect(result).toMatchObject({ ok: false, code: "unsigned" });
    expect(repo.commits).toHaveLength(0);
  });

  it("refuses to confirm a site that is not there", async () => {
    const repo = fakeRepo({ files: {} });
    const result = await verifySite(repo, { path: "se/skane/ridge/hammar.yaml", contributor: CONTRIBUTOR });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });

  it("refuses a path outside sites/", async () => {
    const repo = fakeRepo();
    const result = await verifySite(repo, { path: "../../.github/workflows/pages.yaml", contributor: CONTRIBUTOR });
    expect(result).toMatchObject({ ok: false, code: "invalid_path" });
    expect(repo.commits).toHaveLength(0);
  });
});

describe("worker auth", () => {
  const SECRET = "test-secret-not-a-real-one";

  it("round-trips a valid session", async () => {
    const { token, expiresAt } = await issueToken("edvin", SECRET);
    const payload = await verifyToken(token, SECRET);
    expect(payload?.sub).toBe("edvin");
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a token signed with a different secret - rotating it signs everyone out", async () => {
    const { token } = await issueToken("edvin", SECRET);
    expect(await verifyToken(token, "rotated-secret")).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const { token } = await issueToken("edvin", SECRET);
    const [, signature] = token.split(".");
    const forged = `${btoa(JSON.stringify({ sub: "attacker", exp: 9999999999 }))}.${signature}`;
    expect(await verifyToken(forged, SECRET)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { token } = await issueToken("edvin", SECRET, new Date("2020-01-01T00:00:00Z"));
    expect(await verifyToken(token, SECRET, new Date("2026-01-01T00:00:00Z"))).toBeNull();
  });

  it("rejects missing and malformed tokens", async () => {
    for (const bad of [null, "", "no-dot", "a.b.c.d"]) {
      expect(await verifyToken(bad, SECRET)).toBeNull();
    }
  });

  it("rejects a wrong password and never accepts an empty configured one", () => {
    expect(passwordMatches("correct horse", "correct horse")).toBe(true);
    expect(passwordMatches("wrong", "correct horse")).toBe(false);
    expect(passwordMatches("", "")).toBe(false);
    expect(passwordMatches(undefined, "correct horse")).toBe(false);
    expect(passwordMatches("   ", "   ")).toBe(false);
  });

  it("tolerates whitespace a secret store or a phone keyboard added", () => {
    // `wrangler secret put` fed from a pipe keeps the trailing newline,
    // which otherwise makes the password literally untypable.
    expect(passwordMatches("hunter2", "hunter2\n")).toBe(true);
    expect(passwordMatches("hunter2", "hunter2\r\n")).toBe(true);
    expect(passwordMatches("hunter2", " hunter2 ")).toBe(true);
    // ...and a pasted value with a trailing space still works.
    expect(passwordMatches("hunter2 ", "hunter2")).toBe(true);
    // But it is still the whole password that has to match.
    expect(passwordMatches("hunter", "hunter2")).toBe(false);
    expect(passwordMatches("hunter 2", "hunter2")).toBe(false);
  });

  it("reads a bearer token out of the Authorization header only", () => {
    expect(bearerFrom(new Request("https://x/", { headers: { Authorization: "Bearer abc.def" } }))).toBe("abc.def");
    expect(bearerFrom(new Request("https://x/", { headers: { Authorization: "Basic abc" } }))).toBeNull();
    expect(bearerFrom(new Request("https://x/"))).toBeNull();
  });
});
