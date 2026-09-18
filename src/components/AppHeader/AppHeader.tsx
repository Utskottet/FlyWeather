import { useState } from "react";
import { SourceStatus } from "../SourceStatus/SourceStatus.tsx";

export interface AppHeaderProps {
  /** True in START/live-site mode - passed straight through to SourceStatus. */
  sitesMeasured: boolean;
  raspOn: boolean;
  windUpdated: string | null;
  raspUpdated: string | null;
  /** Undefined when there is nowhere for a save to go (see app/editorApi.ts's PUBLISH_TARGET) - the button is then not rendered at all rather than shown and guaranteed to fail. */
  onAddSite?: () => void;
  compact: boolean;
}

/**
 * Top header (§ Startvind UX Direction): brand, beta badge, real data-update
 * status, and Add site. Identity and status only - no map tool lives up
 * here, and nothing in it moves the map.
 *
 * On a phone the status cluster does not shrink into unreadable chips; it
 * collapses behind one "Data" button and opens as a panel under the header,
 * so the header itself stays a single short row and the map keeps the
 * screen (the reference image's desktop arrangement is not simply scaled
 * down - see MASTER_SPEC §15).
 *
 * The wording inside the status cluster is still SourceStatus's own
 * (SITES MEASURED / WIND FIELD FORECAST ...) - matching the reference's
 * "Forecast updated 15:30" phrasing is chunk 2's truthful-data-status
 * work, not this chunk's re-layout.
 */
export function AppHeader({
  sitesMeasured,
  raspOn,
  windUpdated,
  raspUpdated,
  onAddSite,
  compact,
}: AppHeaderProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  const status = (
    <SourceStatus
      sitesMeasured={sitesMeasured}
      raspOn={raspOn}
      windUpdated={windUpdated}
      raspUpdated={raspUpdated}
    />
  );

  return (
    <header className="app-header" data-testid="app-header">
      <div className="app-header-brand">
        <img
          className="app-header-logo"
          src={`${import.meta.env.BASE_URL}startvind-logo.png`}
          alt="Startvind"
          width={158}
          height={74}
        />
        <span className="app-header-beta" data-testid="app-header-beta">
          BETA
        </span>
      </div>

      {compact ? (
        <button
          type="button"
          className={`app-header-status-button${statusOpen ? " active" : ""}`}
          aria-expanded={statusOpen}
          onClick={() => setStatusOpen((open) => !open)}
          data-testid="header-status-toggle"
        >
          Data
        </button>
      ) : (
        <div className="app-header-status" data-testid="app-header-status">
          {status}
        </div>
      )}

      {onAddSite && (
        <button type="button" className="app-header-add" onClick={onAddSite} data-testid="add-site-button">
          Add site
        </button>
      )}

      {compact && statusOpen && (
        <div className="app-header-status-panel" data-testid="app-header-status-panel">
          {status}
        </div>
      )}
    </header>
  );
}
