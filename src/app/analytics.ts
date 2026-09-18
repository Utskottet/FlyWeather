/**
 * Optional visitor counting, off by default.
 *
 * Startvind is a static GitHub Pages site, so it has never had any
 * traffic measurement at all - Pages publishes no stats of its own and no
 * counting script was ever added. This module adds one, but deliberately
 * ships *inert*: with no configuration the app injects nothing, makes no
 * third-party request, and behaves exactly as it did before. Counting
 * starts only once a provider and token are configured (see
 * .env.example), which is a settings change in the deploy workflow, not a
 * code change.
 *
 * Both supported providers are cookieless and store no personal data, so
 * neither needs a consent banner under GDPR - that is the whole reason
 * this file supports these two and not the usual analytics suspects. The
 * token is public either way: it is visible in the page source of every
 * site using these products, so it is not a secret and does not belong in
 * GitHub Secrets (see the workflow's repository *variables* instead).
 *
 * The provider choice was deliberately deferred - this exists so that
 * choice later costs one pasted token rather than an implementation.
 */

export type AnalyticsProvider = "cloudflare" | "goatcounter";

export interface AnalyticsConfig {
  provider: AnalyticsProvider;
  /**
   * Cloudflare: the beacon token from the Web Analytics dashboard.
   * GoatCounter: either the bare site code (`startvind`, expanded to
   * https://startvind.goatcounter.com/count below) or a full endpoint URL
   * if the site lives on a custom GoatCounter domain.
   */
  token: string;
}

/**
 * Validates raw env values into a config, or null when analytics should
 * stay off. Null is the normal, fully-supported state - an unset,
 * half-set (provider but no token), or unrecognized provider all mean
 * "off" rather than an error, because a mistyped analytics setting must
 * never be able to break the actual weather app.
 */
export function parseAnalyticsConfig(
  provider: string | undefined,
  token: string | undefined,
): AnalyticsConfig | null {
  const p = provider?.trim().toLowerCase();
  const t = token?.trim();
  if (!p || !t) return null;
  if (p !== "cloudflare" && p !== "goatcounter") return null;
  return { provider: p, token: t };
}

/** Where GoatCounter's count endpoint lives for a given token. */
export function goatcounterEndpoint(token: string): string {
  return token.includes("://") ? token : `https://${token}.goatcounter.com/count`;
}

interface ScriptSpec {
  src: string;
  attributes: Record<string, string>;
}

/**
 * The exact script element each provider documents. Kept as data (rather
 * than inlined into the DOM call below) so the shape can be asserted in
 * tests without a real document or a real network request.
 */
export function analyticsScriptSpec(config: AnalyticsConfig): ScriptSpec {
  if (config.provider === "cloudflare") {
    return {
      src: "https://static.cloudflareinsights.com/beacon.min.js",
      attributes: { defer: "", "data-cf-beacon": JSON.stringify({ token: config.token }) },
    };
  }
  return {
    src: "https://gc.zgo.at/count.js",
    attributes: { async: "", "data-goatcounter": goatcounterEndpoint(config.token) },
  };
}

/**
 * Injects the configured provider's script, or does nothing at all when
 * analytics is unconfigured. Returns the element (or null) so callers and
 * tests can tell which happened. Safe to call more than once: a second
 * call is a no-op, which matters because React 19's StrictMode
 * double-invokes effects in development.
 */
export function installAnalytics(
  config: AnalyticsConfig | null,
  doc: Document = document,
): HTMLScriptElement | null {
  if (config === null) return null;
  if (doc.querySelector("script[data-startvind-analytics]")) return null;

  const spec = analyticsScriptSpec(config);
  const script = doc.createElement("script");
  script.src = spec.src;
  script.setAttribute("data-startvind-analytics", config.provider);
  for (const [name, value] of Object.entries(spec.attributes)) {
    script.setAttribute(name, value);
  }
  doc.head.appendChild(script);
  return script;
}
