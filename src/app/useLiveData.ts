import { useEffect, useRef, useState } from "react";
import type { GeneratedLiveFile } from "../domain/types.ts";
import { PUBLISH_TARGET, type PublishTarget } from "./editorApi.ts";

interface LiveDataState {
  data: GeneratedLiveFile | null;
  loading: boolean;
  error: string | null;
  /** Where the current data came from, so the app can be honest about its age. */
  source: "live" | "bundled" | null;
}

/**
 * How often the page asks for fresh station readings.
 *
 * Two minutes, matching the Worker's own edge cache - asking more often
 * would return the identical cached response and cost everyone a
 * request. The stations publish every few minutes, so this keeps a rose
 * on screen within a few minutes of the real wind.
 */
const REFRESH_MS = 120_000;

/**
 * Live station wind.
 *
 * Two sources, in order:
 *
 *  1. The Worker's /api/live, which reads the stations when asked.
 *  2. public/generated/live.json, written at build time.
 *
 * The second used to be the only one, and that was the bug. The build
 * runs when the deploy pipeline runs - measured at about seven times a
 * day, because GitHub's scheduler honours a five-minute cron at
 * two-to-five-hour intervals - while a live reading goes stale in
 * thirty minutes. Most of the day every site fell back to forecast and
 * no station reading was visible at all. Nothing looked broken, because
 * falling back to forecast is exactly what a stale observation is
 * supposed to do.
 *
 * It is kept as the fallback rather than deleted, which is what makes
 * this safe: if the Worker is unreachable, misconfigured, or absent (a
 * dev server, a build with no Worker), the page shows what it showed
 * before. There is no state in which this is worse than the old
 * behaviour.
 *
 * And it now REFRESHES. The old version fetched once on mount and never
 * again, so a pilot who left the page open saw one reading for as long
 * as they kept it open - which for something people check repeatedly
 * through a morning is the worst possible failure. Refetching is paused
 * while the tab is hidden and resumed on return, so a phone in a pocket
 * costs nothing.
 */
export function useLiveData(target: PublishTarget | null = PUBLISH_TARGET): LiveDataState {
  const [state, setState] = useState<LiveDataState>({ data: null, loading: true, error: null, source: null });
  // Kept in a ref so a failed refresh never blanks a good reading that is
  // already on screen: stale data clearly labelled beats no data.
  const lastGood = useRef<GeneratedLiveFile | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function load() {
      const result = await fetchLive(target);
      if (cancelled) return;
      if (result) {
        lastGood.current = result.data;
        setState({ data: result.data, loading: false, error: null, source: result.source });
      } else if (lastGood.current === null) {
        setState({ data: null, loading: false, error: "Live station data is unavailable.", source: null });
      }
      // A failure with data already on screen changes nothing: the
      // existing reading stays, and the next attempt is in two minutes.
    }

    function schedule() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void load().then(schedule);
      }, REFRESH_MS);
    }

    function onVisibility() {
      if (document.visibilityState !== "visible") {
        window.clearTimeout(timer);
        return;
      }
      // Back from a locked phone: the reading on screen may be hours
      // old, so fetch immediately rather than waiting out the timer.
      void load().then(schedule);
    }

    void load().then(schedule);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // target comes from module-level configuration and never changes
    // within a session; listing it would restart the timer on every
    // render for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

async function fetchLive(
  target: PublishTarget | null,
): Promise<{ data: GeneratedLiveFile; source: "live" | "bundled" } | null> {
  if (target?.kind === "worker") {
    try {
      const response = await fetch(`${target.baseUrl}/api/live`);
      if (response.ok) {
        const data = (await response.json()) as GeneratedLiveFile;
        // Shape-checked before use: a Worker error page parsed as JSON
        // must not replace real readings with nothing.
        if (data && typeof data.generatedAt === "string" && data.sites) {
          return { data, source: "live" };
        }
      }
    } catch {
      // Fall through to the bundled file.
    }
  }

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}generated/live.json`);
    if (!response.ok) return null;
    return { data: (await response.json()) as GeneratedLiveFile, source: "bundled" };
  } catch {
    return null;
  }
}
