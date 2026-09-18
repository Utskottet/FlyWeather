import { useMemo, useState } from "react";
import { SiteForm } from "./SiteForm.tsx";
import {
  draftToSiteFields,
  sitePathFor,
  suggestedId,
  uniqueId,
  validateDraft,
  type SiteDraft,
} from "../../domain/siteEditor.ts";
import { hasOverlappingBands } from "../../domain/bandOverlap.ts";
import { readRememberedEditor, rememberEditor } from "../../app/editorIdentity.ts";

export interface SiteEditorPanelProps {
  initialDraft: SiteDraft;
  /** "create" derives the id from the name as you type; "edit" leaves an existing id alone. */
  mode: "create" | "edit";
  /** Every id in the catalogue - the duplicate check must include archived sites, as the build's does. */
  allIds: string[];
  /** Where the file currently lives, so a rename can delete the old one. Undefined when creating. */
  previousPath?: string;
  onClose: () => void;
  onSaved: (savedPath: string) => void;
}

type SaveState = { status: "idle" | "saving" } | { status: "error"; message: string };

/**
 * The site editor as a panel over the map.
 *
 * Saving posts to /api/site, which only exists while running locally (see
 * scripts/siteWriterPlugin.ts) - it writes the YAML file into sites/ and
 * rebuilds the catalogue. That is a change to the working tree, exactly as
 * hand-editing the file would be; committing and pushing is still what
 * puts it on the live site.
 */
export function SiteEditorPanel({
  initialDraft,
  mode,
  allIds,
  previousPath,
  onClose,
  onSaved,
}: SiteEditorPanelProps) {
  // Prefilled from this browser, not from the file - see SiteDraft's
  // lastEditedBy for why the previous editor's name is never carried over.
  const [draft, setDraft] = useState<SiteDraft>(() => ({
    ...initialDraft,
    lastEditedBy: initialDraft.lastEditedBy || readRememberedEditor(),
  }));
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  // Creating: the id follows the name, deduped against the catalogue, so
  // it is never typed by hand. Editing: it is left alone, because an id
  // appears in URLs and changing one silently breaks any link to the site.
  const draftWithId = useMemo<SiteDraft>(() => {
    if (mode === "edit") return draft;
    const base = suggestedId(draft.name, draft.country);
    return { ...draft, id: base ? uniqueId(base, allIds) : "" };
  }, [draft, mode, allIds]);

  // An id belonging to *another* site is a clash; the site's own id is not.
  const otherIds = useMemo(
    () => allIds.filter((id) => id !== initialDraft.id),
    [allIds, initialDraft.id],
  );

  const problems = validateDraft(draftWithId, otherIds);
  const overlapping = hasOverlappingBands(draftWithId.bands);
  const targetPath = draftWithId.id ? sitePathFor(draftWithId) : "";
  const canSave = problems.length === 0 && !overlapping && save.status !== "saving";

  async function handleSave() {
    setSave({ status: "saving" });
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: targetPath,
          previousPath,
          fields: draftToSiteFields(draftWithId),
        }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        setSave({ status: "error", message: body.error ?? `Save failed (HTTP ${response.status}).` });
        return;
      }
      // Only remembered once a save actually succeeded, so a name typed
      // into a save that was then rejected doesn't stick.
      rememberEditor(draftWithId.lastEditedBy);
      onSaved(targetPath);
    } catch (err) {
      // The endpoint is dev-only, so the most likely cause by far is
      // running against a built copy rather than `npm run dev`.
      setSave({
        status: "error",
        message: `Could not reach the local save endpoint - is this running under "npm run dev"? (${(err as Error).message})`,
      });
    }
  }

  return (
    <div className="site-editor-panel" role="dialog" aria-label="Site editor" data-testid="site-editor">
      <header className="site-editor-header">
        <h2>{mode === "create" ? "Add site" : `Edit ${initialDraft.name}`}</h2>
        <button type="button" onClick={onClose} aria-label="Close editor">
          ✕
        </button>
      </header>

      <div className="site-editor-body">
        <SiteForm value={draftWithId} onChange={setDraft} />
      </div>

      <footer className="site-editor-footer">
        {targetPath && (
          <p className="site-editor-path">
            sites/<strong>{targetPath}</strong>
            {previousPath && previousPath !== targetPath && <> — moved from {previousPath}</>}
          </p>
        )}

        {(problems.length > 0 || overlapping) && (
          <ul className="site-editor-problems" data-testid="editor-problems">
            {overlapping && <li>Sector cores overlap each other.</li>}
            {problems.map((p) => (
              <li key={`${p.field}-${p.message}`}>{p.message}</li>
            ))}
          </ul>
        )}

        {save.status === "error" && (
          <p className="site-editor-error" data-testid="editor-save-error">
            {save.message}
          </p>
        )}

        <label className="site-editor-signature">
          Your name
          <input
            value={draft.lastEditedBy}
            onChange={(e) => setDraft({ ...draft, lastEditedBy: e.target.value })}
            placeholder="First name and surname"
            autoComplete="name"
            data-testid="editor-signature"
          />
        </label>

        <div className="site-editor-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!canSave} data-testid="editor-save">
            {save.status === "saving" ? "Saving…" : "Save to sites/"}
          </button>
        </div>
      </footer>
    </div>
  );
}
