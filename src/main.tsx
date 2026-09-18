import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { installAnalytics, parseAnalyticsConfig } from "./app/analytics.ts";
import "./index.css";

// Injected before the app mounts so a visit is counted even if the map
// itself later fails to load. A no-op unless both env vars are set - see
// app/analytics.ts and .env.example.
//
// The env read lives here rather than inside analytics.ts so that module
// stays free of Vite's `import.meta.env`: tests/unit/analytics.test.ts
// imports it from the tsconfig.node.json project, which deliberately
// doesn't load vite/client's types.
installAnalytics(
  parseAnalyticsConfig(import.meta.env.VITE_ANALYTICS_PROVIDER, import.meta.env.VITE_ANALYTICS_TOKEN),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
