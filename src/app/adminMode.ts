/**
 * Whether the site-editing controls are visible.
 *
 * startvind.se is public and real pilots use it, so Edit/Add must not
 * appear for them. There is deliberately no password: the buttons only
 * *write* through the dev server's /api/site endpoint, which exists solely
 * on localhost, so on the deployed site they can do nothing anyway.
 * Hiding them is therefore about not confusing visitors, not about
 * guarding access - and a flag in the URL does exactly that with no auth
 * code, no accounts, and nothing to leak.
 *
 * `?admin=1` turns it on and is remembered, `?admin=0` turns it off again.
 *
 * Gated on import.meta.env.DEV as well, because the flag alone is not
 * enough: Save posts to /api/site, which is a dev-server plugin that
 * simply does not exist in a built copy. Without this check, ?admin=1 on
 * the deployed site would render a full editor whose Save button can only
 * ever fail - and a control that never works is worse than no control.
 * The editor is a local authoring tool; the deployed site is read-only.
 */

const STORAGE_KEY = "startvind-admin";

function readStored(storage: Storage | undefined): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private windows and blocked site data throw on access rather than
    // returning null - treat that as simply "not an admin".
    return false;
  }
}

function writeStored(storage: Storage | undefined, on: boolean): void {
  try {
    if (on) storage?.setItem(STORAGE_KEY, "1");
    else storage?.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal: the flag just won't survive a reload.
  }
}

export function resolveAdminMode(search: string, storage: Storage | undefined): boolean {
  const param = new URLSearchParams(search).get("admin");
  if (param === "1") {
    writeStored(storage, true);
    return true;
  }
  if (param === "0") {
    writeStored(storage, false);
    return false;
  }
  return readStored(storage);
}

/**
 * Read once at module load rather than per render: the URL does not change
 * without a reload, and the editor appearing mid-session would be a
 * surprise, not a feature.
 */
export const ADMIN_MODE: boolean =
  import.meta.env.DEV && typeof window !== "undefined"
    ? resolveAdminMode(window.location.search, window.localStorage)
    : false;
