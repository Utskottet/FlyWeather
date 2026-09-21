export interface SourceStatusProps {
  /** True in START/live-site mode; false once time or height has moved into Forecast. */
  sitesMeasured: boolean;
  /** RASP is always a model product - shown only while the overlay is on, and only ever FORECAST, never MEASURED. */
  raspOn: boolean;
  /** Literal download-time label (e.g. "06:00 TODAY") for the regional wind field's generatedAt, from freshness.ts's formatDownloadTime - an absolute clock time, not a relative age, per explicit feedback that an age still requires mental math against the current time. Omitted (no time shown) until the data has actually loaded. */
  windUpdated?: string | null;
  /** Same, for RASP's own manifest generatedAt - only ever shown alongside the RASP chip, which itself is already gated on raspOn. */
  raspUpdated?: string | null;
}

/**
 * Compact source-provenance strip (§ FlyWeather GUI Reorganization +
 * Coherent Height Wind items 15-18) - replaces the old single prose
 * sentence. The regional animated WIND FIELD is always model data, even at
 * START (item 15: "REGIONAL WIND FIELD = weather-model forecast"), so its
 * badge never toggles - only SITES does. RASP's badge is omitted entirely
 * (not merely dimmed) while the overlay is off, so it never wastes space
 * on an irrelevant status (item 17). Never color-only (item 16): the words
 * CURRENT WIND/FORECAST are always in the DOM text, the LED is a redundant
 * cue.
 *
 * "SITES: LIVE WIND READING" rather than "SITES CURRENT WIND", which was
 * itself a replacement for "SITES MEASURED".
 *
 * The middle version was right that measured is what the data IS while
 * current wind is what it TELLS you - and wrong about the cost. "Current
 * wind" is a claim about TIME, and a forecast also claims to tell you the
 * wind right now, so the phrase never distinguished the two things a
 * pilot needs distinguished. Two people who added sites turned out not to
 * know that this number comes off a real anemometer. "Reading" is the
 * word that carries that: a reading is something an instrument did.
 *
 * Forecast mode is deliberately untouched - "SITES FORECAST" was never
 * the confusing half.
 */
export function SourceStatus({ sitesMeasured, raspOn, windUpdated, raspUpdated }: SourceStatusProps) {
  return (
    <div className="source-status" data-testid="source-status">
      <span
        className={`source-status-item ${sitesMeasured ? "led-measured" : "led-forecast"}`}
        data-testid="source-status-sites"
      >
        <span className="source-status-led" aria-hidden="true" />
        SITES{sitesMeasured ? ": LIVE WIND READING" : " FORECAST"}
      </span>
      <span className="source-status-item led-forecast" data-testid="source-status-wind">
        <span className="source-status-led" aria-hidden="true" />
        WIND FORECAST
        {windUpdated != null && <span data-testid="source-status-wind-time"> {windUpdated}</span>}
      </span>
      {raspOn && (
        <span className="source-status-item led-forecast" data-testid="source-status-rasp">
          <span className="source-status-led" aria-hidden="true" />
          RASP FORECAST
          {raspUpdated != null && <span data-testid="source-status-rasp-time"> {raspUpdated}</span>}
        </span>
      )}
    </div>
  );
}
