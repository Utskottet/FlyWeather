import { useState } from "react";
import { contributorLabel } from "../../domain/contributor.ts";
import { describeAction, formatLogDate, historyFor } from "../../domain/siteHistory.ts";

export interface SiteHistorySectionProps {
  siteId: string;
}

/** How many entries are shown before the list is folded. */
const VISIBLE_ENTRIES = 5;

/**
 * A site's public history.
 *
 * Who put it here, and what has been changed since. Both are flat facts
 * out of the edit log rather than anything derived or inferred.
 *
 * It used to lead with "Underhålls av X", computed from whoever had
 * edited the site most. That read as an appointment nobody had made and
 * implied a duty nobody had agreed to - and it would change under
 * somebody's feet the moment a second pilot edited twice. Who ADDED a
 * site is simply true, and stays true.
 *
 * It also used to carry a "confirm these values" button. It was a nice
 * idea and the wrong shape for this panel: the panel is what you read
 * before flying, and a call to action in the middle of it competes with
 * the wind. The endpoint behind it still exists.
 */
export function SiteHistorySection({ siteId }: SiteHistorySectionProps) {
  const history = historyFor(siteId);
  const [expanded, setExpanded] = useState(false);

  // Nothing to say about a site nobody has touched since the log began -
  // which is most of them. An empty heading is worse than no heading.
  if (history.entries.length === 0) return null;

  const shown = expanded ? history.entries : history.entries.slice(0, VISIBLE_ENTRIES);

  return (
    <section className="site-sheet-history" data-testid="site-history">
      <h3>Ändringslogg</h3>

      {history.addedBy && (
        <p className="site-sheet-added-by" data-testid="site-added-by">
          Tillagd av {contributorLabel(history.addedBy.by, history.addedBy.club)},{" "}
          {formatLogDate(history.addedBy.at)}
        </p>
      )}

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

      {history.entries.length > VISIBLE_ENTRIES && !expanded && (
        <button type="button" className="site-sheet-log-more" onClick={() => setExpanded(true)}>
          Visa alla {history.entries.length} ändringar
        </button>
      )}
    </section>
  );
}
