import type { DeploymentState } from "../../app/editorApi.ts";

interface Props {
  state: DeploymentState;
  detail: string;
  url?: string;
  commitSha: string;
  onDone: () => void;
}

/**
 * What happened to a publish, step by step.
 *
 * The two halves are reported separately on purpose, because they fail
 * independently: the change is committed to GitHub first, and the deploy
 * that publishes it to the live site runs afterwards. A failed deploy does
 * not mean lost work - the commit is already safe - and saying so plainly
 * is the difference between "try again" and "panic".
 */

const STEPS: { key: string; label: string; reached: (s: DeploymentState) => boolean }[] = [
  { key: "saved", label: "Saved to GitHub", reached: () => true },
  {
    key: "deploying",
    label: "Deploying",
    reached: (s) => s === "building" || s === "published" || s === "failed",
  },
  { key: "published", label: "Live on the site", reached: (s) => s === "published" },
];

export function PublishProgress({ state, detail, url, commitSha, onDone }: Props) {
  const failed = state === "failed";

  return (
    <div
      className={`publish-progress${failed ? " publish-progress-failed" : ""}`}
      data-testid="publish-progress"
      data-state={state}
      role="status"
      aria-live="polite"
    >
      <ol className="publish-progress-steps">
        {STEPS.map((step) => {
          const done = step.reached(state);
          const isFailure = failed && step.key === "published";
          return (
            <li key={step.key} className={done && !isFailure ? "done" : isFailure ? "failed" : "waiting"}>
              <span aria-hidden="true">{isFailure ? "✕" : done ? "✓" : "○"}</span> {step.label}
            </li>
          );
        })}
      </ol>

      <p className="publish-progress-detail">{detail}</p>

      <p className="publish-progress-meta">
        commit <code>{commitSha.slice(0, 7)}</code>
        {url && (
          <>
            {" · "}
            <a href={url} target="_blank" rel="noreferrer">
              deploy log
            </a>
          </>
        )}
      </p>

      {state === "published" && (
        <button type="button" onClick={onDone} data-testid="publish-done">
          Reload the map
        </button>
      )}

      {failed && (
        <p className="site-editor-hint">
          Your change is committed and safe. Only the deploy failed, so it will go live once that is fixed or the
          next scheduled refresh runs.
        </p>
      )}
    </div>
  );
}
