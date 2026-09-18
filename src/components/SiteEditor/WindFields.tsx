import type { SiteDraft } from "../../domain/siteEditor.ts";
import { describeSpeedBands } from "../../domain/speedBands.ts";

type Wind = SiteDraft["wind"];

interface Props {
  value: Wind;
  onChange: (value: Wind) => void;
}

function numOrUndefined(s: string): number | undefined {
  return s === "" ? undefined : Number(s);
}

/** An empty margin box means "no margin", i.e. 0 - never undefined, so the schema default never has to fire on user input. */
function marginOrZero(s: string): number {
  const n = Number(s);
  return s === "" || Number.isNaN(n) ? 0 : n;
}

/**
 * Verified = both min and max are actually typed in - matches production's
 * own siteFileSchema refine rule. Deliberately ignores the margins: an
 * authored margin is extra precision on top of a band, never evidence that
 * the band itself was confirmed.
 */
function withDerivedVerified(next: Omit<Wind, "verified">): Wind {
  return { ...next, verified: next.min_ms !== undefined && next.max_ms !== undefined };
}

const numberInput = { width: 70, marginLeft: 4 } as const;

export function WindFields({ value, onChange }: Props) {
  function set(patch: Partial<Omit<Wind, "verified">>) {
    onChange(withDerivedVerified({ ...value, ...patch }));
  }

  return (
    <fieldset style={{ marginBottom: 16 }}>
      <legend>Wind {value.verified && <span style={{ color: "#27c93f" }}>(verified)</span>}</legend>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label title="Lowest wind speed this site reads as good.">
          Min m/s
          <input
            type="number"
            step="any"
            min={0}
            value={value.min_ms ?? ""}
            onChange={(e) => set({ min_ms: numOrUndefined(e.target.value) })}
            style={numberInput}
          />
        </label>
        <label title="Highest wind speed this site reads as good.">
          Max m/s
          <input
            type="number"
            step="any"
            min={0}
            value={value.max_ms ?? ""}
            onChange={(e) => set({ max_ms: numOrUndefined(e.target.value) })}
            style={numberInput}
          />
        </label>
        <label title="m/s of orange margin below Min - defaults to 0, not required. Min 5 with 1 under reads 4-5 m/s as orange.">
          Orange under
          <input
            type="number"
            step="any"
            min={0}
            value={value.margin_under_ms ?? 0}
            onChange={(e) => set({ margin_under_ms: marginOrZero(e.target.value) })}
            style={numberInput}
          />
        </label>
        <label title="m/s of orange margin above Max - defaults to 0, not required. Max 7 with 2 over reads 8.5 m/s as orange but 10 m/s as red.">
          Orange over
          <input
            type="number"
            step="any"
            min={0}
            value={value.margin_over_ms ?? 0}
            onChange={(e) => set({ margin_over_ms: marginOrZero(e.target.value) })}
            style={numberInput}
          />
        </label>
      </div>

      {/* Reads the resulting numbers back rather than restating the labels,
          so a mistyped margin is obvious while typing instead of at the
          next site visit. */}
      <p style={{ margin: "8px 0 0", fontSize: 13, color: "#555" }} data-testid="speed-bands-summary">
        {describeSpeedBands(value)}
      </p>
    </fieldset>
  );
}
