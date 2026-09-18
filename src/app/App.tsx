import { locatedEnabledSites } from "../domain/sites.ts";
import { SiteMap } from "../components/Map/SiteMap.tsx";
import { useSitesData } from "./useSitesData.ts";
import "./App.css";

function App() {
  const { data, loading, error } = useSitesData();

  if (loading) return <div className="app-status">Loading sites…</div>;
  if (error) return <div className="app-status">Failed to load site data: {error}</div>;
  if (!data) return null;

  const sites = locatedEnabledSites(data.sites);
  // Every id in the catalogue, archived and unlocated included - the site
  // editor's duplicate-id check has to match build-sites-catalogue.ts's,
  // which rejects a repeat anywhere under sites/.
  const allSiteIds = data.sites.map((s) => s.id);

  return (
    <SiteMap
      sites={sites}
      allSiteIds={allSiteIds}
      freshMinutes={data.defaults.live_fresh_minutes}
      staleMinutes={data.defaults.live_stale_minutes}
    />
  );
}

export default App;
