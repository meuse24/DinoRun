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
