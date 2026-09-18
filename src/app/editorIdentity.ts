/**
 * Remembers who is editing, so a full name is typed once per browser
 * rather than once per save.
 *
 * Only a convenience: the name is still a plain form field that has to
 * pass validation on every save, and nothing here is an identity claim -
 * anyone can type anything. It records who *says* they made the change,
 * which is the honest limit of a local editor with no accounts, and is
 * exactly why git history remains the real audit trail.
 */

const STORAGE_KEY = "startvind-editor-name";

export function readRememberedEditor(storage: Storage | undefined = safeStorage()): string {
  try {
    return storage?.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberEditor(name: string, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, name.trim().replace(/\s+/g, " "));
  } catch {
    // Non-fatal - the name just has to be retyped next session.
  }
}

function safeStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
