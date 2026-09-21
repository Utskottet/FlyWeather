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
 * Labelled "Live wind reading", over two lines. It has been "LIVE SITE"
 * and then "Current Wind"; both said WHEN the number is from and neither
 * said WHERE it came from, and a forecast also claims to be the wind
 * right now. Two people who added sites did not realise this button
 * shows a real anemometer's output - "reading" is the word that fixes
 * that, because a reading is something an instrument did.
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
      <span>Live wind</span>
      <span>reading</span>
    </button>
  );
}
