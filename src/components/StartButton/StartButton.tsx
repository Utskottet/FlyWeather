export interface StartButtonProps {
  /** True once time+height+live-wind are all already at their START values - nothing left to reset, so the button disables (mirrors the old in-timeline NOW button's disabled convention). */
  isLiveMode: boolean;
  onStart: () => void;
}

/**
 * The app's single one-tap reset (§ FlyWeather Interaction Model) - resets
 * time to now, altitude to Surface, and site roses back to live station
 * wind, all in one press. Supersedes the old in-timeline NOW button, which
 * only ever reset time.
 */
export function StartButton({ isLiveMode, onStart }: StartButtonProps) {
  return (
    <button
      type="button"
      className="start-button"
      onClick={onStart}
      disabled={isLiveMode}
      data-testid="start-button"
    >
      START
    </button>
  );
}
