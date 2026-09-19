/**
 * Remembers who is editing, so a name and a club are typed once per
 * browser rather than once per correction.
 *
 * Only a convenience: both are still plain form fields that have to pass
 * validation on every save, and nothing here is an identity claim - anyone
 * can type anything. It records who *says* they made the change, which is
 * the honest limit of an editor with no accounts, and exactly why the
 * public edit log and git history remain the real record.
 *
 * localStorage rather than a cookie or a session: it should survive
 * closing the tab (a pilot who fixes a site in March and another in June
 * should not retype their name), it never leaves the device, and it is
 * read defensively because private windows and blocked site data throw on
 * access rather than returning null.
 */

const NAME_KEY = "startvind-editor-name";
const CLUB_KEY = "startvind-editor-club";

export interface RememberedEditor {
  name: string;
  club: string;
}

export function readRememberedEditor(storage: Storage | undefined = safeStorage()): RememberedEditor {
  return { name: readKey(NAME_KEY, storage), club: readKey(CLUB_KEY, storage) };
}

export function rememberEditor(
  editor: { name: string; club?: string },
  storage: Storage | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(NAME_KEY, editor.name.trim().replace(/\s+/g, " "));
    // An empty club is stored as an empty string rather than removed, so
    // "I deliberately have no club" is remembered as such instead of
    // being re-asked on every visit.
    storage?.setItem(CLUB_KEY, (editor.club ?? "").trim());
  } catch {
    // Non-fatal - the name just has to be retyped next session.
  }
}

export function forgetEditor(storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.removeItem(NAME_KEY);
    storage?.removeItem(CLUB_KEY);
  } catch {
    // Nothing to do; there was nothing readable to forget either.
  }
}

function readKey(key: string, storage: Storage | undefined): string {
  try {
    return storage?.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function safeStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
