import { describeSector, polarToCartesian } from "../../domain/direction.ts";

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
  historyPoints?: HistoryPoint[];
  siteName?: string;
  unit?: string;
}

const VIEWBOX = 100;
const CENTER = VIEWBOX / 2;
const OUTER_R = 46;
// Widened from 5 (user feedback: overall state wasn't visible enough, Block 11).
const STATE_RING_WIDTH = 8;
const HISTORY_R = OUTER_R + 4;

// Pointer geometry (per the user's uploaded reference design: a
// "split-tail" dart, mostly OUTSIDE the ring with a wide notched back,
// tip poking slightly inward) - proportions carried over from the
// reference's own 240-viewBox pixel values, re-expressed as multiples
// of OUTER_R so they scale with this component's 100-viewBox instead
// of being copied as magic numbers.
const POINTER_TIP_R = OUTER_R * 0.91;
const POINTER_NOTCH_R = OUTER_R * 1.21;
const POINTER_WING_R = OUTER_R * 1.31;
const POINTER_WING_HALF_DEG = 8.2;

// Small legibility patch behind the speed number - needed now that
// sector wedges reach all the way to the center (see below), so
// whatever wedge color happens to sit behind the number (green/orange/
// base) doesn't fight with the dark text.
const TEXT_BG_R = 17;

const NORTH_TICK_OUTER_R = OUTER_R;
const NORTH_TICK_INNER_R = OUTER_R - 4;
const NORTH_LABEL_R = OUTER_R - 11;

// Center fill moved from a near-white tint to a genuinely saturated
// mid-tone per user feedback ("the whole center... should be the color
// indicator"). Checked against #111827 (the speed-number text color):
// every fill below stays well above WCAG AA's 4.5:1 contrast minimum
// for text, so the number stays clearly readable (§28) even though the
// background is now much more visually prominent than before.
const STATE_COLORS: Record<RoseState, { ring: string }> = {
  green: { ring: "#2e7d32" },
  orange: { ring: "#e65100" },
  red: { ring: "#c62828" },
  gray: { ring: "#757575" },
};

const SECTOR_BASE_COLOR = "#f3d4d4";
const GREEN_SECTOR_COLOR = "#43a047";
const ORANGE_SECTOR_COLOR = "#fb8c00";

/**
 * "Split-tail" wind pointer per the user's uploaded reference design
 * (uploads/wind-sector-rose.html) - a dart shape with a pointed tip
 * poking just inside the ring and a wide, notched back fanning out
 * past it, replacing the previous simple line+arrowhead. Tip points
 * toward the compass direction wind is coming FROM (§29.3 - unchanged
 * convention, only the shape changed).
 */
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
  historyPoints = [],
  siteName,
  unit = "m/s",
}: WindRoseProps) {
  const stateColor = STATE_COLORS[state];
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
        {/* implicit "unfavorable direction" backdrop - a full disc, not just a ring band, since sectors are now solid wedges reaching the center */}
        <circle cx={CENTER} cy={CENTER} r={OUTER_R} fill={SECTOR_BASE_COLOR} data-testid="sector-base" />

        {orangeSectors.map((s, i) => (
          <path
            key={`orange-${i}`}
            d={describeSector(CENTER, CENTER, OUTER_R, s.fromDeg, s.toDeg)}
            fill={ORANGE_SECTOR_COLOR}
            data-testid="orange-sector"
          />
        ))}
        {greenSectors.map((s, i) => (
          <path
            key={`green-${i}`}
            d={describeSector(CENTER, CENTER, OUTER_R, s.fromDeg, s.toDeg)}
            fill={GREEN_SECTOR_COLOR}
            data-testid="green-sector"
          />
        ))}

        <circle
          cx={CENTER}
          cy={CENTER}
          r={OUTER_R}
          fill="none"
          stroke={stateColor.ring}
          strokeWidth={STATE_RING_WIDTH}
          // Red (the "don't fly" signal) also gets a dashed ring, not just
          // a hue, so it stays distinguishable from green/orange for
          // colorblind users at map-marker scale too (§28).
          strokeDasharray={state === "red" ? STATE_RING_WIDTH * 1.6 : undefined}
          data-testid="state-ring"
        />

        <line
          x1={northTickOuter.x}
          y1={northTickOuter.y}
          x2={northTickInner.x}
          y2={northTickInner.y}
          stroke="#111827"
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
          fill="#111827"
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
          <polygon
            points={pointerPoints(windDirectionDeg)}
            fill="#111827"
            data-testid="wind-pointer"
          />
        )}

        <circle cx={CENTER} cy={CENTER} r={TEXT_BG_R} fill="rgba(255,255,255,0.82)" data-testid="text-legibility-bg" />
        <text
          x={CENTER}
          y={CENTER}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={windSpeedMs !== null ? 20 : 16}
          fontWeight={700}
          fill="#111827"
          data-testid="speed-text"
        >
          {windSpeedMs !== null ? windSpeedMs.toFixed(1) : "–"}
        </text>
        {windSpeedMs !== null && (
          <text x={CENTER} y={CENTER + 14} textAnchor="middle" fontSize={7} fill="#374151">
            {unit}
          </text>
        )}
      </svg>
      {siteName && <div className="wind-rose-label">{siteName}</div>}
    </div>
  );
}
