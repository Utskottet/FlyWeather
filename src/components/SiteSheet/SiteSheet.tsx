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
  /** Whether the selected instant is after dark at this site - see domain/skyBand.ts's isNightAt. */
  isNight: boolean;
  /** How lit this site is at the selected instant - see domain/skyBand.ts's daylightFactor. */
  daylight?: number;
  onClose: () => void;
  /** Supplied only in admin mode - absent means no Edit button at all, not a disabled one. */
  onEdit?: () => void;
}

/** The height Open-Meteo's own surface series is quoted at. */
const SURFACE_HEIGHT_M = 10;

/**
 * Where this reading came from, and at what height.
 *
 * The height used to be hardcoded as "10 m surface wind" whatever the
 * altitude slider said, so a forecast interpolated to 1200 m still claimed
 * to be surface wind. The sheet already receives the height the sample
 * actually reflects - effectiveHeightM, which interpolateWindAtHeight
 * clamps to real data rather than extrapolating - so it says that instead.
 *
 * Worth keeping rather than deleting because the first half is the part
 * that matters: whether you are looking at a measurement or at a model.
 * That distinction is the whole reason a site has a station.
 */
function sourceLabel(sample: SiteSheetSample, effectiveHeightM: number | null): string {
  if (sample.sourceKind === "observation") {
    const age = sample.ageMinutes !== null ? `${Math.round(sample.ageMinutes)} min ago` : "";
    const source = sample.sourceId === "holfuy" ? "Holfuy live" : (sample.sourceId ?? "live");
    return `${source} (${sample.freshness}, ${age})`;
  }
  if (effectiveHeightM === null) return "Open-Meteo forecast";
  const height = effectiveHeightM === SURFACE_HEIGHT_M ? "10 m surface wind" : `${effectiveHeightM} m AGL`;
  return `Open-Meteo forecast (${height})`;
}

export function SiteSheet({
  site,
  sample,
  effectiveHeightM,
  heightSupported,
  isNight,
  daylight = 1,
  onClose,
  onEdit,
}: SiteSheetProps) {
  const sector = site.sector ? site.sector.ranges.map((r) => ({ fromDeg: r.from_deg, toDeg: r.to_deg })) : null;
  const { state, reasons } = evaluateFlyability(
    sample.windDirectionDeg,
    sample.windSpeedMs,
    sample.windGustMs,
    site.sector ?? null,
    site.wind,
  );

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
          isNight={isNight}
          daylight={daylight}
        />
      </div>
      <h2>{site.name}</h2>
      <p className="site-sheet-source-badge" data-testid="site-sheet-source">
        {sample.sourceKind === "observation" ? "LIVE" : "FORECAST"} — {sourceLabel(sample, effectiveHeightM)}
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
      {site.warnings && site.warnings.length > 0 && (
        <ul className="site-sheet-restrictions">
          {site.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {site.links && site.links.length > 0 && (
        <p>
          {site.links.map((l, i) => (
            <span key={l.url}>
              {i > 0 ? " · " : ""}
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            </span>
          ))}
        </p>
      )}
      {onEdit && (
        <button type="button" className="site-sheet-edit" onClick={onEdit} data-testid="site-sheet-edit">
          Edit site
        </button>
      )}
    </div>
  );
}
