import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SiteForm } from "./SiteForm.tsx";
import { SignInForm } from "./SignInForm.tsx";
import { PublishProgress } from "./PublishProgress.tsx";
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
import {
  PUBLISH_TARGET,
  currentSession,
  deploymentStatus,
  publish,
  readSessionToken,
  type DeploymentState,
} from "../../app/editorApi.ts";

export interface SiteEditorPanelProps {
  initialDraft: SiteDraft;
  /** "create" derives the id from the name as you type; "edit" leaves an existing id alone. */
  mode: "create" | "edit";
  /** Every id in the catalogue - the duplicate check must include archived sites, as the build's does. */
  allIds: string[];
  /** Where the file currently lives, so a move can delete the old one in the same commit. */
  previousPath?: string;
  onClose: () => void;
  onSaved: (savedPath: string) => void;
}

type Phase =
  | { kind: "editing" }
  | { kind: "publishing" }
  | { kind: "committed"; commitSha: string; state: DeploymentState; detail: string; url?: string }
  | { kind: "failed"; message: string; recoverable: boolean };

const DRAFT_KEY = "startvind-editor-draft";
const DEPLOY_POLL_MS = 6000;
const DEPLOY_POLL_LIMIT = 50; // ~5 minutes, then stop nagging GitHub

/**
 * The site editor as a panel over the map.
 *
 * On the public website a save goes to the publishing Worker, which
 * commits to the GitHub repository; the deploy that follows is reported
 * step by step rather than left to guesswork. Under `npm run dev` with no
 * Worker configured it writes straight into the working tree instead.
 *
 * A failed publish never costs work: the draft stays on screen AND is
 * mirrored into sessionStorage, so even a reload or a closed tab mid-save
 * can be resumed. It is cleared only once a publish has actually
 * succeeded.
 */
export function SiteEditorPanel({
  initialDraft,
  mode,
  allIds,
  previousPath,
  onClose,
  onSaved,
}: SiteEditorPanelProps) {
  const isWorker = PUBLISH_TARGET?.kind === "worker";

  const [draft, setDraft] = useState<SiteDraft>(() => restoreDraft(initialDraft));
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [signedIn, setSignedIn] = useState<boolean>(() => !isWorker || readSessionToken() !== null);
  const [baseSha, setBaseSha] = useState<string | undefined>(undefined);
  const pollCount = useRef(0);

  // Confirms the stored token is still valid rather than trusting its
  // presence, and picks up the head to base this edit on.
  useEffect(() => {
    if (!isWorker) return;
    let cancelled = false;
    void currentSession().then((session) => {
      if (cancelled) return;
      setSignedIn(session !== null);
      setBaseSha(session?.headSha);
    });
    return () => {
      cancelled = true;
    };
  }, [isWorker]);

  // Mirrored on every keystroke so a crash, a reload or a phone switching
  // apps mid-edit cannot lose the work.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ id: initialDraft.id, mode, draft }));
    } catch {
      // Storage unavailable - the on-screen draft is still intact.
    }
  }, [draft, initialDraft.id, mode]);

  const draftWithId = useMemo<SiteDraft>(() => {
    if (mode === "edit") return draft;
    const base = suggestedId(draft.name, draft.country);
    return { ...draft, id: base ? uniqueId(base, allIds) : "" };
  }, [draft, mode, allIds]);

  const otherIds = useMemo(() => allIds.filter((id) => id !== initialDraft.id), [allIds, initialDraft.id]);

  const problems = validateDraft(draftWithId, otherIds);
  const overlapping = hasOverlappingBands(draftWithId.bands);
  const targetPath = draftWithId.id ? sitePathFor(draftWithId) : "";
  const busy = phase.kind === "publishing";
  const canPublish = problems.length === 0 && !overlapping && !busy && signedIn && targetPath !== "";

  const pollDeployment = useCallback(async (commitSha: string) => {
    const status = await deploymentStatus(commitSha);
    setPhase((current) =>
      current.kind === "committed" && current.commitSha === commitSha
        ? { ...current, state: status.state, detail: status.detail, url: status.url }
        : current,
    );
    return status.state;
  }, []);

  useEffect(() => {
    if (phase.kind !== "committed") return;
    if (phase.state === "published" || phase.state === "failed") return;
    if (pollCount.current >= DEPLOY_POLL_LIMIT) return;

    const timer = window.setTimeout(() => {
      pollCount.current += 1;
      void pollDeployment(phase.commitSha);
    }, DEPLOY_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [phase, pollDeployment]);

  async function handlePublish() {
    setPhase({ kind: "publishing" });
    const outcome = await publish({
      path: targetPath,
      previousPath,
      fields: draftToSiteFields(draftWithId),
      baseSha,
    });

    if (!outcome.ok) {
      setPhase({
        kind: "failed",
        message: outcome.message,
        // A conflict or an expired session is fixable from here; the draft
        // stays exactly as typed either way.
        recoverable: outcome.code === "conflict" || outcome.code === "unauthorised",
      });
      if (outcome.code === "unauthorised") setSignedIn(false);
      return;
    }

    rememberEditor(draftWithId.lastEditedBy);
    clearStoredDraft();

    if (outcome.kind === "local") {
      onSaved(outcome.path);
      return;
    }

    pollCount.current = 0;
    setPhase({
      kind: "committed",
      commitSha: outcome.commitSha,
      state: "pending",
      detail: "Saved to GitHub. Waiting for the deploy to start.",
    });
    void pollDeployment(outcome.commitSha);
  }

  if (isWorker && !signedIn) {
    return (
      <div className="site-editor-panel" role="dialog" aria-label="Sign in to publish" data-testid="site-editor">
        <header className="site-editor-header">
          <h2>Sign in to publish</h2>
          <button type="button" onClick={onClose} aria-label="Close editor">
            ✕
          </button>
        </header>
        <div className="site-editor-body">
          <SignInForm
            onSignedIn={() => {
              setSignedIn(true);
              void currentSession().then((s) => setBaseSha(s?.headSha));
              if (phase.kind === "failed") setPhase({ kind: "editing" });
            }}
          />
          <p className="site-editor-hint">
            Your draft is kept while you sign in - nothing typed so far is lost.
          </p>
        </div>
      </div>
    );
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

        {phase.kind === "failed" && (
          <div className="site-editor-error" data-testid="editor-save-error">
            <p>{phase.message}</p>
            <p className="site-editor-hint">
              Nothing was published and your draft is untouched.
              {phase.recoverable && " Fix the above and try again."}
            </p>
          </div>
        )}

        {phase.kind === "committed" && (
          <PublishProgress
            state={phase.state}
            detail={phase.detail}
            url={phase.url}
            commitSha={phase.commitSha}
            onDone={() => onSaved(targetPath)}
          />
        )}

        <label className="site-editor-signature">
          Your name
          <input
            value={draft.lastEditedBy}
            onChange={(e) => setDraft({ ...draft, lastEditedBy: e.target.value })}
            placeholder="First name and surname"
            autoComplete="name"
            disabled={busy}
            data-testid="editor-signature"
          />
        </label>

        <div className="site-editor-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            {phase.kind === "committed" ? "Close" : "Cancel"}
          </button>
          {phase.kind !== "committed" && (
            <button type="button" onClick={handlePublish} disabled={!canPublish} data-testid="editor-save">
              {busy ? "Publishing…" : isWorker ? "Publish to the live site" : "Save to sites/"}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

/** Brings back a draft left behind by a failed publish or a closed tab, for this same site only. */
function restoreDraft(initial: SiteDraft): SiteDraft {
  const withName = { ...initial, lastEditedBy: initial.lastEditedBy || readRememberedEditor() };
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return withName;
    const stored = JSON.parse(raw) as { id?: string; draft?: SiteDraft };
    // Only restore into the same site - a stale draft for a different one
    // would silently overwrite whatever was actually opened.
    if (stored.id !== initial.id || !stored.draft) return withName;
    return { ...stored.draft, lastEditedBy: stored.draft.lastEditedBy || withName.lastEditedBy };
  } catch {
    return withName;
  }
}

function clearStoredDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do - a stale draft is only ever restored for the same site.
  }
}
