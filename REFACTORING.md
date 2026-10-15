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
- `node tests/render-cache.mjs <saved Git starting HTML>` for 70 scenes and
  five deterministic simulation traces, 12,000 frame advances each.
- `node tests/snow-caps.mjs <saved Git starting HTML>` for mountain geometry.
- Skill Playwright action client and visual inspection of desktop/mobile/file
  screenshots. Disable real highscore requests in all browser tests.
- Inline script syntax checks and `git diff --check`.

## Status

- Plan recorded before implementation; starting revision: `10f6b21`.
