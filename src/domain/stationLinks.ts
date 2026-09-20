import { canonicalProvider } from "../providers/live/resolver.ts";

/**
 * Where to look at a station's own page.
 *
 * Useful for the thing a site panel cannot show: history. A pilot who
 * wants yesterday's trace, or a month of it, goes to the station's own
 * page - so the panel names the station and lets you open it rather than
 * pretending a single current reading is the whole story.
 *
 * Built from the provider and id rather than stored, so it stays right
 * for every site without anybody pasting a link into a site file, and
 * cannot rot into pointing somewhere else.
 *
 * SMHI is the odd one out: it publishes no per-station page for the
 * public, so this links to the station's own open-data resource, which
 * lists what it measures and the periods available. Less pretty than the
 * others, and genuinely the route to that station's history.
 */
export function stationPageUrl(station: {
  provider: string;
  station_id?: string | null;
  url?: string;
}): string | null {
  const id = station.station_id?.trim();
  switch (canonicalProvider(station.provider)) {
    case "holfuy":
      return id ? `https://holfuy.com/en/weather/${encodeURIComponent(id)}` : null;
    case "viva":
      return id ? `https://viva.sjofartsverket.se/station/${encodeURIComponent(id)}` : null;
    case "metar":
      return id ? `https://aviationweather.gov/data/metar/?id=${encodeURIComponent(id.toUpperCase())}` : null;
    case "smhi": {
      if (!id) return null;
      // The id may carry which product the station publishes (`<id>@60`);
      // the page is about the station, so that suffix is dropped.
      const [plain] = id.split("@");
      return `https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/4/station/${encodeURIComponent(plain)}.json`;
    }
    case "weewx": {
      // A club feed's saved URL points at the JSON, not at anything a
      // person wants to read - so it is trimmed back to the site itself,
      // which is the dashboard with the history on it.
      if (!station.url) return null;
      try {
        return new URL(station.url).origin;
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}
