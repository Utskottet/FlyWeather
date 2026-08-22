import type { WeatherKind } from "../../domain/weather.ts";

export interface WeatherGlyphProps {
  kind: WeatherKind;
  size?: number;
}

// Bold, filled, high-contrast palette - matches the user's uploaded
// reference (uploads/wind-sector-rose.html)'s sun/cloud/rain hex values
// exactly, so this glyph reads clearly against a transparent map
// background instead of the previous thin-line/low-contrast style.
const SUN = "#f8c900";
const CLOUD_FILL = "#f7f7f7";
const CLOUD_STROKE = "#222";
const RAIN = "#248bd6";
const MUTED = "#607d8b"; // fog/snow accent - darker than the old #90a4ae for contrast, no reference equivalent exists for these kinds
const BOLT = "#f57f17";

function Sun({ size, cx, cy }: { size: number; cx: number; cy: number }) {
  const r = size * 0.22;
  const rayInner = r + size * 0.06;
  const rayOuter = r + size * 0.2;
  const rays = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(angle) * rayInner;
    const y1 = cy + Math.sin(angle) * rayInner;
    const x2 = cx + Math.cos(angle) * rayOuter;
    const y2 = cy + Math.sin(angle) * rayOuter;
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
  });
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={SUN} />
      <g stroke={SUN} strokeWidth={size * 0.09} strokeLinecap="round">
        {rays}
      </g>
    </g>
  );
}

// Raw cloud silhouette lifted from the reference's own cloud path (a single
// bold outlined shape, not overlapping filled circles), re-expressed as a
// point list so it can be scaled/translated to any icon size and vertical
// anchor. Raw coordinates span x:[-23,21] (width 44), y:[-19,10] (height
// 29), matching the reference's own proportions.
const RAW_CLOUD_POINTS: Array<[number, number]> = [
  [-14, 8],
  [-20, 8],
  [-23, 4],
  [-23, 0],
  [-23, -5],
  [-19, -9],
  [-14, -9],
  [-12, -16],
  [-6, -19],
  [0, -17],
  [5, -16],
  [8, -12],
  [9, -8],
  [15, -9],
  [21, -4],
  [21, 2],
  [21, 7],
  [17, 10],
  [12, 10],
];
const RAW_CLOUD_MID_Y = -4.5; // (-19 + 10) / 2 - the shape's own vertical center, so `cy` below means "cloud's vertical center", not an arbitrary anchor

function Cloud({ size, cy }: { size: number; cy: number }) {
  const cx = size / 2;
  const scale = size / 46; // raw shape is ~44 wide - this keeps it filling most of the icon box, bold per the task's "not subtle" instruction
  const p = ([x, y]: [number, number]) =>
    `${(cx + x * scale).toFixed(2)} ${(cy + (y - RAW_CLOUD_MID_Y) * scale).toFixed(2)}`;
  const [a, c1s, c1e, c1c, c2s, c2e, c2c, c3s, c3e, c3c, c4s, c4e, c4c, c5s, c5e, c5c, c6s, c6e, c6c] =
    RAW_CLOUD_POINTS;
  const d = [
    `M ${p(a)}`,
    `C ${p(c1s)} ${p(c1e)} ${p(c1c)}`,
    `C ${p(c2s)} ${p(c2e)} ${p(c2c)}`,
    `C ${p(c3s)} ${p(c3e)} ${p(c3c)}`,
    `C ${p(c4s)} ${p(c4e)} ${p(c4c)}`,
    `C ${p(c5s)} ${p(c5e)} ${p(c5c)}`,
    `C ${p(c6s)} ${p(c6e)} ${p(c6c)}`,
    `L ${p([-14, 10])}`,
    "Z",
  ].join(" ");
  return <path d={d} fill={CLOUD_FILL} stroke={CLOUD_STROKE} strokeWidth={size * 0.065} strokeLinejoin="round" />;
}

function DropLines({ size, cy, count, color }: { size: number; cy: number; count: number; color: string }) {
  const cx = size / 2;
  const spacing = size * 0.18;
  const startX = cx - ((count - 1) * spacing) / 2;
  return (
    <g stroke={color} strokeWidth={size * 0.09} strokeLinecap="round">
      {Array.from({ length: count }, (_, i) => (
        <line
          key={i}
          x1={startX + i * spacing}
          y1={cy}
          x2={startX + i * spacing - size * 0.06}
          y2={cy + size * 0.2}
        />
      ))}
    </g>
  );
}

function SnowDots({ size, cy, count }: { size: number; cy: number; count: number }) {
  const cx = size / 2;
  const spacing = size * 0.2;
  const startX = cx - ((count - 1) * spacing) / 2;
  return (
    <g fill={MUTED} stroke={CLOUD_STROKE} strokeWidth={size * 0.02}>
      {Array.from({ length: count }, (_, i) => (
        <circle key={i} cx={startX + i * spacing} cy={cy + size * 0.1} r={size * 0.06} />
      ))}
    </g>
  );
}

export function WeatherGlyph({ kind, size = 20 }: WeatherGlyphProps) {
  const cloudY = size * 0.44;
  const dropY = size * 0.72;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Weather: ${kind}`}>
      {kind === "clear" && <Sun size={size} cx={size / 2} cy={size / 2} />}

      {kind === "partly-cloudy" && (
        <>
          <Sun size={size * 0.9} cx={size * 0.68} cy={size * 0.3} />
          <Cloud size={size} cy={cloudY} />
        </>
      )}

      {kind === "cloudy" && <Cloud size={size} cy={size / 2} />}

      {kind === "fog" && (
        <>
          <Cloud size={size} cy={cloudY * 0.85} />
          <g stroke={MUTED} strokeWidth={size * 0.08} strokeLinecap="round">
            <line x1={size * 0.16} y1={size * 0.83} x2={size * 0.84} y2={size * 0.83} />
            <line x1={size * 0.24} y1={size * 0.95} x2={size * 0.76} y2={size * 0.95} />
          </g>
        </>
      )}

      {kind === "drizzle" && (
        <>
          <Cloud size={size} cy={cloudY} />
          <SnowDots size={size} cy={dropY - size * 0.1} count={3} />
        </>
      )}

      {kind === "rain" && (
        <>
          <Cloud size={size} cy={cloudY} />
          <DropLines size={size} cy={dropY} count={3} color={RAIN} />
        </>
      )}

      {kind === "showers" && (
        <>
          <Cloud size={size} cy={cloudY} />
          <DropLines size={size} cy={dropY} count={4} color={RAIN} />
        </>
      )}

      {kind === "thunder" && (
        <>
          <Cloud size={size} cy={cloudY} />
          <polygon
            fill={BOLT}
            stroke={CLOUD_STROKE}
            strokeWidth={size * 0.02}
            strokeLinejoin="round"
            points={`${size * 0.55},${dropY - size * 0.04} ${size * 0.4},${dropY + size * 0.14} ${size * 0.5},${dropY + size * 0.14} ${size * 0.42},${dropY + size * 0.34} ${size * 0.62},${dropY + size * 0.08} ${size * 0.5},${dropY + size * 0.08}`}
          />
        </>
      )}

      {kind === "snow" && (
        <>
          <Cloud size={size} cy={cloudY} />
          <SnowDots size={size} cy={dropY - size * 0.07} count={3} />
        </>
      )}

      {kind === "unknown" && (
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.6}
          fontWeight={800}
          fill={CLOUD_STROKE}
        >
          ?
        </text>
      )}
    </svg>
  );
}
