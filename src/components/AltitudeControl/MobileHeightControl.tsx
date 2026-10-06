import { useEffect, useRef, useState } from "react";
import { AltitudeSlider } from "../AltitudeSlider/AltitudeSlider.tsx";
import { SURFACE_ALTITUDE_M, formatAltitudeLabel } from "../../domain/altitudeAxis.ts";

export interface MobileHeightControlProps {
  altitudeM: number;
  onChange: (altitudeM: number) => void;
}

/**
 * Phone height control (§ Startvind UX Direction, revised 2026-10-06).
 *
 * The permanent altitude slider was the tallest thing in the phone bottom
 * bar and forced the bar to stay tall; moving it behind a button makes the
 * bar one slim row, which in turn lets the time chip poke out above it.
 *
 * Unlike the old `HeightControl` this is not a value-hiding button: the
 * button's own label *is* the current value ("Surface" / "70 m AGL"), so
 * the selection stays readable while collapsed. Tapping it pops a slider
 * above the bar (over the map, clearing the protruding time chip); the
 * label tracks the drag live. Collapsing never resets the value - only
 * START does that, via `altitudeM`.
 */
export function MobileHeightControl({ altitudeM, onChange }: MobileHeightControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = altitudeM !== SURFACE_ALTITUDE_M;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="mobile-height" ref={rootRef}>
      {open && (
        <div className="mobile-height-popover" role="dialog" aria-label="Height above ground">
          <div className="mobile-height-popover-title">Height above ground (m AGL)</div>
          <AltitudeSlider altitudeM={altitudeM} onChange={onChange} />
        </div>
      )}
      <button
        type="button"
        className={`mobile-height-button${active ? " is-active" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        data-testid="mobile-height-button"
      >
        <span className="mobile-height-value" data-testid="mobile-height-value">
          {formatAltitudeLabel(altitudeM)}
        </span>
        <span className="mobile-height-chevron" aria-hidden="true">
          {open ? "▾" : "▴"}
        </span>
      </button>
    </div>
  );
}
