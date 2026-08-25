import { useCallback, type RefObject } from "react";
import { normalizeDeg } from "../../../../src/domain/direction";

/**
 * Pointer-drag -> compass degree, for a handle on a CompassRoseEditor's
 * fixed 100x100 viewBox / center (50,50) - matches WindRose.tsx's own
 * viewBox convention (src/components/WindRose/WindRose.tsx), just not
 * imported directly since this hook only needs the geometry constant, not
 * the whole component.
 */
const CENTER = 50;

export function useAngleDrag(svgRef: RefObject<SVGSVGElement | null>) {
  return useCallback(
    (onDrag: (angleDeg: number) => void) => (downEvent: React.PointerEvent<SVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      downEvent.preventDefault();
      const target = downEvent.currentTarget;
      target.setPointerCapture(downEvent.pointerId);

      function computeAngle(clientX: number, clientY: number): number {
        const ctm = svg!.getScreenCTM();
        if (!ctm) return 0;
        const point = svg!.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        const local = point.matrixTransform(ctm.inverse());
        const angle = Math.atan2(local.x - CENTER, -(local.y - CENTER)) * (180 / Math.PI);
        return Math.round(normalizeDeg(angle));
      }

      onDrag(computeAngle(downEvent.clientX, downEvent.clientY));

      function handleMove(moveEvent: PointerEvent) {
        onDrag(computeAngle(moveEvent.clientX, moveEvent.clientY));
      }
      function handleUp(upEvent: PointerEvent) {
        target.releasePointerCapture(upEvent.pointerId);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      }
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [svgRef],
  );
}
