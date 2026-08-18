import type { LocatedSite } from "../../domain/sites.ts";
import { evaluateFlyability } from "../../domain/flyability.ts";
import { degreesToCompass16 } from "../../domain/direction.ts";
import { WindRose } from "../WindRose/index.ts";
import { WeatherGlyph } from "../WeatherGlyph/index.ts";
import type { WeatherKind } from "../../domain/weather.ts";

export interface SiteSheetSample {
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
  weatherKind: WeatherKind;
}

export interface SiteSheetProps {
  site: LocatedSite;
  sample: SiteSheetSample;
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

export function SiteSheet({ site, sample, selectedTimestamp, onClose }: SiteSheetProps) {
  const greenSectors = site.rose.green.map((s) => ({ fromDeg: s.from_deg, toDeg: s.to_deg }));
  const orangeSectors = site.rose.orange.map((s) => ({ fromDeg: s.from_deg, toDeg: s.to_deg }));
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
          greenSectors={greenSectors}
          orangeSectors={orangeSectors}
          windDirectionDeg={sample.windDirectionDeg}
          windSpeedMs={sample.windSpeedMs}
          state={state}
        />
        <WeatherGlyph kind={sample.weatherKind} size={28} />
      </div>
      <h2>{site.name}</h2>
      <p className="site-sheet-status" data-testid="site-sheet-status">
        {STATE_LABEL[state]} at {timeLabel}
      </p>
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
        <dt>Source</dt>
        <dd>Open-Meteo forecast (10 m surface wind)</dd>
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
