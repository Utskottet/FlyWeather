/** Wind speed unit conversions. Internal storage is always m/s (MASTER_SPEC.md §10). */

export function kmhToMs(kmh: number): number {
  return kmh / 3.6;
}

export function msToKmh(ms: number): number {
  return ms * 3.6;
}

export function mphToMs(mph: number): number {
  return mph * 0.44704;
}

export function msToMph(ms: number): number {
  return ms / 0.44704;
}

export function knotsToMs(knots: number): number {
  return knots * 0.514444;
}

export function msToKnots(ms: number): number {
  return ms / 0.514444;
}
