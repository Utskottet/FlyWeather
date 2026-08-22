import { useEffect, useState } from "react";

/**
 * The current time, re-read every `intervalMs` - for UI elements that need
 * to visually track the passage of real time (the slider's NOW marker) even
 * when nothing else causes a re-render. Not for data fetching/windowing -
 * useSiteForecasts.ts/useWindGrid.ts deliberately capture `new Date()` once
 * per fetch instead, per their own documented reasoning (windowing shouldn't
 * silently shift out from under an open session).
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
