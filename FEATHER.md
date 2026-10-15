# Jump feather plan

## Player contract

- A blue/turquoise feather pickup stores one air jump, with no expiry or stacking.
- Jump normally, release, then press the existing jump control again in the air.
  Keyboard, pointer, touch button and gamepad use the same game command.
- Ground jumps and landing do not spend the charge. Death, restart and a new
  session clear it. Pausing freezes pickups. Chili and feather can coexist.
- A small feather beside the dino indicates a charge. Collection and use have
  distinct visual/audio feedback; meaning never relies on color alone.
- Air-jump lift is bounded near the screen top. Cacti and birds remain dangerous;
  the feather does not change speed, score rules or invulnerability.
- The game remains one offline/file-capable HTML, with optional external song.

## Implementation sequence

1. Save Git baseline `10b7c4b`; add this plan and focused browser regressions.
2. Add a small simulation component for feather spawning/charge, swept pickup
   collision and cooldown. Use deterministic timers without consuming the
   obstacle/chili RNG. Spawn with space around hazards and the chili pickup.
3. Implement one explicit airborne impulse through Game.jump, preserving normal
   jumps and the existing landing buffer. Consume only on a successful air jump.
4. Render an inline Canvas feather, pickup halo and charge indicator. Add brief
   feedback, reduced-motion handling, accessible announcements and help text.
5. Test behavior and rendering in Chromium and WebKit, including smartphone
   portrait/landscape touch emulation and isolated offline file loading. Exercise
   collection, no stacking, first/second/third jumps, landing, top bounds, Chili,
   pause, death/restart/session reset and real inputs. Inspect screenshots.
6. Run the develop-web-game action client, game contract and old-behavior visual/
   deterministic regressions with feather spawning disabled only in tests.
   Document evidence, update BUILD and commit the completed feature.

## Engineering basis

- Keep input, fixed-step simulation and rendering distinct, as described in
  [MDN's game-loop anatomy](https://developer.mozilla.org/en-US/docs/Games/Anatomy).
- Use explicit transitions (empty -> charged -> spent) and reuse the existing
  collision/input pipeline. Bound live pickups to one, avoid per-frame DOM work,
  and keep cosmetic effects outside gameplay randomness.
- Build on the existing swept-AABB pickup approach so fast movement does not
  skip a collectible. Preserve accessibility and reduced-motion behavior.

## Compatibility evidence

- Smartphone testing uses Playwright touch/DPR/mobile viewport emulation.
  It does not establish physical Android/iPhone performance or Safari hardware
  compatibility by itself. Record engine versions and exact outcomes below.
- Resolved the initial `spawn UNKNOWN`: the Windows dependency validator failed,
  while the actual WebKit 26.5 executable runs. Set
  `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` here to bypass that validator.
  This is an environment workaround; the real engine still runs the tests.
- Windows WebKit rejects initial `file://` navigation with its offline flag set.
  The tests block HTTP before file navigation, then enable the offline flag once
  the HTML has loaded. Its hosted offline test uses a genuinely failing origin
  socket instead of the offline flag, which also rejects controlled navigation.
  Chromium uses the offline flag from the beginning. No game code changes were
  needed for these differences in browser automation.

## Implemented behavior

- The first spawn is eligible after four seconds of obstacle play, with safe-slot
  retries. A consumed or missed feather waits 18 seconds before another spawn.
  The cooldown does not run while a charge is stored. One live pickup maximum.
- Spawn checks run after obstacle movement/creation. A reserved gap also delays
  the next obstacle while the feather is near the incoming edge. Both sides of
  the collectible stay clear; no random samples are added by feather scheduling.
- Ground-jump rules are unchanged. Air-jump impulse is capped at 9 px per fixed
  step and fitted to headroom using the existing gravity. A released air jump
  uses the existing short-jump handling; ducking prevents charge consumption.
- The feather badge, pickup and particles use inline Canvas vectors/colors.
  Particle count remains capped at 100 and reduced motion suppresses bursts.
  The live region announces collection/use, and the coach hint disappears when
  spent. The embedded help has a dedicated Jump feather card.
- No new files are needed for play. Backend score constants, modes, records,
  normal collision boxes, speed and Chili duration/multiplier stay unchanged.

## Repeatable checks

Use an installed Playwright package and Chromium/WebKit browsers. In this
workspace, the reusable ESM entry is
`D:/projects/pacman/node_modules/playwright/index.mjs`; set `DINO_PLAYWRIGHT` to
your installed entry if Playwright is not resolved locally.

```powershell
$env:DINO_PLAYWRIGHT = 'D:/projects/pacman/node_modules/playwright/index.mjs'
$env:DINO_TEST_OUTPUT = "$PWD/output/feather"
$env:DINO_BROWSER = 'chromium'
node tests/jump-feather.mjs
node tests/game-contract.mjs
node tests/skill-client.mjs

$env:DINO_BROWSER = 'webkit'
$env:PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1'
node tests/jump-feather.mjs
node tests/game-contract.mjs
```

For established behavior, extract the exact pre-feature HTML from Git and start
`node dev-server.js` in another terminal:

```powershell
node -e "const fs=require('node:fs');fs.mkdirSync('output/feather',{recursive:true});fs.writeFileSync('output/feather/dino.before.html',require('node:child_process').execFileSync('git',['show','10b7c4b:dino.html']));"
$env:DINO_TEST_OUTPUT = "$PWD/output/feather/comparison"
node tests/render-cache.mjs output/feather/dino.before.html
```

Run that comparison once with each `DINO_BROWSER` value. Its established-game
fixtures disable the new feather explicitly, including the separately created
simulation model. New behavior is checked with feather enabled by
`jump-feather.mjs`. Comparison tolerances are unchanged; on failure, a compact
first-difference JSON is written instead of printing the whole simulation trace.

## Verification status

- Feature implementation and embedded help completed in `2026-10-15.2`;
  current build `2026-10-15.3` includes the physical-phone restart fix below.
- Feature scenarios passed in Chromium 151.0.7922.34 and WebKit 26.5, each with
  desktop, touch/DPR smartphone portrait and landscape configurations.
- Covers keyboard repeat/release, mouse/touch/gamepad, collection mid-jump,
  one charge/no third jump, landing persistence, swept collision, RNG isolation,
  spawn separation/reserved corridor, natural collection, cooldown, Chili,
  pause/resize, reduced motion, altitude and death/restart/session reset/help.
- General lifecycle scenarios passed in both engines, including blocked storage,
  direct Help links, local records after network failure and hosted offline
  reload without the optional song. The WebKit harness differences are above.
- Ran the actual develop-web-game action client. Inspected pickup, ready/spent,
  air-jump, help and normal gameplay screenshots in desktop/mobile layouts.
- Pre-feature comparison for build .2 passed in both engines: 70/70 pixel-identical
  scenes per engine (140 total; zero changed pixels), plus five identical
  12,000-frame simulation/effect traces per engine (120,000 frame advances per
  version across both engines). Caches, particle cap and array reuse passed.
- Inline JavaScript and changed Node script syntax, shared client/PHP score
  constants, exact Git baseline bytes and `git diff --check` passed.
- All six implementation/validation steps are complete. Plan commit: `5d59fd0`;
  feature/help commit: `5455109`; branch: `feature/jump-feather`.
- Artifacts: `output/feather/{chromium,webkit,contract-chromium,contract-webkit,
  skill-client,comparison}`. No real highscore requests or deployment.
- Aggregated emulation results: `output/feather/verification.json`.

## Physical Galaxy A53 verification (2026-10-15)

- Samsung SM-A536B / Galaxy A53, Android 16, actual Chrome 155.0.8059.79.
  No viewport/device emulation. Real OS portrait/landscape rotation with the
  original settings restored in finally and read back after testing.
- Inputs are trusted Chrome CDP touch events on the actual phone. The normal rAF
  loop runs; pickup positions and unrelated obstacles are controlled fixtures.
  No manual simulation frames or live highscore submissions.
- Passed collection, ground-jump charge preservation, one air jump/no third
  jump, duck press/release, settings pause/resume, orientation, help/back,
  death/restart and charge reset. Screenshots inspected.
- Offline service-worker reload and a subsequent feather air jump passed with
  only the test origin's USB bridge disconnected. Phone network settings and
  other sites/tabs were not changed. Direct Android file opening and physical
  iPhone/Safari are not covered by this device run.
- The short landscape viewport (663 x 234 CSS px, DPR 3.375) exposed a preexisting
  hit-target bug: record feedback made the result card extend under the
  transparent touch-control grid, whose empty area swallowed Play again taps.
  Reproduced at that viewport: elementFromPoint returned touch-controls.
- Build .3 makes the transparent grid ignore pointer events, while buttons and
  links remain interactive. No visual/physics changes. Added a hit-test assertion
  and compact landscape configuration to game-contract.mjs.
- Build .3 passed the physical run and seven lifecycle scenarios per engine in
  Chromium/WebKit (14 total), the skill action client, syntax and diff checks.
  Earlier .2 Canvas/simulation comparisons are recorded above; .3 only changes
  CSS hit testing and the build identifier.
- Two four-second controlled samples measured about 60 FPS in both orientations.
  These do not establish sustained-play or universal performance. Exact metrics:
  `output/feather/device/report.json`; screenshots are beside the report.

Unlock an authorized USB-debugging Android device and open Chrome. Start
`node tests/android-preview.cjs` in another terminal, then run:

```powershell
adb forward tcp:9223 localabstract:chrome_devtools_remote
adb reverse tcp:8877 tcp:8877
node tests/android-feather.mjs
adb reverse --remove tcp:8877
adb forward --remove tcp:9223
```

Use DINO_PLAYWRIGHT as above if needed; DINO_ANDROID_SERIAL selects a device for
the script. Match ADB bridges to that same device. The runner creates/closes its
own tab and disconnects CDP, leaving other tabs open.
