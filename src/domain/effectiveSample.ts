import { classifyFreshness, type Freshness } from "./freshness.ts";
import type { WindSample } from "./types.ts";

export interface ForecastPoint {
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
}

export interface EffectiveSample extends ForecastPoint {
  sourceKind: "observation" | "forecast";
  sourceId: string | null;
  /** Only meaningful when sourceKind is "observation". */
  freshness: Freshness | null;
  ageMinutes: number | null;
}

/**
 * Chooses what to actually display for the selected time, per
 * MASTER_SPEC.md §6.1: prefer a fresh live observation at NOW; a stale
 * observation falls back to forecast rather than masquerading as
 * current (§11.2); anything other than NOW always uses forecast, since
 * live data only describes right now.
 */
export function selectEffectiveSample(
  isNow: boolean,
  liveSample: WindSample | null,
  forecastPoint: ForecastPoint,
  now: Date,
  freshMinutes: number,
  staleMinutes: number,
): EffectiveSample {
  if (isNow && liveSample) {
    const freshness = classifyFreshness(liveSample.timestamp, now, freshMinutes, staleMinutes);
    if (freshness !== "stale") {
      const ageMinutes = (now.getTime() - new Date(liveSample.timestamp).getTime()) / 60_000;
      return {
        windDirectionDeg: liveSample.windDirectionDeg,
        windSpeedMs: liveSample.windSpeedMs,
        windGustMs: liveSample.windGustMs,
        sourceKind: "observation",
        sourceId: liveSample.sourceId,
        freshness,
        ageMinutes,
      };
    }
  }

  return {
    windDirectionDeg: forecastPoint.windDirectionDeg,
    windSpeedMs: forecastPoint.windSpeedMs,
    windGustMs: forecastPoint.windGustMs,
    sourceKind: "forecast",
    sourceId: "open-meteo",
    freshness: null,
    ageMinutes: null,
  };
}
