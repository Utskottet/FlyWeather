import { useState } from "react";
import { ContributorFields } from "../SiteEditor/ContributorFields.tsx";
import { EMPTY_CONTRIBUTOR, validateContributor, type Contributor } from "../../domain/contributor.ts";
import { MAX_ISSUE_LENGTH, issueByline, validateIssueText } from "../../domain/issues.ts";
import { ISSUES, postIssue } from "../../app/issuesApi.ts";
import { formatLogDate } from "../../domain/siteHistory.ts";
import { readRememberedEditor, rememberEditor } from "../../app/editorIdentity.ts";

export interface IssuesPanelProps {
  onClose: () => void;
}

type Phase = { kind: "writing" } | { kind: "sending" } | { kind: "sent" } | { kind: "failed"; message: string };

/**
 * Issues and improvements: a public list anybody can read, and a form
 * anybody can post to.
 *
 * Public on both sides deliberately. A suggestion box only the owner can
 * see is one people stop using, because they cannot tell whether theirs
 * was the third report of the same thing or the first - and because
 * there is no evidence anybody read it. Here the list is the evidence.
 *
 * The same signature as editing a site: a name, a club that has to be a
 * real one, and one tick. Not because a suggestion can break anything -
 * it writes to its own file and nothing else - but because somebody who
 * wants to be rude should have to sign it, and because a named
 * suggestion can be replied to in the clubhouse.
 */
export function IssuesPanel({ onClose }: IssuesPanelProps) {
  const [text, setText] = useState("");
  const [contributor, setContributor] = useState<Contributor>(() => {
    const remembered = readRememberedEditor();
    return { ...EMPTY_CONTRIBUTOR, name: remembered.name, club: remembered.club };
  });
  const [attempted, setAttempted] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "writing" });

  const textProblem = attempted ? validateIssueText(text) : null;
  const sending = phase.kind === "sending";

  async function submit() {
    setAttempted(true);
    if (validateIssueText(text) !== null || validateContributor(contributor).length > 0) return;

    setPhase({ kind: "sending" });
    const result = await postIssue(text, contributor);
    if (!result.ok) {
      setPhase({ kind: "failed", message: result.message });
      return;
    }
    rememberEditor({ name: contributor.name, club: contributor.club });
    setPhase({ kind: "sent" });
  }

  return (
    <div className="issues-panel" role="dialog" aria-label="Issues and improvements" data-testid="issues-panel">
      <header className="issues-header">
        <h2>Issues and improvements</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="issues-body">
        {phase.kind === "sent" ? (
          <p className="issues-sent" data-testid="issues-sent">
            Tack! Ditt förslag är sparat och dyker upp i listan när sajten har byggts om, om ett par minuter.
            <br />
            <span className="editor-intro-en">
              Thank you. Your suggestion is saved and appears in the list once the site rebuilds, in a couple of
              minutes.
            </span>
          </p>
        ) : (
          <>
            <p className="issues-lead">
              Något som kan bli bättre? Skriv det här - listan är öppen, alla kan läsa den.
              <br />
              <span className="editor-intro-en">
                Something that could be better? Write it here - the list is public, anyone can read it.
              </span>
            </p>

            <label className="issues-text-label">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                maxLength={MAX_ISSUE_LENGTH}
                placeholder="T.ex. tidslinjen är svår att förstå på mobil / e.g. the timeline is hard to read on a phone"
                disabled={sending}
                data-testid="issue-text"
              />
            </label>
            {textProblem && (
              <p className="contributor-problem" data-testid="issue-text-problem">
                {textProblem}
              </p>
            )}

            <ContributorFields
              value={contributor}
              onChange={setContributor}
              disabled={sending}
              showProblems={attempted}
            />

            {phase.kind === "failed" && (
              <p className="site-editor-error" data-testid="issue-error">
                {phase.message}
              </p>
            )}

            <div className="issues-actions">
              <button type="button" onClick={onClose} disabled={sending}>
                Avbryt / Cancel
              </button>
              <button type="button" onClick={() => void submit()} disabled={sending} data-testid="issue-submit">
                {sending ? "Skickar…" : "Skicka / Send"}
              </button>
            </div>
          </>
        )}

        <section className="issues-list-section">
          <h3>
            {ISSUES.length > 0 ? `${ISSUES.length} inskickade / submitted` : "Inget inskickat än / nothing yet"}
          </h3>
          {ISSUES.length > 0 && (
            <ul className="issues-list" data-testid="issues-list">
              {ISSUES.map((issue, i) => (
                <li key={`${issue.at}-${i}`}>
                  <p className="issues-item-text">{issue.text}</p>
                  <p className="issues-item-by">
                    {issueByline(issue)} · {formatLogDate(issue.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
