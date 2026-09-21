/**
 * Removes the contributor name and club this app used to keep in
 * localStorage.
 *
 * Until 2026-09-21 a successful publish saved both, so the editor could
 * pre-fill them next time. That convenience is gone - a form that opens
 * already wearing somebody else's name is one nobody reads, and on a
 * borrowed phone it is worse than an inconvenience - but the values are
 * still sitting in the browser of everybody who ever published. Nothing
 * reads them any more, so they are simply somebody's name left in a
 * drawer.
 *
 * Runs once at startup and clears them. Safe to delete this module (and
 * its call in main.tsx) once enough time has passed that anybody who
 * published in that window has loaded the site again - there is no
 * correctness cost to leaving it either, it just stops being useful.
 */

const RETIRED_KEYS = ["startvind-editor-name", "startvind-editor-club"];

export function forgetStoredIdentity(storage: Storage | undefined = safeStorage()): void {
  for (const key of RETIRED_KEYS) {
    try {
      storage?.removeItem(key);
    } catch {
      // Private windows and blocked site data throw on access. Nothing
      // reads these values any more, so failing to remove one is
      // untidy rather than a problem.
    }
  }
}

function safeStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
