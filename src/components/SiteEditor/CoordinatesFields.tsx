import type { SiteDraft } from "../../domain/siteEditor.ts";

type Coordinates = SiteDraft["coordinates"];

interface Props {
  value: Coordinates;
  onChange: (value: Coordinates) => void;
}

/** Verified = both lat and lon are actually typed in - no manual toggle. */
function withDerivedVerified(next: Omit<Coordinates, "verified">): Coordinates {
  return { ...next, verified: next.lat !== null && next.lon !== null };
}

export function CoordinatesFields({ value, onChange }: Props) {
  return (
    <fieldset style={{ marginBottom: 16 }}>
      <legend>Coordinates {value.verified && <span style={{ color: "#27c93f" }}>(verified)</span>}</legend>
      <label style={{ display: "inline-block", marginRight: 12 }}>
        Lat
        <input
          type="number"
          step="any"
          value={value.lat ?? ""}
          onChange={(e) => onChange(withDerivedVerified({ ...value, lat: e.target.value === "" ? null : Number(e.target.value) }))}
        />
      </label>
      <label style={{ display: "inline-block", marginRight: 12 }}>
        Lon
        <input
          type="number"
          step="any"
          value={value.lon ?? ""}
          onChange={(e) => onChange(withDerivedVerified({ ...value, lon: e.target.value === "" ? null : Number(e.target.value) }))}
        />
      </label>
    </fieldset>
  );
}
