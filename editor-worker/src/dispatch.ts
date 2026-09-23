import type { GitHubConfig } from "./github.ts";

const API = "https://api.github.com";

/**
 * The `repository_dispatch` event name `.github/workflows/weather-refresh.yml`
 * listens for. Declared here and matched there.
 *
 * A rename in only one of those places turns the external refresh off
 * silently - the Worker keeps dispatching an event nobody listens for, the
 * workflow keeps only its unreliable `schedule`, and the forecast goes
 * stale again with no error anywhere. Keeping the name as one exported
 * constant makes the pair obvious to a reader and to a search.
 */
export const REFRESH_EVENT_TYPE = "refresh-weather";

/**
 * Asks GitHub to run the weather-refresh workflow now.
 *
 * GitHub throttles its own `schedule` triggers hard on this repository: a
 * five-minute cron was measured firing at gaps of 117 to 318 minutes over 48
 * hours (docs/PUBLISHING.md), so the published forecast sat several hours
 * old and the app showed its staleness banner during entirely normal
 * operation. A `repository_dispatch` is not subject to that scheduler, so
 * the Worker's own cron (wrangler.toml's `[triggers]`) can make the
 * refresh actually happen on a predictable cadence.
 *
 * It reuses the same token the publisher commits with. A repository
 * dispatch needs "Contents: write" on a fine-grained token (or `repo` on a
 * classic one) - the exact permission this Worker already holds to publish
 * a site - so there is no second credential to set up, drift or expire.
 *
 * Creates no commit and no data of its own: the workflow it triggers does
 * all the work. GitHub answers 204 with an empty body on success, so any
 * other status is an error worth surfacing rather than swallowing.
 */
export async function dispatchWeatherRefresh(
  config: GitHubConfig,
  eventType: string = REFRESH_EVENT_TYPE,
): Promise<void> {
  const response = await fetch(`${API}/repos/${config.owner}/${config.repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": config.userAgent,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type: eventType }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub repository_dispatch failed (${response.status}): ${body.slice(0, 300)}`,
    );
  }
}
