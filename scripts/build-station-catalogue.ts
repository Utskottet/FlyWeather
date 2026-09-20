import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { fetchSource, isAllowedSourceUrl } from "../src/providers/live/sourceUrl.ts";
import type { StationCatalogue, StationRecord, StationProviderStatus } from "../src/domain/stations.ts";

/**
 * Builds the directory of wind stations the site editor's finder searches.
 *
 * Written to public/static/stations.json and COMMITTED, the same way
 * airspaces.json is (see .github/workflows/airspace-refresh.yml), rather
 * than rebuilt on every deploy. That is not a detail - Holfuy has no
 * coordinate API, so the only way to place its stations is to fetch each
 * station page, and the deploy pipeline runs every five minutes. Crawling
 * sixty pages twelve times an hour to rediscover a list that changes
 * maybe monthly would be rude at best.
 *
 * Committing it also means the diff is reviewable: a provider changing
 * its directory format shows up as a suspicious number of stations
 * appearing or vanishing in a pull request, not as a silent change to
 * what the editor offers.
 *
 * Every provider is fetched independently and a failure is isolated: one
 * directory being down produces a catalogue without it, marked as
 * failed, rather than no catalogue at all.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outPath = resolve(repoRoot, "public/static/stations.json");

const SMHI = "https://opendata-download-metobs.smhi.se/api/version/1.0";
const VIVA = "https://services.viva.sjofartsverket.se/output/vivaoutputservice.svc";

function station(
  provider: string,
  id: string | number,
  name: string,
  lat: unknown,
  lon: unknown,
  extra: Partial<StationRecord> = {},
): StationRecord | null {
  const latitude = Number(lat);
  const longitude = Number(lon);
  // A station with no usable position cannot be offered by distance, and
  // is dropped rather than placed at null island.
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    key: `${provider}:${id}`,
    provider,
    id: String(id),
    name,
    lat: latitude,
    lon: longitude,
    ...extra,
  };
}

/** Runs `fn` over `items` with a small concurrency limit, keeping failures rather than throwing. */
async function pooled<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          out[i] = await fn(items[i]);
        } catch {
          out[i] = null;
        }
      }
    }),
  );
  return out;
}

interface SmhiDirectoryStation {
  key?: number | string;
  id?: number | string;
  name: string;
  latitude: number;
  longitude: number;
  active: boolean;
}

/**
 * SMHI publishes wind speed and direction as separate parameters, and a
 * station can carry one without the other. Only the intersection is
 * usable: a speed with no direction cannot draw a rose.
 *
 * The one-minute product (47/48) is preferred where a station has it;
 * the hourly ten-minute mean (4/3) is the fallback, and the choice is
 * recorded in the id as `<id>@60` so the collector does not have to ask
 * again on every run.
 */
async function smhiCatalogue(): Promise<{ stations: StationRecord[]; note: string }> {
  const parameters = [47, 48, 4, 3, 21];
  const results = await Promise.allSettled(
    parameters.map((p) => fetchSource(`${SMHI}/parameter/${p}.json`) as Promise<{ station: SmhiDirectoryStation[] }>),
  );
  const directories = new Map<number, SmhiDirectoryStation[]>();
  results.forEach((r, i) => {
    if (r.status === "fulfilled") directories.set(parameters[i], r.value.station.filter((s) => s.active));
  });
  if (!directories.has(47) && !directories.has(4)) throw new Error("SMHI wind directories could not be loaded");

  const gustIds = new Set((directories.get(21) ?? []).map((s) => String(s.key ?? s.id)));
  const byId = new Map<string, StationRecord>();

  for (const [speedParam, directionParam, intervalMinutes] of [
    [47, 48, 1],
    [4, 3, 60],
  ]) {
    const directionIds = new Set((directories.get(directionParam) ?? []).map((s) => String(s.key ?? s.id)));
    for (const s of directories.get(speedParam) ?? []) {
      const id = String(s.key ?? s.id);
      // First pass wins, so a station with the one-minute product is
      // never downgraded to the hourly one.
      if (!directionIds.has(id) || byId.has(id)) continue;
      const record = station("smhi", intervalMinutes === 60 ? `${id}@60` : id, s.name, s.latitude, s.longitude, {
        stationType: intervalMinutes === 1 ? "SMHI, one-minute mean" : "SMHI, ten-minute mean reported hourly",
        intervalMinutes,
        gustAvailable: gustIds.has(id),
        locationSource: "SMHI station catalogue",
      });
      if (record) byId.set(id, record);
    }
  }

  const partial = results.some((r) => r.status === "rejected");
  return {
    stations: [...byId.values()],
    note: `Active stations publishing both wind speed and direction.${partial ? " Some parameter directories failed, so coverage is partial." : ""}`,
  };
}

interface VivaStation {
  ID: number;
  Name: string;
  Lat: number;
  Lon: number;
}

async function vivaCatalogue(): Promise<{ stations: StationRecord[]; note: string }> {
  const [all, wind, direction] = (await Promise.all([
    fetchSource(`${VIVA}/vivastation/`),
    fetchSource(`${VIVA}/GetManyStationsOneParameter/medelvind?isMVY=false`),
    fetchSource(`${VIVA}/GetManyStationsOneParameter/vindriktning?isMVY=false`),
  ])) as [
    { GetStationsResult: { Stations: VivaStation[] } },
    { GetManyStationsOneParameterResult: { SampleList: { StationID: number }[] } },
    { GetManyStationsOneParameterResult: { SampleList: { StationID: number }[] } },
  ];

  const withWind = new Set(wind.GetManyStationsOneParameterResult.SampleList.map((s) => s.StationID));
  const withDirection = new Set(direction.GetManyStationsOneParameterResult.SampleList.map((s) => s.StationID));

  const stations = all.GetStationsResult.Stations.filter((s) => withWind.has(s.ID) && withDirection.has(s.ID))
    .map((s) =>
      station("viva", s.ID, s.Name, s.Lat, s.Lon, {
        stationType: "Sjöfartsverket ViVa",
        locationSource: "ViVa station catalogue",
      }),
    )
    .filter((s): s is StationRecord => s !== null);

  return { stations, note: "Listed with both wind speed and direction. Some may currently be offline." };
}

/** Holfuy's public Swedish list, with coordinates read from each station's own page. */
async function holfuyCatalogue(): Promise<{ stations: StationRecord[]; note: string }> {
  const list = (await fetchSource("https://holfuy.com/puget/search.php?country=SE")) as { id: number; name: string }[];
  if (!Array.isArray(list)) throw new Error("Holfuy directory format changed");
  if (list.length > 500) throw new Error("Holfuy directory unexpectedly large; refusing to crawl it");

  const found = await pooled(list, 2, async (s) => {
    if (!/^\d+$/.test(String(s.id))) return null;
    const html = (await fetchSource(`https://holfuy.com/en/weather/${s.id}`, "text")) as string;
    const match = html.match(/\/map\/la=(-?\d+(?:\.\d+)?)&(?:amp;)?lo=(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    return station("holfuy", s.id, s.name, match[1], match[2], {
      stationType: "Holfuy",
      locationSource: "Holfuy public station page",
      gustAvailable: true,
      note: "The public widget reports a time with no date, so a reading's exact age cannot be confirmed.",
    });
  });

  const stations = found.filter((s): s is StationRecord => s !== null);
  if (stations.length === 0) throw new Error("No Holfuy station coordinates could be read");
  return {
    stations,
    note: `${stations.length} of ${list.length} Swedish stations publish readable coordinates.`,
  };
}

interface MetarDirectoryRow {
  icaoId: string;
  site: string;
  lat: number;
  lon: number;
  country: string;
  siteType?: string;
}

/** The official airport directory, gzipped - hence node:zlib, and hence this being a build script rather than a Worker route. */
async function metarCatalogue(): Promise<{ stations: StationRecord[]; note: string }> {
  const url = "https://aviationweather.gov/data/cache/stations.cache.json.gz";
  if (!isAllowedSourceUrl(url)) throw new Error("Airport directory URL is not allowlisted");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "error" });
  if (!response.ok) throw new Error(`Airport directory returned HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = (buffer[0] === 0x1f && buffer[1] === 0x8b ? gunzipSync(buffer, { maxOutputLength: 32_000_000 }) : buffer).toString(
    "utf8",
  );
  const rows = JSON.parse(text) as MetarDirectoryRow[];
  if (!Array.isArray(rows)) throw new Error("Airport directory format changed");

  const stations = rows
    .filter((r) => r.country === "SE" && /^ES[A-Z]{2}$/.test(r.icaoId ?? "") && r.siteType?.includes("METAR"))
    .map((r) =>
      station("metar", r.icaoId, r.site, r.lat, r.lon, {
        stationType: "Airport METAR",
        intervalMinutes: 60,
        locationSource: "Aviation Weather Center station directory",
        note: "Reported on a schedule, often hourly and sometimes only during operating hours - not continuous live wind.",
      }),
    )
    .filter((s): s is StationRecord => s !== null);

  return {
    stations,
    note: "Swedish METAR-capable airports. Directory membership does not mean an airport is currently reporting.",
  };
}

/**
 * Club-operated stations, curated by hand.
 *
 * There is no directory of these and there should not be a scraped one:
 * each entry is a club that publishes a feed, checked by a person, whose
 * host is on the fetch allowlist. Currently one. It is listed as its own
 * provider so the finder can be honest that this is a short curated list
 * rather than national coverage.
 */
async function clubCatalogue(): Promise<{ stations: StationRecord[]; note: string }> {
  const url = "https://vader.sjoboflyg.se/json/weewx_data.json";
  const feed = (await fetchSource(url)) as { station?: { latitude_dd?: number; longitude_dd?: number } };
  const record = station("weewx", "esmi", "Sjöbo flygklubb · ESMI", feed.station?.latitude_dd, feed.station?.longitude_dd, {
    url,
    stationType: "Club weather station (WeeWX)",
    intervalMinutes: 5,
    locationSource: "Station's own feed",
  });
  if (!record) throw new Error("Club feed did not publish usable coordinates");
  return { stations: [record], note: "A short curated list of club feeds, not a national directory of private stations." };
}

const SOURCES: { id: string; name: string; load: () => Promise<{ stations: StationRecord[]; note: string }> }[] = [
  { id: "smhi", name: "SMHI", load: smhiCatalogue },
  { id: "viva", name: "ViVa (Sjöfartsverket)", load: vivaCatalogue },
  { id: "holfuy", name: "Holfuy", load: holfuyCatalogue },
  { id: "metar", name: "Airports (METAR)", load: metarCatalogue },
  { id: "weewx", name: "Club stations", load: clubCatalogue },
];

export async function buildStationCatalogue(): Promise<StationCatalogue> {
  const providers: StationProviderStatus[] = [];
  const stations: StationRecord[] = [];

  for (const source of SOURCES) {
    try {
      const { stations: found, note } = await source.load();
      stations.push(...found);
      providers.push({ id: source.id, name: source.name, status: "ok", stationCount: found.length, note });
      console.log(`station catalogue: ${source.id} -> ${found.length} stations`);
    } catch (err) {
      // Isolated: one directory being down produces a catalogue without
      // it, clearly marked, rather than no catalogue at all.
      providers.push({ id: source.id, name: source.name, status: "failed", stationCount: 0, note: (err as Error).message });
      console.warn(`station catalogue: ${source.id} FAILED - ${(err as Error).message}`);
    }
  }

  stations.sort((a, b) => a.key.localeCompare(b.key));
  return { generatedAt: new Date().toISOString(), providers, stations };
}

async function main() {
  const catalogue = await buildStationCatalogue();
  const usable = catalogue.providers.filter((p) => p.status === "ok").length;
  if (usable === 0) throw new Error("Every station directory failed; refusing to write an empty catalogue");

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(catalogue, null, 2) + "\n", "utf-8");
  console.log(`station catalogue: ${catalogue.stations.length} stations from ${usable}/${SOURCES.length} sources -> ${outPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`station catalogue failed: ${(err as Error).message}`);
    process.exit(1);
  });
}
