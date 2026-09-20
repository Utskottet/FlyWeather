import type { LocatedSite } from "../../domain/sites.ts";
import { SiteHistorySection } from "./SiteHistorySection.tsx";
import { evaluateFlyability } from "../../domain/flyability.ts";
import { degreesToCompass16 } from "../../domain/direction.ts";
import { providerLabel } from "../../providers/live/resolver.ts";
import { proximityAdvice } from "../../domain/stations.ts";
import { navigationUrl } from "../../domain/parking.ts";
import { stationPageUrl } from "../../domain/stationLinks.ts";
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
  /** False when `ageMinutes` is measured from a download rather than from the observation - see WindSample. */
  ageConfirmed?: boolean;
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
    const source = sample.sourceId ? providerLabel(sample.sourceId) : "live";
    // An age is only quoted when the source actually dated its reading.
    // Holfuy's widget does not, and "3 min ago" would be describing when
    // we downloaded it - see WindSample.ageConfirmed.
    if (sample.ageConfirmed === false) return `${source} (age unconfirmed)`;
    const age = sample.ageMinutes !== null ? `${Math.round(sample.ageMinutes)} min ago` : "age unknown";
    return `${source} (${sample.freshness}, ${age})`;
  }
  if (effectiveHeightM === null) return "Open-Meteo forecast";
  const height = effectiveHeightM === SURFACE_HEIGHT_M ? "10 m surface wind" : `${effectiveHeightM} m AGL`;
  return `Open-Meteo forecast (${height})`;
}

/**
 * What to call a site's station.
 *
 * The name where one was saved - only stations chosen with the finder
 * have one. Otherwise the provider and the id, which is what the person
 * who set it up actually wrote down, and enough to look the station up.
 * "Holfuy" alone identifies nothing.
 */
function stationLabel(station: NonNullable<LocatedSite["station"]>): string {
  if (station.name) return station.name;
  const provider = providerLabel(station.provider);
  return station.station_id ? `${provider} #${station.station_id}` : provider;
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
  const stationUrl = site.station ? stationPageUrl(site.station) : null;
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
      {/*
        The verdict in words, for anybody who cannot use the colour.
        The reasons used to be a visible list under the badge; on a red
        site it said "direction outside the sector" and "speed outside
        safe limits", which the rose had already said louder. Removed
        from the page and kept here, so the rose is not colour-only -
        a screen reader gets the same verdict the colour carries.
      */}
      <div className="site-sheet-rose-row" role="img" aria-label={reasons.join(". ")}>
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
      {/*
        Which station this site's live wind comes from, and how far away
        it is - directly under the source badge, because the two answer
        one question together. "LIVE" tells you it is a measurement;
        this tells you a measurement of WHERE. A reading from an
        anemometer on the hill and one from an airport twenty kilometres
        inland are both live, and only one of them is about this site.

        Shown in forecast mode too: the station is a property of the
        site, and knowing what it would be reading is worth having even
        when the panel is showing a model.
      */}
      {site.station && (
        <p className="site-sheet-station" data-testid="site-sheet-station">
          Station:{" "}
          {/*
            Linked to the station's own page, which is where a pilot goes
            for the thing this panel cannot show: yesterday's trace, or a
            month of it. One current reading is not the whole story.
          */}
          {stationUrl ? (
            <a href={stationUrl} target="_blank" rel="noreferrer" data-testid="site-sheet-station-link">
              {stationLabel(site.station)}
            </a>
          ) : (
            stationLabel(site.station)
          )}
          {site.station_distance_km !== undefined && (
            <>
              {" · Distance to station: "}
              <span className={`site-sheet-station-distance ${proximityAdvice(site.station_distance_km)}`}>
                {site.station_distance_km.toFixed(1)} km
              </span>
            </>
          )}
        </p>
      )}
      {!heightSupported && (
        <p className="site-sheet-height-warning" data-testid="site-sheet-height-warning">
          No wind-aloft data available for this site at this time - not silently shown as surface wind.
        </p>
      )}
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
      {/*
        Below the warnings, deliberately. Several of these sites exist on
        a landowner's goodwill, and "private field, contact CPS" has to be
        read BEFORE a button that drives you there - a navigate button
        above the restriction would be the app quietly overruling it.
      */}
      {site.parking && (
        <p className="site-sheet-parking">
          <a
            className="site-sheet-parking-link"
            href={navigationUrl(site.parking)}
            target="_blank"
            rel="noreferrer"
            data-testid="site-sheet-parking"
          >
            Navigate to parking
          </a>
          {site.parking.note && (
            <span className="site-sheet-parking-note" data-testid="site-sheet-parking-note">
              {site.parking.note}
            </span>
          )}
        </p>
      )}
      {onEdit && (
        <button type="button" className="site-sheet-edit" onClick={onEdit} data-testid="site-sheet-edit">
          Edit site
        </button>
      )}
      <SiteHistorySection siteId={site.id} />
    </div>
  );
}
