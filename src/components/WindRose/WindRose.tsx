import { describeSector, normalizeDeg, polarToCartesian, sectorMidpointDeg } from "../../domain/direction.ts";
import { WeatherGlyph } from "../WeatherGlyph/WeatherGlyph.tsx";
import type { WeatherKind } from "../../domain/weather.ts";

export type RoseState = "green" | "orange" | "red" | "gray";

export interface RoseSector {
  fromDeg: number;
  toDeg: number;
}

export interface HistoryPoint {
  directionDeg: number;
  /** 0 = most recent sample. Only ever pass real observation history - never forecast values (§2.1.4). */
  recencyRank: number;
}

export interface WindRoseProps {
  /** Rendered pixel size (square). 48-64 for map markers, 120-200 for the expanded view (§2.4). */
  size?: number;
  /**
   * The site's core flyable direction range (its single green/"inner"
   * sector - orange sub-ranges are no longer drawn as separate wedges,
   * per explicit feedback matching the reference's one-wedge model).
   * Null when the site has no green sector configured - never fabricate
   * a range, render no wedge instead (§2.1.4).
   */
  sector: RoseSector | null;
  /** Colors the wedge - the reference's model conveys good/maybe/no-go entirely through this one wedge's fill, not a separate ring. */
  state: RoseState;
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
  /** Rendered inside the rose (per the user's uploaded reference design), above the speed number - not composed externally by the caller anymore. */
  weatherKind?: WeatherKind;
  historyPoints?: HistoryPoint[];
  siteName?: string;
}

const VIEWBOX = 100;
const CENTER = VIEWBOX / 2;
const OUTER_R = 46;
const HISTORY_R = OUTER_R + 4;

// Colors lifted directly from the user's uploaded reference
// (uploads/wind-sector-rose.html)'s :root custom properties.
const INK = "#111";
const GREEN = "#27c93f";
const ORANGE = "#ff9800";
const RED = "#f23535";
const GRAY = "#757575"; // reference has no "unknown" state - this app's own addition, kept neutral like the others
const STATE_SECTOR_COLOR: Record<RoseState, string> = { green: GREEN, orange: ORANGE, red: RED, gray: GRAY };

// The reference's single sector wedge is drawn at opacity .78 (CSS
// `.sector { opacity: .78 }`), not fully solid - matched exactly per
// explicit feedback that the fill needs to be alpha-transparent so
// whatever sits behind the rose (the map) shows through it.
const SECTOR_OPACITY = 0.78;

// The reference's ring is `stroke-width: 3.5` on a 240-viewBox circle
// of radius 90 (ratio ~0.0194 of the radius) - genuinely thin, not the
// thick ring an earlier pass mistakenly shipped. Expressed as a ratio
// of OUTER_R so it scales with this component's own viewBox instead of
// being copied as an unrelated magic number.
const RING_WIDTH = OUTER_R * (3.5 / 90);

// Pointer geometry (per the reference: a "split-tail" dart, mostly
// OUTSIDE the ring with a wide notched back, tip poking slightly
// inward) - proportions carried over from the reference's own
// 240-viewBox pixel values, re-expressed as multiples of OUTER_R so
// they scale with this component's 100-viewBox instead of being
// copied as magic numbers. Stays "ink" black per the reference.
const POINTER_TIP_R = OUTER_R * 0.91;
const POINTER_NOTCH_R = OUTER_R * 1.21;
const POINTER_WING_R = OUTER_R * 1.31;
const POINTER_WING_HALF_DEG = 8.2;

const NORTH_TICK_OUTER_R = OUTER_R;
const NORTH_TICK_INNER_R = OUTER_R - 4;
const NORTH_LABEL_R = OUTER_R - 11;

// Adaptive weather/speed layout (FlyWeather Next UI milestone): the
// reference's weather-above/speed-below placement is fixed regardless of
// sector position, which covers the colored sector whenever it points
// upward. Instead, weather is placed at the sector's midpoint + 180deg (the
// point on the ring farthest from the sector), translated only - never
// rotated, per the task's explicit instruction - and speed nudges to
// whichever vertical half the weather ISN'T in, staying horizontally
// centered and near the ring's center where any pie-slice sector wedge is
// narrowest. With no sector configured there's nothing to avoid, so the
// angle defaults to 0 (north/up), reproducing the same relative
// composition as before - just bigger, per the task's core "weather is too
// small on phones" complaint applying universally, not only when a sector
// exists.
const DEFAULT_WEATHER_ANGLE = 0;

// ~39% of the ring's own diameter (2*OUTER_R) - within the task's
// documented 35-40%-of-rose-diameter target for the weather graphic
// (previously 22, well under target - this is a deliberate, real increase,
// not a cosmetic tweak).
const ICON_SIZE = 36;

// The graphic is allowed to protrude past the ring - within the task's
// documented 10-15% range. ICON_PLACEMENT_R is the radius at which the
// icon's CENTER sits, chosen so its outer edge lands exactly at
// OUTER_R * (1 + ICON_PROTRUSION_FRACTION).
const ICON_PROTRUSION_FRACTION = 0.12;
const ICON_PLACEMENT_R = OUTER_R * (1 + ICON_PROTRUSION_FRACTION) - ICON_SIZE / 2;

// Speed keeps the reference's original below-center offset magnitude
// (54/90 of OUTER_R) - only its sign (above vs. below center) becomes
// adaptive.
const SPEED_OFFSET = OUTER_R * (54 / 90);

/** Sector midpoint + 180deg (wraparound-safe via the existing
 * sectorMidpointDeg helper) - the point on the ring farthest from the
 * sector, where the weather graphic reads clearest without covering it.
 * Returns the reference's own fixed "up" angle when there's no sector to
 * avoid. */
function weatherAngleFor(sector: RoseSector | null): number {
  if (!sector) return DEFAULT_WEATHER_ANGLE;
  return normalizeDeg(sectorMidpointDeg(sector.fromDeg, sector.toDeg) + 180);
}

/** Split-tail wind pointer, per the reference. Tip points toward the compass direction wind is coming FROM (§29.3). */
function pointerPoints(angleDeg: number): string {
  const tip = polarToCartesian(CENTER, CENTER, POINTER_TIP_R, angleDeg);
  const wingLeft = polarToCartesian(CENTER, CENTER, POINTER_WING_R, angleDeg - POINTER_WING_HALF_DEG);
  const notch = polarToCartesian(CENTER, CENTER, POINTER_NOTCH_R, angleDeg);
  const wingRight = polarToCartesian(CENTER, CENTER, POINTER_WING_R, angleDeg + POINTER_WING_HALF_DEG);
  return [tip, wingLeft, notch, wingRight].map((p) => `${p.x},${p.y}`).join(" ");
}

export function WindRose({
  size = 64,
  sector,
  state,
  windDirectionDeg,
  windSpeedMs,
  weatherKind,
  historyPoints = [],
  siteName,
}: WindRoseProps) {
  const northTickOuter = polarToCartesian(CENTER, CENTER, NORTH_TICK_OUTER_R, 0);
  const northTickInner = polarToCartesian(CENTER, CENTER, NORTH_TICK_INNER_R, 0);
  const northLabelPos = polarToCartesian(CENTER, CENTER, NORTH_LABEL_R, 0);

  const weatherAngle = weatherAngleFor(sector);
  const iconCenter = polarToCartesian(CENTER, CENTER, ICON_PLACEMENT_R, weatherAngle);
  // Speed nudges to whichever vertical half the weather ISN'T in, so the two
  // never share space regardless of where the sector pushed the weather.
  const speedCy = CENTER + (iconCenter.y < CENTER ? SPEED_OFFSET : -SPEED_OFFSET);

  return (
    <div
      className="wind-rose"
      style={{ width: size, display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        overflow="visible"
        role="img"
        aria-label={siteName ? `Wind rose for ${siteName}` : "Wind rose"}
      >
        {sector && (
          <path
            d={describeSector(CENTER, CENTER, OUTER_R, sector.fromDeg, sector.toDeg)}
            fill={STATE_SECTOR_COLOR[state]}
            opacity={SECTOR_OPACITY}
            data-testid="sector"
          />
        )}

        <circle
          cx={CENTER}
          cy={CENTER}
          r={OUTER_R}
          fill="none"
          stroke={INK}
          strokeWidth={RING_WIDTH}
          data-testid="outer-ring"
        />

        <line
          x1={northTickOuter.x}
          y1={northTickOuter.y}
          x2={northTickInner.x}
          y2={northTickInner.y}
          stroke={INK}
          strokeWidth={2}
          strokeLinecap="round"
          data-testid="north-tick"
        />
        <text
          x={northLabelPos.x}
          y={northLabelPos.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={7}
          fontWeight={800}
          fill={INK}
          data-testid="north-label"
        >
          N
        </text>

        {historyPoints.map((hp, i) => {
          const pt = polarToCartesian(CENTER, CENTER, HISTORY_R, hp.directionDeg);
          const opacity = Math.max(0.25, 1 - hp.recencyRank * 0.2);
          const r = Math.max(1, 2.5 - hp.recencyRank * 0.3);
          return (
            <circle
              key={`history-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={r}
              fill="#333"
              opacity={opacity}
              data-testid="history-dot"
            />
          );
        })}

        {windDirectionDeg !== null && (
          <polygon points={pointerPoints(windDirectionDeg)} fill={INK} data-testid="wind-pointer" />
        )}

        {weatherKind && (
          <g
            transform={`translate(${iconCenter.x - ICON_SIZE / 2} ${iconCenter.y - ICON_SIZE / 2})`}
            data-testid="rose-weather-icon"
          >
            <WeatherGlyph kind={weatherKind} size={ICON_SIZE} />
          </g>
        )}

        <text
          x={CENTER}
          y={speedCy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={windSpeedMs !== null ? 19 : 15}
          fontWeight={800}
          letterSpacing={-0.5}
          fill={INK}
          data-testid="speed-text"
        >
          {windSpeedMs !== null ? windSpeedMs.toFixed(1) : "–"}
        </text>
      </svg>
      {siteName && <div className="wind-rose-label">{siteName}</div>}
    </div>
  );
}
