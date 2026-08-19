import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this as a project page under /FlyWeather/, not
  // the domain root - only apply that base for the actual production
  // build so `npm run dev`/preview and Playwright's page.goto("/") keep
  // working against root-relative paths locally.
  base: command === "build" ? "/FlyWeather/" : "/",
  plugins: [react()],
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
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
  },
}));
