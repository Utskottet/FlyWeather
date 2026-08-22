import type { ReactNode } from "react";

export interface PressToggleProps {
  /** Never changes text between pressed/unpressed states - state is conveyed only via aria-pressed + the "active" class, per the task's explicit ban on dual-label toggles (e.g. no "Wind on" / "Wind off"). */
  label: string;
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  testId?: string;
  /** Optional content after the label (e.g. a disclosure chevron on a control with an associated submenu, like RASP) - purely visual, never changes the pressed/aria-pressed semantics. */
  trailing?: ReactNode;
}

export function PressToggle({ label, pressed, onChange, testId, trailing }: PressToggleProps) {
  return (
    <button
      type="button"
      className={`press-toggle${pressed ? " active" : ""}`}
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      data-testid={testId}
    >
      {label}
      {trailing}
    </button>
  );
}
