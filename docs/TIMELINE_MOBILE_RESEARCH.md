# Time slider research — Windy's two timelines

Written 2026-10-06 in response to: *"our time slider, more on the mobile than
web, needs higher resolution — it's hard to look at a specific time on a
specific day. Windy uses two types of slider, one for web and one for
mobile; the mobile one is pretty sleek."*

This is a **research deliverable only**. No app code was changed. It records
what Windy actually ships (read from its own client, not guessed), why it
solves the resolution problem, and a concrete way to bring the useful parts
into Startvind's `TimeSlider`.

---

## 0. TL;DR

- Windy really does ship **two separate timeline components**, switched by
  device: `progress-bar` on desktop and `mobile-calendar` on phones.
- The mobile one is a **horizontally scrollable multi-day strip**: each day
  gets its own fixed-width column (Windy's default is 160 px), you flick/scroll
  left–right to reach any day, a yellow line marks "now", and an orange chip
  above the strip reads the selected day + clock time continuously.
- Resolution comes from **space per hour**, not from a smarter range input:
  160 px per day ≈ **9 minutes of forecast per pixel**, versus our current
  phone slider's ~5 px per hour (**12 minutes per pixel, and only 360 px of
  travel for 72 h**).
- Windy's desktop bar solves the same problem a second way: a **non-linear
  time scale** that gives the first days far more pixels than the last ones.
- Recommendation: build a phone-specific scrollable day strip (keep the
  desktop bar, add hover-scrub + non-linear spacing to it). Details in §5–6.

---

## 1. Confirmed: two different sliders, chosen by device

Evidence from Windy's live client (`index.js`, v51.3.1):

```js
tileLayer: new fx({
  ident: "tileLayer",
  userControl: S ? "mobile-calendar" : "progress-bar",   // S = is mobile/tablet
  requiresFullRenderParams: true,
}),
```

Both are mounted through the same plugin wrapper, which binds them to
**different DOM anchors**:

```js
rf = class extends q {
  constructor(e) {
    e.attachPoint = `[data-plugin="bottom-controls-${S ? "mobile" : "desktop"}"]`;
    e.className   = e.className || "plugin-bottom";
    e.pane        = "small-bottom";
    e.neverClose  = true;
    ...
  }
}
```

and the page itself ships both anchors:

```html
<section id="bottom-wrapper">
  <span data-plugin="bottom-controls-mobile"></span>
  <span data-plugin="bottom-below-controls-mobile"></span>
  ...
</section>
<span data-plugin="bottom-controls-desktop"></span>
```

So the two experiences are genuinely different code, not one responsive
component. That matches what the user described.

Shared data model behind both:

- A **calendar** object built from the model's `minifest` holds
  `timestamps[]`, `days[]` (each with `start/end/middayTs/hasForecast/premium`),
  `start`, `end`, `refTimeTs`.
- A single global **`timestamp`** is the selected time; both sliders read and
  write it.
- A **play/pause** button animates `timestamp` through `timestamps`.
- Premium hours (`premiumStart`/`premiumEnd`) grey the map
  (`premium-calendar` body class) — not relevant to us.

---

## 2. Desktop timeline — `progress-bar`

Source: `plugins/progress-bar.js` + global `index.css`.

Structure:

```
.progress-bar
  .progress-line            ← the 6 px ruler (10 px transparent border = ~26 px touch target)
    .avbl                   ← full-width dark track
    .played                 ← white fill, width = selected timestamp %
    <i>                     ← "now" marker, left = now %
  .timecode.ghost-timecode  ← hover scrub preview chip
  .timecode.desktop-timecode← the real, draggable chip
.pb-calendar                ← day-label row underneath
```

Key behaviours:

- **Hover anywhere → ghost chip.** `mousemove` maps the cursor x to a time,
  formats it, and shows a grey chip at the cursor (`opacity` 0→1, hidden on
  `mouseleave`). Desktop only (`isMobileOrTablet ? undefined : …`).
- **Click → jump.** `timestamp = clamp(scale.invert(px), refTime, end)`.
- **Drag the chip.** The chip is a `Drag` handle; while dragging,
  `timestamp = clamp(x.invert(px + 25), …)` and the chip's `left` follows the
  timestamp percentage.
- **Live "now" marker.** `setInterval(..., tsMinute)` recomputes its left
  percentage every 60 s — the same idea as our existing `useNow()` NOW marker.
- **Day labels adapt to width.** `.pb-calendar` is a 26 px row of day cells;
  each cell's width is the day's percentage of the timeline. A day shows its
  long name > 140 px, short name > 55 px, nothing below that; if any day is
  < 20 px the whole row hides. Weekends are tinted (`--color-orange-light`).
- **Width scales with horizon:** max-width 500 px (<3 days), 800 (<5),
  1100 (<10), 1800 (≥10).
- **Play/pause** toggles the animation.

### The interesting bit — a non-linear time scale

`_shared-format-calendar-time.js` (`W`, exported as `a`) is the function that
maps timestamp ↔ 0–100 % along the bar. It is deliberately **not linear**:

| forecast days | mapping |
|---|---|
| `< 6`  | linear, `start→end` = `0→100 %` |
| `6–9`  | first 30 % of days → `0–40 %`; rest → `40–100 %` |
| `≥ 10` | day 1 → `0–20 %`; days 2–4 → `20–40 %`; rest → `40–100 %` |

Near-term hours (the ones a pilot actually acts on) get up to 5× the pixels
per hour that distant days get, while the far horizon still exists on the same
bar. This is the desktop answer to "hard to hit a specific time".

---

## 3. Mobile timeline — `mobile-calendar`

Source: `plugins/mobile-calendar.js` and
`plugins/_shared-mobile-calendar-timecode.js`.

Structure:

```
.mobile-calendar                        ← bottom bar; margin-bottom:-80px when
  logo                                     collapsed, -40px when expanded
  section
    .mobile-days                        ← horizontally scrollable strip
      .mobile-days__wrapper
        .mobile-days__day-wrapper       ← one per day, 160px wide
          .day  ("Tue" / "Tuesday", premium flag)
          ul.hours  (03 06 09 … 21, every 3h, opacity 0 → .6 when expanded)
      .mobile-days__now                 ← yellow 3px "now" line, opacity .4
    .timecode (orange chip, centered, min-width 80px, pointer below)
    tile-layer-loader
  .play-pause                           ← 38px button, left
```

Key behaviours:

- **Collapsed by default.** The bar sits mostly below the fold and slides up
  when you interact (`.mobile-calendar--expanded`), revealing the hour labels
  at 60 % opacity. Tapping is the reveal gesture.
- **One fixed-width column per day.** `widthOfTheDay` defaults to **160 px**
  (prop, overridable). `.mobile-days__day-wrapper` is `width/min-width: 160px`.
- **Scroll position ↔ time is a straight linear scale:**

  ```js
  scaleLinear({ domain: [0, widthOfTheDay * days.length], range: [start, end] })
  ```

  `scrollLeft 0` = calendar start; `scrollLeft = 160·n` = end of day *n*.
  Inside a day, **1 px ≈ 9 minutes**. Writing the timestamp scrolls the strip
  to it; scrolling the strip writes the timestamp back (debounced, with a
  guard flag so the two don't fight).
- **Hour labels every 3 h** (`hoursSpacing` default 3, loop 3→21), laid out
  as a table across the day width so each label sits near its real hour.
- **"Now" line** is a separate absolutely-positioned yellow marker, recomputed
  from `Date.now()`, independent of selection (same separation we already have
  between `nowPositionFraction` and `selectedIndex`).
- **Momentum scrolling.** `_shared-draggable-div.js` hand-rolls flick inertia:
  velocity clamped to ±500 px/s, decay `-v·e^(−t/325)`, stops below 0.5 px
  after ≤3 s, driven by `requestAnimationFrame`. On a phone the browser's own
  touch scrolling already does this; the custom code exists so **mouse-drag**
  on desktop-ish mobile also flicks.
- **The chip is a readout, not the handle.** Unlike the desktop version, the
  phone gesture is scroll-the-strip; the orange `timecode` chip sits centered
  above and just states the selected day/time.
- The **1h / 3h step** toggle is a separate control (Windy staff: *"we offer
  button for the forecast step … when 1h is active, 3h button is offered"*).
  It is the *temporal* resolution lever; the day strip is the *spatial* one.

---

## 4. Why this fixes our problem

Our current `TimeSlider` (`src/components/TimeSlider/TimeSlider.tsx`):

- a single native `<input type="range">` over `hours[]` (73 values, NOW→+72 h);
- `selectedFraction = selectedIndex / maxIndex`, so on a 360 px phone the
  whole 72 h window is about 334 px of thumb travel → **~4.6 px per hour**;
- day (9 px) / six-hour (6 px) / hour (3 px) ticks all share that same 334 px,
  so at 360 px the day labels are ~26 px apart and individual hour ticks are
  sub-pixel collisions;
- the label chip helps you *read* the selection but not *hit* it — a
  1-hour nudge is a ~5 px drag, well under a comfortable touch target.

Windy's mobile model changes the arithmetic completely:

| | Startvind today (phone) | Windy mobile (per day) |
|---|---|---|
| space per hour | ~4.6 px | ~6.7 px (160 px / 24 h) |
| minutes per pixel | ~13 min | ~9 min |
| days reachable | 4 (partial) jammed into one 360 px track | each day its own scrollable column |
| selection feedback | a chip that can be dragged | continuous chip over a scrollable strip |

And because 72 h is only ~3 full days, each day can be given **more** width
than Windy needs: 300 px/day → 12.5 px/hour → **~5 minutes per pixel**, with
the whole horizon about three phone-screens wide, which is a pleasant flick.
That is a ~3× finer pointer than today, on the axis that actually matters
(today/tomorrow afternoon).

---

## 5. What to borrow

### 5.1 Mobile (the main ask) — scrollable day strip

Replace the phone `TimeSlider` with a mobile-specific component:

1. **Group `hours[]` into local calendar days** (Europe/Stockholm, DST-safe —
   reuse the existing `Intl.DateTimeFormat` helpers in `domain/timeAxis.ts`).
   A day is `{ label, shortLabel, hours: [{ index, hour }] }`.
2. **Render one column per day**, width e.g. 300 px (tunable). Each column:
   - day name at the top (`SAT` / `Sat`), weekend tint optional;
   - an hour row with a tick + optional label every 3 h (`03 06 09 … 21`) using
     `classifyTick`/`tickHourLabel`;
   - the night/day sky band painted **behind that day's hours** using the
     existing `buildSkyBandBlocks`/`skyBandGradient` output (per-day is more
     legible than one compressed 72 h strip);
   - a click/tap target per hour cell (≥ 44 px tall) so a specific hour can be
     tapped, not just scrolled to.
3. **Horizontal scroll = time.** Map `scrollLeft ↔ selectedIndex` with a
   `ResizeObserver`-measured travel (same pattern the desktop bar already
   uses), guarding against the scroll↔state feedback loop.
4. **Snap to the hour** (`scroll-snap-type: x mandatory`) so the selected hour
   lands cleanly; keep index semantics unchanged (`selectedIndex` is still
   what the rest of the app consumes).
5. **The chip stays**: reuse `formatSliderLabel` and the existing chip styling,
   pinned above the strip, centered, showing `"NOW · Sat 20:00"` / `"Sat 14:00"`.
6. **The now marker stays**: reuse `nowPositionFraction(hours, now)` placed as
   a vertical line at the real clock position in the strip.
7. **Keep `useNow()`** so the now line drifts, independent of selection.

This preserves every downstream contract (`hours`, `selectedIndex`,
`onChange`) — only the phone presentation changes.

### 5.2 Desktop — keep the bar, steal two ideas

- **Hover scrub preview**: a grey "ghost" chip following the cursor showing the
  time under it, click to jump. Cheap, and it makes the existing wide bar feel
  far more precise.
- **Non-linear spacing**: give NOW→+24/36 h more of the bar and compress the
  far end. We do not need Windy's exact 0/20/40/100 breakpoints for a 72 h
  window; something like first 24 h → 45–50 % of the width, remaining 48 h →
  the rest, keeps "this afternoon" precise while still showing the horizon.
  This touches tick positioning, the NOW marker, and the drag math — do it as a
  follow-up after the mobile work, not in the same change.

### 5.3 Do **not** copy

- Windy's momentum/`requestAnimationFrame` inertia code. Native touch scrolling
  on a phone already has inertia; only add a pointer-drag fallback for mouse if
  actually needed.
- The premium greying, the logo, the tile-layer loader, the 1h/3h toggle —
  ours is already hourly (`SLIDER_STEPS = 72`), so a step toggle buys nothing.

---

## 6. Implementation sketch (React)

Keep the desktop `TimeSlider` as-is; add a sibling selected by the existing
`useIsCompact()` (`COMPACT_MAX_WIDTH_PX = 760`), so only one slider is in the
DOM at a time (the same reason `useIsCompact` exists today):

```
src/domain/timeAxis.ts          + groupHoursByLocalDay(hours) and
                                  dayColumnLayout(days, pxPerDay) pure helpers
src/components/TimeSlider/
  TimeSlider.tsx                (desktop, unchanged initially)
  MobileTimeSlider.tsx          (new: scroll strip + chip + now line)
tests/unit/timeAxis.test.ts     + day grouping, DST, px↔index mapping
tests/e2e/time-slider.spec.ts   + scroll→label, hour tap, 360/390/430 overflow
```

Pure helpers worth unit-testing (no DOM):

- `groupHoursByLocalDay(hours)` → days with correct `index` boundaries, stable
  across the 2026-03-29 and 2026-10-25 DST transitions (mirror the existing
  `nowPositionFraction` tests).
- `indexFromScrollLeft(scrollLeft, pxPerDay)` / `scrollLeftForIndex(index, …)`
  → inverse of each other, clamped, total.

Accessibility, non-negotiable:

- The strip is `role="slider"` (or a group of buttons) with `aria-valuemin/max/now`
  and `aria-valuetext` = `formatSliderLabel(...)`.
- Arrow keys move one hour; Home/End jump to NOW/+72 h.
- Provide a visually-hidden native `<input type="range">` as the keyboard/AT
  path if the custom widget can't cover every case — simplest is to keep the
  existing range input rendered off-screen and drive it from the strip.
- `prefers-reduced-motion`: no smooth `scrollTo`, no animated chip.

Performance: 73 items and 4 columns — negligible. Measure on a real phone
anyway, per §26.

---

## 7. Decisions taken (2026-10-06)

The owner chose the **day strip, ~300 px/day + snap** direction, and it is
now implemented:

1. **Day column width** — one fixed cell per hour at
   `MOBILE_HOUR_WIDTH_PX = 13px`, so a full 24-hour day is ~312 px
   (~13 px/hour, ~5 min/px). Wider than Windy's 160 px/day on purpose:
   with only ~3 forecast days, reachability beats fitting more days on
   screen.
2. **Snap vs continuous** — snap to whole hours, via CSS
   `scroll-snap-type: x mandatory`; the selected hour is recentred under a
   fixed playhead.
3. **Tap-to-select hours** — implemented: every hour cell is a tap target.
4. **Desktop non-linear scale / hover-scrub** — deliberately deferred; the
   desktop bar is a separate follow-up.
5. **Range input** — kept off-screen as the keyboard/AT path, sharing the
   one `selectedIndex` value; the desktop control is unchanged.

Unresolved, to revisit from real use: how the day header reads when the
strip is centred mid-day (it is left-aligned to the day column, so only its
tail is visible), and whether a future "today / tomorrow" quick-jump is
worth adding on top of free scrolling.

---

## 8. Sources (all read 2026-10-06)

Windy's client is minified but its structure and CSS class names are readable
directly:

- `https://www.windy.com/` — server HTML, `bottom-controls-mobile` /
  `bottom-controls-desktop` anchors.
- `https://www.windy.com/v/51.3.1.ind.c170/index.css` — `.progress-bar`,
  `.timecode`, `.switch-mobile-wrapper`, `#bottom-wrapper`, `.premium-calendar`.
- `https://www.windy.com/v/51.3.1.ind.c170/index.js` — plugin registry:
  `userControl: S ? 'mobile-calendar' : 'progress-bar'`; the plugin wrapper
  that binds to the two anchors.
- `https://www.windy.com/v/51.3.1.ind.c170/plugins/progress-bar.js`
- `https://www.windy.com/v/51.3.1.ind.c170/plugins/mobile-calendar.js`
- `https://www.windy.com/v/51.3.1.ind.c170/plugins/_shared-mobile-calendar-timecode.js`
  — the day strip and chip (160 px/day, 3 h labels, scroll↔time scale).
- `https://www.windy.com/v/51.3.1.ind.c170/plugins/_shared-timecode.js` —
  the desktop draggable chip.
- `https://www.windy.com/v/51.3.1.ind.c170/plugins/_shared-draggable-div.js`
  — momentum scroll (`±500 px/s`, `e^(−t/325)`).
- `https://www.windy.com/v/51.3.1.ind.c170/plugins/_shared-format-calendar-time.js`
  — the non-linear `start→0/20/40/100 %` time scale.
- Windy Community, "Where is the 1h/3h setting?" (`topic/33493`) — the
  temporal step lever, and Windy staff confirming a differently-styled button
  on mobile.
- Windy Community, `tags/time slider` — staff reply that a 3 h step button is
  offered when 1 h is active.

Startvind files referenced: `src/components/TimeSlider/TimeSlider.tsx`,
`src/components/BottomBar/BottomBar.tsx`, `src/domain/timeAxis.ts`,
`src/domain/skyBand.ts`, `src/app/useNow.ts`, `src/app/useIsCompact.ts`,
`src/app/App.css`, `MASTER_SPEC.md` §6/§15.
