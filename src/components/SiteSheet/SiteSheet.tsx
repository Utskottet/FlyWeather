import type { LocatedSite } from "../../domain/sites.ts";
import { evaluateFlyability } from "../../domain/flyability.ts";
import { degreesToCompass16 } from "../../domain/direction.ts";
import { WindRose } from "../WindRose/index.ts";
import type { WeatherKind } from "../../domain/weather.ts";
import type { Freshness } from "../../domain/freshness.ts";

export interface SiteSheetSample {
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
  weatherKind: WeatherKind;
  sourceKind: "observation" | "forecast";
  sourceId: string | null;
  freshness: Freshness | null;
  ageMinutes: number | null;
}

export interface SiteSheetProps {
  site: LocatedSite;
  sample: SiteSheetSample;
  /** Height (m AGL) the shown sample actually reflects - null when unsupported. May differ from the altitude bar's requested value when it exceeds real data (§ FlyWeather Interaction Model - see AltitudeSlider's own honest-ceiling disclosure). */
  effectiveHeightM: number | null;
  heightSupported: boolean;
  /** ISO-8601 UTC timestamp of the currently-selected slider time. */
  selectedTimestamp: string | null;
  onClose: () => void;
}

const STATE_LABEL: Record<"green" | "orange" | "red" | "gray", string> = {
  green: "GOOD",
  orange: "MAYBE",
  red: "BAD",
  gray: "UNKNOWN",
};

function sourceLabel(sample: SiteSheetSample): string {
  if (sample.sourceKind === "observation") {
    const age = sample.ageMinutes !== null ? `${Math.round(sample.ageMinutes)} min ago` : "";
    const source = sample.sourceId === "holfuy" ? "Holfuy live" : (sample.sourceId ?? "live");
    return `${source} (${sample.freshness}, ${age})`;
  }
  return "Open-Meteo forecast (10 m surface wind)";
}

export function SiteSheet({
  site,
  sample,
  effectiveHeightM,
  heightSupported,
  selectedTimestamp,
  onClose,
}: SiteSheetProps) {
  const green = site.rose.green[0];
  const sector = green ? { fromDeg: green.from_deg, toDeg: green.to_deg } : null;
  const { state, reasons } = evaluateFlyability(
    sample.windDirectionDeg,
    sample.windSpeedMs,
    sample.windGustMs,
    site.rose.green,
    site.rose.orange,
    site.wind_speed,
  );

  const timeLabel = selectedTimestamp
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Stockholm",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(selectedTimestamp))
    : "—";

  return (
    <div className="site-sheet" role="dialog" aria-label={`${site.name} details`} data-testid="site-sheet">
      <button type="button" className="site-sheet-close" onClick={onClose} aria-label="Close">
        &times;
      </button>
      <div className="site-sheet-rose-row">
        <WindRose
          size={140}
          sector={sector}
          state={state}
          windDirectionDeg={sample.windDirectionDeg}
          windSpeedMs={sample.windSpeedMs}
          weatherKind={sample.weatherKind}
        />
      </div>
      <h2>{site.name}</h2>
      <p className="site-sheet-status" data-testid="site-sheet-status">
        {STATE_LABEL[state]} at {timeLabel}
      </p>
      <p className="site-sheet-source-badge" data-testid="site-sheet-source">
        {sample.sourceKind === "observation" ? "LIVE" : "FORECAST"} — {sourceLabel(sample)}
      </p>
      {!heightSupported && (
        <p className="site-sheet-height-warning" data-testid="site-sheet-height-warning">
          No wind-aloft data available for this site at this time - not silently shown as surface wind.
        </p>
      )}
      <ul className="site-sheet-reasons">
        {reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <dl className="site-sheet-facts">
        <dt>Direction</dt>
        <dd>
          {sample.windDirectionDeg !== null
            ? `${degreesToCompass16(sample.windDirectionDeg)} (${sample.windDirectionDeg.toFixed(0)}°)`
            : "no data"}
        </dd>
        <dt>Wind / gust</dt>
        <dd>
          {sample.windSpeedMs !== null ? `${sample.windSpeedMs.toFixed(1)} m/s` : "no data"}
          {sample.windGustMs !== null ? ` / ${sample.windGustMs.toFixed(1)} m/s` : ""}
        </dd>
        <dt>Height</dt>
        <dd data-testid="site-sheet-height">
          {effectiveHeightM !== null ? `${effectiveHeightM.toFixed(0)} m AGL` : "unsupported"}
        </dd>
      </dl>
      <p>{site.description}</p>
      {site.restrictions && site.restrictions.length > 0 && (
        <ul className="site-sheet-restrictions">
          {site.restrictions.map((r, i) => (
            <li key={i}>{r.message}</li>
          ))}
        </ul>
      )}
      {site.cps_url && (
        <p>
          <a href={site.cps_url} target="_blank" rel="noreferrer">
            View on CPS
          </a>
        </p>
      )}
    </div>
  );
}
