import type { WindSample } from "../../domain/types.ts";
import type { LiveWindProvider, SiteLiveSource } from "./types.ts";
import { holfuyWidgetProvider } from "./holfuyWidgetProvider.ts";
import { vivaProvider } from "./vivaProvider.ts";
import { smhiProvider } from "./smhiProvider.ts";
import { metarProvider } from "./metarProvider.ts";
import { weewxProvider } from "./weewxProvider.ts";

/**
 * Every live-wind reader, by the provider id a site file stores.
 *
 * These ids are written into site YAML by contributors, so they are a
 * published interface: renaming one breaks every file that used it. New
 * readers get new ids; old ids get aliases (below) rather than edits
 * across the catalogue.
 */
const PROVIDERS: Record<string, LiveWindProvider> = {
  holfuy: holfuyWidgetProvider,
  viva: vivaProvider,
  smhi: smhiProvider,
  metar: metarProvider,
  weewx: weewxProvider,
};

/**
 * Older or third-party spellings of a provider id, mapped to the reader
 * that actually serves them.
 *
 * `sjoboflyg` is what Klamby's file has said since long before any reader
 * existed - it names the club rather than the software, which was a
 * reasonable guess at the time and is now simply one club's WeeWX feed.
 * Aliasing costs nothing and means no site file has to be rewritten to
 * make a station that was already correctly described start working.
 *
 * `local` is the station-finder prototype's own id for the same family,
 * so a record pasted straight out of it resolves too.
 */
export const PROVIDER_ALIASES: Record<string, string> = {
  sjoboflyg: "weewx",
  local: "weewx",
  belchertown: "weewx",
  airport: "metar",
};

/**
 * What to call a provider in front of a pilot.
 *
 * The ids are machine keys chosen for stability in YAML; "weewx" on a
 * site panel tells a reader nothing. Falls back to the raw id rather
 * than hiding an unknown one - a site whose provider is a typo should
 * look odd, not tidy.
 */
export const PROVIDER_LABELS: Record<string, string> = {
  holfuy: "Holfuy",
  viva: "ViVa",
  smhi: "SMHI",
  metar: "Airport METAR",
  weewx: "Club station",
};

/**
 * The same names in Swedish, for the contributor-facing screens.
 *
 * A separate map rather than a translated-on-the-fly string, and covered
 * by a test that its keys match PROVIDER_LABELS exactly - so adding a
 * reader without naming it in Swedish fails the suite rather than
 * putting an English phrase in the middle of a Swedish sentence.
 */
export const PROVIDER_LABELS_SV: Record<string, string> = {
  holfuy: "Holfuy",
  viva: "ViVa",
  smhi: "SMHI",
  metar: "flygplatser (METAR)",
  weewx: "klubbstationer",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[canonicalProvider(provider)] ?? provider;
}

export function canonicalProvider(provider: string): string {
  const key = provider.trim().toLowerCase();
  return PROVIDER_ALIASES[key] ?? key;
}

/** Whether anything can actually read this provider - used by the editor to warn before saving. */
export function isKnownProvider(provider: string): boolean {
  return canonicalProvider(provider) in PROVIDERS;
}

export function knownProviderIds(): string[] {
  return Object.keys(PROVIDERS);
}

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
    const provider = providers[canonicalProvider(source.provider)];
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
