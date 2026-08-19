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

/** A point offset both along `axisAngle` and sideways along `axisAngle +/- 90deg`, built from two polarToCartesian calls (one for position, one for a pure lateral delta from the origin) rather than hand-rolled trig, to stay consistent with the rest of the codebase's angle convention. */
function offsetPoint(cx: number, cy: number, axisAngle: number, along: number, lateral: number): { x: number; y: number } {
  const base = polarToCartesian(cx, cy, along, axisAngle);
  const side = polarToCartesian(0, 0, lateral, axisAngle + 90);
  return { x: base.x + side.x, y: base.y + side.y };
}

/**
 * Regional flow arrow - deliberately a DIFFERENT convention from
 * WindRose's site arrow. WindRose points to the compass direction wind
 * is coming FROM (§29.3, a station/vane convention). This arrow points
 * in the direction wind is blowing TOWARD (windDirectionDeg + 180),
 * matching how flow/streamline wind maps (e.g. Yr's) conventionally
 * read - the arrow shows where the air is going, not where it's from.
 *
 * Shape (per user feedback after the 6x-denser grid made the old thin
 * line+small-triangle read as ambiguous blobs at a glance): a small,
 * sharp triangular head near the tip - occupying only the outer ~20%
 * of the shaft, so it reads as a distinct arrowhead rather than most of
 * the shape - plus a long, thin, gently curved "swimming" tail running
 * the rest of the way back to a point. The curve (quadratic Bezier
 * bulging slightly outward before narrowing) is what gives the tail its
 * flowing/fish-tail quality per the user's explicit ask, rather than a
 * plain straight taper. Iterated visually (rendered standalone SVG
 * previews at both an enlarged size and the actual ~26px on-map size)
 * before finalizing these proportions - the first attempt had the head
 * occupying most of the shaft length, which read as a generic kite/
 * diamond rather than a directional arrow.
 */
export function WindArrow({ windDirectionDeg, windSpeedMs, size = SIZE_DEFAULT }: WindArrowProps) {
  const center = size / 2;
  const color = speedColor(windSpeedMs);
  const halfLen = Math.min(size * 0.46, size * 0.2 + windSpeedMs * 1.1);
  const flowAngle = windDirectionDeg + 180;

  const headBaseAlong = halfLen * 0.78; // head occupies only the outer ~22% of the shaft
  const shoulderWidth = size * 0.13;
  const tailTaperWidth = size * 0.035; // narrower than the shoulders - this step is the "distinct head" boundary
  const bellyAlong = halfLen * 0.5;
  const bellyWidth = tailTaperWidth * 2.2; // slight outward bulge for the "swimming" curve, not a plain straight taper

  const tip = polarToCartesian(center, center, halfLen, flowAngle);
  const shoulderRight = offsetPoint(center, center, flowAngle, headBaseAlong, shoulderWidth);
  const shoulderLeft = offsetPoint(center, center, flowAngle, headBaseAlong, -shoulderWidth);
  const taperRight = offsetPoint(center, center, flowAngle, headBaseAlong, tailTaperWidth);
  const taperLeft = offsetPoint(center, center, flowAngle, headBaseAlong, -tailTaperWidth);
  const bellyRight = offsetPoint(center, center, windDirectionDeg, bellyAlong, -bellyWidth);
  const bellyLeft = offsetPoint(center, center, windDirectionDeg, bellyAlong, bellyWidth);
  const tailTip = polarToCartesian(center, center, halfLen, windDirectionDeg);

  const d = [
    `M ${tip.x} ${tip.y}`,
    `L ${shoulderRight.x} ${shoulderRight.y}`,
    `L ${taperRight.x} ${taperRight.y}`,
    `Q ${bellyRight.x} ${bellyRight.y} ${tailTip.x} ${tailTip.y}`,
    `Q ${bellyLeft.x} ${bellyLeft.y} ${taperLeft.x} ${taperLeft.y}`,
    `L ${shoulderLeft.x} ${shoulderLeft.y}`,
    "Z",
  ].join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Regional wind arrow">
      <path d={d} fill={color} data-testid="wind-arrow-shape" />
    </svg>
  );
}
