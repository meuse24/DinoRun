# Rotating attract screen

Build `2026-10-24.4` skips gameplay lettering prewarming in the demo/backdrop
renderers, which never display those callouts. The main renderer still prepares
them before play; preview caches remain lazy if a future feature needs lettering.
During the landscape demo, the hidden idle backdrop pauses and resumes on the
next scores/powerups panel. Canvas resolution and menu effects are unchanged.

Build `2026-10-24.3` also shows the Settings FPS counter on all three attract
panels. When enabled, a small two-line readout replaces the decorative coin mark
inside the existing credit plate, preserving START and preview geometry. It uses
the main rAF sampler (500ms updates), including the initial/reset dash; it measures
the complete attract loop, not only the demo simulation. Turning FPS off restores
the coin mark. The existing session-only FPS setting behavior is unchanged.

Demo and backdrop use the same `Game`, `Renderer` and `Effects` classes as play,
so the retained vector sprite paths apply there too. The demo has independent
world/RNG/state; its effect events are not wired to the real runner and it
currently spawns no gameplay particles. The particle pool is available in its
Effects instance but therefore does not provide an active particle-allocation
saving in today's demo. Its compact HUD also omits the gameplay score HUD.

Introduced in build `2026-10-17.1`, the attract screen replaces the small Start game / Highscores menu with a
persistent orange START button and three rotating preview panels:

- **Highscores, 8 seconds:** real top ten, five entries per four-second page.
  Labels distinguish online, saved online and this-device lists, and show the
  selected Normal/Relaxed mode. Empty lists invite the first record.
- **Demo, 10 seconds:** a silent runner using the actual Game, Renderer,
  obstacle hitboxes and jump/duck rules. The authored opening demonstrates cacti
  and two bird heights; a small autopilot controls the dino. It loops on a crash.
- **Power-ups, 9 seconds:** Chili, feather and shield icons with short player
  descriptions. The illustrated powers match the current in-game rules.

The same START element remains visible and stationary across all three panels,
with a minimum 60 px height on short landscape screens. It starts a fresh real
round through the existing mouse/touch/keyboard/gamepad input paths. No demo
score, obstacle or power-up carries over. The separate Highscores button is gone;
automatic name entry after a qualifying real round remains available.

The panels rotate automatically in a loop; navigation dots and the preview pause
button were removed in build2026-10-21.10. Settings, Help, focus loss and
backgrounding suspend the loop through the existing browser pause lifecycle.
Rotation never moves keyboard focus or announces each panel through a live region.
Reduced motion keeps the automatic loop with static transitions and a still demo.
START appears with credits; at zero, the prominent INSERT COIN occupies its slot.

## Boundaries

`AttractScreen` owns presentation timing and the preview DOM. Its demo has a
private seeded random source, independent Game.world, and a separate Renderer
using the existing Canvas. No demo event connects to Runner's audio, session
statistics, highscore controller or persistence. Live gameplay stays in the
existing Game. No new runtime assets or dependencies are required.

Build `2026-10-17.2` removes the 1080 px width cap. Every landscape window uses
the full width inside safe-area padding, with the preview on the left and the
stationary START on the right. Height is bounded by 520 px, available height and
the normal track proportions. At 1920x1080 the stage grows from 1080 to 1896 px
wide and shrinks from 680 to 520 px high; at 1366x768 it is 1342x492 px.

Wide, short windows also use the full safe width. The demo and its separate idle
backdrop each own a responsive world; they fit the Canvas without stretching
vectors. The real gameplay world stays at its existing 600/420 logical width.
The coordinator restores its Canvas dimensions on each gameplay/menu transition.
Explicit page-container width sizing avoids a stale WebKit grid aspect-ratio
height after repeated landscape/portrait resize while paused. Portrait retains
the vertical menu. There are no new runtime assets.

Score fetching stays in HighscoreController/HighscoreApi. The preview loads only
the selected mode and allows at most one refresh per mode per minute, on a score
panel visit, with the controller deduplicating active requests. Failed requests
fall back to validated saved online or local entries. Late responses for another
mode cannot replace the visible mode. Names use textContent.

The release builder now matches the complete round menu with balanced section
tags. Its previous first-closing-tag expression protected only part of the new
nested markup and produced a broken release DOM. Whitespace preservation remains
enabled for the whole menu, including the existing WebKit game-over edge case.

## Repeatable verification

```powershell
$env:DINO_PLAYWRIGHT = 'D:/projects/pacman/node_modules/playwright/index.mjs'
$env:DINO_TEST_OUTPUT = "$PWD/output/attract"
node tests/attract-screen.mjs
node tests/game-contract.mjs
node tests/architecture.mjs
node tests/jump-feather.mjs
node tests/shield-bubble.mjs
node tests/skill-client.mjs
npm run build
node tests/release.mjs
node tests/attract-screen.mjs release/dino.html
node tests/game-contract.mjs release/dino.html
node tests/skill-client.mjs release/dino.html
```

Run browser checks with Chromium and `DINO_BROWSER=webkit`. This Windows WebKit
installation needs `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`; see FEATHER.md.
Attract tests use isolated standalone files, no live scores, and desktop plus
touch/DPR viewports 390x844, 844x390, 663x234, 844x234 and 320x568, plus desktop
1280x720, 1920x1080, 1366x768, 1920x500 and tablet 1024x768. They check both score
pages, the full loop, focus, stationary/unobstructed START, installation controls,
pause, real jump/duck demonstration, independent RNG/world/records/statistics,
fresh starts from each panel, keyboard/touch, reduced motion, mode changes, late
responses, cache fallback and bounded requests, full safe width, compact height,
uniform Canvas scaling and repeated orientation changes while paused. Reports
include layout metrics.

Source and delivery results are collected under `output/attract`. Screenshots
are visually inspected. Emulation and physical-device results are recorded
separately. Nothing has been deployed.

## Previous verified result (2026-10-17.1)

- Chromium 151.0.7922.34 and WebKit 26.5: attract tests pass five layouts per
  engine for source and compact delivery. No browser errors or required network
  requests in the isolated standalone fixtures.
- 48 source/release scenes per engine are pixel-identical (96 total), including
  all attract panels, real gameplay, help, shield rendering and automatic entry.
- Source lifecycle/offline contract (seven) and architecture (11) scenarios pass
  per engine; compact lifecycle/offline contract passes seven per engine.
  Existing feather and shield checks pass three layouts each per engine.
- Installed develop-web-game action client passes source and delivery. A separate
  Chromium smoke test uses normal requestAnimationFrame, waits for automatic demo
  rotation and starts a real round by mouse, without manual simulation hooks.
- Build: 360,922 -> 189,665 bytes (47.45% saved), release SHA-256
  `9d37db43e1a8c96565a76a77869cd42a470bd551c7c1ff80150fd45d7fb64133`.
  Hash/reproducibility, inline/Node syntax and diff checks pass. Aggregate:
  `output/attract/verification.json`. No required implementation work remains.

## Previous physical Galaxy A53 verification (2026-10-17.1)

Build `2026-10-17.1` was tested through the existing server on port 8765:
readable `dino.html`, SHA-256
`1d39734816f5a6922908f1f535c52b0b226ed8185075f6f3cf2580d1820627fd`.
Device: Samsung SM-A536B, Android 16, Chrome 155.0.8059.79. Trusted CDP touch
input, actual OS rotation and the normal requestAnimationFrame loop were used;
no viewport emulation or manual simulation stepping.

- Automatic scores/demo/power-ups rotation, preview/settings pause and starts
  from all three panels pass in portrait and landscape. START stays fixed,
  visible and touchable, including the actual 637x234 browser viewport.
- A controlled real-time pickup/collision fixture passes: the shield absorbs
  a cactus hit and the next bird hit ends the round.
- Feather pickup/air jump, duck press/release, pause, help, restart, automatic
  name entry and service-worker offline reload/air jump pass. Offline testing
  temporarily disconnects only the test origin's USB bridge. No browser errors
  or live score submissions. Screenshots inspected.
- Two four-second controlled samples measured 60.1/59.5 FPS. These samples do
  not establish sustained-play performance. The compact artifact was not loaded
  on the phone in this run; source/release equivalence is established above.
- Own tabs/helpers/USB bridges were closed or removed; initial rotation settings
  restored (auto=1, user_rotation=0). The existing 8765 server remains running.

Run `tests/android-attract.mjs` and `tests/android-feather.mjs` with the USB setup
in [FEATHER.md](FEATHER.md). Set `DINO_ANDROID_URL` to use an existing local
server; the response must match the selected HTML's SHA-256. For Chrome profiles
where direct CDP initialization hangs, use `tests/android-cdp-relay.mjs` as
documented there. Reports: `output/attract/phone/verification.json`,
`output/attract/phone/device/attract-report.json` and
`output/attract/phone-regression/device/report.json`.

## Full-width verification (2026-10-17.2)

- Chromium 151.0.7922.34 and WebKit 26.5: source and compact delivery pass all
  ten layouts, including full safe width in wide/short windows, compact height,
  unchanged vector proportions and paused repeated orientation changes. Existing
  rotation, score, isolation, reduced-motion, touch/keyboard and START checks pass.
- Source and delivery lifecycle/offline suites pass seven scenarios per engine;
  architecture passes 11 per engine. Installed develop-web-game client passes.
- All 48 source/delivery scenes per engine are pixel-identical (96 total),
  including the compact landscape menu, settings, actual gameplay and restart.
- Physical Galaxy A53 / SM-A536B, Android 16, Chrome 155.0.8059.79: source loaded
  through the existing 8765 server. Actual portrait 320x581 and landscape 637x234
  pass full rotation, preview/settings pause and starts from every panel. The
  landscape stage fills the 621 px available width; START remains 200x60 px.
  Shield pickup/first-hit survival/subsequent lethal contact pass. Trusted touch,
  normal rAF, controlled hazards; no browser errors or live score submissions.
- Screenshots inspected on desktop, small landscape/portrait and physical phone.
  Original rotation restored (auto=1, user_rotation=0), own tabs/relay/USB bridges
  removed; the user's existing 8765 server remains running.
- Source: 363,019 bytes, SHA-256
  `7cc14cbcb77db22baca776c87983f03c29361419f63319da5f5677f8c329f868`.
  Delivery: 190,739 bytes (47.46% saved), SHA-256
  `edbddd381b1bdc54f5ab5de07134ec584f6aa21458192a60ccc87c55208badc3`.
  Compact delivery is compared in both desktop engines; the physical run loaded
  the source. No new physical iPhone or sustained-performance claim.

Aggregate: `output/attract-wide/verification.json`. Reports/screenshots:
`output/attract-wide`, physical report
`output/attract-wide/phone/device/attract-report.json`.

The delivery comparison normalizes the mouse position before each snapshot.
Mobile WebKit otherwise retained a native select's hover state in only one of
the source/release contexts, producing a small fill difference despite identical
geometry and computed styles. The targeted 12-scene landscape comparison passes
with equal pointer state; exact pixel tolerance remains unchanged. Use
`DINO_RELEASE_LAYOUTS=landscape` for a targeted comparison when diagnosing a
failure; omit it for the full four-layout suite.

## Additional Galaxy S10e verification (2026-10-18)

Build 2026-10-18.2, final compact SHA-256
`5fc33e04ce2b41c69384154d5bcd96bb040d009af31c824466aa19156a9c31d0`,
passes on physical Samsung SM-G970F / Galaxy S10e, Android12, Chrome154.0.8037.127.
Actual browser viewports are portrait360x617 and short landscape673x280, DPR3.
Normal rAF, full preview rotation, demo, three power-up cards, pause/settings,
trusted starts from every panel and shield collection/first-hit survival/
subsequent death pass; no browser errors or live highscore requests.

Older Chrome retained Start's `:active` state after a touch/orientation change:
the captured transform was exactly `matrix(1, 0, 0, 1, 0, 2)`. The physical
harness now toggles the real preview pause control twice before recording its
resting baseline. Start's existing 1px position tolerance stays unchanged, and
both layouts pass. Initial/resting geometry is included in the report. No game
code or graphics changes were needed.

Report/screenshots: `output/s10e-2026-10-18/attract/device/attract-report.json`;
aggregate: `output/s10e-2026-10-18/verification.json`. Original fixture records,
fullscreen preference and rotation restored; own tabs/helpers/bridges cleaned.
