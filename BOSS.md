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
- The initial implementation checks above used emulated touch layouts; the
  physical-device follow-up is recorded below. Browser evidence:
  output/rock-boss/final/ and output/rock-boss/release/.

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

## Physical Android follow-up (2026-10-19)

Release build 2026-10-18.12 verified by SHA-256:
`ad05658b85c3d1a7a6204ec4b564868edb85a8496831429b26c09d11afa28e6d`.
Galaxy S10e SM-G970F, Android 12, Chrome 155.0.8059.81. Real 360x617 portrait
and 673x280 landscape CSS viewports, normal rAF and trusted CDP touches.

Seven scenarios in each orientation passed (14 total): clean short-jump passage
at normal speeds 6 and 8.5 and relaxed speed 5.3; Settings pause and rotation
while paused; missed jump/ledge collision with frozen death scene; held jump
against the ceiling; exactly one shield charge shattering the boss; and page-local
reduced motion suppressing debris. No game-code correction was needed.

The fixture makes the boss eligible immediately, freezes acceleration at each
selected speed and holds unrelated collectible spawning. Boss motion, jump
physics, hitboxes, input handlers and death flow run normally. Online scores are
disabled. The two 30-frame warning samples had median16.7ms, p95=16.8ms, no
frame over33ms; these are short warning-phase samples, not a sustained gameplay
benchmark. Screenshots inspected; no page or console errors. The landscape
approach image catches the intended Settings exit fade; subsequent gameplay
images are unobscured.

Original rotation(auto1/user0) and the preview origin's storage restored; own
test tab closed, scoped relay/preview stopped and own USB8877/9223 bridges
removed. Existing Chrome tabs and the desktop8765 preview were retained.
Evidence: `output/rock-boss/physical/device/android-rock-boss.json` and PNGs.

Repeat with `node tests/android-rock-boss.mjs release/dino.html` after starting
`node tests/android-preview.cjs release/dino.html`, the scoped CDP relay and USB
bridges described in FEATHER.md. The runner defaults to relay9224; optional
DINO_CDP_URL/DINO_ANDROID_URL/DINO_ANDROID_SERIAL select existing safe bridges,
server and device. DINO_TEST_OUTPUT chooses the report directory.

## Debug rock training (build 2026-10-19.1)

Settings > Debug log > Rock training enables continuous practice from the next
START. Switching during a round applies to the following round; reload resets
it to Off. Only rocks spawn, at the selected mode's fixed starting speed (normal
6, relaxed 4.2). The regular warning and clearance pauses remain between rocks.
No personal records, top-ten qualification, online submission or session stats
are recorded for training. The result and gameplay footer identify practice.

`node tests/rock-training.mjs [game.html]` verifies three successive passages,
keyboard/touch switching, fixed speed, score isolation, normal-mode return and
reload reset. Chromium and WebKit source/release pass desktop, portrait
and landscape layouts. Screenshots inspected. Architecture (11), lifecycle (7),
release boss regression (8), 64 pixel-identical source/release scenes and the
installed skill client pass. Evidence lives in
`output/rock-training/`. These new training checks use browser emulation;
the physical Android result above applies to the previous boss build.
