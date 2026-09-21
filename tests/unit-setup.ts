/**
 * Every test runs in Europe/Stockholm, whatever the machine is set to.
 *
 * This app formats and reasons in Swedish local time throughout, and one
 * class of bug is only visible in a zone that is not UTC: a bare
 * timestamp like "2026-09-22T17:00" parses as UTC on a UTC machine and
 * as local time everywhere else, so the guards in forecastTime.test.ts
 * would pass on CI while the bug shipped. Pinning the zone makes those
 * tests mean the same thing on a developer's laptop and on a runner.
 *
 * Assigning process.env.TZ resets Node's cached zone, so this takes
 * effect for Date even though the process has already started - and it
 * is done here, before any test module is imported.
 */
process.env.TZ = "Europe/Stockholm";

/**
 * jsdom has no ResizeObserver, and components that measure their own
 * layout (TimeSlider's marker, SiteMap's bottom bar) legitimately use it.
 * A no-op stand-in lets those components mount in unit tests; anything
 * that depends on real measured sizes belongs in an e2e test, where a
 * real browser reports real boxes.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
}
