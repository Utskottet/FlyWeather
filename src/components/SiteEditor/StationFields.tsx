import { useState } from "react";
import type { SiteDraft } from "../../domain/siteEditor.ts";
import { StationFinder } from "./StationFinder.tsx";
import { isKnownProvider, knownProviderIds } from "../../providers/live/resolver.ts";
import { observationFreshness, previewStation, type StationPreview } from "../../app/stationApi.ts";
import { degreesToCompass16 } from "../../domain/direction.ts";

type Station = NonNullable<SiteDraft["station"]>;

interface Props {
  value: Station | undefined;
  onChange: (value: Station | undefined) => void;
  /** The site's own coordinates - the point the finder searches from. */
  point: { lat: number | null; lon: number | null };
}

// provider is required by siteFileSchema (z.string().min(1)), so an
// empty station starts with an empty provider rather than no key at all -
// validateDraft blocks saving until it is filled in, which is a clearer
// failure than a file the build would reject.
const EMPTY: Station = { verified: false, provider: "" };

/**
 * A site's live wind station.
 *
 * `verified` is no longer set here, at all. It used to be derived from
 * "is the provider field non-empty", which meant typing any text into any
 * box marked the station verified - a claim about flying, made by a
 * string length check. It now stays exactly as it was loaded (false for
 * anything new), and changing it is a deliberate edit to the YAML by
 * somebody who has flown the site and compared the readings.
 *
 * What the editor CAN establish is whether the feed answers, so it offers
 * exactly that: a connection check that shows the actual wind, its
 * measured age, and nothing dressed up as more than it is.
 *
 * There is no "does this site have a station?" tickbox any more. It hid
 * the one button that explains the whole feature behind an act of faith:
 * two people added sites without ever discovering the finder, because
 * nothing on screen suggested there was anything behind the checkbox.
 * "Find nearby station" is now simply there, and choosing a station is
 * what creates one.
 */
export function StationFields({ value, onChange, point }: Props) {
  const [finderOpen, setFinderOpen] = useState(false);
  const [preview, setPreview] = useState<StationPreview | "loading" | null>(null);

  const enabled = value !== undefined;
  const v = value ?? EMPTY;
  const providerKnown = v.provider.trim() !== "" && isKnownProvider(v.provider);

  function set(next: Partial<Station>) {
    // verified is carried through untouched - see the component comment.
    onChange({ ...v, ...next });
  }

  async function check() {
    setPreview("loading");
    setPreview(await previewStation({ provider: v.provider, station_id: v.station_id, url: v.url }));
  }

  return (
    <fieldset style={{ marginBottom: 16 }}>
      <legend>Live station</legend>

      <p className="station-fields-lead">
        En vindmätare i närheten gör platsens vind verklig i stället för en prognos.
        <br />
        <span className="editor-intro-en">
          A nearby wind meter makes this site show a real reading instead of a forecast.
        </span>
      </p>

      <div className="station-fields-actions">
        <button
          type="button"
          onClick={() => setFinderOpen(true)}
          className="station-fields-find"
          data-testid="find-station"
        >
          Find nearby station
        </button>
        {enabled && (
          <>
            <button type="button" onClick={() => void check()} data-testid="check-station">
              Check connection
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setPreview(null);
              }}
              data-testid="remove-station"
            >
              Remove
            </button>
          </>
        )}
      </div>

      {finderOpen && (
        <StationFinder
          point={point}
          onClose={() => setFinderOpen(false)}
          onUse={(selection) => {
            // Fills the fields and stops. Saving stays a separate,
            // explicit act - and verified is not among the fields it is
            // allowed to touch. Choosing a station is also what brings
            // one into existence; there is no box to tick first.
            set({
              name: selection.name,
              provider: selection.provider,
              station_id: selection.station_id,
              url: selection.url,
              note: selection.note,
            });
            setFinderOpen(false);
            setPreview(null);
          }}
        />
      )}

      {enabled && (
        <>
          {v.provider.trim() !== "" && !providerKnown && (
            <p className="station-fields-warning" data-testid="station-provider-unknown">
              Nothing can read the provider "{v.provider}" - this station will stay silent. Known providers:{" "}
              {knownProviderIds().join(", ")}.
            </p>
          )}

          {preview === "loading" && <p className="station-fields-status">Checking…</p>}
          {preview && preview !== "loading" && (
            <p
              className={`station-fields-status ${preview.status}`}
              data-testid={preview.status === "ok" ? "station-check-ok" : "station-check-unavailable"}
            >
              {preview.status === "unavailable"
                ? `No reading — ${preview.message}`
                : describeSample(preview.sample)}
            </p>
          )}

          <label style={{ display: "inline-block", marginRight: 12 }}>
            Name
            <input value={v.name ?? ""} onChange={(e) => set({ name: e.target.value || undefined })} data-testid="station-name" />
          </label>
          <label style={{ display: "inline-block", marginRight: 12 }}>
            Provider
            <input value={v.provider} onChange={(e) => set({ provider: e.target.value })} data-testid="station-provider" />
          </label>
          <label style={{ display: "inline-block", marginRight: 12 }}>
            Station ID
            <input
              value={v.station_id ?? ""}
              onChange={(e) => set({ station_id: e.target.value || undefined })}
              data-testid="station-id"
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            URL
            <input
              value={v.url ?? ""}
              onChange={(e) => set({ url: e.target.value || undefined })}
              style={{ display: "block", width: "100%", padding: 6, boxSizing: "border-box" }}
              data-testid="station-url"
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Note
            <input
              value={v.note ?? ""}
              onChange={(e) => set({ note: e.target.value || undefined })}
              style={{ display: "block", width: "100%", padding: 6, boxSizing: "border-box" }}
              data-testid="station-note"
            />
          </label>
        </>
      )}
    </fieldset>
  );
}

function describeSample(sample: import("../../domain/types.ts").WindSample): string {
  const freshness = observationFreshness(sample);
  const wind = sample.windSpeedMs === null ? "no speed" : `${sample.windSpeedMs.toFixed(1)} m/s`;
  const direction = sample.variableDirection
    ? "variable"
    : sample.windDirectionDeg === null
      ? "no direction"
      : degreesToCompass16(sample.windDirectionDeg);
  const age =
    freshness === "unknown-age"
      ? "age unknown"
      : `${Math.round((Date.now() - Date.parse(sample.timestamp)) / 60_000)} min ago`;
  return `Connected: ${wind} from ${direction}, ${age}. This does not verify the station suits this site.`;
}
