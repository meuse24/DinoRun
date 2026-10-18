# Round-end flow

Build 2026-10-18.2 replaces the result card with a pointer-transparent
**Game over** overlay over the running world's death animation for 2.6 seconds.
Score and personal-best feedback remain visible. Jump/restart input cannot
skip this interval. Settings, Help, focus loss and orientation pauses freeze it.

After the animation, Runner opens name entry if the round qualifies. Invalid or
rejected names stay editable. A completed online/local save, cancellation,
Escape or Back returns directly to the attract screen. A round that does not
qualify returns automatically. Pending online qualification is allowed to
finish, including a late positive result; network failure uses the existing
bounded API timeout. Qualification state stays in the DOM-free controller.

The old result card and Play again button are removed. Start on attract begins
the next run. The Off/power button appears beside Help and Settings on attract
and opens the existing session summary. Returning to attract preserves session
statistics and simulation time; only New session clears them. Highscores, game
mode and audio preferences retain their existing persistence behavior.

The PWA cache is v12. Source stays self-contained; optional MP3 files and hosted
installation assets keep their existing roles.

## Repeatable checks

```powershell
$env:DINO_PLAYWRIGHT = 'D:/projects/pacman/node_modules/playwright/index.mjs'
node tests/game-over-flow.mjs
node tests/game-over-flow.mjs release/dino.html
node tests/game-contract.mjs
node tests/architecture.mjs
node tests/attract-screen.mjs
node tests/release.mjs
```

Repeat browser checks with `DINO_BROWSER=webkit` and, on this Windows host,
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` (see FEATHER.md).

For an authorized phone, run the safe preview, USB forward/reverse and scoped
CDP relay from FEATHER.md. Then:

```powershell
node tests/game-over-flow.mjs release/dino.html --android
node tests/android-feather.mjs release/dino.html
```

The preview must serve that exact artifact. Physical checks use normal rAF,
controlled real cactus collisions and trusted Chrome touch input, without
viewport emulation or live highscore requests. Original fixture storage and
rotation settings are restored; only test-created tabs/helpers are closed.
Desktop tests use manual stepping and isolated score/API fixtures.

Evidence and inspected screenshots are under `output/game-over`; final results
and exact source/release hashes are recorded in its `verification.json` and the
repository's `progress.md`. Phone and emulator results are distinct.

## Validation on 2026-10-18

- Chromium 151 and WebKit 26.5 pass desktop, narrow portrait and short landscape
  round-end flows, including native Escape with fullscreen disabled in the
  desktop fixture. Qualification/controller checks pass 11 cases per engine;
  lifecycle/offline checks pass seven cases; attract checks cover ten layouts.
- Both engines pass 52 exact source/release UI/gameplay comparisons each. The
  builder preserves overlay whitespace because collapsing it caused small
  WebKit glyph-edge differences; pixel tolerances were not changed.
- Physical Galaxy A53 / SM-A536B, Android 16, Chrome 155: normal rAF, actual
  cactus collisions and 15 trusted touch inputs per orientation pass all five
  round-end scenarios, name rejection/save/cancel, late positive/negative
  qualification, accumulated statistics and Off/New session. Existing physical
  feather/air-jump/duck/pause/help/restart and hosted offline reload checks pass.
- Phone-tested compact hash: `a1750427054558d2e42e2ab61e159f64ebf72fb9b974752e72171da5b858536c`.
  Final compact hash: `5fc33e04ce2b41c69384154d5bcd96bb040d009af31c824466aa19156a9c31d0`.
  The only subsequent delivery change retains 38 whitespace bytes in the
  overlay: collapsing that block's whitespace reproduces the phone-tested
  hash exactly. Game source/logic is identical. Current full browser comparisons
  verify the final packaging. Phone rotation (auto=1, user=0), fixture storage
  and test tabs/helpers/USB bridges were restored/cleaned; live scores untouched.

### Additional older phone: Galaxy S10e

The final compact hash above was tested directly on Samsung SM-G970F / Galaxy
S10e, Android 12/API 31, Chrome 154.0.8037.127. Both portrait 360x760 and landscape
760x360 pass all five round-end flows with normal rAF, controlled real cactus
collisions and 15 trusted touches per orientation. Entry rejection/save/cancel,
late positive/negative qualification, Off and session statistics pass without
browser errors or live score requests. Attract/shield and feather/duck/help/
restart/hosted-offline regressions also pass on the same hash. Evidence:
`output/s10e-2026-10-18/verification.json`; original rotation/storage restored,
test tabs/helpers/USB bridges cleaned.
