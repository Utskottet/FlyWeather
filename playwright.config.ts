import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  /*
    One worker. Every test in this suite drives a live WebGL map, and
    several assert on what the canvas actually painted - that particles
    moved between two frames, that changing height changed the field.
    Running those in parallel puts several GPU contexts in contention on
    one machine, and the symptom is two frames coming back identical
    because the compositor stalled rather than because the animation is
    broken. That is a false failure about the most expensive thing to
    debug, so the suite trades wall-clock time for trustworthy results.
  */
  workers: 1,
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:5173",
  },
});
