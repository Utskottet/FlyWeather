export interface PressToggleProps {
  /** Never changes text between pressed/unpressed states - state is conveyed only via aria-pressed + the "active" class, per the task's explicit ban on dual-label toggles (e.g. no "Wind on" / "Wind off"). */
  label: string;
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  testId?: string;
}

export function PressToggle({ label, pressed, onChange, testId }: PressToggleProps) {
  return (
    <button
      type="button"
      className={`press-toggle${pressed ? " active" : ""}`}
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      data-testid={testId}
    >
      {label}
    </button>
  );
}
