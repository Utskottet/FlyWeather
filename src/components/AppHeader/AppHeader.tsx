import { useEffect, useRef, useState } from "react";
import { SourceStatus } from "../SourceStatus/SourceStatus.tsx";

export interface AppHeaderProps {
  /** True in START/live-site mode - passed straight through to SourceStatus. */
  sitesMeasured: boolean;
  raspOn: boolean;
  windUpdated: string | null;
  raspUpdated: string | null;
  /** Undefined when there is nowhere for a save to go (see app/editorApi.ts's PUBLISH_TARGET) - the menu item is then not rendered at all rather than shown and guaranteed to fail. */
  onAddSite?: () => void;
  /** Same rule: no publish target means nowhere to post a suggestion, so no menu item. */
  onOpenIssues?: () => void;
  /** Always available - the log is read from data the page already has, and needs no server. */
  onOpenLog: () => void;
}

/**
 * Top header (§ Startvind UX Direction): brand, data-update status, and a
 * menu. Identity and status only - no map tool lives up here, and nothing
 * in it moves the map.
 *
 * Add site lives inside the menu rather than as a button of its own. It is
 * meant to be findable by the pilots who fly these sites - an editor
 * nobody can see is an editor nobody contributes to - but it is not what
 * someone opened the app for. A menu is the honest weight for it: present,
 * discoverable, not competing with the map.
 *
 * The status is on the bar on every screen. It used to hide inside the
 * menu on a phone, which put whether you are looking at a measurement or
 * a model - the single most important thing on the page - behind a tap
 * nobody makes. Dropping the BETA badge and taking the wordmark down to
 * its own width paid for the room. The phone arrangement is a CSS
 * difference now (two stacked lines instead of one row), not a different
 * component tree, so there is no second layout to keep in step.
 */
export function AppHeader({
  sitesMeasured,
  raspOn,
  windUpdated,
  raspUpdated,
  onAddSite,
  onOpenIssues,
  onOpenLog,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // A menu that only closes via its own button is a menu people leave open
  // over the map by accident.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="app-header" data-testid="app-header">
      <div className="app-header-brand">
        <img
          className="app-header-logo"
          src={`${import.meta.env.BASE_URL}startvind-wordmark.png`}
          alt="Startvind"
          width={469}
          height={192}
        />
      </div>

      <div className="app-header-status" data-testid="app-header-status">
        <SourceStatus
          sitesMeasured={sitesMeasured}
          raspOn={raspOn}
          windUpdated={windUpdated}
          raspUpdated={raspUpdated}
        />
      </div>

      <div className="app-header-menu" ref={menuRef}>
        <button
          type="button"
          className={`app-header-menu-button${menuOpen ? " active" : ""}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Menu"
          onClick={() => setMenuOpen((open) => !open)}
          data-testid="header-menu-toggle"
        >
          <span aria-hidden="true">☰</span>
        </button>

        {menuOpen && (
          <div className="app-header-menu-panel" role="menu" data-testid="header-menu-panel">
            {onAddSite && (
              <button
                type="button"
                role="menuitem"
                className="app-header-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onAddSite();
                }}
                data-testid="add-site-button"
              >
                Add site
              </button>
            )}
            {onOpenIssues && (
              <button
                type="button"
                role="menuitem"
                className="app-header-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenIssues();
                }}
                data-testid="issues-button"
              >
                Issues and improvements
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="app-header-menu-item"
              onClick={() => {
                setMenuOpen(false);
                onOpenLog();
              }}
              data-testid="log-button"
            >
              Log
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
