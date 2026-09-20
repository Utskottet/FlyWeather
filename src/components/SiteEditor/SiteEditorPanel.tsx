import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SiteForm } from "./SiteForm.tsx";
import { ContributorFields } from "./ContributorFields.tsx";
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
import { EMPTY_CONTRIBUTOR, validateContributor, type Contributor } from "../../domain/contributor.ts";
import { PUBLISH_TARGET, deploymentStatus, publish, repoHead, type DeploymentState } from "../../app/editorApi.ts";

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
const CONTRIBUTOR_KEY = "startvind-editor-contributor";
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
 * There is no sign-in. Anybody looking at the map can correct a site;
 * what a save carries instead of a password is a contributor (see
 * ContributorFields), recorded in the site file and in the public edit
 * log in the same commit.
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
  const [contributor, setContributor] = useState<Contributor>(restoreContributor);
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  // Nothing is marked as a problem until a save has been attempted. A
  // form that turns red while you are still filling in the first field is
  // scolding you for not having finished yet.
  const [attempted, setAttempted] = useState(false);
  const [baseSha, setBaseSha] = useState<string | undefined>(undefined);
  const pollCount = useRef(0);

  // The head this edit is based on, so a change that lands while somebody
  // is typing becomes a refusal they can act on rather than a silent
  // overwrite of whatever the other person just published.
  useEffect(() => {
    if (!isWorker) return;
    let cancelled = false;
    void repoHead().then((sha) => {
      if (!cancelled) setBaseSha(sha);
    });
    return () => {
      cancelled = true;
    };
  }, [isWorker]);

  // Mirrored like the draft: somebody who loses the tab mid-edit should
  // not have to retype their name and re-tick the boxes.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(CONTRIBUTOR_KEY, JSON.stringify(contributor));
    } catch {
      // Storage unavailable - what is on screen is still intact.
    }
  }, [contributor]);

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
    // lastEditedBy is no longer a field of its own - it is whoever is
    // signing this edit, kept in step here so the draft, the site file and
    // the log all name the same person.
    const signed = { ...draft, lastEditedBy: contributor.name.trim().replace(/\s+/g, " ") };
    if (mode === "edit") return signed;
    const base = suggestedId(signed.name, signed.country);
    return { ...signed, id: base ? uniqueId(base, allIds) : "" };
  }, [draft, contributor.name, mode, allIds]);

  const otherIds = useMemo(() => allIds.filter((id) => id !== initialDraft.id), [allIds, initialDraft.id]);

  // The contributor's own problems are reported in place by
  // ContributorFields, so they are filtered out here rather than said
  // twice in two different wordings.
  const problems = validateDraft(draftWithId, otherIds).filter((p) => p.field !== "lastEditedBy");
  const contributorProblems = validateContributor(contributor);
  const overlapping = hasOverlappingBands(draftWithId.bands);
  const targetPath = draftWithId.id ? sitePathFor(draftWithId) : "";
  const busy = phase.kind === "publishing";
  const canPublish =
    problems.length === 0 && contributorProblems.length === 0 && !overlapping && !busy && targetPath !== "";

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
    setAttempted(true);
    if (!canPublish) return;

    setPhase({ kind: "publishing" });
    const outcome = await publish({
      path: targetPath,
      previousPath,
      fields: draftToSiteFields(draftWithId),
      contributor,
      baseSha,
    });

    if (!outcome.ok) {
      setPhase({
        kind: "failed",
        message: outcome.message,
        // A conflict, a refused signature or an unchanged form is fixable
        // from here; the draft stays exactly as typed either way.
        recoverable: outcome.code === "conflict" || outcome.code === "rejected" || outcome.code === "no_change",
      });
      return;
    }

    rememberEditor({ name: contributor.name, club: contributor.club });
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

  return (
    <div className="site-editor-panel" role="dialog" aria-label="Site editor" data-testid="site-editor">
      <header className="site-editor-header">
        <h2>{mode === "create" ? "Add site" : `Edit ${initialDraft.name}`}</h2>
        <button type="button" onClick={onClose} aria-label="Close editor">
          ✕
        </button>
      </header>

      <div className="site-editor-body">
        {/*
          Only when adding. It is advice about whether this site should
          exist at all, which is a question that has already been answered
          by the time somebody is editing one - and a standing warning on
          every edit is a warning people stop reading.
        */}
        {mode === "create" && (
          <p className="site-editor-guidance" data-testid="editor-proximity-note">
            To avoid a cluttered map, do not add a site if there is another site too close.
          </p>
        )}
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

        <ContributorFields
          value={contributor}
          onChange={setContributor}
          disabled={busy}
          showProblems={attempted}
        />

        <div className="site-editor-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            {phase.kind === "committed" ? "Close" : "Cancel"}
          </button>
          {/*
            Save is enabled even when the form is not ready. A disabled
            Save is the worst possible answer to "why can't I save this?" -
            it refuses and explains nothing, and on a phone the problem it
            is silently objecting to is usually scrolled off screen.
            Pressing it marks the edit as attempted, which is what makes
            the problems appear next to the fields they belong to.

            Deliberately not aria-disabled either: the button really is
            live, it just answers with an explanation instead of a save.
            Marking it disabled for assistive technology while it still
            does something would be the same lie told twice.
          */}
          {phase.kind !== "committed" && (
            <button type="button" onClick={handlePublish} disabled={busy} data-testid="editor-save">
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
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return initial;
    const stored = JSON.parse(raw) as { id?: string; draft?: SiteDraft };
    // Only restore into the same site - a stale draft for a different one
    // would silently overwrite whatever was actually opened.
    if (stored.id !== initial.id || !stored.draft) return initial;
    return stored.draft;
  } catch {
    return initial;
  }
}

/**
 * Brings back the contributor, from this tab's interrupted edit if there
 * is one and otherwise from whoever last published on this machine.
 *
 * The name and club are remembered; the tickbox deliberately is not. It
 * is an affirmation about THIS edit, and one that arrives pre-ticked from
 * six months ago is not an affirmation.
 */
function restoreContributor(): Contributor {
  const remembered = readRememberedEditor();
  const base: Contributor = { ...EMPTY_CONTRIBUTOR, name: remembered.name, club: remembered.club };
  try {
    const raw = window.sessionStorage.getItem(CONTRIBUTOR_KEY);
    if (!raw) return base;
    const stored = JSON.parse(raw) as Partial<Contributor>;
    return {
      ...base,
      name: typeof stored.name === "string" && stored.name !== "" ? stored.name : base.name,
      club: typeof stored.club === "string" ? stored.club : base.club,
      // Within the same tab a lost draft is the same edit, so the tick
      // survives a reload - but never a new visit.
      affirmed: stored.affirmed === true,
    };
  } catch {
    return base;
  }
}

function clearStoredDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do - a stale draft is only ever restored for the same site.
  }
}
