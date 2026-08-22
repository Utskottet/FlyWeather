import { useEffect, useState } from "react";
import type { SoaringManifest } from "../domain/soaring.ts";

/**
 * The base URL for FlyWeather-Soaring's published product set - a
 * separate, independent static host, not this app's own `generated/`
 * files (see that repo's docs/ARCHITECTURE.md). No existing precedent
 * for a custom env var in this codebase (only Vite's own built-in
 * BASE_URL was used before this) - see .env.example for the dev default.
 * Empty/unset is a valid, supported state: RASP is simply unavailable,
 * the rest of the app is unaffected (§ "if the soaring backend is
 * unavailable, FlyWeather must continue working normally").
 */
const SOARING_BASE_URL = (import.meta.env.VITE_SOARING_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

interface SoaringManifestState {
  manifest: SoaringManifest | null;
  loading: boolean;
  error: string | null;
}

/** Resolves a manifest-relative file path (raster/numeric) against the configured soaring base URL. */
export function resolveSoaringUrl(relativePath: string): string {
  return `${SOARING_BASE_URL}/${relativePath}`;
}

export function useSoaringManifest(): SoaringManifestState {
  const [state, setState] = useState<SoaringManifestState>({
    manifest: null,
    loading: SOARING_BASE_URL !== "",
    error: SOARING_BASE_URL === "" ? "VITE_SOARING_BASE_URL is not configured" : null,
  });

  useEffect(() => {
    if (SOARING_BASE_URL === "") return; // Nothing to fetch - RASP stays unavailable, not an error banner.

    let cancelled = false;
    fetch(`${SOARING_BASE_URL}/manifest.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Soaring manifest request failed (HTTP ${res.status})`);
        return res.json() as Promise<SoaringManifest>;
      })
      .then((manifest) => {
        if (cancelled) return;
        setState({ manifest, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ manifest: null, loading: false, error: err instanceof Error ? err.message : "Unknown error" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
