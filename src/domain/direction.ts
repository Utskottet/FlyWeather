export interface Point {
  x: number;
  y: number;
}

/** Normalize a degree value into [0, 360). */
export function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/**
 * Convert a compass angle (0 = N / up, increasing clockwise, matching the
 * meteorological convention in MASTER_SPEC.md §2.3) to a point on a circle
 * of the given radius centered at (cx, cy) in standard SVG coordinates
 * (y increases downward).
 */
export function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number): Point {
  const rad = (normalizeDeg(angleDeg) * Math.PI) / 180;
  return {
    x: cx + radius * Math.sin(rad),
    y: cy - radius * Math.cos(rad),
  };
}

/**
 * Clockwise angular sweep from fromDeg to toDeg, handling wrap-around
 * (e.g. 337.5 -> 22.5 sweeps 45 degrees through 0/360).
 */
export function sectorSweepDeg(fromDeg: number, toDeg: number): number {
  const sweep = normalizeDeg(toDeg) - normalizeDeg(fromDeg);
  return sweep <= 0 ? sweep + 360 : sweep;
}

/** Midpoint angle of the clockwise sector from fromDeg to toDeg, handling wrap-around. */
export function sectorMidpointDeg(fromDeg: number, toDeg: number): number {
  return normalizeDeg(normalizeDeg(fromDeg) + sectorSweepDeg(fromDeg, toDeg) / 2);
}

/**
 * Whether angleDeg falls within the clockwise sector [fromDeg, toDeg),
 * start inclusive, end exclusive. Handles wrap-around sectors. Boundary
 * behavior is deliberately deterministic per MASTER_SPEC.md §5.2.
 */
export function isAngleInSector(angleDeg: number, fromDeg: number, toDeg: number): boolean {
  const offset = normalizeDeg(angleDeg - fromDeg);
  return offset < sectorSweepDeg(fromDeg, toDeg);
}

/**
 * SVG path `d` for a ring-segment (donut wedge) between innerR and outerR,
 * sweeping clockwise from fromDeg to toDeg. Handles wrap-around sectors
 * (e.g. 337.5 -> 22.5) via the sweep computed by sectorSweepDeg. Does not
 * support a full 360-degree sweep (degenerate arc); callers needing a full
 * ring should draw a plain stroked circle instead.
 */
export function describeRingSector(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  fromDeg: number,
  toDeg: number,
): string {
  const sweep = sectorSweepDeg(fromDeg, toDeg);
  const largeArc = sweep > 180 ? 1 : 0;

  const outerStart = polarToCartesian(cx, cy, outerR, fromDeg);
  const outerEnd = polarToCartesian(cx, cy, outerR, fromDeg + sweep);
  const innerEnd = polarToCartesian(cx, cy, innerR, fromDeg + sweep);
  const innerStart = polarToCartesian(cx, cy, innerR, fromDeg);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

const COMPASS_16 = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

export type Compass16 = (typeof COMPASS_16)[number];

/** Nearest 16-point compass label for a degree value (§31 compass/degree conversion tests). */
export function degreesToCompass16(deg: number): Compass16 {
  const index = Math.round(normalizeDeg(deg) / 22.5) % 16;
  return COMPASS_16[index];
}

/** Center degree of a 16-point compass label (inverse of degreesToCompass16). */
export function compass16ToDegrees(label: Compass16): number {
  return normalizeDeg(COMPASS_16.indexOf(label) * 22.5);
}
