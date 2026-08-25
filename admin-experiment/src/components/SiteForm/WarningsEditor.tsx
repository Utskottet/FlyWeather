interface Props {
  value: string[];
  onChange: (value: string[]) => void;
}

export function WarningsEditor({ value, onChange }: Props) {
  return (
    <fieldset style={{ marginBottom: 16 }}>
      <legend>Warnings</legend>
      {value.map((warning, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <input
            value={warning}
            onChange={(e) => onChange(value.map((w, j) => (j === i ? e.target.value : w)))}
            style={{ flex: 1, padding: 6 }}
          />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, ""])}>
        + Add warning
      </button>
    </fieldset>
  );
}
