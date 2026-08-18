export interface HeightSample {
  heightM: number;
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
}

export interface InterpolatedWind {
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
  /** The height this result actually reflects - equals targetHeightM when interpolated, or a clamped boundary height otherwise. */
  effectiveHeightM: number | null;
}

/** Circular-safe interpolation between two compass-degree angles (handles wrap-around, e.g. 350->10). */
function interpolateAngleDeg(a: number, b: number, t: number): number {
  const aRad = (a * Math.PI) / 180;
  const bRad = (b * Math.PI) / 180;
  const x = (1 - t) * Math.cos(aRad) + t * Math.cos(bRad);
  const y = (1 - t) * Math.sin(aRad) + t * Math.sin(bRad);
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/**
 * Interpolates wind at a target AGL height from discrete model-height
 * samples (§7.2: "if a forecast provider offers discrete heights ...
 * interpolate where sensible"). Clamps to the nearest available height
 * rather than extrapolating beyond real data when the target is outside
 * the sampled range. Returns nulls (not a guess) when no sample has data.
 */
export function interpolateWindAtHeight(targetHeightM: number, samples: HeightSample[]): InterpolatedWind {
  const valid = samples
    .filter((s): s is HeightSample & { windDirectionDeg: number; windSpeedMs: number } =>
      s.windDirectionDeg !== null && s.windSpeedMs !== null,
    )
    .sort((a, b) => a.heightM - b.heightM);

  if (valid.length === 0) {
    return { windDirectionDeg: null, windSpeedMs: null, effectiveHeightM: null };
  }

  if (targetHeightM <= valid[0].heightM) {
    const s = valid[0];
    return { windDirectionDeg: s.windDirectionDeg, windSpeedMs: s.windSpeedMs, effectiveHeightM: s.heightM };
  }

  const highest = valid[valid.length - 1];
  if (targetHeightM >= highest.heightM) {
    return {
      windDirectionDeg: highest.windDirectionDeg,
      windSpeedMs: highest.windSpeedMs,
      effectiveHeightM: highest.heightM,
    };
  }

  for (let i = 0; i < valid.length - 1; i++) {
    const lo = valid[i];
    const hi = valid[i + 1];
    if (targetHeightM >= lo.heightM && targetHeightM <= hi.heightM) {
      const t = (targetHeightM - lo.heightM) / (hi.heightM - lo.heightM);
      // Avoid routing an exact endpoint through trig (float noise, e.g.
      // t=1 could yield 302.9999999994 instead of exactly 303).
      if (t === 0) return { windDirectionDeg: lo.windDirectionDeg, windSpeedMs: lo.windSpeedMs, effectiveHeightM: targetHeightM };
      if (t === 1) return { windDirectionDeg: hi.windDirectionDeg, windSpeedMs: hi.windSpeedMs, effectiveHeightM: targetHeightM };
      return {
        windDirectionDeg: interpolateAngleDeg(lo.windDirectionDeg, hi.windDirectionDeg, t),
        windSpeedMs: lo.windSpeedMs + t * (hi.windSpeedMs - lo.windSpeedMs),
        effectiveHeightM: targetHeightM,
      };
    }
  }

  // Unreachable given the boundary checks above, but keep the function total.
  return { windDirectionDeg: null, windSpeedMs: null, effectiveHeightM: null };
}
