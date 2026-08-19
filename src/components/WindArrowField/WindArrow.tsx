import { polarToCartesian } from "../../domain/direction.ts";

export interface WindArrowProps {
  windDirectionDeg: number;
  windSpeedMs: number;
  size?: number;
}

const SIZE_DEFAULT = 28;

/**
 * Speed color bands, roughly Beaufort-like - not an official scale, just
 * visually distinct steps matching typical wind-map conventions (calm
 * blue through strong red).
 */
function speedColor(speedMs: number): string {
  if (speedMs < 2) return "#90caf9";
  if (speedMs < 5) return "#42a5f5";
  if (speedMs < 8) return "#66bb6a";
  if (speedMs < 12) return "#ffa726";
  return "#ef5350";
}

/**
 * Regional flow arrow - deliberately a DIFFERENT convention from
 * WindRose's site arrow. WindRose points to the compass direction wind
 * is coming FROM (§29.3, a station/vane convention). This arrow points
 * in the direction wind is blowing TOWARD (windDirectionDeg + 180),
 * matching how flow/streamline wind maps (e.g. Yr's) conventionally
 * read - the arrow shows where the air is going, not where it's from.
 */
export function WindArrow({ windDirectionDeg, windSpeedMs, size = SIZE_DEFAULT }: WindArrowProps) {
  const center = size / 2;
  const color = speedColor(windSpeedMs);
  const halfLen = Math.min(size * 0.44, size * 0.16 + windSpeedMs * 0.9);
  const flowAngle = windDirectionDeg + 180;

  const tail = polarToCartesian(center, center, halfLen, windDirectionDeg);
  const tip = polarToCartesian(center, center, halfLen, flowAngle);
  const headLeft = polarToCartesian(center, center, halfLen * 0.55, flowAngle - 24);
  const headRight = polarToCartesian(center, center, halfLen * 0.55, flowAngle + 24);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Regional wind arrow">
      <line x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y} stroke={color} strokeWidth={size * 0.1} strokeLinecap="round" />
      <polygon
        points={`${tip.x},${tip.y} ${headLeft.x},${headLeft.y} ${headRight.x},${headRight.y}`}
        fill={color}
      />
    </svg>
  );
}
