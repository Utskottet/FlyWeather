import type { SiteDraft } from "../../domain/siteEditor.ts";
import { COUNTRIES, REGIONS_BY_COUNTRY, PILOT_LEVELS } from "../../domain/siteEditorOptions.ts";
import { CoordinatesFields } from "./CoordinatesFields.tsx";
import { WindFields } from "./WindFields.tsx";
import { StationFields } from "./StationFields.tsx";
import { ParkingFields } from "./ParkingFields.tsx";
import { WarningsEditor } from "./WarningsEditor.tsx";
import { LinksEditor } from "./LinksEditor.tsx";
import { CompassRoseEditor } from "./CompassRoseEditor.tsx";

interface Props {
  value: SiteDraft;
  onChange: (value: SiteDraft) => void;
}

function field(width: number | string = "100%") {
  return { display: "block", width, padding: 6, boxSizing: "border-box" as const };
}

export function SiteForm({ value, onChange }: Props) {
  return (
    <>
      <label style={{ display: "block", marginBottom: 12 }}>
        Name
        <input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} style={field()} />
      </label>

      <label style={{ display: "block", marginBottom: 12 }}>
        Short name
        <input value={value.short_name ?? ""} onChange={(e) => onChange({ ...value, short_name: e.target.value || undefined })} style={field()} />
      </label>

      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        {/* These three are not stored in the file - together with the id
            they ARE the file's path (sites/<country>/<region>/<group>/),
            which is where parseSitePath reads them back from. So none of
            them can be left unset the way the prototype allowed, and
            changing one moves the file. */}
        <label style={{ flex: 1 }}>
          Country
          <select
            value={value.country}
            onChange={(e) => {
              const country = e.target.value;
              // A region from the old country's list is meaningless here,
              // so it falls back to that country's first region.
              onChange({ ...value, country, region: REGIONS_BY_COUNTRY[country][0] });
            }}
            style={field()}
          >
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Region
          <select value={value.region} onChange={(e) => onChange({ ...value, region: e.target.value })} style={field()}>
            {REGIONS_BY_COUNTRY[value.country].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Group
          <select
            value={value.group}
            onChange={(e) => onChange({ ...value, group: e.target.value as "ridge" | "winch" })}
            style={field()}
          >
            <option value="ridge">ridge</option>
            <option value="winch">winch</option>
          </select>
        </label>
      </div>

      <CompassRoseEditor bands={value.bands} onChange={(bands) => onChange({ ...value, bands })} />

      <CoordinatesFields value={value.coordinates} onChange={(coordinates) => onChange({ ...value, coordinates })} />

      <WindFields value={value.wind} onChange={(wind) => onChange({ ...value, wind })} />

      {/* Directly under Wind, and above Parking: a station is what makes
          a site's wind real, and two people who added sites missed it
          entirely when it sat further down. The finder searches from the
          site's own coordinates, so they are handed down rather than
          asked for a second time. */}
      <StationFields
        value={value.station}
        onChange={(station) => onChange({ ...value, station })}
        point={{ lat: value.coordinates.lat, lon: value.coordinates.lon }}
      />

      <ParkingFields value={value.parking} onChange={(parking) => onChange({ ...value, parking })} />

      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <label style={{ flex: 1 }}>
          Pilot level
          <select
            value={value.pilot_level ?? ""}
            onChange={(e) => onChange({ ...value, pilot_level: e.target.value === "" ? undefined : (e.target.value as (typeof PILOT_LEVELS)[number]) })}
            style={field()}
          >
            <option value="">(unset)</option>
            {PILOT_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Ridge height (m)
          <input
            type="number"
            step="any"
            value={value.ridge_height_m ?? ""}
            onChange={(e) => onChange({ ...value, ridge_height_m: e.target.value === "" ? null : Number(e.target.value) })}
            style={field()}
          />
        </label>
      </div>

      <label style={{ display: "block", marginBottom: 12 }}>
        Description
        <textarea value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} rows={6} style={field()} />
      </label>

      <WarningsEditor value={value.warnings} onChange={(warnings) => onChange({ ...value, warnings })} />
      <LinksEditor value={value.links} onChange={(links) => onChange({ ...value, links })} />
    </>
  );
}
