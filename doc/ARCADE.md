# Arcade typography and feedback

Build `2026-10-21.2`, worker cache `dino-run-v28`.

## Research and direction

The reference games inform the hierarchy and timing, rather than supplying a
new font or copied artwork. The existing desert palette and offline HTML remain
the visual foundation.

- [2048's original stylesheet](https://github.com/gabrielecirulli/2048/blob/master/style/main.scss)
  separates large numbers from supporting labels, uses a brief overshoot on
  merges, and moves score additions upward. Applied here as a short milestone
  punch, a stronger score size, and a record badge entrance.
- [Hextris's original stylesheet](https://raw.githubusercontent.com/Hextris/hextris/gh-pages/style/style.css)
  uses viewport-relative title/score sizes and a separate highscore label/value
  hierarchy. Applied here as responsive title sizing and a larger current score.
- [Jonasson/Purho: Juice It or Lose It, GDC Europe 2012](https://gdcvault.com/play/1016789/Juice-It-or-Lose)
  demonstrates layered visual responses to simple game actions. Applied here as
  brief, event-driven emphasis for scores and records.
- [web.dev: Animations and performance](https://web.dev/articles/animations-and-performance)
  recommends transform/opacity for efficient web animation. The START beat and
  sheen animate those properties; text shadows and glows stay static. No font
  downloads, particle system or additional animation loop was added.
- [web.dev: prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion)
  describes CSS and JavaScript responses to the OS preference. Both DOM and
  Canvas decorative movement follow the existing live preference listener.

## Player-facing changes

- Larger gold/cream DINO RUN lettering, navy outline, layered extrusion, warm
  glow and a stronger tilt in the existing staggered letter wave.
- START has a larger cream label with depth, a brief beat every 4.8 seconds and
  a light sweep every 5.6 seconds. Its actual hit target stays fixed; the sweep
  cannot intercept input. Preview pause and covered-menu pause stop both effects.
- Supporting headings retain the existing entry/breathing animations and gain
  stronger weight, tracking and subtle static highlights, with a night variant.
- Current score: 18 logical pixels versus 14 for HI/level on Canvas; responsive
  15–18 pixels on the portrait DOM HUD. Tabular digits prevent changing widths.
- The existing 100-point event produces one short size/lift punch and a warm
  accent. The score stays readable throughout; the old blink was removed.
- The record badge gets a 420 ms scale punch and soft gold glow. GAME OVER is
  uppercase gold with depth, and its points are larger than supporting feedback.
- Reduced motion retains the typography and static glow, with no new decorative
  movement. Score rules, physics, highscore eligibility and audio are unchanged.

## Repeatable verification

```powershell
$env:DINO_PLAYWRIGHT = 'D:/projects/pacman/node_modules/playwright/index.mjs'
node tests/arcade-type.mjs
node tests/attract-screen.mjs
node tests/game-over-flow.mjs
node tests/screen-transitions.mjs
node tests/skill-client.mjs
node tests/game-contract.mjs
npm run build
node tests/release.mjs

$env:DINO_BROWSER = 'webkit'
$env:PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1'
node tests/arcade-type.mjs release/dino.html
node tests/attract-screen.mjs release/dino.html
```

`arcade-type.mjs` samples the START effects while checking invariant button
geometry and hit testing, preview pause, dynamic reduced motion, dark colors,
continuous Canvas score readability, milestone settling, and accessible score
labels. It captures menu/night/record screenshots in desktop, portrait and
compact landscape using isolated offline files. The existing suites cover
gameplay controls, ten attract layouts and round-end/dialog behavior.

Artifacts for this iteration are under `output/arcade/`; these are desktop and
touch emulation checks. Physical Android performance was not measured.
