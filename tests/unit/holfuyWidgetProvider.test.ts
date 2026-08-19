import { describe, expect, it } from "vitest";
import { buildHolfuyWidgetUrl, parseHolfuyWidgetHtml } from "../../src/providers/live/holfuyWidgetProvider.ts";

// Trimmed fixture captured from a real widget.holfuy.com response (station 126,
// Ravlunda) - see docs/DATA_SOURCE_AUDIT.md for the full investigation.
const REAL_FIXTURE_HTML = `
<html><head>
<script>
var stattr = {"id":126,"short_name":"Ravlu","country":"SE","o_s":65,"o_e":110,"o2_s":0,"o2_e":0,"w_s":50,"w_e":125,"w2_s":0,"w2_e":0,"style":"W"};var units =JSON.parse('{"speed":"m\\/s","temp":"C","height":"m"}');
</script>
</head>
<body>
<script>
	var owind=[[2.5,253],[3.1,246],[3.1,251],[3.1,252]];
</script>
<script>
var wind_dir_sensor=1;
  			kokInit(true);
			newWind(254,7,13.3,10,'23:23');
</script>
</body></html>
`;

describe("buildHolfuyWidgetUrl", () => {
  it("uses the public widget.holfuy.com embed endpoint, no password param", () => {
    const url = buildHolfuyWidgetUrl("126");
    expect(url).toContain("https://widget.holfuy.com/?");
    expect(url).toContain("station=126");
    expect(url).toContain("su=m%2Fs");
    expect(url).not.toContain("pw=");
    expect(url).not.toContain("password");
  });
});

describe("parseHolfuyWidgetHtml", () => {
  it("extracts direction, speed, and gust from the embedded newWind() call, converting km/h to m/s", () => {
    // newWind(dir, speed, temp, gust, time) per Holfuy's own widget
    // source (widget.holfuy.com/js/wind_kok.js) - NOT (dir, speed,
    // gust, temp, time), and speed/gust are always km/h regardless of
    // the su=m/s query param (that only affects the widget's own
    // on-canvas display conversion). This fixture's raw values are
    // speed=7 km/h, temp=13.3 (discarded), gust=10 km/h.
    const parsed = parseHolfuyWidgetHtml(REAL_FIXTURE_HTML);
    expect(parsed).not.toBeNull();
    expect(parsed?.windDirectionDeg).toBe(254);
    expect(parsed?.windSpeedMs).toBeCloseTo(7 / 3.6, 5);
    expect(parsed?.windGustMs).toBeCloseTo(10 / 3.6, 5);
    expect(parsed!.windGustMs).toBeGreaterThan(parsed!.windSpeedMs); // gust >= sustained speed, sanity check for the bug this fixes
  });

  it("extracts the recent-samples history from the owind array", () => {
    const parsed = parseHolfuyWidgetHtml(REAL_FIXTURE_HTML);
    expect(parsed?.recentSamples).toEqual([
      { windSpeedMs: 2.5, directionDeg: 253 },
      { windSpeedMs: 3.1, directionDeg: 246 },
      { windSpeedMs: 3.1, directionDeg: 251 },
      { windSpeedMs: 3.1, directionDeg: 252 },
    ]);
  });

  it("returns null (not a throw) when the expected pattern is absent", () => {
    expect(parseHolfuyWidgetHtml("<html><body>unexpected format</body></html>")).toBeNull();
  });

  it("returns null on malformed numeric data rather than NaN", () => {
    expect(parseHolfuyWidgetHtml("newWind(abc,7,13.3,10,'23:23');")).toBeNull();
  });
});
