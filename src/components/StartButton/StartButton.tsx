export interface StartButtonProps {
  /** True once time+height+live-wind are all already at their START values. */
  isLiveMode: boolean;
  onStart: () => void;
}

/**
 * The app's single one-tap reset (§ FlyWeather Interaction Model) - resets
 * time to now, altitude to Surface, and site roses back to live station
 * wind, all in one press. Supersedes the old in-timeline NOW button, which
 * only ever reset time.
 *
 * Never disabled (§ FlyWeather Mobile UI Correction) - a prior version
 * grayed this out at START, which read as "unavailable" rather than "this
 * is where you are". It stays clickable at all times and shows an
 * active/pressed state instead; pressing it while already at START is a
 * harmless no-op (handleStart just re-applies the same values).
 *
 * Green while live, muted while on a forecast hour. Green because that is
 * what "you are looking at what is happening right now" reads as at a
 * glance, and because it is the one state where the app is showing
 * measurement rather than a model. The muted state is still clearly a
 * button - dimmed, not disabled - since pressing it is exactly how you
 * come back.
 *
 * Labelled "Current Wind" (§ Startvind UX Direction) rather than the
 * earlier "LIVE SITE" - same control, same semantics, the reference
 * image's wording.
 */
export function StartButton({ isLiveMode, onStart }: StartButtonProps) {
  return (
    <button
      type="button"
      className={`start-button${isLiveMode ? " active" : ""}`}
      onClick={onStart}
      aria-pressed={isLiveMode}
      data-testid="start-button"
    >
      Current Wind
    </button>
  );
}
