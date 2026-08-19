import { WindRose, type RoseSector } from "../components/WindRose/index.ts";
import type { WeatherKind } from "../domain/weather.ts";

interface Case {
  slug: string;
  title: string;
  green: RoseSector[];
  orange: RoseSector[];
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
  state: "green" | "orange" | "red" | "gray";
  weather?: WeatherKind;
  history?: { directionDeg: number; recencyRank: number }[];
}

// Fixture cases matching MASTER_SPEC.md §29's required Playwright screenshots.
// Sector data mirrors the real hammar/kaseberga-s/ravlunda/hovs-hallar-n
// provisional sectors from SITES.md so this doubles as a sanity check
// against production geometry, not just synthetic angles.
const CASES: Case[] = [
  {
    slug: "hammar-sw",
    title: "Hammar-like SW case",
    green: [{ fromDeg: 213.75, toDeg: 236.25 }],
    orange: [
      { fromDeg: 202.5, toDeg: 213.75 },
      { fromDeg: 236.25, toDeg: 247.5 },
    ],
    windDirectionDeg: 225,
    windSpeedMs: 5.2,
    state: "green",
    weather: "partly-cloudy",
  },
  {
    slug: "kaseberga-s",
    title: "Kåseberga-like S case",
    green: [{ fromDeg: 168.75, toDeg: 191.25 }],
    orange: [
      { fromDeg: 157.5, toDeg: 168.75 },
      { fromDeg: 191.25, toDeg: 202.5 },
    ],
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
    green: [{ fromDeg: 78.75, toDeg: 101.25 }],
    orange: [
      { fromDeg: 67.5, toDeg: 78.75 },
      { fromDeg: 101.25, toDeg: 112.5 },
    ],
    windDirectionDeg: 90,
    windSpeedMs: 4.5,
    state: "green",
    weather: "rain",
  },
  {
    slug: "n-wraparound",
    title: "N wraparound case",
    green: [{ fromDeg: 348.75, toDeg: 11.25 }],
    orange: [
      { fromDeg: 337.5, toDeg: 348.75 },
      { fromDeg: 11.25, toDeg: 22.5 },
    ],
    windDirectionDeg: 5,
    windSpeedMs: 5.0,
    state: "green",
    weather: "cloudy",
  },
  {
    slug: "wrong-direction-red",
    title: "Wrong-direction red case",
    green: [{ fromDeg: 213.75, toDeg: 236.25 }],
    orange: [
      { fromDeg: 202.5, toDeg: 213.75 },
      { fromDeg: 236.25, toDeg: 247.5 },
    ],
    windDirectionDeg: 45,
    windSpeedMs: 7.1,
    state: "red",
    weather: "thunder",
  },
  {
    slug: "unverified-orange",
    title: "Unverified orange case",
    green: [{ fromDeg: 213.75, toDeg: 236.25 }],
    orange: [
      { fromDeg: 202.5, toDeg: 213.75 },
      { fromDeg: 236.25, toDeg: 247.5 },
    ],
    windDirectionDeg: 225,
    windSpeedMs: 5.2,
    state: "orange",
    weather: "showers",
  },
  {
    slug: "stale-gray",
    title: "Stale gray case",
    green: [{ fromDeg: 213.75, toDeg: 236.25 }],
    orange: [
      { fromDeg: 202.5, toDeg: 213.75 },
      { fromDeg: 236.25, toDeg: 247.5 },
    ],
    windDirectionDeg: null,
    windSpeedMs: null,
    state: "gray",
  },
];

export function RoseGallery() {
  return (
    <main style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: 24, fontFamily: "sans-serif" }}>
      {CASES.map((c) => (
        <figure key={c.slug} data-testid={`rose-case-${c.slug}`} style={{ margin: 0, textAlign: "center" }}>
          <WindRose
            size={160}
            greenSectors={c.green}
            orangeSectors={c.orange}
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
          greenSectors={CASES[0].green}
          orangeSectors={CASES[0].orange}
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
          greenSectors={CASES[0].green}
          orangeSectors={CASES[0].orange}
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
