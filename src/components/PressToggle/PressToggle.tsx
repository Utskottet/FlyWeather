import type { ReactNode } from "react";

/**
 * `pill` is the original standalone rounded button. `switch` is the
 * row form used inside the Map layers panel (§ Startvind UX Direction):
 * label on the left, a switch track on the right, the whole row being
 * one button. The semantics are identical in both - `aria-pressed` and
 * the single never-changing label are unchanged, only the drawing differs.
 */
export type PressToggleVariant = "pill" | "switch";

export interface PressToggleProps {
  /** Never changes text between pressed/unpressed states - state is conveyed only via aria-pressed + the "active" class, per the task's explicit ban on dual-label toggles (e.g. no "Wind on" / "Wind off"). */
  label: string;
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  testId?: string;
  /** Optional content after the label (e.g. a disclosure chevron on a control with an associated submenu, like RASP) - purely visual, never changes the pressed/aria-pressed semantics. */
  trailing?: ReactNode;
  variant?: PressToggleVariant;
}

export function PressToggle({ label, pressed, onChange, testId, trailing, variant = "pill" }: PressToggleProps) {
  return (
    <button
      type="button"
      className={`press-toggle press-toggle-${variant}${pressed ? " active" : ""}`}
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      data-testid={testId}
    >
      <span className="press-toggle-label">{label}</span>
      {trailing}
      {variant === "switch" && (
        <span className="press-toggle-track" aria-hidden="true">
          <span className="press-toggle-knob" />
        </span>
      )}
    </button>
  );
}
