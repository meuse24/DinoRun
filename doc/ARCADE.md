# Arcade typography and feedback

Build `2026-10-21.3`, worker cache `dino-run-v29`. Second iteration: the first
pass (build `.2`) kept system fonts and mostly static shadows; this pass adds
real arcade faces, event lettering and stronger, still anchored motion.

## Research and direction

- [Jonasson/Purho: Juice It or Lose It, GDC Europe 2012](https://gdcvault.com/play/1016789/Juice-It-or-Lose)
  and Jan Willem Nijman's (Vlambeer) "The Art of Screenshake": layered,
  event-driven responses to simple actions; small, short camera shake on hits.
  Applied as pop-in callouts, digit hops, letter drops/slams and 160–300 ms
  shake on smash, shield save, chili and boss clear.
- Classic cabinet conventions (Namco-era bitmap HUD faces, "SC/HI" counters,
  score tallies, LEVEL sweeps). Press Start 2P is modeled on that era's type.
- [MDN: Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
  and [web.dev: Canvas performance](https://web.dev/articles/canvas-performance):
  pre-render repeated drawing to an offscreen canvas. All glowing/outlined
  Canvas lettering is rasterised once per text, style and device scale; frames
  only transform cached sprites. No per-frame `shadowBlur` (this matters for the
  CPU-rasterised Android canvases noted in earlier performance work).
- [web.dev: Animations and performance](https://web.dev/articles/animations-and-performance):
  DOM effects animate only `transform`, individual `translate`/`scale` and
  `opacity`. Individual transform properties let a per-letter entrance run
  alongside the existing per-letter idle ripple without overriding it.
- [web.dev: prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion):
  all new movement is inside the existing motion gate; lettering stays.

## Fonts

Both faces are embedded as WOFF2 data URIs in `<style id="arcade-fonts">`, so
`file://` and offline play need no sibling file (~23 KB binary).

- **Dino Display** = Lilita One, Copyright (c) 2011 Juan Montoreano, SIL OFL 1.1.
  Titles, headings, START, callouts, banners, countdown.
- **Dino Pixel** = Press Start 2P, Copyright 2012 The Press Start 2P Project
  Authors, SIL OFL 1.1. HUD, score digits, kickers, tallies.

The unmodified font files carry their copyright/license names; the attribution
is also kept in the source header and in a preserved script comment, and
`npm run build` asserts it survives minification. The renderer requests both
faces at start-up; a lettering sprite drawn before a face is ready is not
cached, so the fallback never sticks.

## Player-facing changes

- Title: outlined gold/cream letters on a navy+ember extrusion, letters drop in
  with squash/stretch on menu entry, pulsing gold halo and two twinkling stars.
- START: display face with outline/depth, squash-stretch beat every 2.4 s, an
  inner light pulse and a light sweep. The button geometry and hit target never
  move; effects are clipped pseudo-elements without pointer events.
- Headings in the display face; kickers ("THE LEADERBOARD") in the pixel face.
  Highscore rows: display-face names, pixel ranks/scores, glowing first place.
- Canvas HUD: pixel face (`L`/`HI` 10 px, score 16 px), hard drop shadow at
  night. Every 100 points the score swells once, its digits hop in a wave and a
  soft glow fades; it stays readable and settles before the milestone ends.
  Portrait DOM HUD uses the same face and pops on milestones.
- Callouts: AIR JUMP!, FEATHER!, SHIELD!, SAVED!, CHILI BOOST!, SMASH! pop in
  with overshoot, wobble upward and fade (gradient fill, outline, extrusion,
  glow, gloss), coloured per power-up.
- LEVEL n / SPEED UP! banner sweeps in and out on each speed level (cosmetic,
  derived from `game.level` in `Runner`; hidden during countdown, record and
  boss notices).
- NEW HIGH SCORE! plaque pops, pulses and gets a clipped light sweep. Countdown
  digits and GO! use the lettering cache. STONE JAW trembles; BOSS CLEAR! pops.
- GAME OVER letters slam in one by one; the points count up on simulation time
  (pause/skip exact) in the pixel face. Reduced motion shows the total at once.

Score rules, physics, spawning, highscore eligibility and audio are unchanged.

## Repeatable verification

```powershell
$env:DINO_PLAYWRIGHT = 'D:/projects/pacman/node_modules/playwright/index.mjs'
node tests/arcade-type.mjs
node tests/attract-screen.mjs
node tests/game-over-flow.mjs
node tests/screen-transitions.mjs
node tests/game-contract.mjs
npm run build
node tests/release.mjs

$env:DINO_BROWSER = 'webkit'
$env:PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1'
node tests/arcade-type.mjs release/dino.html
node tests/attract-screen.mjs
```

`arcade-type.mjs` now also checks that both embedded faces load offline, the
pixel HUD face, the digit wave and its settling, callout overshoot/rise,
lettering sprite caching, the level banner and pausing of the new title/START
effects. Review captures were written to `output/arcade-fx/look/` (desktop,
portrait, landscape: menu, countdown, callouts, level, record, boss, night,
tally, Game over). Desktop/touch emulation only; physical Android frame times
were not measured in this iteration.


## Effects setting and delivery (2026-10-21.4)

Settings now offers a saved Arcade effects switch. On a fresh launch, a short
menu-only performance probe can disable the additional effects and show an
explanation; a manual choice takes precedence. The probe distinguishes a light
30 Hz cap from busy or frequently delayed frames. Deterministic tests feed
synthetic timing to verify those decisions; they do not establish phone speed.
The choice propagates into Help and gates Canvas lettering, digit waves and
event shake. Existing gameplay continues independently. Menu headings, cabinet
initials, lettering prewarming and coach/banner coordination are also refined.

Run `node tests/effects-setting.mjs [game.html]` for desktop/touch persistence,
effect gating, Help propagation and automatic decision coverage. It accepts
`DINO_BROWSER=webkit`. Publish the v30 worker together with the new HTML
as described in [UPDATES.md](UPDATES.md).

### Probe rule

After a warm-up (30 frames or 600 ms) the menu collects 90 frames, or decides
after 2 s with at least 15 frames. Effects switch off when the median interval
exceeds 24 ms while update+draw work exceeds 4 ms, or when the 90th-percentile
interval exceeds 40 ms. A fast result is not saved, so each launch re-probes; a
slow result is saved as `auto-off`; a manual choice is saved as `on`/`off` and
stops probing. The result is written to the optional test log (`effects-probe`).

### Frame-time measurements

Desktop Chromium headless, 1280x720, CDP CPU throttling, busy round (a callout
every 400 ms, banners, milestones, shake; no obstacles), mean FPS:

| CPU | Build .2 menu/play | .3 menu/play | .4 effects on | .4 effects off |
| --- | --- | --- | --- | --- |
| 1x | 60 / 60 | 60 / 60 | 60 / 60 | 60 / 60 |
| 4x | 21.1 / 20.3 | 20.5 / 16.4 | 21.5 / 20.5 | 23.9 / 27.0 |
| 6x | 9.6 / 9.5 | 8.5 / 7.4 | 12.3 / 9.5 | 13.3 / 13.3 |

The pixel-glyph HUD cache recovered the .3 gameplay loss. The probe kept effects
on at 1x (16.7 ms) and switched them off at 4x (median 50 ms, p90 67 ms).

Physical Galaxy S10e (SM-G970F, Android 12, Chrome 155) via the safe preview,
USB bridges and CDP (`node tests/android-effects.mjs`, report in
`output/arcade-fx/device/report.json`): the real first-launch probe measured
16.7 ms intervals, 0.4-0.5 ms work and kept effects on in both orientations.
Busy round with effects on/off: landscape 57.8/59.8 FPS (p95 16.8 ms, 3.7 %
frames over 20 ms with effects), portrait 60/59.8 FPS; menu 58.7-59.3 on,
59.8 off. Before sprite prewarming, landscape play was 55 FPS (p95 33.4 ms);
first-time blurred sprite rasterisation is now done in idle time. The device
run also showed the coach hint covering the LEVEL banner; banners now wait for
the hint. The runner restores rotation and clears only the preview origin's
worker/cache and the saved effects choice.
