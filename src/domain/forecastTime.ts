/**
 * Reading a forecast hour without guessing what time zone it is in.
 *
 * Open-Meteo is asked for `timezone=UTC` and answers with timestamps
 * like "2026-09-22T17:00" - UTC, but with nothing on the end that says
 * so. JavaScript treats a bare date-time as LOCAL time, not UTC:
 *
 *   new Date("2026-09-22T17:00")   -> 15:00Z on a Swedish machine
 *   new Date("2026-09-22T17:00Z")  -> 17:00Z
 *
 * So every naive `new Date(hour)` in this app was reading each forecast
 * row two hours early in summer, one in winter. The labels stayed
 * self-consistent, which is what hid it: the slider said 17:00 and the
 * row was called 17:00, while the wind shown under that label was the
 * wind for 19:00. A pilot comparing against YR saw two different
 * numbers for what looked like the same hour.
 *
 * The regional wind grid does publish "2026-09-21T15:00:00Z", with the
 * Z, so the two sources disagreed about the meaning of their own
 * timestamps - and the code that matched them against each other
 * silently paired rows two hours apart, inside its own 30-minute
 * tolerance, without ever reporting a miss.
 *
 * Everything that turns a forecast hour into an instant goes through
 * here. A bare timestamp is UTC, because that is what was asked for and
 * what every producer in this project publishes; anything carrying its
 * own zone is respected as written.
 */

/** True when the timestamp already says what zone it is in. */
function hasExplicitZone(iso: string): boolean {
  return /[Zz]$|[+-]\d\d:?\d\d$/.test(iso);
}

/**
 * A forecast hour as a real instant.
 *
 * Returns an Invalid Date for unparseable input rather than throwing -
 * one malformed row must not take a whole page down - so callers that
 * care should check `Number.isFinite(d.getTime())`.
 */
export function parseForecastHour(iso: string): Date {
  return new Date(hasExplicitZone(iso) ? iso : `${iso}Z`);
}

/** The same instant in milliseconds, for comparisons and sorting. */
export function forecastHourMs(iso: string): number {
  return parseForecastHour(iso).getTime();
}

/**
 * The canonical way to write a forecast hour: always with its zone.
 *
 * Used when generating data files, so nothing downstream has to infer
 * what "2026-09-22T17:00" meant. Existing published files predate this
 * and still lack the Z, which is exactly why parseForecastHour above
 * keeps accepting both rather than demanding the new form.
 */
export function normaliseForecastHour(iso: string): string {
  return hasExplicitZone(iso) ? iso : `${iso}Z`;
}
