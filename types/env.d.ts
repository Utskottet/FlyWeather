/// <reference types="vite/client" />

/**
 * Typed build-time configuration. Declared here rather than inline so both
 * TypeScript projects see it - the app and the tests do not share an
 * `include` (see window.d.ts for the same reasoning).
 */
interface ImportMetaEnv {
  /**
   * Base URL of the publishing Worker, e.g.
   * https://startvind-editor.<subdomain>.workers.dev
   *
   * Set, the site editor publishes through it: the Worker authenticates
   * the operator and commits to the GitHub repository, so no GitHub
   * credential is ever present in this bundle or in the browser. Unset,
   * the editor falls back to writing straight to disk under `npm run dev`,
   * and does not exist at all in a built copy.
   */
  readonly VITE_EDITOR_API_URL?: string;
  readonly VITE_SOARING_BASE_URL?: string;
  readonly VITE_ANALYTICS_PROVIDER?: string;
  readonly VITE_ANALYTICS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
