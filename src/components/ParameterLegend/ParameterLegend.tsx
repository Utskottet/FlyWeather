import type { SoaringColorStop } from "../../domain/soaring.ts";

export interface ParameterLegendProps {
  label: string;
  technicalLabel: string;
  unit: string;
  colorScale: SoaringColorStop[];
  provenance?: string;
}

/**
 * Numeric legend - the whole point is that someone unfamiliar with the
 * implementation can read a real value off the color, not just "weak/
 * strong". Gradient stop positions are computed from each color stop's
 * actual value (not assumed evenly spaced), so the tick spacing always
 * matches the real color mapping even if a future parameter's stops aren't
 * uniform.
 *
 * Non-interactive (§ FlyWeather GUI Reorganization + Coherent Height Wind) -
 * a prior pass put the RASP parameter selector behind a tap on this
 * legend's own title; that selector now lives directly on the RASP control
 * in the top-left tool stack instead, "directly associated with the RASP
 * control" per that milestone's explicit instruction, so this component
 * goes back to being a plain read-only legend.
 */
export function ParameterLegend({ label, technicalLabel, unit, colorScale, provenance }: ParameterLegendProps) {
  if (colorScale.length === 0) return null;
  const minValue = colorScale[0].value;
  const maxValue = colorScale[colorScale.length - 1].value;
  const span = maxValue - minValue || 1;
  const gradient = `linear-gradient(to right, ${colorScale
    .map((stop) => `${stop.color} ${((stop.value - minValue) / span) * 100}%`)
    .join(", ")})`;

  return (
    <div className="rasp-legend" data-testid="rasp-legend">
      <div className="rasp-legend-title">
        {label} · {technicalLabel} · {unit}
      </div>
      <div className="rasp-legend-scale" style={{ background: gradient }} />
      <div className="rasp-legend-ticks" data-testid="rasp-legend-ticks">
        {colorScale.map((stop) => (
          <span
            key={stop.value}
            className="rasp-legend-tick"
            style={{ left: `${((stop.value - minValue) / span) * 100}%` }}
          >
            {stop.value}
          </span>
        ))}
      </div>
      {provenance && <div className="rasp-legend-provenance">{provenance}</div>}
    </div>
  );
}
