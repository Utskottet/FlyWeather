import type { WindSample } from "../../domain/types.ts";

export interface SiteLiveSource {
  provider: string;
  station_id?: string | null;
  priority: number;
  verified: boolean;
  note?: string;
}

export interface LiveWindProvider {
  fetch(source: SiteLiveSource): Promise<WindSample[]>;
}
