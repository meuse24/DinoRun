# Stone Jaw rock boss

## Player contract and plan

- A rare rock boss replaces a short stretch of regular obstacles. First eligible
  encounter after 36 seconds of obstacle play; later encounters wait 44–58 seconds.
  Scheduling is deterministic and consumes no obstacle/pickup random values.
- Reserve the incoming corridor, let existing hazards/pickups and Chili finish,
  then announce STONE JAW / SHORT JUMP THROUGH for 1.8 seconds. No surprise spawn
  between cacti. Resume ordinary spawns after the clearance celebration.
- A tall rock with a glowing passage: short jumps pass between ceiling and ledge;
  running/ducking hits the ledge and excessively high jumps hit the ceiling.
  Scale rock thickness with approach speed to preserve a usable timing window in
  both modes. Use the real dino hitboxes and fixed-step movement.
- Chili cannot burn the boss. One stored shield shatters it and consumes the
  charge. Feather remains usable. Passing or shield-breaking counts once, with
  rock debris, a short synthesized sound and BOSS CLEAR. No extra score: existing
  server score plausibility and modes remain unchanged.
- Keep simulation DOM-free, share Game.world, freeze with gameplay pause, reset
  with rounds/sessions, and exclude bosses from the attract demo. Inline Canvas
  vectors and existing capped effects; reduced motion suppresses decorative pulses
  and debris. No new runtime library or external image/audio asset.

## Implementation sequence

1. Add RockBoss scheduling/entity, safe spawn reservation and collision outcomes.
2. Draw the rock/opening, warning and clearance; integrate synthesized audio,
   accessible announcements, concise English Help and text-state inspection.
3. Test actual jump trajectories across both modes/speeds, lower/upper impacts,
   shield/Chili/feather, spawn isolation, lifecycle/pause/resize/reduced motion,
   keyboard/touch and browser errors. Inspect screenshots and the skill client.
4. Rebuild the standalone delivery, run relevant existing regressions, record
   evidence and commit the finished feature.

## Implementation and verification (build 2026-10-18.12)

- RockBoss owns idle/clearing/warning/active/cleared phases and shares Game.world.
  Game coordinates the corridor and checks collisions; Renderer reads the model.
  The wide head has a full roof hitbox; the narrower lower jaw scales with speed.
  Side rims frame the passage as depth decoration. Opening y=78..166, rock
  y=28..190 logical pixels, below the score display. A cached Path2D outlines the
  rock; the existing 100-particle cap also bounds its stone fragments.
- The scheduler waits for previous hazards, visible pickups and Chili's return
  to finish. Jumping/ducking never delays the warning: this prevents holding Duck
  from exploiting an indefinitely empty corridor. Pickups already present move
  normally; new collectible/hazard spawns wait until the encounter ends.
- tests/rock-boss.mjs uses the real Game and actual Runner input handlers in an
  isolated standalone file, with online scores disabled. Six mode/speed pairs
  sweep short-jump timing. Successful start windows span 5–13 fixed steps
  (83–217 ms), including a deliberately early relaxed-speed 4.2 encounter; natural
  bosses start later at a higher speed. Tests also cover both collision bands,
  an open passage, Chili resistance, one-shot shield shatter, clean shield/score
  preservation, feather use, corridor/pickup isolation, the full first timer,
  grace time, death freeze, resets, cooldown, pause, resize/rotation, reduced
  motion and attract exclusion. Keyboard/touch pass desktop, portrait and
  landscape. Source and release each pass all eight groups in Chromium and WebKit.
- Existing regressions: 86 screen-transition checks, 11 architecture scenarios,
  seven lifecycle/offline scenarios, Chromium shield and WebKit feather/shield
  flows in three layouts, and the ten-layout Chromium attract suite pass.
- Reproducible release: 438,338 -> 230,851 bytes. All 64 Chromium source/release
  scenes are pixel-identical, including new boss warning/approach/clear scenes in
  four layouts. The actual installed skill action client passes source and release;
  screenshots/state inspected. Extended volume suite includes both synthesized
  boss sounds, with real offline audio rendering, volume scaling and mute verified.
- No physical-device result is claimed for this build: connected Galaxy S10e was
  asleep/locked and unlocking was requested. Touch layouts above are emulation.
  Evidence: output/rock-boss/final/ and output/rock-boss/release/.

Repeatable commands (set DINO_PLAYWRIGHT if Playwright is installed elsewhere):

```powershell
node tests/rock-boss.mjs
node tests/rock-boss.mjs release/dino.html
node tests/shield-bubble.mjs
node tests/jump-feather.mjs
node tests/game-contract.mjs
node tests/architecture.mjs
node tests/screen-transitions.mjs
node tests/skill-client.mjs release/dino.html
node tests/attract-screen.mjs release/dino.html
node tests/volume-controls.mjs release/dino.html
npm run build
node tests/release.mjs
```

Set DINO_BROWSER=webkit for the boss/collectible WebKit runs. On this Windows
host WebKit uses PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 as documented in
FEATHER.md. No live score submissions or runtime dependencies added.

A final release run with ordinary rAF (no manual stepping) also clears the boss
using trusted keyboard input on desktop and trusted touch on the portrait Jump
button. Videos/screenshots inspected, no page errors. The normal-rAF fixture
accelerates only encounter eligibility, disables unrelated pickup spawns and
keeps the actual boss movement/jump physics. Evidence: output/rock-boss/live/.
The locator actionability check in mobile emulation initially misreported a
stage interception; direct touchscreen input at the verified button center
reached touch-jump and completed the encounter. The repeatable manual-frame
suite also passes the regular locator-based Jump button action.
