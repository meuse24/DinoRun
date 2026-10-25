# Embedded game architecture

The game remains one HTML file, with no build step or required runtime imports.
The optional song and hosted installation assets keep their existing roles.

## Boundaries

- `Game` and its entities own fixed-step simulation and logical world dimensions.
- `Renderer` reads the simulation; its effects and caches remain presentation.
- `HighscoreController` coordinates `HighscoreStore` and `HighscoreApi`; view
  changes and round eligibility are reported through callbacks.
- `HighscoreView` owns DOM rendering, name-picker input, dialog and focus.
- `Runner` connects these components and the browser/input/audio adapters.
- `BonusFlightView` maps the portrait DOM score to drawing coordinates during
  bonus tallies. It owns the temporary transparent flight layer; the renderer
  supplies the shared artwork. Simulation and payments remain in `Game`.

No framework, dependency container, general event bus or additional packaging is
needed for these two boundaries.

## Small maintenance refactoring (2026-10-21.13)

`ScreenPresenter.restoreAfterDialog()` restores pause, canvas sizing and rendering
before the caller resolves its return-focus target. Settings and HighscoreView
share this sequence. Their close-event guards, highscore generations, Help
history and focus-target selection remain with the owning views.

The DOM-free controller test selects named declarations from the game's immediate
IIFE scope using Acorn's syntax tree. It no longer depends on indentation, section
comments or single-line arrow functions. Missing/ambiguous declarations fail
explicitly. Acorn is a pinned development dependency; standalone play adds no
runtime dependency. A regression exercises qualification and offline saving after
reformatting and checks missing/duplicate declaration diagnostics.

## Validation

Use `DINO_PLAYWRIGHT` to select an installed Playwright ESM entry if needed.
Run these commands with the default Chromium, then with `DINO_BROWSER=webkit`:

```powershell
node tests/architecture.mjs
node tests/game-contract.mjs
node tests/jump-feather.mjs
node tests/render-cache.mjs output/architecture/baseline.html
```

Before editing, save a matching baseline HTML from Git. The original
2026-10-15 comparison used `c0eacdd:dino.html`; do not assume that old build
remains compatible with later gameplay changes. The comparison script requires that saved file; the other
tests do not. On this Windows installation, WebKit needs
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` to bypass its broken host validator;
tests still launch the actual WebKit engine. See `FEATHER.md` for setup details.

Run `node tests/skill-client.mjs` for the installed develop-web-game action loop.
Set `DINO_TEST_OUTPUT=output/architecture` for lifecycle, comparison and client
artifacts; the architecture tests add engine subdirectories. Feather tests write
to `output/feather`. All tests isolate or disable live highscore requests.

Workflow cases cover qualification/ties, cancellation, duplicate submission,
local fallback, rejected names, retries using the same round ID, late responses
during a new save, and online-list refresh. Integration cases verify that both
early and late online qualification automatically open the name dialog only
after the death animation. Rotation preserves score, timers and powerups.

The visual comparison uses a fresh browser process for each version/configuration
to isolate its long benchmarks and graphics resources. PNG exports are checked
before decoding, including dimensions/context-loss diagnostics on failure. Image
tolerances and deterministic trace comparisons are unchanged.

Build `2026-10-15.6` passed final verification on 2026-10-16 in Chromium
151.0.7922.34 and WebKit 26.5: 11 architecture scenarios and seven lifecycle
scenarios per engine, feather tests in three layouts per engine, and the skill
action client. All 140 comparison scenes are pixel-identical to `c0eacdd`;
five 12,000-frame simulation/effect traces per engine match the baseline.
Screenshots were inspected. No physical-device rerun was performed for this
refactoring; the Android preview remains stopped.


## Simulation phases (2026-10-24.12)

`Game.update()` owns fixed-step validation, clocks, player/death/jump-buffer
updates and the final meter/step event. `updatePlaying()` schedules the boss
before Chili, then advances scenery and the active world. `updateWorld()`
updates distance/score/life milestones, obstacles, pickups and night, resolves
ordinary obstacles before the boss, then checks records and section bonuses.
`updatePickups()`, `resolveObstacleCollisions()` and `resolveBossCollision()`
keep those rules together without introducing another state owner.

This order is intentional: life milestones can protect a contact on the same
frame, pickups can supply protection before collision, and synchronous event
listeners still see the same intermediate states. Preserve random consumption,
spawn-corridor checks and post-crash guards when changing a phase.

Feather and shield share `advancePickup()` (movement and swept collection test)
and `pickupSpawnIsClear()` (obstacle/collectible clearance). Charge, consume,
expiry and respawn stay in their respective classes. Collection dimensions
and the asymmetric feather/shield spacing remain explicit; these helpers do
not generalize Chili or berry placement.
