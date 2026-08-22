import { useState } from "react";
import type { SoaringColorStop } from "../../domain/soaring.ts";
import { RaspParamSelector, type RaspParamSelectorProps } from "../RaspParamSelector/RaspParamSelector.tsx";

export interface ParameterLegendProps {
  label: string;
  technicalLabel: string;
  unit: string;
  colorScale: SoaringColorStop[];
  provenance?: string;
  /**
   * When supplied, the legend's title becomes tappable and opens a small
   * popover to switch RASP parameters (§ FlyWeather Mobile UI Correction) -
   * replaces the prior always-visible 4-button row in the primary toolbar,
   * which permanently expanded it. Omit to render a plain, non-interactive
   * title (e.g. if the manifest only ever exposes one parameter).
   */
  paramSelector?: RaspParamSelectorProps;
}

/**
 * Numeric legend - the whole point is that someone unfamiliar with the
 * implementation can read a real value off the color, not just "weak/
 * strong". Gradient stop positions are computed from each color stop's
 * actual value (not assumed evenly spaced), so the tick spacing always
 * matches the real color mapping even if a future parameter's stops aren't
 * uniform.
 */
export function ParameterLegend({ label, technicalLabel, unit, colorScale, provenance, paramSelector }: ParameterLegendProps) {
  const [paramPopoverOpen, setParamPopoverOpen] = useState(false);
  if (colorScale.length === 0) return null;
  const minValue = colorScale[0].value;
  const maxValue = colorScale[colorScale.length - 1].value;
  const span = maxValue - minValue || 1;
  const gradient = `linear-gradient(to right, ${colorScale
    .map((stop) => `${stop.color} ${((stop.value - minValue) / span) * 100}%`)
    .join(", ")})`;

  return (
    <div className="rasp-legend" data-testid="rasp-legend">
      {paramSelector ? (
        <button
          type="button"
          className="rasp-legend-title rasp-legend-title-button"
          onClick={() => setParamPopoverOpen((open) => !open)}
          aria-expanded={paramPopoverOpen}
          data-testid="rasp-legend-title-button"
        >
          {label} · {technicalLabel} · {unit}
          <span className="rasp-legend-chevron" aria-hidden="true">
            {paramPopoverOpen ? "▴" : "▾"}
          </span>
        </button>
      ) : (
        <div className="rasp-legend-title">
          {label} · {technicalLabel} · {unit}
        </div>
      )}
      {paramSelector && paramPopoverOpen && (
        <div className="rasp-legend-param-popover" data-testid="rasp-legend-param-popover">
          <RaspParamSelector
            {...paramSelector}
            onChange={(key) => {
              paramSelector.onChange(key);
              setParamPopoverOpen(false);
            }}
          />
        </div>
      )}
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
