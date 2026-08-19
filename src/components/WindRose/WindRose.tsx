import { describeRingSector, polarToCartesian } from "../../domain/direction.ts";

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
// Widened from 5 (user feedback: overall state wasn't visible enough).
const STATE_RING_WIDTH = 8;
const SECTOR_OUTER_R = OUTER_R - STATE_RING_WIDTH - 2;
const SECTOR_WIDTH = 12;
const SECTOR_INNER_R = SECTOR_OUTER_R - SECTOR_WIDTH;
const SECTOR_MID_R = (SECTOR_INNER_R + SECTOR_OUTER_R) / 2;
const CENTER_R = SECTOR_INNER_R - 2;
const ARROW_INNER_R = CENTER_R * 0.6;
const ARROW_HEAD_R = SECTOR_OUTER_R;
const ARROW_SHAFT_R = ARROW_HEAD_R - 6;
const ARROW_HALF_WIDTH_DEG = 7;
const HISTORY_R = OUTER_R + 4;

// Center fill moved from a near-white tint to a genuinely saturated
// mid-tone per user feedback ("the whole center... should be the color
// indicator"). Checked against #111827 (the speed-number text color):
// every fill below stays well above WCAG AA's 4.5:1 contrast minimum
// for text, so the number stays clearly readable (§28) even though the
// background is now much more visually prominent than before.
const STATE_COLORS: Record<RoseState, { ring: string; fill: string }> = {
  green: { ring: "#2e7d32", fill: "#a5d6a7" },
  orange: { ring: "#e65100", fill: "#ffcc80" },
  red: { ring: "#c62828", fill: "#ef9a9a" },
  gray: { ring: "#757575", fill: "#cfd8dc" },
};

const SECTOR_BASE_COLOR = "#f3d4d4";
const GREEN_SECTOR_COLOR = "#43a047";
const ORANGE_SECTOR_COLOR = "#fb8c00";

function arrowheadPoints(angleDeg: number): string {
  const tip = polarToCartesian(CENTER, CENTER, ARROW_HEAD_R, angleDeg);
  const left = polarToCartesian(CENTER, CENTER, ARROW_SHAFT_R, angleDeg - ARROW_HALF_WIDTH_DEG);
  const right = polarToCartesian(CENTER, CENTER, ARROW_SHAFT_R, angleDeg + ARROW_HALF_WIDTH_DEG);
  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`;
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
  const arrowShaftEnd =
    windDirectionDeg !== null ? polarToCartesian(CENTER, CENTER, ARROW_SHAFT_R, windDirectionDeg) : null;
  const arrowStart =
    windDirectionDeg !== null ? polarToCartesian(CENTER, CENTER, ARROW_INNER_R, windDirectionDeg) : null;

  return (
    <div
      className="wind-rose"
      style={{ width: size, display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        role="img"
        aria-label={siteName ? `Wind rose for ${siteName}` : "Wind rose"}
      >
        {/* implicit "unfavorable direction" background - everywhere not covered by a green/orange sector */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={SECTOR_MID_R}
          fill="none"
          stroke={SECTOR_BASE_COLOR}
          strokeWidth={SECTOR_WIDTH}
          data-testid="sector-base"
        />

        {orangeSectors.map((s, i) => (
          <path
            key={`orange-${i}`}
            d={describeRingSector(CENTER, CENTER, SECTOR_INNER_R, SECTOR_OUTER_R, s.fromDeg, s.toDeg)}
            fill={ORANGE_SECTOR_COLOR}
            data-testid="orange-sector"
          />
        ))}
        {greenSectors.map((s, i) => (
          <path
            key={`green-${i}`}
            d={describeRingSector(CENTER, CENTER, SECTOR_INNER_R, SECTOR_OUTER_R, s.fromDeg, s.toDeg)}
            fill={GREEN_SECTOR_COLOR}
            data-testid="green-sector"
          />
        ))}

        <circle cx={CENTER} cy={CENTER} r={CENTER_R} fill={stateColor.fill} data-testid="state-fill" />
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

        {windDirectionDeg !== null && arrowStart && arrowShaftEnd && (
          <g data-testid="wind-arrow">
            <line
              x1={arrowStart.x}
              y1={arrowStart.y}
              x2={arrowShaftEnd.x}
              y2={arrowShaftEnd.y}
              stroke="#111827"
              strokeWidth={2.5}
              strokeLinecap="round"
              data-testid="wind-arrow-line"
            />
            <polygon points={arrowheadPoints(windDirectionDeg)} fill="#111827" data-testid="wind-arrow-head" />
          </g>
        )}

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
