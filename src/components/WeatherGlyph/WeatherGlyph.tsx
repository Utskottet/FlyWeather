import type { WeatherKind } from "../../domain/weather.ts";

export interface WeatherGlyphProps {
  kind: WeatherKind;
  size?: number;
}

const SUN = "#f9a825";
const CLOUD = "#90a4ae";
const RAIN = "#1976d2";
const SNOW = "#78909c";
const BOLT = "#f57f17";

function Sun({ size, cx, cy }: { size: number; cx: number; cy: number }) {
  return <circle cx={cx} cy={cy} r={size * 0.24} fill={SUN} />;
}

function Cloud({ size, cy }: { size: number; cy: number }) {
  const cx = size / 2;
  return (
    <g fill={CLOUD}>
      <circle cx={cx - size * 0.16} cy={cy} r={size * 0.17} />
      <circle cx={cx + size * 0.06} cy={cy - size * 0.09} r={size * 0.2} />
      <circle cx={cx + size * 0.24} cy={cy} r={size * 0.15} />
      <rect x={cx - size * 0.3} y={cy} width={size * 0.62} height={size * 0.16} rx={size * 0.08} />
    </g>
  );
}

function DropLines({ size, cy, count, color }: { size: number; cy: number; count: number; color: string }) {
  const cx = size / 2;
  const spacing = size * 0.16;
  const startX = cx - ((count - 1) * spacing) / 2;
  return (
    <g stroke={color} strokeWidth={size * 0.045} strokeLinecap="round">
      {Array.from({ length: count }, (_, i) => (
        <line
          key={i}
          x1={startX + i * spacing}
          y1={cy}
          x2={startX + i * spacing - size * 0.05}
          y2={cy + size * 0.16}
        />
      ))}
    </g>
  );
}

function SnowDots({ size, cy, count }: { size: number; cy: number; count: number }) {
  const cx = size / 2;
  const spacing = size * 0.18;
  const startX = cx - ((count - 1) * spacing) / 2;
  return (
    <g fill={SNOW}>
      {Array.from({ length: count }, (_, i) => (
        <circle key={i} cx={startX + i * spacing} cy={cy + size * 0.1} r={size * 0.035} />
      ))}
    </g>
  );
}

export function WeatherGlyph({ kind, size = 20 }: WeatherGlyphProps) {
  const cloudY = size * 0.42;
  const dropY = size * 0.68;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Weather: ${kind}`}>
      {kind === "clear" && <Sun size={size} cx={size / 2} cy={size / 2} />}

      {kind === "partly-cloudy" && (
        <>
          <Sun size={size * 0.9} cx={size * 0.68} cy={size * 0.32} />
          <Cloud size={size} cy={cloudY} />
        </>
      )}

      {kind === "cloudy" && <Cloud size={size} cy={size / 2} />}

      {kind === "fog" && (
        <>
          <Cloud size={size} cy={cloudY * 0.85} />
          <g stroke={CLOUD} strokeWidth={size * 0.05} strokeLinecap="round">
            <line x1={size * 0.18} y1={size * 0.82} x2={size * 0.82} y2={size * 0.82} />
            <line x1={size * 0.25} y1={size * 0.94} x2={size * 0.75} y2={size * 0.94} />
          </g>
        </>
      )}

      {kind === "drizzle" && (
        <>
          <Cloud size={size} cy={cloudY} />
          <SnowDots size={size} cy={dropY - size * 0.08} count={3} />
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
            points={`${size * 0.55},${dropY - size * 0.04} ${size * 0.4},${dropY + size * 0.14} ${size * 0.5},${dropY + size * 0.14} ${size * 0.42},${dropY + size * 0.34} ${size * 0.62},${dropY + size * 0.08} ${size * 0.5},${dropY + size * 0.08}`}
          />
        </>
      )}

      {kind === "snow" && (
        <>
          <Cloud size={size} cy={cloudY} />
          <SnowDots size={size} cy={dropY - size * 0.05} count={3} />
        </>
      )}

      {kind === "unknown" && (
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.6}
          fill={CLOUD}
        >
          ?
        </text>
      )}
    </svg>
  );
}
