import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  idFromPath,
  publishSite,
  validateSitePath,
  type CommitInput,
  type RepoGateway,
} from "../../editor-worker/src/publish.ts";
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
      files.set(input.writePath, input.text);
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
    const result = await publishSite(repo, {
      path: "se/skane/winch/hammar.yaml",
      previousPath: "se/skane/ridge/hammar.yaml",
      fields: hammarFields(),
    });

    expect(result.ok).toBe(true);
    const written = parseYaml(repo.commits[0].text);
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
    await publishSite(repo, { path: "se/skane/ridge/hammar.yaml", fields: hammarFields() });
    const written = parseYaml(repo.commits[0].text);
    expect(written.station).toBeUndefined();
    expect(written.links).toBeUndefined();
    // But an unmodelled sibling of an owned key is still not collateral.
    expect(written.coordinates.source).toBe("CPS");
  });

  it("keeps a station the payload does carry, note and all", async () => {
    const repo = fakeRepo();
    await publishSite(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields({
        station: { provider: "holfuy", station_id: "214", verified: true, note: "Cliff-top mast" },
      }),
    });
    const written = parseYaml(repo.commits[0].text);
    expect(written.station.station_id).toBe("214");
    expect(written.station.note).toBe("Cliff-top mast");
  });

  it("lets a wind margin be cleared, rather than merging the old value back", async () => {
    const repo = fakeRepo({
      files: {
        "sites/se/skane/ridge/hammar.yaml": HAMMAR.replace("  max_ms: 8", "  max_ms: 8\n  margin_over_ms: 2"),
      },
    });
    await publishSite(repo, { path: "se/skane/ridge/hammar.yaml", fields: hammarFields() });
    const written = parseYaml(repo.commits[0].text);
    expect(written.wind.margin_over_ms).toBeUndefined();
    expect(written.wind.notes).toContain("no field for");
  });

  it("writes and deletes in a single commit, so a move cannot half-apply", async () => {
    const repo = fakeRepo();
    await publishSite(repo, {
      path: "se/skane/winch/hammar.yaml",
      previousPath: "se/skane/ridge/hammar.yaml",
      fields: hammarFields(),
    });

    expect(repo.commits).toHaveLength(1);
    expect(repo.commits[0].writePath).toBe("sites/se/skane/winch/hammar.yaml");
    expect(repo.commits[0].deletePath).toBe("sites/se/skane/ridge/hammar.yaml");
    expect([...repo.files.keys()]).toEqual(["sites/se/skane/winch/hammar.yaml"]);
  });

  it("never deletes anything when the destination is the same path", async () => {
    const repo = fakeRepo();
    await publishSite(repo, {
      path: "se/skane/ridge/hammar.yaml",
      previousPath: "se/skane/ridge/hammar.yaml",
      fields: hammarFields(),
    });
    expect(repo.commits[0].deletePath).toBeUndefined();
    expect(repo.files.has("sites/se/skane/ridge/hammar.yaml")).toBe(true);
  });

  it("refuses a move whose original has already gone", async () => {
    const repo = fakeRepo({ files: {} });
    const result = await publishSite(repo, {
      path: "se/skane/winch/hammar.yaml",
      previousPath: "se/skane/ridge/hammar.yaml",
      fields: hammarFields(),
    });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(repo.commits).toHaveLength(0);
  });

  it("renames the id together with the file, keeping the two in step", async () => {
    const repo = fakeRepo();
    const result = await publishSite(repo, {
      path: "se/skane/ridge/hammars-backar.yaml",
      previousPath: "se/skane/ridge/hammar.yaml",
      fields: hammarFields({ id: "hammars-backar" }),
    });
    expect(result.ok).toBe(true);
    expect(parseYaml(repo.commits[0].text).coordinates.source).toBe("CPS");
    expect(repo.commits[0].deletePath).toBe("sites/se/skane/ridge/hammar.yaml");
  });
});

describe("publishSite: conflicting edits", () => {
  it("refuses when the branch moved since the editor loaded", async () => {
    const repo = fakeRepo();
    repo.headSha = "head-9";
    const result = await publishSite(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields(),
      baseSha: "head-1",
    });
    expect(result).toMatchObject({ ok: false, code: "conflict" });
    expect(repo.commits).toHaveLength(0);
  });

  it("proceeds when the editor's base is still current", async () => {
    const repo = fakeRepo();
    const result = await publishSite(repo, {
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
    const result = await publishSite(racy, { path: "se/skane/ridge/hammar.yaml", fields: hammarFields() });
    expect(result).toMatchObject({ ok: false, code: "conflict" });
  });
});

describe("publishSite: rejections that protect the catalogue", () => {
  it("refuses an unsigned publish", async () => {
    const repo = fakeRepo();
    for (const name of [undefined, "", "Edvin", 42]) {
      const result = await publishSite(repo, {
        path: "se/skane/ridge/hammar.yaml",
        fields: hammarFields({ last_edited_by: name }),
      });
      expect(result, `name ${JSON.stringify(name)} should be refused`).toMatchObject({ ok: false, code: "unsigned" });
    }
    expect(repo.commits).toHaveLength(0);
  });

  it("refuses an id that disagrees with its filename", async () => {
    const repo = fakeRepo();
    const result = await publishSite(repo, {
      path: "se/skane/ridge/hammar.yaml",
      fields: hammarFields({ id: "something-else" }),
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_site" });
  });

  it("refuses an id already used by a different site", async () => {
    const repo = fakeRepo({
      files: { "sites/se/skane/ridge/hammar.yaml": HAMMAR, "sites/se/skane/archive/molle.yaml": HAMMAR },
    });
    const result = await publishSite(repo, {
      path: "se/skane/ridge/molle.yaml",
      fields: hammarFields({ id: "molle" }),
    });
    expect(result).toMatchObject({ ok: false, code: "duplicate_id" });
    expect(repo.commits).toHaveLength(0);
  });

  it("allows re-saving a site over itself, which is not a duplicate", async () => {
    const repo = fakeRepo();
    const result = await publishSite(repo, { path: "se/skane/ridge/hammar.yaml", fields: hammarFields() });
    expect(result.ok).toBe(true);
  });

  it("refuses a path outside sites/, without calling the repository", async () => {
    const repo = fakeRepo();
    const result = await publishSite(repo, {
      path: "../../.github/workflows/pages.yaml",
      fields: hammarFields(),
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_path" });
    expect(repo.commits).toHaveLength(0);
  });

  it("refuses a document the catalogue build would reject", async () => {
    const repo = fakeRepo();
    const result = await publishSite(repo, {
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
    await publishSite(
      repo,
      { path: "se/skane/ridge/hammar.yaml", fields: hammarFields({ last_edited_at: "1999-01-01T00:00:00.000Z" }) },
      when,
    );
    expect(parseYaml(repo.commits[0].text).last_edited_at).toBe(when.toISOString());
  });

  it("creates a brand new site and says so in the commit message", async () => {
    const repo = fakeRepo();
    const result = await publishSite(repo, {
      path: "se/skane/ridge/new-place.yaml",
      fields: hammarFields({ id: "new-place", name: "New Place" }),
    });
    expect(result.ok).toBe(true);
    expect(repo.commits[0].message).toContain("Add New Place");
    expect(repo.commits[0].message).toContain("Edvin Buregren");
    expect(repo.commits[0].deletePath).toBeUndefined();
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
