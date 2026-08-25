import type { SiteDraftInput } from "../../domain/siteDraft";

type Link = SiteDraftInput["links"][number];

interface Props {
  value: Link[];
  onChange: (value: Link[]) => void;
}

export function LinksEditor({ value, onChange }: Props) {
  function update(i: number, patch: Partial<Link>) {
    onChange(value.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  return (
    <fieldset style={{ marginBottom: 16 }}>
      <legend>Links</legend>
      {value.map((link, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <input placeholder="Label" value={link.label} onChange={(e) => update(i, { label: e.target.value })} style={{ width: 160, padding: 6 }} />
          <input placeholder="URL" value={link.url} onChange={(e) => update(i, { url: e.target.value })} style={{ flex: 1, padding: 6 }} />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, { label: "", url: "" }])}>
        + Add link
      </button>
    </fieldset>
  );
}
