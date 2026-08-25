import type { SiteDraftInput } from "../../domain/siteDraft";

type Wind = SiteDraftInput["wind"];

interface Props {
  value: Wind;
  onChange: (value: Wind) => void;
}

function numOrUndefined(s: string): number | undefined {
  return s === "" ? undefined : Number(s);
}

/** Verified = both min and max are actually typed in - matches production's own siteFileSchema refine rule. */
function withDerivedVerified(next: Omit<Wind, "verified">): Wind {
  return { ...next, verified: next.min_ms !== undefined && next.max_ms !== undefined };
}

export function WindFields({ value, onChange }: Props) {
  return (
    <fieldset style={{ marginBottom: 16 }}>
      <legend>Wind {value.verified && <span style={{ color: "#27c93f" }}>(verified)</span>}</legend>
      <label style={{ display: "inline-block", marginRight: 12 }}>
        Min m/s
        <input
          type="number"
          step="any"
          min={0}
          value={value.min_ms ?? ""}
          onChange={(e) => onChange(withDerivedVerified({ ...value, min_ms: numOrUndefined(e.target.value) }))}
        />
      </label>
      <label style={{ display: "inline-block", marginRight: 12 }}>
        Max m/s
        <input
          type="number"
          step="any"
          min={0}
          value={value.max_ms ?? ""}
          onChange={(e) => onChange(withDerivedVerified({ ...value, max_ms: numOrUndefined(e.target.value) }))}
        />
      </label>
    </fieldset>
  );
}
