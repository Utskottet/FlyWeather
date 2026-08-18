import type { LocatedSite } from "../../domain/sites.ts";
import { WindRose } from "../WindRose/index.ts";

export interface SiteSheetProps {
  site: LocatedSite;
  onClose: () => void;
}

// §15.2 fields this sheet can honestly show today: rose, name, status,
// description, restrictions, source link. Wind/weather/source/age fields
// wait for Block 5/6 - showing them now would mean inventing numbers.
export function SiteSheet({ site, onClose }: SiteSheetProps) {
  return (
    <div className="site-sheet" role="dialog" aria-label={`${site.name} details`} data-testid="site-sheet">
      <button type="button" className="site-sheet-close" onClick={onClose} aria-label="Close">
        &times;
      </button>
      <WindRose
        size={140}
        greenSectors={site.rose.green.map((s) => ({ fromDeg: s.from_deg, toDeg: s.to_deg }))}
        orangeSectors={site.rose.orange.map((s) => ({ fromDeg: s.from_deg, toDeg: s.to_deg }))}
        windDirectionDeg={null}
        windSpeedMs={null}
        state="gray"
      />
      <h2>{site.name}</h2>
      <p className="site-sheet-status">UNKNOWN — live and forecast data not wired up yet</p>
      <p>{site.description}</p>
      {site.restrictions && site.restrictions.length > 0 && (
        <ul className="site-sheet-restrictions">
          {site.restrictions.map((r, i) => (
            <li key={i}>{r.message}</li>
          ))}
        </ul>
      )}
      {site.cps_url && (
        <p>
          <a href={site.cps_url} target="_blank" rel="noreferrer">
            View on CPS
          </a>
        </p>
      )}
    </div>
  );
}
