# Jump feather

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

Use `npm ci` and `npx playwright install chromium webkit` for the local pinned
Playwright package and browsers. `DINO_PLAYWRIGHT` can optionally select another
installed ESM entry. Shared setup and test groups: [TESTING.md](TESTING.md).

```powershell
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
node -e "const fs=require('node:fs');fs.mkdirSync('output/feather',{recursive:true});fs.writeFileSync('output/feather/dino.before.html',require('node:child_process').execFileSync('git',['show','b13c647:dino.html']));"
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
  build `2026-10-15.3` includes the physical-phone restart fix below. The later
  architecture refactoring is documented separately in `ARCHITECTURE.md`.
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
- All six implementation/validation steps are complete. Plan commit: `e10292d`;
  feature/help commit: `1578561`; branch: `feature/jump-feather`.
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

### Existing local server and scoped CDP connection

Both `android-feather.mjs` and `android-attract.mjs` accept `DINO_ANDROID_URL`
(default `http://127.0.0.1:8877/dino.html`) and an optional HTML argument. With
an existing server, they disable live scores before game initialization, block
API requests and compare the HTTP response SHA-256 with the selected file.
Match the USB reverse bridge to the URL's port; the offline feather check
temporarily removes and restores that bridge. Do not run tests concurrently.

For example, when `node dev-server.js` already runs on 8765:

```powershell
$env:DINO_ANDROID_URL = 'http://127.0.0.1:8765/dino.html'
adb forward tcp:9223 localabstract:chrome_devtools_remote
adb reverse tcp:8765 tcp:8765
try {
  node tests/android-attract.mjs
  node tests/android-feather.mjs
} finally {
  adb reverse --remove tcp:8765
  adb forward --remove tcp:9223
}
```

If Playwright CDP initialization hangs while the phone's version endpoint still
responds, existing Chrome tabs may prevent auto-attachment from completing.
Start `node tests/android-cdp-relay.mjs` in another terminal with the same
`DINO_PLAYWRIGHT` setting, then set
`DINO_CDP_URL=http://127.0.0.1:9224` for the runners. The localhost-only relay
attaches only to targets created by the test connection and leaves existing
tabs alone. It uses Playwright's bundled WebSocket dependency. Optional settings:
`DINO_CDP_UPSTREAM` (default `http://127.0.0.1:9223`) and
`DINO_CDP_RELAY_PORT` (default `9224`). Stop the relay afterward.

Build `2026-10-17.1` passed both runners on the physical Galaxy A53 using the
existing 8765 server and this scoped relay. Portrait/landscape feather controls,
help, restart, automatic name entry and offline reload/air jump passed, with no
browser errors or live submissions. The source hash and separate attract/shield
results are in [ATTRACT.md](ATTRACT.md). Initial task rotation settings were
restored to auto=1/user_rotation=0, all own helpers/bridges were removed, and the
existing 8765 server was kept running.

### Additional Galaxy S10e verification (2026-10-18)

The final build2026-10-18.2 compact artifact, SHA-256
`5fc33e04ce2b41c69384154d5bcd96bb040d009af31c824466aa19156a9c31d0`,
passes physical Samsung SM-G970F / Galaxy S10e, Android12/API31 and
Chrome154.0.8037.127. Trusted touch collection/air jump, one-charge consumption,
duck press/release, pause preservation, help, death/automatic entry/attract start
and hosted offline reload/air jump pass. Portrait360x760 and landscape760x360,
DPR3, normal rAF; no viewport emulation, manual frames or live score requests.

Two four-second controlled scenes measured 59.92/59.91FPS (240 frames each),
median16.7ms, p95=16.8ms. These short samples do not establish sustained-play
performance. Screenshots inspected; no browser errors. Original records and
rotation(auto1/user0) restored; own tab/preview/relay/USB bridges removed.
Reports: `output/s10e-2026-10-18/feather/device/report.json`; aggregate
`output/s10e-2026-10-18/verification.json`.
