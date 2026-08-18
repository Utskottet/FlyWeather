import { useEffect, useState } from "react";
import type { GeneratedLiveFile } from "../domain/types.ts";

interface LiveDataState {
  data: GeneratedLiveFile | null;
  loading: boolean;
  error: string | null;
}

/** Loads the build-generated live-observation bundle (public/generated/live.json). */
export function useLiveData(): LiveDataState {
  const [state, setState] = useState<LiveDataState>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    fetch("/generated/live.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load live data (HTTP ${res.status})`);
        return res.json() as Promise<GeneratedLiveFile>;
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
