import { isAngleInSector } from "../../../src/domain/direction";

/** Structural, not imported from ./siteDraft.ts, to avoid a circular import (siteDraft.ts calls into this module for its own validation). */
export interface OverlapCheckable {
  id: string;
  from_deg: number;
  to_deg: number;
}

/**
 * Two circular half-open ranges [aFrom,aTo) and [bFrom,bTo) overlap iff one
 * range's start angle falls strictly inside the other - this also covers
 * full containment (whichever range is "inside" has its own start point
 * inside the other). Two ranges that only touch at a shared boundary (e.g.
 * 90-105 and 105-195) do NOT count as overlapping - explicit feedback that
 * adjacent bands are the normal, intended case.
 */
function rangesOverlap(a: OverlapCheckable, b: OverlapCheckable): boolean {
  return isAngleInSector(b.from_deg, a.from_deg, a.to_deg) || isAngleInSector(a.from_deg, b.from_deg, b.to_deg);
}

/** Every pair of bands that overlap, for surfacing in the UI. */
export function findOverlappingBandPairs<T extends OverlapCheckable>(bands: T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      if (rangesOverlap(bands[i], bands[j])) pairs.push([bands[i], bands[j]]);
    }
  }
  return pairs;
}

export function hasOverlappingBands(bands: OverlapCheckable[]): boolean {
  return findOverlappingBandPairs(bands).length > 0;
}

/**
 * After `changedId`'s from_deg/to_deg has already been moved to `newAngle`
 * in `bands`, push a neighbor's edge out to `newAngle` too when exactly ONE
 * of its two edges now falls inside the changed band's range - the clean
 * "grew into one adjacent neighbor" case - so the two end up touching
 * exactly instead of overlapping. More intuitive than just erroring
 * (explicit feedback): dragging one band's boundary into a neighbor
 * "pushes" the neighbor out of the way, like an adjacent slider handle.
 *
 * Deliberately does NOT push when BOTH of a neighbor's edges fall inside
 * the changed range (the changed band fully swallowed it, e.g. the dragged
 * edge landed exactly on the neighbor's own start while also passing its
 * end) - there's no single-edge fix for that without collapsing the
 * neighbor to a zero-width band, which is worse than leaving it alone. That
 * case instead falls through to the overlap warning/Save-block
 * (findOverlappingBandPairs/hasOverlappingBands), same as the general
 * single-level-only chain-of-3+-bands caveat: this only resolves the
 * common one-shared-boundary case, not every possible configuration.
 */
export function resolveBandPush<T extends OverlapCheckable>(bands: T[], changedId: string, newAngle: number): T[] {
  const changed = bands.find((b) => b.id === changedId);
  if (!changed) return bands;

  return bands.map((b) => {
    if (b.id === changedId) return b;
    const fromIntrudes = isAngleInSector(b.from_deg, changed.from_deg, changed.to_deg);
    const toIntrudes = isAngleInSector(b.to_deg, changed.from_deg, changed.to_deg);
    if (fromIntrudes && !toIntrudes) return { ...b, from_deg: newAngle };
    if (toIntrudes && !fromIntrudes) return { ...b, to_deg: newAngle };
    return b;
  });
}
