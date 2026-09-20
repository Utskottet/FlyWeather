import type { WindSample } from "../../domain/types.ts";

export interface SiteLiveSource {
  provider: string;
  station_id?: string | null;
  /**
   * The station's own feed, when the provider needs one to find it.
   *
   * Most readers build their URL from the station id alone. Club-operated
   * WeeWX feeds cannot: there is no directory to look an id up in, so the
   * address IS the identity. It was dropped between the saved site file
   * and the collector until now, which is why a station could be saved,
   * look right, and never produce a reading.
   *
   * Always checked against the allowlist before it is fetched - see
   * sourceUrl.ts. A saved record is contributor-supplied.
   */
  url?: string | null;
  /** The station's human name, for display and for log lines. Never used to fetch anything. */
  name?: string | null;
  priority: number;
  verified: boolean;
  note?: string;
}

export interface LiveWindProvider {
  fetch(source: SiteLiveSource): Promise<WindSample[]>;
}
