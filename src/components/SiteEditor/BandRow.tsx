import type { EditorBand } from "../../domain/siteEditor.ts";

interface Props {
  band: EditorBand;
  overlapping?: boolean;
  onEdgeChange: (edge: "from_deg" | "to_deg", value: number) => void;
  onMarginChange: (side: "margin_under_deg" | "margin_over_deg", value: number) => void;
  onRemove: () => void;
}

export function BandRow({ band, overlapping = false, onEdgeChange, onMarginChange, onRemove }: Props) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 6,
        padding: 4,
        outline: overlapping ? "2px solid #f23535" : "none",
        outlineOffset: 2,
        borderRadius: 4,
      }}
    >
      <label>
        From
        <input
          type="number"
          min={0}
          max={360}
          value={band.from_deg}
          onChange={(e) => onEdgeChange("from_deg", Number(e.target.value))}
          style={{ width: 60, marginLeft: 4 }}
        />
      </label>
      <label>
        To
        <input
          type="number"
          min={0}
          max={360}
          value={band.to_deg}
          onChange={(e) => onEdgeChange("to_deg", Number(e.target.value))}
          style={{ width: 60, marginLeft: 4 }}
        />
      </label>
      <label title="Degrees of orange margin extending backward from 'From' - defaults to 0, not required.">
        Orange under
        <input
          type="number"
          min={0}
          max={360}
          value={band.margin_under_deg}
          onChange={(e) => onMarginChange("margin_under_deg", Number(e.target.value))}
          style={{ width: 60, marginLeft: 4 }}
        />
      </label>
      <label title="Degrees of orange margin extending forward from 'To' - defaults to 0, not required.">
        Orange over
        <input
          type="number"
          min={0}
          max={360}
          value={band.margin_over_deg}
          onChange={(e) => onMarginChange("margin_over_deg", Number(e.target.value))}
          style={{ width: 60, marginLeft: 4 }}
        />
      </label>
      <button type="button" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}
