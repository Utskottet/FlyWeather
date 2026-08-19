import { useEffect, useState } from "react";
import type { GeneratedSitesFile } from "../domain/sites.ts";

interface SitesDataState {
  data: GeneratedSitesFile | null;
  loading: boolean;
  error: string | null;
}

/** Loads the build-generated site catalogue (public/generated/sites.json). */
export function useSitesData(): SitesDataState {
  const [state, setState] = useState<SitesDataState>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}generated/sites.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load site data (HTTP ${res.status})`);
        return res.json() as Promise<GeneratedSitesFile>;
      })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ data: null, loading: false, error: err instanceof Error ? err.message : "Unknown error" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
