export type SiteMode = "soaring" | "winch";

export interface SiteModeToggleProps {
  mode: SiteMode;
  onChange: (mode: SiteMode) => void;
}

export function SiteModeToggle({ mode, onChange }: SiteModeToggleProps) {
  return (
    <div className="site-mode-toggle" role="group" aria-label="Site set" data-testid="site-mode-toggle">
      <button
        type="button"
        className={mode === "soaring" ? "active" : ""}
        onClick={() => onChange("soaring")}
        data-testid="site-mode-soaring"
      >
        Ridge
      </button>
      <button
        type="button"
        className={mode === "winch" ? "active" : ""}
        onClick={() => onChange("winch")}
        data-testid="site-mode-winch"
      >
        Winch
      </button>
    </div>
  );
}
