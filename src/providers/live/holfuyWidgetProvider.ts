import type { WindSample } from "../../domain/types.ts";
import type { LiveWindProvider, SiteLiveSource } from "./types.ts";

/**
 * Uses Holfuy's public widget.holfuy.com embed endpoint - the same
 * unauthenticated, no-password mechanism https://m.cps.to/ itself embeds
 * (`<iframe src="https://widget.holfuy.com/?station=<id>&...">`), not
 * the restricted, password-gated api.holfuy.com live API (see
 * docs/DATA_SOURCE_AUDIT.md for the investigation behind this choice).
 */
export function buildHolfuyWidgetUrl(stationId: string): string {
  const params = new URLSearchParams({
    station: stationId,
    su: "m/s",
    t: "C",
    lang: "en",
    mode: "rose",
    size: "400",
  });
  return `https://widget.holfuy.com/?${params.toString()}`;
}

export interface ParsedHolfuyWidget {
  windDirectionDeg: number;
  windSpeedMs: number;
  windGustMs: number;
  /** Last few [speed, directionDeg] samples the widget itself renders as history dots. */
  recentSamples: { windSpeedMs: number; directionDeg: number }[];
}

/**
 * Parses the embedded `newWind(dir, speed, gust, temp, 'HH:MM')` and
 * `owind = [[speed, dir], ...]` JS calls the widget's HTML renders
 * server-side. There is no JSON API here - this is screen-scraping a
 * public embed's rendered output, which is the only mechanism available
 * without the restricted API's password (see docs/DATA_SOURCE_AUDIT.md).
 * Returns null (not a throw) if the expected pattern isn't found, so a
 * format change degrades to "no live data" rather than crashing.
 */
export function parseHolfuyWidgetHtml(html: string): ParsedHolfuyWidget | null {
  const newWindMatch = html.match(
    /newWind\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*[\d.]+\s*,\s*'[^']*'\s*\)/,
  );
  if (!newWindMatch) return null;

  const [, dirStr, speedStr, gustStr] = newWindMatch;
  const windDirectionDeg = Number(dirStr);
  const windSpeedMs = Number(speedStr);
  const windGustMs = Number(gustStr);
  if (!Number.isFinite(windDirectionDeg) || !Number.isFinite(windSpeedMs) || !Number.isFinite(windGustMs)) {
    return null;
  }

  let recentSamples: { windSpeedMs: number; directionDeg: number }[] = [];
  const owindMatch = html.match(/var\s+owind\s*=\s*(\[[^;]*\]);/);
  if (owindMatch) {
    try {
      const raw = JSON.parse(owindMatch[1]) as [number, number][];
      recentSamples = raw
        .filter((pair) => Array.isArray(pair) && pair.length === 2)
        .map(([speed, dir]) => ({ windSpeedMs: speed, directionDeg: dir }));
    } catch {
      recentSamples = [];
    }
  }

  return { windDirectionDeg, windSpeedMs, windGustMs, recentSamples };
}

async function fetchWidgetHtml(stationId: string): Promise<string | null> {
  const res = await fetch(buildHolfuyWidgetUrl(stationId));
  if (!res.ok) return null;
  return res.text();
}

export const holfuyWidgetProvider: LiveWindProvider = {
  async fetch(source: SiteLiveSource): Promise<WindSample[]> {
    if (!source.station_id) return [];
    const html = await fetchWidgetHtml(source.station_id);
    if (!html) return [];
    const parsed = parseHolfuyWidgetHtml(html);
    if (!parsed) return [];

    // The widget shows only a local "HH:MM", with no date or explicit
    // timezone - too ambiguous to parse into a trustworthy ISO instant.
    // Using the fetch time as the observation timestamp is honest and
    // safe here: Holfuy's own widget refreshes every 5 min (its
    // `<meta refresh>` tag), so the underlying reading is never more
    // than ~5 min older than when we fetched it.
    const timestamp = new Date().toISOString();

    return [
      {
        sourceId: "holfuy",
        sourceKind: "observation",
        stationId: source.station_id,
        timestamp,
        windDirectionDeg: parsed.windDirectionDeg,
        windSpeedMs: parsed.windSpeedMs,
        windGustMs: parsed.windGustMs,
        quality: "good",
      },
    ];
  },
};
