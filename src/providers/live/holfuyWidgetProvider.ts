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

const KMH_TO_MS = 1 / 3.6;

/**
 * Parses the embedded `newWind(dir, speed, temp, gust, 'HH:MM')` and
 * `owind = [[speed, dir], ...]` JS calls the widget's HTML renders
 * server-side. There is no JSON API here - this is screen-scraping a
 * public embed's rendered output, which is the only mechanism available
 * without the restricted API's password (see docs/DATA_SOURCE_AUDIT.md).
 * Returns null (not a throw) if the expected pattern isn't found, so a
 * format change degrades to "no live data" rather than crashing.
 *
 * The argument order and units here were WRONG from Block 6 until this
 * fix - assumed `(dir, speed, gust, temp, time)` with speed/gust
 * already in m/s. Both assumptions were false, confirmed by fetching
 * Holfuy's own widget source (`widget.holfuy.com/js/wind_kok.js`
 * declares `function newWind(wind_dir, wind_speed, temp, gust, time)`,
 * and `main.js`'s `speedToUnit()` divides by 3.6 to convert to m/s for
 * display when `su=m/s` is requested - meaning the raw newWind() args
 * are always km/h, regardless of that query param, which only affects
 * the widget's own on-canvas rendering, not the numbers passed into the
 * function). The bug was silent and looked plausible at a glance
 * (numbers in the right ballpark for *a* wind reading), which is why it
 * went unnoticed until a user spotted speeds that didn't match reality.
 * `owind`'s recent-sample array is unaffected - cross-checked against
 * several stations' own dashboards and it's already in the requested
 * display unit (m/s here), not km/h.
 */
export function parseHolfuyWidgetHtml(html: string): ParsedHolfuyWidget | null {
  const newWindMatch = html.match(
    /newWind\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*'[^']*'\s*\)/,
  );
  if (!newWindMatch) return null;

  const [, dirStr, speedKmhStr, , gustKmhStr] = newWindMatch;
  const windDirectionDeg = Number(dirStr);
  const windSpeedMs = Number(speedKmhStr) * KMH_TO_MS;
  const windGustMs = Number(gustKmhStr) * KMH_TO_MS;
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
