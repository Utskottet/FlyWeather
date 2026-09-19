import { useState } from "react";
import { ContributorFields } from "../SiteEditor/ContributorFields.tsx";
import { EMPTY_CONTRIBUTOR, contributorLabel, validateContributor, type Contributor } from "../../domain/contributor.ts";
import { describeAction, formatLogDate, historyFor } from "../../domain/siteHistory.ts";
import { readRememberedEditor, rememberEditor } from "../../app/editorIdentity.ts";
import { PUBLISH_TARGET, verify } from "../../app/editorApi.ts";

export interface SiteHistorySectionProps {
  siteId: string;
  /** Path relative to sites/, which a confirmation is recorded against. */
  sitePath: string;
}

/** How many entries are shown before the list is folded. */
const VISIBLE_ENTRIES = 5;

type Phase =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "failed"; message: string };

/**
 * A site's public history, and the one-tap way to add to it.
 *
 * Two things a catalogue of flying sites needs and a YAML file cannot
 * express on its own:
 *
 * Who looks after this. Not appointed and not a field in the file -
 * derived from who has actually been editing it (see editLog.ts). It
 * gives a pilot who thinks a number is wrong somebody to ask, and it
 * gives the person who has been keeping a site right some visible credit
 * for it.
 *
 * When it was last confirmed. Data checked last Sunday and data nobody
 * has looked at since 2023 are indistinguishable in a file, and only one
 * of them should be flown on. "Stämmer uppgifterna?" is the cheapest
 * possible contribution - it costs a name and two taps, writes a line to
 * the log and changes nothing about the site - and it is often the most
 * useful thing anybody can say.
 */
export function SiteHistorySection({ siteId, sitePath }: SiteHistorySectionProps) {
  const history = historyFor(siteId);
  const [expanded, setExpanded] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [contributor, setContributor] = useState<Contributor>(() => {
    const remembered = readRememberedEditor();
    return { ...EMPTY_CONTRIBUTOR, name: remembered.name, club: remembered.club };
  });
  const [attempted, setAttempted] = useState(false);

  const canConfirm = PUBLISH_TARGET?.kind === "worker";
  const shown = expanded ? history.entries : history.entries.slice(0, VISIBLE_ENTRIES);

  async function submit() {
    setAttempted(true);
    if (validateContributor(contributor).length > 0) return;

    setPhase({ kind: "saving" });
    const result = await verify({ path: sitePath, contributor });
    if (!result.ok) {
      setPhase({ kind: "failed", message: result.message });
      return;
    }
    rememberEditor({ name: contributor.name, club: contributor.club });
    setPhase({ kind: "saved" });
  }

  return (
    <section className="site-sheet-history" data-testid="site-history">
      <h3>Ändringslogg</h3>

      {history.maintainer ? (
        <p className="site-sheet-maintainer" data-testid="site-maintainer">
          Underhålls av {contributorLabel(history.maintainer.name, history.maintainer.club)}
        </p>
      ) : (
        <p className="site-sheet-maintainer" data-testid="site-maintainer">
          Ingen har ändrat den här platsen ännu.
        </p>
      )}

      <p className="site-sheet-verified" data-testid="site-last-verified">
        {history.lastVerified
          ? `Senast bekräftad ${formatLogDate(history.lastVerified.at)} av ${history.lastVerified.by}`
          : "Uppgifterna har inte bekräftats av någon ännu."}
      </p>

      {shown.length > 0 && (
        <ul className="site-sheet-log" data-testid="site-log">
          {shown.map((entry, i) => (
            <li key={`${entry.at}-${i}`}>
              <span className="site-sheet-log-when">{formatLogDate(entry.at)}</span>{" "}
              <span className="site-sheet-log-who">{contributorLabel(entry.by, entry.club)}</span>{" "}
              {describeAction(entry)}
              {entry.changes && entry.changes.length > 0 && (
                <span className="site-sheet-log-what">: {entry.changes.join("; ")}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {history.entries.length > VISIBLE_ENTRIES && !expanded && (
        <button type="button" className="site-sheet-log-more" onClick={() => setExpanded(true)}>
          Visa alla {history.entries.length} ändringar
        </button>
      )}

      {canConfirm && phase.kind === "idle" && (
        <button
          type="button"
          className="site-sheet-verify"
          onClick={() => setPhase({ kind: "confirming" })}
          data-testid="site-verify"
        >
          Stämmer uppgifterna? Bekräfta
        </button>
      )}

      {(phase.kind === "confirming" || phase.kind === "saving" || phase.kind === "failed") && (
        <div className="site-sheet-verify-form" data-testid="site-verify-form">
          <p className="site-sheet-verify-lead">
            Du intygar att uppgifterna om den här platsen stämmer i dag. Inget ändras - din bekräftelse läggs till i
            loggen.
          </p>
          <ContributorFields
            value={contributor}
            onChange={setContributor}
            disabled={phase.kind === "saving"}
            showProblems={attempted}
          />
          {phase.kind === "failed" && (
            <p className="site-editor-error" data-testid="site-verify-error">
              {phase.message}
            </p>
          )}
          <div className="site-sheet-verify-actions">
            <button type="button" onClick={() => setPhase({ kind: "idle" })} disabled={phase.kind === "saving"}>
              Avbryt
            </button>
            <button type="button" onClick={submit} disabled={phase.kind === "saving"} data-testid="site-verify-submit">
              {phase.kind === "saving" ? "Sparar…" : "Bekräfta"}
            </button>
          </div>
        </div>
      )}

      {phase.kind === "saved" && (
        <p className="site-sheet-verify-done" data-testid="site-verify-done">
          Tack! Din bekräftelse är sparad och syns i loggen när sajten har uppdaterats, om ett par minuter.
        </p>
      )}
    </section>
  );
}
