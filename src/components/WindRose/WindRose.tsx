import { describeSector, polarToCartesian } from "../../domain/direction.ts";
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
  greenSectors: RoseSector[];
  orangeSectors: RoseSector[];
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
  state: RoseState;
  /** Rendered inside the rose (per the user's uploaded reference design), above the speed number - not composed externally by the caller anymore. */
  weatherKind?: WeatherKind;
  historyPoints?: HistoryPoint[];
  siteName?: string;
}

const VIEWBOX = 100;
const CENTER = VIEWBOX / 2;
const OUTER_R = 46;
const HISTORY_R = OUTER_R + 4;

// Colors and stroke-width lifted directly from the user's uploaded
// reference (uploads/wind-sector-rose.html)'s :root custom properties
// (--green/--orange/--red/--ink/--stroke), not our own previous
// palette - "fully comply stylewise" per explicit feedback after the
// first pass stayed too close to the old design's colors/proportions.
const INK = "#111";
const GREEN = "#27c93f";
const ORANGE = "#ff9800";
const RED = "#f23535";
const GRAY = "#757575"; // reference has no "unknown" state - this app's own addition, kept neutral like the others

// The reference's ring is a plain, thin, always-"ink" compass boundary
// (status is conveyed by the sector wedge's fill alone in their single-
// sector demo model). This app's sites can have several independent
// green/orange sectors at once, so - unlike the reference - there's
// still a need for one clear "what does the CURRENT overall reading
// evaluate to, right now" signal distinct from "which directions are
// configured favorable." Keeping the ring state-colored (a real,
// explicitly requested feature from Block 11) but adopting the
// reference's much thinner stroke now that the sector wedges
// themselves carry strong color too - the extra-wide ring from Block 11
// was compensating for the OLD thin ring-band sectors being too
// subtle, which solid wedges no longer are.
const RING_WIDTH = 4;
const STATE_RING_COLOR: Record<RoseState, string> = { green: GREEN, orange: ORANGE, red: RED, gray: GRAY };

// The reference's rose is transparent, sitting on a fixed-color demo
// page. Ours sits directly on a map whose background varies by mode
// (Relief/Topo/Map) and location, so an unfilled "no configured
// sector" area would have inconsistent (sometimes unreadable) contrast
// - kept a light neutral backdrop disc for that reason, a deliberate,
// justified deviation rather than an oversight.
const SECTOR_BASE_COLOR = "#f3d4d4";

// Pointer geometry (per the reference: a "split-tail" dart, mostly
// OUTSIDE the ring with a wide notched back, tip poking slightly
// inward) - proportions carried over from the reference's own
// 240-viewBox pixel values, re-expressed as multiples of OUTER_R so
// they scale with this component's 100-viewBox instead of being
// copied as magic numbers. Stays "ink" black per the reference - state
// is the ring's job, not the pointer's, avoiding two redundant
// state-colored elements.
const POINTER_TIP_R = OUTER_R * 0.91;
const POINTER_NOTCH_R = OUTER_R * 1.21;
const POINTER_WING_R = OUTER_R * 1.31;
const POINTER_WING_HALF_DEG = 8.2;

const NORTH_TICK_OUTER_R = OUTER_R;
const NORTH_TICK_INNER_R = OUTER_R - 4;
const NORTH_LABEL_R = OUTER_R - 11;

// Weather icon + speed number layout - the reference stacks a weather
// icon above a large, bold, unit-less speed number ("deliberately no
// unit" per its own comment) roughly in the upper-middle of the
// circle. WeatherGlyph is this app's own existing icon set (not the
// reference's hand-drawn ones - reusing our own tested component
// rather than duplicating icon logic), sized and positioned to fit the
// same layout role.
const ICON_CY = CENTER - 17;
const ICON_SIZE = 20;
const SPEED_CY = CENTER + 10;
const TEXT_BG_CY = CENTER - 2;
const TEXT_BG_R = 26;

/** Split-tail wind pointer, per the reference. Tip points toward the compass direction wind is coming FROM (§29.3 - unchanged convention, only the shape changed). */
function pointerPoints(angleDeg: number): string {
  const tip = polarToCartesian(CENTER, CENTER, POINTER_TIP_R, angleDeg);
  const wingLeft = polarToCartesian(CENTER, CENTER, POINTER_WING_R, angleDeg - POINTER_WING_HALF_DEG);
  const notch = polarToCartesian(CENTER, CENTER, POINTER_NOTCH_R, angleDeg);
  const wingRight = polarToCartesian(CENTER, CENTER, POINTER_WING_R, angleDeg + POINTER_WING_HALF_DEG);
  return [tip, wingLeft, notch, wingRight].map((p) => `${p.x},${p.y}`).join(" ");
}

export function WindRose({
  size = 64,
  greenSectors,
  orangeSectors,
  windDirectionDeg,
  windSpeedMs,
  state,
  weatherKind,
  historyPoints = [],
  siteName,
}: WindRoseProps) {
  const ringColor = STATE_RING_COLOR[state];
  const northTickOuter = polarToCartesian(CENTER, CENTER, NORTH_TICK_OUTER_R, 0);
  const northTickInner = polarToCartesian(CENTER, CENTER, NORTH_TICK_INNER_R, 0);
  const northLabelPos = polarToCartesian(CENTER, CENTER, NORTH_LABEL_R, 0);

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
        {/* implicit "unfavorable direction" backdrop - see SECTOR_BASE_COLOR comment for why this diverges from the reference's transparent rose */}
        <circle cx={CENTER} cy={CENTER} r={OUTER_R} fill={SECTOR_BASE_COLOR} data-testid="sector-base" />

        {orangeSectors.map((s, i) => (
          <path
            key={`orange-${i}`}
            d={describeSector(CENTER, CENTER, OUTER_R, s.fromDeg, s.toDeg)}
            fill={ORANGE}
            data-testid="orange-sector"
          />
        ))}
        {greenSectors.map((s, i) => (
          <path
            key={`green-${i}`}
            d={describeSector(CENTER, CENTER, OUTER_R, s.fromDeg, s.toDeg)}
            fill={GREEN}
            data-testid="green-sector"
          />
        ))}

        <circle
          cx={CENTER}
          cy={CENTER}
          r={OUTER_R}
          fill="none"
          stroke={ringColor}
          strokeWidth={RING_WIDTH}
          strokeLinecap="round"
          // Red (the "don't fly" signal) also gets a dashed ring, not just
          // a hue, so it stays distinguishable from green/orange for
          // colorblind users at map-marker scale too (§28).
          strokeDasharray={state === "red" ? RING_WIDTH * 1.8 : undefined}
          data-testid="state-ring"
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

        <circle cx={CENTER} cy={TEXT_BG_CY} r={TEXT_BG_R} fill="rgba(255,255,255,0.85)" data-testid="text-legibility-bg" />

        {weatherKind && (
          <g transform={`translate(${CENTER - ICON_SIZE / 2} ${ICON_CY - ICON_SIZE / 2})`} data-testid="rose-weather-icon">
            <WeatherGlyph kind={weatherKind} size={ICON_SIZE} />
          </g>
        )}

        <text
          x={CENTER}
          y={SPEED_CY}
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
