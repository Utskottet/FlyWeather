import { WindRose, type RoseSector, type RoseState } from "../components/WindRose/index.ts";
import type { WeatherKind } from "../domain/weather.ts";

interface Case {
  slug: string;
  title: string;
  sector: RoseSector | null;
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
  state: RoseState;
  weather?: WeatherKind;
  history?: { directionDeg: number; recencyRank: number }[];
}

// Fixture cases matching MASTER_SPEC.md §29's required Playwright screenshots.
// Sector data mirrors the real hammar/kaseberga-s/ravlunda/hovs-hallar-n
// provisional green sectors from SITES.md so this doubles as a sanity
// check against production geometry, not just synthetic angles. Only
// the green ("inner") range is drawn - orange sub-ranges are no longer
// separate wedges, per explicit feedback matching the reference's
// single-wedge, status-colored model.
const CASES: Case[] = [
  {
    slug: "hammar-sw",
    title: "Hammar-like SW case",
    sector: { fromDeg: 213.75, toDeg: 236.25 },
    windDirectionDeg: 225,
    windSpeedMs: 5.2,
    state: "green",
    weather: "partly-cloudy",
  },
  {
    slug: "kaseberga-s",
    title: "Kåseberga-like S case",
    sector: { fromDeg: 168.75, toDeg: 191.25 },
    windDirectionDeg: 180,
    windSpeedMs: 6.0,
    state: "green",
    weather: "clear",
    history: [
      { directionDeg: 178, recencyRank: 0 },
      { directionDeg: 183, recencyRank: 1 },
      { directionDeg: 172, recencyRank: 2 },
    ],
  },
  {
    slug: "ravlunda-e",
    title: "Ravlunda-like E case",
    sector: { fromDeg: 78.75, toDeg: 101.25 },
    windDirectionDeg: 90,
    windSpeedMs: 4.5,
    state: "green",
    weather: "rain",
  },
  {
    slug: "n-wraparound",
    title: "N wraparound case",
    sector: { fromDeg: 348.75, toDeg: 11.25 },
    windDirectionDeg: 5,
    windSpeedMs: 5.0,
    state: "green",
    weather: "cloudy",
  },
  {
    slug: "wrong-direction-red",
    title: "Wrong-direction red case",
    sector: { fromDeg: 213.75, toDeg: 236.25 },
    windDirectionDeg: 45,
    windSpeedMs: 7.1,
    state: "red",
    weather: "thunder",
  },
  {
    slug: "unverified-orange",
    title: "Unverified orange case",
    sector: { fromDeg: 213.75, toDeg: 236.25 },
    windDirectionDeg: 225,
    windSpeedMs: 5.2,
    state: "orange",
    weather: "showers",
  },
  {
    slug: "stale-gray",
    title: "Stale gray case",
    sector: { fromDeg: 213.75, toDeg: 236.25 },
    windDirectionDeg: null,
    windSpeedMs: null,
    state: "gray",
  },
  {
    slug: "no-sector-configured",
    title: "No sector configured",
    sector: null,
    windDirectionDeg: 225,
    windSpeedMs: 5.2,
    state: "gray",
    weather: "cloudy",
  },
];

// Task-mandated adaptive-weather-placement fixtures (§ FlyWeather Next UI,
// item 14) - synthetic sector angles, not tied to real site geometry like
// CASES above, specifically chosen to exercise every quadrant plus narrow/
// wide/wraparound edge cases for the sector-midpoint+180deg placement math.
const ADAPTIVE_PLACEMENT_CASES: Case[] = [
  { slug: "adaptive-0-40", title: "0-40deg", sector: { fromDeg: 0, toDeg: 40 }, windDirectionDeg: 20, windSpeedMs: 4, state: "green", weather: "rain" },
  { slug: "adaptive-70-120", title: "70-120deg", sector: { fromDeg: 70, toDeg: 120 }, windDirectionDeg: 95, windSpeedMs: 4, state: "green", weather: "rain" },
  { slug: "adaptive-150-210", title: "150-210deg", sector: { fromDeg: 150, toDeg: 210 }, windDirectionDeg: 180, windSpeedMs: 4, state: "green", weather: "rain" },
  { slug: "adaptive-240-300", title: "240-300deg", sector: { fromDeg: 240, toDeg: 300 }, windDirectionDeg: 270, windSpeedMs: 4, state: "green", weather: "rain" },
  { slug: "adaptive-310-350", title: "310-350deg", sector: { fromDeg: 310, toDeg: 350 }, windDirectionDeg: 330, windSpeedMs: 4, state: "green", weather: "rain" },
  { slug: "adaptive-narrow", title: "Very narrow (100-105deg)", sector: { fromDeg: 100, toDeg: 105 }, windDirectionDeg: 102, windSpeedMs: 4, state: "green", weather: "rain" },
  { slug: "adaptive-wide", title: "Very wide (20-300deg)", sector: { fromDeg: 20, toDeg: 300 }, windDirectionDeg: 160, windSpeedMs: 4, state: "green", weather: "rain" },
  { slug: "adaptive-wraparound", title: "Wraparound (330-30deg)", sector: { fromDeg: 330, toDeg: 30 }, windDirectionDeg: 0, windSpeedMs: 4, state: "green", weather: "rain" },
];

export function RoseGallery() {
  return (
    <main style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: 24, fontFamily: "sans-serif" }}>
      {[...CASES, ...ADAPTIVE_PLACEMENT_CASES].map((c) => (
        <figure key={c.slug} data-testid={`rose-case-${c.slug}`} style={{ margin: 0, textAlign: "center" }}>
          <WindRose
            size={160}
            sector={c.sector}
            state={c.state}
            windDirectionDeg={c.windDirectionDeg}
            windSpeedMs={c.windSpeedMs}
            weatherKind={c.weather}
            historyPoints={c.history}
          />
          <figcaption>{c.title}</figcaption>
        </figure>
      ))}
      <figure data-testid="rose-case-marker-48" style={{ margin: 0, textAlign: "center" }}>
        <WindRose
          size={48}
          sector={CASES[0].sector}
          state={CASES[0].state}
          windDirectionDeg={225}
          windSpeedMs={5.2}
          weatherKind="partly-cloudy"
          siteName="Hammar"
        />
        <figcaption>48px marker size</figcaption>
      </figure>
      <figure data-testid="rose-case-marker-64" style={{ margin: 0, textAlign: "center" }}>
        <WindRose
          size={64}
          sector={CASES[0].sector}
          state={CASES[0].state}
          windDirectionDeg={225}
          windSpeedMs={5.2}
          weatherKind="partly-cloudy"
          siteName="Hammar"
        />
        <figcaption>64px marker size</figcaption>
      </figure>
    </main>
  );
}
