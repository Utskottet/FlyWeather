import { useMemo, useRef } from "react";
import { describeSector, polarToCartesian, normalizeDeg } from "../../domain/direction.ts";
import type { EditorBand } from "../../domain/siteEditor.ts";
import { CORE_COLOR_HEX, MARGIN_COLOR_HEX } from "../../domain/siteEditorOptions.ts";
import { findOverlappingBandPairs, resolveBandPush } from "../../domain/bandOverlap.ts";
import { useAngleDrag } from "./useAngleDrag.ts";
import { BandRow } from "./BandRow.tsx";

interface Props {
  bands: EditorBand[];
  onChange: (bands: EditorBand[]) => void;
}

// Same 100x100 viewBox / opacity convention as the production
// src/components/WindRose/WindRose.tsx, deliberately not imported (that
// component assumes a single overall RoseState, not per-band authored
// margins) - see docs/EDITOR_INTEGRATION.md for the reuse-vs-reimplement
// call; the prototype itself has been deleted.
const VIEWBOX = 100;
const CENTER = VIEWBOX / 2;
const OUTER_R = 46;
const SECTOR_OPACITY = 0.78;
const HANDLE_R = 4;
// from-handles sit just inside the ring, to-handles just outside it - when
// two bands touch (a band's to_deg equals a neighbor's from_deg, the normal
// adjacent case), their handles would otherwise land on the exact same
// pixel and become impossible to grab individually (explicit feedback:
// "impossible to redrag unless remove one band"). Different radii keep
// every handle independently clickable regardless of angle.
const FROM_HANDLE_R = OUTER_R - 6;
const TO_HANDLE_R = OUTER_R + 6;

/** New band starts where the last one ends, so adding bands one after another doesn't start them fully overlapping at the same default 0-90 range. */
function makeBand(existing: EditorBand[]): EditorBand {
  const from = existing.length > 0 ? existing[existing.length - 1].to_deg : 0;
  return {
    id: crypto.randomUUID(),
    from_deg: from,
    to_deg: normalizeDeg(from + 90),
    margin_under_deg: 0,
    margin_over_deg: 0,
  };
}

export function CompassRoseEditor({ bands, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const startDrag = useAngleDrag(svgRef);

  function patchBand(id: string, patch: Partial<EditorBand>) {
    onChange(bands.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  /**
   * Drag-only: pushes any neighbor the dragged edge would otherwise
   * overlap out of the way, instead of just erroring - see
   * domain/bandOverlap.ts's resolveBandPush for the "who gets pushed"
   * logic and its single-level-only caveat. Deliberately NOT used for
   * typed numeric input: a typed value is a single discrete jump (e.g.
   * "from" briefly reading 105 while "to" is still its 90 default), which
   * can read as a huge wraparound sweep mid-edit and push an unrelated
   * band unexpectedly. Drag moves in small continuous steps, so this
   * problem doesn't arise there. Numeric edits that create an overlap
   * still surface via the warning/Save-block below - the user just
   * retypes or switches to dragging.
   */
  function applyDragEdgeChange(id: string, edge: "from_deg" | "to_deg", newAngle: number) {
    const updated = bands.map((b) => (b.id === id ? { ...b, [edge]: newAngle } : b));
    onChange(resolveBandPush(updated, id, newAngle));
  }

  function removeBand(id: string) {
    onChange(bands.filter((b) => b.id !== id));
  }

  const overlappingPairs = useMemo(() => findOverlappingBandPairs(bands), [bands]);
  const overlappingIds = useMemo(() => new Set(overlappingPairs.flatMap(([a, b]) => [a.id, b.id])), [overlappingPairs]);

  return (
    <fieldset style={{ marginBottom: 16 }}>
      <legend>Wind direction sectors</legend>
      {overlappingPairs.length > 0 && (
        <p style={{ color: "#f23535", margin: "0 0 8px", fontWeight: 600 }} data-testid="overlap-warning">
          Sector cores cannot overlap - fix the highlighted sector{overlappingPairs.length > 1 ? "s" : ""} before saving.
        </p>
      )}
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <svg
          ref={svgRef}
          width={200}
          height={200}
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          overflow="visible"
          role="img"
          aria-label="Wind direction sector editor"
        >
          {bands.map((band) => (
            <g key={`sector-${band.id}`}>
              {band.margin_under_deg > 0 && (
                <path
                  d={describeSector(CENTER, CENTER, OUTER_R, band.from_deg - band.margin_under_deg, band.from_deg)}
                  fill={MARGIN_COLOR_HEX}
                  opacity={SECTOR_OPACITY}
                  data-testid="margin-under"
                />
              )}
              {band.margin_over_deg > 0 && (
                <path
                  d={describeSector(CENTER, CENTER, OUTER_R, band.to_deg, band.to_deg + band.margin_over_deg)}
                  fill={MARGIN_COLOR_HEX}
                  opacity={SECTOR_OPACITY}
                  data-testid="margin-over"
                />
              )}
              <path
                d={describeSector(CENTER, CENTER, OUTER_R, band.from_deg, band.to_deg)}
                fill={CORE_COLOR_HEX}
                opacity={SECTOR_OPACITY}
                stroke={overlappingIds.has(band.id) ? "#f23535" : "none"}
                strokeWidth={overlappingIds.has(band.id) ? 1.5 : 0}
                data-testid="band-sector"
              />
            </g>
          ))}

          <circle cx={CENTER} cy={CENTER} r={OUTER_R} fill="none" stroke="#111" strokeWidth={1.5} />
          <text x={CENTER} y={CENTER - OUTER_R - 4} textAnchor="middle" fontSize={7} fontWeight={800}>
            N
          </text>

          {bands.map((band) => {
            const fromPt = polarToCartesian(CENTER, CENTER, FROM_HANDLE_R, band.from_deg);
            const toPt = polarToCartesian(CENTER, CENTER, TO_HANDLE_R, band.to_deg);
            return (
              <g key={`handles-${band.id}`}>
                <circle
                  cx={fromPt.x}
                  cy={fromPt.y}
                  r={HANDLE_R}
                  fill="#fff"
                  stroke="#111"
                  strokeWidth={1.5}
                  style={{ cursor: "grab", touchAction: "none" }}
                  data-testid="handle-from"
                  onPointerDown={startDrag((deg) => applyDragEdgeChange(band.id, "from_deg", deg))}
                />
                <circle
                  cx={toPt.x}
                  cy={toPt.y}
                  r={HANDLE_R}
                  fill="#111"
                  stroke="#fff"
                  strokeWidth={1.5}
                  style={{ cursor: "grab", touchAction: "none" }}
                  data-testid="handle-to"
                  onPointerDown={startDrag((deg) => applyDragEdgeChange(band.id, "to_deg", deg))}
                />
              </g>
            );
          })}
        </svg>

        <div style={{ flex: 1, minWidth: 280 }}>
          {bands.length === 0 && <p style={{ margin: "0 0 8px", color: "#666" }}>No sectors yet - flyability shows as unknown until at least one exists.</p>}
          {bands.map((band) => (
            <BandRow
              key={band.id}
              band={band}
              overlapping={overlappingIds.has(band.id)}
              onEdgeChange={(edge, value) => patchBand(band.id, { [edge]: value })}
              onMarginChange={(side, value) => patchBand(band.id, { [side]: value })}
              onRemove={() => removeBand(band.id)}
            />
          ))}
          <button type="button" onClick={() => onChange([...bands, makeBand(bands)])}>
            + Add sector
          </button>
        </div>
      </div>
    </fieldset>
  );
}
