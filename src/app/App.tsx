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

  return (
    <SiteMap
      sites={sites}
      freshMinutes={data.defaults.live_fresh_minutes}
      staleMinutes={data.defaults.live_stale_minutes}
    />
  );
}

export default App;
