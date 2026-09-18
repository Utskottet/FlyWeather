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
  compact: boolean;
}

/**
 * Top header (§ Startvind UX Direction): brand, beta badge, data-update
 * status, and a menu. Identity and status only - no map tool lives up
 * here, and nothing in it moves the map.
 *
 * Add site lives inside the menu rather than as a button of its own. It is
 * meant to be findable by the pilots who fly these sites - an editor
 * nobody can see is an editor nobody contributes to - but it is not what
 * someone opened the app for. A menu is the honest weight for it: present,
 * discoverable, not competing with the map.
 *
 * On a phone the status cluster does not shrink into unreadable chips; it
 * shares that same menu, so the header stays a single short row and the
 * map keeps the screen (the reference image's desktop arrangement is not
 * simply scaled down - see MASTER_SPEC §15).
 */
export function AppHeader({
  sitesMeasured,
  raspOn,
  windUpdated,
  raspUpdated,
  onAddSite,
  compact,
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

      {/* Desktop keeps the status inline - there is room, and it is the
          thing most worth reading at a glance. The phone gets it in the
          menu instead. */}
      {!compact && (
        <div className="app-header-status" data-testid="app-header-status">
          {status}
        </div>
      )}

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
            {compact && (
              <div className="app-header-menu-status" data-testid="app-header-status-panel">
                {status}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
