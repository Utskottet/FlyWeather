import type { SiteDraftInput } from "../../domain/siteDraft";

type Station = NonNullable<SiteDraftInput["station"]>;

interface Props {
  value: Station | undefined;
  onChange: (value: Station | undefined) => void;
}

const EMPTY: Station = { verified: false };

/** Verified = a provider is actually typed in - no manual toggle. */
function withDerivedVerified(next: Omit<Station, "verified">): Station {
  return { ...next, verified: (next.provider ?? "").trim().length > 0 };
}

export function StationFields({ value, onChange }: Props) {
  const enabled = value !== undefined;
  const v = value ?? EMPTY;

  return (
    <fieldset style={{ marginBottom: 16 }}>
      <legend>
        <label>
          <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked ? { ...EMPTY } : undefined)} /> Live station{" "}
        </label>
        {v.verified && <span style={{ color: "#27c93f" }}>(verified)</span>}
      </legend>
      {enabled && (
        <>
          <p style={{ margin: "0 0 8px", color: "#666", fontSize: 13 }}>
            Live station sourcing (simple URL vs. scraping) still needs exploring - this is just a placeholder record for now.
          </p>
          <label style={{ display: "inline-block", marginRight: 12 }}>
            Name
            <input value={v.name ?? ""} onChange={(e) => onChange(withDerivedVerified({ ...v, name: e.target.value || undefined }))} />
          </label>
          <label style={{ display: "inline-block", marginRight: 12 }}>
            Provider
            <input value={v.provider ?? ""} onChange={(e) => onChange(withDerivedVerified({ ...v, provider: e.target.value || undefined }))} />
          </label>
          <label style={{ display: "inline-block", marginRight: 12 }}>
            Station ID
            <input value={v.station_id ?? ""} onChange={(e) => onChange(withDerivedVerified({ ...v, station_id: e.target.value || undefined }))} />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            URL
            <input
              value={v.url ?? ""}
              onChange={(e) => onChange(withDerivedVerified({ ...v, url: e.target.value || undefined }))}
              style={{ display: "block", width: "100%", padding: 6, boxSizing: "border-box" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Note
            <input
              value={v.note ?? ""}
              onChange={(e) => onChange(withDerivedVerified({ ...v, note: e.target.value || undefined }))}
              style={{ display: "block", width: "100%", padding: 6, boxSizing: "border-box" }}
            />
          </label>
        </>
      )}
    </fieldset>
  );
}
