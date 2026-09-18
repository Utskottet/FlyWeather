import { useEffect, useState } from "react";

/**
 * The phone/desktop split point for the § Startvind UX Direction layout.
 *
 * A media query, not a user setting: the two arrangements are genuinely
 * different (see MASTER_SPEC §15) rather than one being a shrunken copy of
 * the other, so the choice has to be made in JS - rendering both and
 * hiding one with CSS would put two copies of every slider (and every
 * `data-testid`) in the DOM at once.
 */
export const COMPACT_MAX_WIDTH_PX = 760;

const QUERY = `(max-width: ${COMPACT_MAX_WIDTH_PX}px)`;

export function useIsCompact(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setCompact(e.matches);
    setCompact(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return compact;
}
