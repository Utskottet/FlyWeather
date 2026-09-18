import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { siteWriterPlugin } from "./scripts/siteWriterPlugin.ts";

export default defineConfig(() => ({
  // Served from the domain root now that startvind.se points here, rather
  // than from /FlyWeather/ as a GitHub Pages project page.
  //
  // This is not cosmetic. Every asset URL is baked in at build time, so a
  // base that does not match where the site is actually served 404s every
  // script and stylesheet - a blank page, not a degraded one. public/CNAME
  // is what tells GitHub Pages the domain, and the two must change
  // together: the old /FlyWeather/ path keeps working because Pages
  // redirects a project URL to the custom domain once one is set.
  base: "/",
  // siteWriterPlugin is `apply: "serve"`, so the in-app site editor can
  // write real files into sites/ while you run the app locally and never
  // exists in a production build - GitHub Pages has no server to run it.
  plugins: [react(), siteWriterPlugin(__dirname)],
  optimizeDeps: {
    // MapLibre GL ships its own web worker as a separate file
    // (maplibre-gl-worker.mjs) for off-main-thread tile parsing; Vite's
    // esbuild-based dep pre-bundler breaks that worker's own import
    // resolution, causing it to 404 in dev and silently stall map
    // loading (confirmed via a diagnostic spec - console showed
    // `net::ERR_FAILED` for maplibre-gl-worker.mjs). Excluding it from
    // pre-bundling is MapLibre's own documented workaround for Vite.
    exclude: ["maplibre-gl"],
  },
  build: {
    rollupOptions: {
      // gallery.html is a dev-only fixture harness for the WindRose
      // component (Playwright visual checks); kept out of the app's
      // normal navigation but still built so it stays working.
      input: {
        main: resolve(__dirname, "index.html"),
        gallery: resolve(__dirname, "gallery.html"),
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/unit-setup.ts"],
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
  },
}));
