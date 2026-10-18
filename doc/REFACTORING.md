# Refactoring plan: one standalone HTML

## Contract

- `dino.html` remains the complete playable game, with inline CSS, artwork,
  guide and JavaScript. No build step, external modules or runtime libraries.
- Opening a copy through `file://` works offline without sibling files.
  `dino-jump-jump.mp3` is optional. Online scores and hosted PWA installation
  remain progressive enhancements.
- Preserve appearance, input behavior, fixed-step physics, random consumption,
  score rules, render caches and Chromium attribution.
- Development tests and documentation may live outside the HTML.

## Implementation sequence

1. **Protect the contract.** Add baseline-independent browser regression tests
   for start/jump/duck, death/restart, settings/help pauses, mode records,
   session reset, blocked storage, online failure, portrait/landscape and an
   isolated offline `file://` copy. Check client/server score-rule parity.
   Retain the existing deterministic and visual comparison tests.
2. **Clarify game state and preferences.** Factor shared round reset operations
   while keeping session-only resets explicit. Give saved mode and per-mode
   records a dedicated internal component.
3. **Clarify browser responsibilities.** Move browser lifecycle, pause reasons,
   motion/context events, settings and page navigation into focused internal
   components. Keep Runner as the game/input/event-loop coordinator. Mark the
   embedded script's responsibility boundaries for navigation.
4. **Verify and finish.** Compare against the Git starting revision, run browser
   interactions using the develop-web-game client, inspect screenshots and
   document results. Update BUILD and commit the completed changes.

## Validation

- `node tests/game-contract.mjs` (no historical HTML required).
- `node tests/skill-client.mjs` (uses the installed develop-web-game action
  client, disables online scores and supplies a deterministic frame hook).
- `node tests/render-cache.mjs <saved Git starting HTML>` for 70 scenes and
  five deterministic simulation traces, 12,000 frame advances each.
- `node tests/snow-caps.mjs <saved Git starting HTML>` for mountain geometry.
- Skill Playwright action client and visual inspection of desktop/mobile/file
  screenshots. Disable real highscore requests in all browser tests.
- Inline script syntax checks and `git diff --check`.

## Status

- Plan recorded before implementation; starting revision: `10f6b21`.
- All four implementation steps completed. Build: `2026-10-15.1`.
- GamePreferences owns saved mode/records and an in-memory fallback when storage
  fails. Game.resetRound shares entity/state resets while preserving the
  distinction between round and session clocks and the original RNG order.
- BrowserLifecycle owns focus/context/motion state, event bindings, pause reasons
  and input eligibility. GamePage owns settings, buttons, audio activation and
  embedded help navigation. Runner coordinates input, simulation, effects and
  frame scheduling. The component map is inside the main embedded script.
- A standalone copy embeds its tab icon; hosted manifest/icons stay available
  for PWA installation. Service-worker cache v4 treats music as optional, so an
  absent song no longer prevents an offline installation.
- The snow regression test now observes retained paths without rewriting the
  game's source text. DINO_TEST_OUTPUT can isolate comparison artifacts.

## Verified results (Chromium, 2026-10-15)

- Six passing contract scenarios: desktop, portrait, landscape, isolated offline
  file, isolated file with blocked storage, and hosted offline reload through a
  real service worker with the song missing. Includes keyboard/touch controls,
  dialogs/help/direct Help links, protected death/restart, records, network
  failure, reduced motion, focus/context recovery, session reset and real rAF
  pause/resume. No uncaught page errors or unexpected file dependencies.
- All 70 Canvas comparisons against `10f6b21` are pixel-identical: maximum channel
  difference 0 and changed pixel count 0.
- All five deterministic simulation/effect traces match the starting version
  over 12,000 frame advances per configuration (60,000 total per version).
- All 54 non-snow image comparisons and 156 mountain contour checks passed.
- Skill action client passed; screenshots and state inspected. Also inspected
  desktop/file/PWA, portrait, landscape/night and turbo screenshots.
- Inline script syntax, changed Node scripts, service-worker syntax and
  `git diff --check` passed. PHP and server validation rules were not changed;
  client/PHP score constants are checked by the contract test.
- Reports and screenshots: `output/refactoring/contract`,
  `output/refactoring/skill-client`, `output/refactoring/comparison`.
- No deployment performed. Safari/iOS hardware was not tested in this change.
