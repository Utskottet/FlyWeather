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
