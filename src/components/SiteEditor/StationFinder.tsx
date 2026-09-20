import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_RADIUS_KM,
  nearbyStations,
  proximityAdvice,
  stationSelection,
  type NearbyStation,
  type StationCatalogue,
} from "../../domain/stations.ts";
import { loadStationCatalogue, observationFreshness, previewStation, type StationPreview } from "../../app/stationApi.ts";
import { degreesToCompass16 } from "../../domain/direction.ts";

export interface StationFinderProps {
  /** The site being edited. Its coordinates are the search point. */
  point: { lat: number | null; lon: number | null };
  onUse: (selection: ReturnType<typeof stationSelection>) => void;
  onClose: () => void;
}

/**
 * Finds the wind stations near a flying site, shows what one is actually
 * reporting, and hands the chosen record back to the editor.
 *
 * Three deliberate refusals:
 *
 * It does not save. "Use this station" fills the form's fields and
 * closes; publishing stays one explicit act by a person who can see what
 * they are about to publish.
 *
 * It does not set verified. A station that answers has proved its feed is
 * readable - nothing more. Whether it describes the wind at a hill
 * several kilometres away well enough to fly on is a question only
 * somebody who has flown there can answer, and the two were conflated
 * before this existed.
 *
 * It does not hide an unknown age. A reading whose timestamp cannot be
 * trusted says so, rather than being rendered as fresh because it
 * arrived just now.
 */
export function StationFinder({ point, onUse, onClose }: StationFinderProps) {
  const [catalogue, setCatalogue] = useState<StationCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [selected, setSelected] = useState<NearbyStation | null>(null);
  const [preview, setPreview] = useState<StationPreview | "loading" | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStationCatalogue().then(
      (loaded) => !cancelled && setCatalogue(loaded),
      (err: Error) => !cancelled && setError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const hasPoint = point.lat !== null && point.lon !== null;
  const nearby = useMemo(() => {
    if (!catalogue || !hasPoint) return [];
    return nearbyStations(catalogue.stations, { lat: point.lat!, lon: point.lon! }, radiusKm);
  }, [catalogue, hasPoint, point.lat, point.lon, radiusKm]);

  async function check(station: NearbyStation) {
    setSelected(station);
    setPreview("loading");
    const result = await previewStation({ provider: station.provider, station_id: station.id, url: station.url });
    setPreview(result);
  }

  const failedProviders = catalogue?.providers.filter((p) => p.status === "failed") ?? [];

  return (
    <div className="station-finder" role="dialog" aria-label="Find a nearby station" data-testid="station-finder">
      <header className="station-finder-header">
        <h3>Nearby wind stations</h3>
        <button type="button" onClick={onClose} aria-label="Close station finder">
          ✕
        </button>
      </header>

      {!hasPoint && (
        <p className="station-finder-empty" data-testid="station-finder-no-point">
          Set the site's coordinates first - the search starts from them.
        </p>
      )}

      {error && <p className="site-editor-error">{error}</p>}

      {hasPoint && !catalogue && !error && <p className="station-finder-empty">Loading the station directory…</p>}

      {hasPoint && catalogue && (
        <>
          <label className="station-finder-radius">
            Within {radiusKm} km
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              data-testid="station-finder-radius"
            />
          </label>

          {nearby.length === 0 ? (
            <p className="station-finder-empty" data-testid="station-finder-empty">
              No stations within {radiusKm} km. Widen the search, or leave the site without a live station.
            </p>
          ) : (
            <ul className="station-finder-list" data-testid="station-finder-list">
              {nearby.map((station) => (
                <li key={station.key} className={selected?.key === station.key ? "selected" : undefined}>
                  <button type="button" className="station-finder-row" onClick={() => void check(station)}>
                    <span className={`station-finder-distance ${proximityAdvice(station.distanceKm)}`}>
                      {station.distanceKm.toFixed(1)} km
                    </span>
                    <span className="station-finder-name">{station.name}</span>
                    <span className="station-finder-kind">{station.stationType ?? station.provider}</span>
                  </button>

                  {selected?.key === station.key && (
                    <div className="station-finder-preview" data-testid="station-finder-preview">
                      {preview === "loading" && <p>Checking the station…</p>}

                      {preview && preview !== "loading" && preview.status === "unavailable" && (
                        <p className="station-finder-unavailable" data-testid="station-preview-unavailable">
                          No reading right now — {preview.message}
                        </p>
                      )}

                      {preview && preview !== "loading" && preview.status === "ok" && (
                        <ObservationSummary preview={preview} />
                      )}

                      {station.note && <p className="station-finder-note">{station.note}</p>}

                      <p className="station-finder-note">
                        {station.distanceKm.toFixed(1)} km away. A working connection does not mean this station
                        describes the wind at this site — only somebody who has flown here can say that.
                      </p>

                      <button
                        type="button"
                        className="station-finder-use"
                        onClick={() => onUse(stationSelection(station))}
                        data-testid="station-finder-use"
                      >
                        Use this station
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <footer className="station-finder-footer">
            <p>
              {catalogue.stations.length} stations, last checked {new Date(catalogue.generatedAt).toLocaleDateString("sv-SE")}.
              Being listed does not mean a station is currently reporting.
            </p>
            {failedProviders.length > 0 && (
              <p data-testid="station-finder-degraded">
                Missing from this list: {failedProviders.map((p) => p.name).join(", ")} — the directory could not be read
                when it was last built.
              </p>
            )}
          </footer>
        </>
      )}
    </div>
  );
}

/**
 * One observation, with its age stated rather than implied.
 *
 * The gust report is printed separately when the source supplies one
 * that way (SMHI's hourly maximum), because it describes a different
 * period from the wind beside it.
 */
function ObservationSummary({ preview }: { preview: { status: "ok"; sample: import("../../domain/types.ts").WindSample } }) {
  const { sample } = preview;
  const freshness = observationFreshness(sample);
  const minutes = Math.round((Date.now() - Date.parse(sample.timestamp)) / 60_000);

  const age =
    freshness === "unknown-age"
      ? "age unknown - this source publishes no dated timestamp"
      : freshness === "suspect"
        ? "the source flagged this reading, or its clock is wrong"
        : `measured ${minutes} min ago${freshness === "stale" ? " - older than this source's normal interval" : ""}`;

  return (
    <div className={`station-finder-observation ${freshness}`} data-testid="station-preview-ok">
      <p className="station-finder-wind">
        {sample.windSpeedMs === null ? "no speed" : `${sample.windSpeedMs.toFixed(1)} m/s`}
        {sample.windGustMs !== null ? ` (gust ${sample.windGustMs.toFixed(1)})` : ""}{" "}
        {sample.variableDirection
          ? "variable direction"
          : sample.windDirectionDeg === null
            ? "no direction"
            : `from ${degreesToCompass16(sample.windDirectionDeg)} (${sample.windDirectionDeg.toFixed(0)}°)`}
      </p>
      <p className="station-finder-age" data-testid="station-preview-age">
        {age}
      </p>
      {sample.gustReport && (
        <p className="station-finder-note" data-testid="station-preview-gust-report">
          {sample.gustReport.label}: {sample.gustReport.windGustMs.toFixed(1)} m/s, measured{" "}
          {Math.round((Date.now() - Date.parse(sample.gustReport.timestamp)) / 60_000)} min ago — a different period from
          the wind above.
        </p>
      )}
      {sample.note && <p className="station-finder-note">{sample.note}</p>}
    </div>
  );
}
