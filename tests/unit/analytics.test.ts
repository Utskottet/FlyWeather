import { describe, expect, it } from "vitest";
import {
  analyticsScriptSpec,
  goatcounterEndpoint,
  installAnalytics,
  parseAnalyticsConfig,
} from "../../src/app/analytics.ts";

describe("parseAnalyticsConfig", () => {
  it("is off when nothing is configured", () => {
    expect(parseAnalyticsConfig(undefined, undefined)).toBeNull();
    expect(parseAnalyticsConfig("", "")).toBeNull();
  });

  it("is off when only half-configured, rather than erroring", () => {
    expect(parseAnalyticsConfig("goatcounter", undefined)).toBeNull();
    expect(parseAnalyticsConfig(undefined, "startvind")).toBeNull();
  });

  it("is off for an unrecognized provider - a typo must never break the app", () => {
    expect(parseAnalyticsConfig("plausible", "abc")).toBeNull();
  });

  it("accepts both supported providers, case- and whitespace-insensitively", () => {
    expect(parseAnalyticsConfig(" Cloudflare ", " tok3n ")).toEqual({
      provider: "cloudflare",
      token: "tok3n",
    });
    expect(parseAnalyticsConfig("GOATCOUNTER", "startvind")).toEqual({
      provider: "goatcounter",
      token: "startvind",
    });
  });
});

describe("goatcounterEndpoint", () => {
  it("expands a bare site code to its goatcounter.com count endpoint", () => {
    expect(goatcounterEndpoint("startvind")).toBe("https://startvind.goatcounter.com/count");
  });

  it("passes a full URL through untouched, for custom GoatCounter domains", () => {
    expect(goatcounterEndpoint("https://stats.startvind.se/count")).toBe("https://stats.startvind.se/count");
  });
});

describe("analyticsScriptSpec", () => {
  it("matches Cloudflare's documented beacon snippet", () => {
    expect(analyticsScriptSpec({ provider: "cloudflare", token: "abc123" })).toEqual({
      src: "https://static.cloudflareinsights.com/beacon.min.js",
      attributes: { defer: "", "data-cf-beacon": '{"token":"abc123"}' },
    });
  });

  it("matches GoatCounter's documented snippet", () => {
    expect(analyticsScriptSpec({ provider: "goatcounter", token: "startvind" })).toEqual({
      src: "https://gc.zgo.at/count.js",
      attributes: { async: "", "data-goatcounter": "https://startvind.goatcounter.com/count" },
    });
  });
});

describe("installAnalytics", () => {
  function freshDocument(): Document {
    return document.implementation.createHTMLDocument("test");
  }

  it("injects nothing at all when analytics is off", () => {
    const doc = freshDocument();
    expect(installAnalytics(null, doc)).toBeNull();
    expect(doc.querySelectorAll("script")).toHaveLength(0);
  });

  it("appends the provider's script with its attributes", () => {
    const doc = freshDocument();
    const script = installAnalytics({ provider: "goatcounter", token: "startvind" }, doc);
    expect(script).not.toBeNull();
    expect(script!.src).toBe("https://gc.zgo.at/count.js");
    expect(script!.getAttribute("data-goatcounter")).toBe("https://startvind.goatcounter.com/count");
    expect(doc.head.querySelectorAll("script")).toHaveLength(1);
  });

  it("is idempotent - StrictMode's double invocation must not count twice", () => {
    const doc = freshDocument();
    installAnalytics({ provider: "cloudflare", token: "abc123" }, doc);
    expect(installAnalytics({ provider: "cloudflare", token: "abc123" }, doc)).toBeNull();
    expect(doc.head.querySelectorAll("script")).toHaveLength(1);
  });
});
