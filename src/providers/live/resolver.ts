import type { WindSample } from "../../domain/types.ts";
import type { LiveWindProvider, SiteLiveSource } from "./types.ts";
import { holfuyWidgetProvider } from "./holfuyWidgetProvider.ts";
import { vivaProvider } from "./vivaProvider.ts";

const PROVIDERS: Record<string, LiveWindProvider> = {
  holfuy: holfuyWidgetProvider,
  viva: vivaProvider,
  // findwind, etc: not yet implemented. The resolver skips an
  // unrecognized provider name rather than crashing, per §11's
  // "Provider failure must degrade gracefully" - see
  // docs/DATA_SOURCE_AUDIT.md for what's outstanding.
};

/**
 * Tries each of a site's configured live sources in priority order
 * (§18) and returns the first one that yields a sample. A source that
 * throws, returns nothing, or names an unimplemented provider is
 * skipped rather than failing the whole resolution. `providers` is
 * injectable (defaults to the real registry) so this is testable
 * without a network call.
 */
export async function resolveLiveSample(
  sources: SiteLiveSource[],
  providers: Record<string, LiveWindProvider> = PROVIDERS,
): Promise<WindSample | null> {
  const byPriority = [...sources].sort((a, b) => a.priority - b.priority);

  for (const source of byPriority) {
    const provider = providers[source.provider];
    if (!provider) continue;
    try {
      const samples = await provider.fetch(source);
      if (samples.length > 0) return samples[0];
    } catch {
      continue;
    }
  }

  return null;
}
