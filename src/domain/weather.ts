/** Internal stable weather enum - never bind UI directly to a provider's numeric codes (§25). */
export type WeatherKind =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "showers"
  | "thunder"
  | "snow"
  | "unknown";

/**
 * Maps an Open-Meteo WMO weather code (https://open-meteo.com/en/docs -
 * "WMO Weather interpretation codes") to our internal enum.
 */
export function openMeteoCodeToWeatherKind(code: number | null | undefined): WeatherKind {
  if (code === null || code === undefined) return "unknown";
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 80 && code <= 82) return "showers";
  if (code >= 95 && code <= 99) return "thunder";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  return "unknown";
}
