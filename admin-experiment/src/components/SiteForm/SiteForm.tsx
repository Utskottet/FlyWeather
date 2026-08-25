import type { SiteDraftInput } from "../../domain/siteDraft";
import { COUNTRIES, REGIONS_BY_COUNTRY, PILOT_LEVELS } from "../../domain/options";
import { CoordinatesFields } from "./CoordinatesFields";
import { WindFields } from "./WindFields";
import { StationFields } from "./StationFields";
import { WarningsEditor } from "./WarningsEditor";
import { LinksEditor } from "./LinksEditor";
import { CompassRoseEditor } from "../CompassRoseEditor/CompassRoseEditor";

interface Props {
  value: SiteDraftInput;
  onChange: (value: SiteDraftInput) => void;
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
        <label style={{ flex: 1 }}>
          Country
          <select
            value={value.country ?? ""}
            onChange={(e) => {
              const country = e.target.value || undefined;
              // Changing country invalidates any previously-chosen region from the old country's list.
              onChange({ ...value, country, region: undefined });
            }}
            style={field()}
          >
            <option value="">(unset)</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Region
          <select
            value={value.region ?? ""}
            onChange={(e) => onChange({ ...value, region: e.target.value || undefined })}
            disabled={!value.country}
            style={field()}
          >
            <option value="">(unset)</option>
            {(value.country ? REGIONS_BY_COUNTRY[value.country] : []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Group
          <select
            value={value.group ?? ""}
            onChange={(e) => onChange({ ...value, group: e.target.value === "" ? undefined : (e.target.value as "ridge" | "winch") })}
            style={field()}
          >
            <option value="">(unset)</option>
            <option value="ridge">ridge</option>
            <option value="winch">winch</option>
          </select>
        </label>
      </div>

      <CompassRoseEditor bands={value.bands} onChange={(bands) => onChange({ ...value, bands })} />

      <CoordinatesFields value={value.coordinates} onChange={(coordinates) => onChange({ ...value, coordinates })} />

      <WindFields value={value.wind} onChange={(wind) => onChange({ ...value, wind })} />

      <StationFields value={value.station} onChange={(station) => onChange({ ...value, station })} />

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
