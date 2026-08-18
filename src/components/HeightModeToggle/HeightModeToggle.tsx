export type HeightMode = "surface" | "soaring";

export interface HeightModeToggleProps {
  mode: HeightMode;
  onChange: (mode: HeightMode) => void;
}

export function HeightModeToggle({ mode, onChange }: HeightModeToggleProps) {
  return (
    <div className="height-mode-toggle" role="group" aria-label="Height mode" data-testid="height-mode-toggle">
      <button
        type="button"
        className={mode === "surface" ? "active" : ""}
        onClick={() => onChange("surface")}
        data-testid="height-mode-surface"
      >
        Surface
      </button>
      <button
        type="button"
        className={mode === "soaring" ? "active" : ""}
        onClick={() => onChange("soaring")}
        data-testid="height-mode-soaring"
      >
        Soaring height
      </button>
    </div>
  );
}
