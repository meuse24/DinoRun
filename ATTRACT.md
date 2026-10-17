# Rotating attract screen

Build `2026-10-17.1` replaces the small Start game / Highscores menu with a
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

Three labelled navigation dots select a panel. Pause freezes the preview clock
and demo; Settings, Help, focus loss and backgrounding use the existing browser
pause lifecycle. Rotation never moves keyboard focus or announces each panel
through a live region. Reduced motion defaults to paused rotation and a static
demo; panels and START remain manually usable. Explicit Play can resume panel
rotation while reduced motion continues to keep the demo still.

## Boundaries

`AttractScreen` owns presentation timing and the preview DOM. Its demo has a
private seeded random source, independent Game.world, and a separate Renderer
using the existing Canvas. No demo event connects to Runner's audio, session
statistics, highscore controller or persistence. Live gameplay stays in the
existing Game. No new runtime assets or dependencies are required.

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
touch/DPR viewports 390x844, 844x390, 663x234 and 320x568. They check both score
pages, the full loop, focus, stationary/unobstructed START, installation controls,
pause, real jump/duck demonstration, independent RNG/world/records/statistics,
fresh starts from each panel, keyboard/touch, reduced motion, mode changes, late
responses, cache fallback and bounded requests. Reports include layout metrics.

Source and delivery results are collected under `output/attract`. Screenshots
are visually inspected. Emulation and physical-device results are recorded
separately. Nothing has been deployed.

## Verified result

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

## Physical Galaxy A53 verification (2026-10-17)

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
