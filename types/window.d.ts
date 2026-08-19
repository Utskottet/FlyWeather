import type { Map as MapLibreGLMap } from "maplibre-gl";

// Exposes the live map instance on window - a common, harmless debugging
// pattern (many map demos do `window.map = map`) that doubles as a
// stable hook for E2E tests to read center/zoom/bearing and a "has the
// map finished its first load" flag, since MapLibre's WebGL canvas has
// no per-tile DOM class to wait on the way Leaflet's tiles did. Lives in
// its own ambient .d.ts (rather than inline in MapLibreMap.tsx) so both
// the app (tsconfig.app.json) and test (tsconfig.node.json) TypeScript
// projects see it - they don't share an `include` otherwise.
declare global {
  interface Window {
    __flyweatherMap?: MapLibreGLMap;
    __flyweatherMapLoaded?: boolean;
  }
}

export {};
