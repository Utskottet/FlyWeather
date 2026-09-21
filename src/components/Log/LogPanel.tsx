import { useMemo, useState } from "react";
import type { LocatedSite } from "../../domain/sites.ts";
import { activityByline, buildActivity, totals } from "../../domain/activity.ts";
import { EDIT_LOG, formatLogDate } from "../../domain/siteHistory.ts";
import { ISSUES } from "../../app/issuesApi.ts";

export interface LogPanelProps {
  /** The sites currently on the map, for the counts at the top. */
  sites: LocatedSite[];
  /** When the live readings were collected, if any have been. */
  liveGeneratedAt?: string | null;
  onClose: () => void;
}

/** Shown before the list is folded - enough to read at a glance, not a wall. */
const VISIBLE_ITEMS = 30;

/**
 * Log: what has been going on here.
 *
 * Every number is counted from the log itself, not stored anywhere. A
 * running total kept in a database is a second source of truth that can
 * drift away from the thing it counts, and the only honest way to repair
 * one is to recount - so this recounts, every time, from the lines that
 * are the evidence. If it says twelve edits, twelve lines produced that,
 * and anybody can read them.
 *
 * Edits and suggestions live in separate files because they are
 * different things with different rules. To a reader they are one story,
 * so they are merged here for display and nowhere else.
 *
 * There is deliberately no visitor count. Counting visitors needs
 * somewhere to keep a number, which is the one thing this whole design
 * has avoided; the dashboard that does count them is private, and a
 * public number anybody can inflate by refreshing would be worth less
 * than the honesty it costs.
 */
export function LogPanel({ sites, liveGeneratedAt, onClose }: LogPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const activity = useMemo(() => buildActivity(EDIT_LOG, ISSUES), []);
  const counts = useMemo(() => totals(activity), [activity]);

  const withStation = sites.filter((s) => s.station).length;
  const winch = sites.filter((s) => s.group === "winch").length;
  const shown = expanded ? activity : activity.slice(0, VISIBLE_ITEMS);

  return (
    <div className="log-panel" role="dialog" aria-label="Log" data-testid="log-panel">
      <header className="log-header">
        <h2>Log</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="log-body">
        <dl className="log-totals" data-testid="log-totals">
          <div>
            <dt>Platser / Sites</dt>
            <dd>
              {sites.length}
              <span className="log-total-note">
                {winch} winch · {sites.length - winch} ridge
              </span>
            </dd>
          </div>
          <div>
            <dt>Vindmätare / Stations</dt>
            <dd>
              {withStation}
              <span className="log-total-note">av {sites.length} platser</span>
            </dd>
          </div>
          <div>
            <dt>Ändringar / Edits</dt>
            <dd>
              {counts.edits}
              <span className="log-total-note">på {counts.sitesTouched} platser</span>
            </dd>
          </div>
          <div>
            <dt>Bidragsgivare / Contributors</dt>
            <dd>{counts.contributors}</dd>
          </div>
          <div>
            <dt>Förslag / Suggestions</dt>
            <dd>{counts.issues}</dd>
          </div>
          {liveGeneratedAt && (
            <div>
              <dt>Senaste mätning / Last reading</dt>
              <dd className="log-total-small">{new Date(liveGeneratedAt).toLocaleString("sv-SE")}</dd>
            </div>
          )}
        </dl>

        <p className="log-lead">
          Allt som har hänt här, nyast först. Alla ändringar är offentliga och signerade.
          <br />
          <span className="editor-intro-en">
            Everything that has happened here, newest first. Every change is public and signed.
          </span>
        </p>

        {activity.length === 0 ? (
          <p className="log-empty" data-testid="log-empty">
            Inget har hänt än. / Nothing has happened yet.
          </p>
        ) : (
          <ul className="log-list" data-testid="log-list">
            {shown.map((item, i) => (
              <li key={`${item.at}-${i}`} className={item.kind}>
                <p className="log-item-head">
                  <span className="log-item-when">{formatLogDate(item.at)}</span>{" "}
                  <span className="log-item-who">{activityByline(item)}</span> {item.summary}
                  {item.site && <span className="log-item-site"> · {item.site}</span>}
                </p>
                {item.detail.length > 0 && <p className="log-item-detail">{item.detail.join("; ")}</p>}
              </li>
            ))}
          </ul>
        )}

        {activity.length > VISIBLE_ITEMS && !expanded && (
          <button type="button" className="log-more" onClick={() => setExpanded(true)} data-testid="log-more">
            Visa alla {activity.length} / Show all
          </button>
        )}
      </div>
    </div>
  );
}
