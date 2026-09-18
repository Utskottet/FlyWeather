import type { CommitInput, RepoGateway } from "./publish.ts";

/**
 * GitHub-backed RepoGateway.
 *
 * Writes go through the Git Data API rather than the simpler Contents API
 * for one reason: atomicity. Contents can only touch one file per call, so
 * moving a site would be two commits - add, then delete - and a failure
 * between them leaves the catalogue with either a duplicate id (which
 * fails every future build) or no site at all. Building a tree and a
 * single commit makes a move indivisible: it either happens completely or
 * not at all.
 *
 * The final ref update is a compare-and-swap. `force` is never set, so if
 * anything else pushed while we were assembling the commit, GitHub refuses
 * it rather than discarding that work, and the caller reports a conflict.
 */

const API = "https://api.github.com";

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  /** Sent as User-Agent; GitHub rejects API requests without one. */
  userAgent: string;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function utf8FromBase64(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function createGitHubGateway(config: GitHubConfig): RepoGateway {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": config.userAgent,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();

      // GitHub answers an under-permissioned fine-grained token with
      // "Resource not accessible by personal access token", which reads
      // like a bug in the caller. It is a configuration problem, and it
      // shows up only on the first WRITE - reads succeed, so everything
      // looks fine until someone actually publishes. Say what to fix.
      if (response.status === 403 && /not accessible by personal access token/i.test(body)) {
        throw new GitHubError(
          "The GitHub token can read this repository but not write to it. Give it " +
            '"Contents: Read and write" (a fine-grained token on an organisation repo ' +
            "may also need the organisation to approve it), then set it again with " +
            "`wrangler secret put GITHUB_TOKEN`.",
          response.status,
        );
      }
      if (response.status === 401) {
        throw new GitHubError(
          "The GitHub token was rejected - it has probably expired. Issue a new one and " +
            "set it again with `wrangler secret put GITHUB_TOKEN`.",
          response.status,
        );
      }

      // 422 on a ref update is GitHub's "not a fast forward" - surfaced
      // with that wording so publish.ts can recognise it as a conflict
      // rather than a generic upstream failure.
      throw new GitHubError(
        `GitHub ${init?.method ?? "GET"} ${path} failed (${response.status}): ${body.slice(0, 400)}`,
        response.status,
      );
    }
    return (await response.json()) as T;
  }

  const base = `/repos/${config.owner}/${config.repo}`;

  return {
    async head(): Promise<string> {
      const ref = await call<{ object: { sha: string } }>(`${base}/git/ref/heads/${config.branch}`);
      return ref.object.sha;
    },

    async listSitePaths(commitSha: string): Promise<string[]> {
      // One recursive call for the whole tree rather than a request per
      // site - the duplicate-id check must see every file, and 31 calls
      // per publish would be both slow and rate-limit bait.
      const tree = await call<{ tree: { path: string; type: string }[]; truncated?: boolean }>(
        `${base}/git/trees/${commitSha}?recursive=1`,
      );
      if (tree.truncated) {
        throw new GitHubError("Repository tree was truncated; cannot verify site ids safely.", 500);
      }
      return tree.tree
        .filter((e) => e.type === "blob" && e.path.startsWith("sites/") && e.path.endsWith(".yaml"))
        .map((e) => e.path);
    },

    async readFile(commitSha: string, path: string): Promise<string | null> {
      try {
        const file = await call<{ content: string; encoding: string }>(
          `${base}/contents/${encodeURI(path)}?ref=${commitSha}`,
        );
        if (file.encoding !== "base64") {
          throw new GitHubError(`Unexpected encoding "${file.encoding}" for ${path}`, 500);
        }
        return utf8FromBase64(file.content);
      } catch (err) {
        if (err instanceof GitHubError && err.status === 404) return null;
        throw err;
      }
    },

    async commit(input: CommitInput): Promise<{ commitSha: string }> {
      const parent = await call<{ tree: { sha: string } }>(`${base}/git/commits/${input.expectedHeadSha}`);

      const blob = await call<{ sha: string }>(`${base}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: input.text, encoding: "utf-8" }),
      });

      // A tree entry with sha: null removes that path. Pairing it with the
      // write in one tree is what makes a move a single commit.
      const entries: Record<string, unknown>[] = [
        { path: input.writePath, mode: "100644", type: "blob", sha: blob.sha },
      ];
      if (input.deletePath && input.deletePath !== input.writePath) {
        entries.push({ path: input.deletePath, mode: "100644", type: "blob", sha: null });
      }

      const tree = await call<{ sha: string }>(`${base}/git/trees`, {
        method: "POST",
        body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }),
      });

      const commit = await call<{ sha: string }>(`${base}/git/commits`, {
        method: "POST",
        body: JSON.stringify({
          message: input.message,
          tree: tree.sha,
          parents: [input.expectedHeadSha],
        }),
      });

      // force:false - if the branch moved while we assembled this, GitHub
      // refuses and nothing above is referenced by any ref, so the loose
      // objects are simply garbage-collected. Never force: that would
      // discard whatever landed in between.
      await call(`${base}/git/refs/heads/${config.branch}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });

      return { commitSha: commit.sha };
    },
  };
}

export type DeploymentState = "pending" | "building" | "published" | "failed" | "unknown";

/**
 * Where a published commit has got to, for the editor's progress display.
 * Read from the Pages workflow's own run for that exact commit, so it
 * reports what actually happened rather than guessing from elapsed time.
 */
export async function deploymentStatus(
  config: GitHubConfig,
  commitSha: string,
): Promise<{ state: DeploymentState; detail: string; url?: string }> {
  const response = await fetch(
    `${API}/repos/${config.owner}/${config.repo}/actions/runs?head_sha=${commitSha}&per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": config.userAgent,
      },
    },
  );
  if (!response.ok) {
    return { state: "unknown", detail: `Could not read workflow runs (HTTP ${response.status}).` };
  }

  const body = (await response.json()) as {
    workflow_runs: { name: string; status: string; conclusion: string | null; html_url: string }[];
  };

  const pages = body.workflow_runs.find((r) => /pages/i.test(r.name));
  if (!pages) {
    // The commit is on GitHub but its deploy has not been queued yet -
    // genuinely "pending", not an error, and worth saying so plainly
    // rather than showing nothing while Actions catches up.
    return { state: "pending", detail: "Commit is on GitHub; the deploy has not started yet." };
  }

  if (pages.status !== "completed") {
    return { state: "building", detail: `Deploy ${pages.status.replace("_", " ")}.`, url: pages.html_url };
  }
  if (pages.conclusion === "success") {
    return { state: "published", detail: "Published to the live site.", url: pages.html_url };
  }
  return {
    state: "failed",
    detail: `Deploy ${pages.conclusion ?? "failed"}. The commit is safely on GitHub; the deploy needs attention.`,
    url: pages.html_url,
  };
}
