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
 * MEASURED/FORECAST are always in the DOM text, the LED is a redundant cue.
 */
export function SourceStatus({ sitesMeasured, raspOn, windUpdated, raspUpdated }: SourceStatusProps) {
  return (
    <div className="source-status" data-testid="source-status">
      <span
        className={`source-status-item ${sitesMeasured ? "led-measured" : "led-forecast"}`}
        data-testid="source-status-sites"
      >
        <span className="source-status-led" aria-hidden="true" />
        SITES {sitesMeasured ? "MEASURED" : "FORECAST"}
      </span>
      <span className="source-status-item led-forecast" data-testid="source-status-wind">
        <span className="source-status-led" aria-hidden="true" />
        WIND FIELD FORECAST
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
