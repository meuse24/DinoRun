# Compact delivery

`release/dino.html` is the generated standalone delivery file. Keep editing the
readable root `dino.html`; the game itself still needs no build step to run.

## Rebuild

Current night-performance fix: `2026-10-21.24`, worker cache `dino-run-v50`.
Night HUD glyphs include shadows; stable lines share bounded cached runs, and
phone text-cache contexts match the CPU-rasterised destination. Animated punches
reuse a stable source scale. Same Canvas density as .23; slight edge-antialiasing
changes are possible. See [ARCADE.md](ARCADE.md) for the physical comparison.
Delivery318399 bytes, SHA-256
`e849b1aaad7e1bb7989a72a06e9dc377a5d07a319d7a2ffc64e8166f347a7035`.
Physical final artifact: night59.85FPS landscape/60.07 portrait, stressed
night59.85 in both, no sampled >20ms frames. Chromium/WebKit arcade3, installed
skill client, contract/offline7 and final64 pixel-identical source/release scenes
pass. Strict pre-change vector-cache comparison rejects expected HUD edge
antialiasing differences; its tolerance remains unchanged. Published HTML then
worker over FTPS, both live HTTPS hashes verified.
Published hash confirmed on the physical phone in Chrome and TWA:12 landscape
and2 portrait production layout/Help/Settings checks pass.

Previous phone-performance fix: `2026-10-21.23`, worker cache `dino-run-v49`.
Landscape touch play caps internal Canvas density at DPR2 while retaining full
CSS size and aspect; portrait/attract remain at their previous density. Fine
Canvas edges can be softer. Physical Galaxy S10e generated-delivery measurements
reach59.87FPS in normal and stressed play, portrait and landscape. Comparison
method, run variance and limits: [ARCADE.md](ARCADE.md).
Delivery317618 bytes, SHA-256
`90725139d70da5b3218953bf27704baf0ae815a190f1f090746ea1bf40fb01c0`.
Chromium/WebKit architecture12, skill client, contract/offline7 and Chromium64
pixel-identical source/release scenes pass. Published HTML then worker over
FTPS; both live HTTPS hashes verified.
Exact published hash also passes12 landscape/2 portrait physical browser/TWA
attract and trusted Help/Settings checks; no APK rebuild required.

Previous portrait-demo fix: `2026-10-21.22`, worker cache `dino-run-v48`.
The portrait demo Canvas fits between its caption and bottom label, keeping the
whole animation above the landscape advice. Short screens shrink it uniformly;
landscape attract and active gameplay retain their previous layout.
Delivery317478 bytes, SHA-256
`6f6bc8f19aa4f1bd263272e6d2d9d2b3c210ca24792756f5e1415474482a2610`.
Chromium/WebKit attract12, skill client, round-end3 and all64 source/release
comparisons pass. Published HTML then worker, HTTPS hashes verified. Physical
Galaxy S10e passes12 landscape and2 portrait checks against the exact published
hash in browser/TWA; native portrait screenshots confirm the demo clears advice.

Previous proportional-attract build: `2026-10-21.21`, worker cache `dino-run-v47`.
Landscape attract height follows its full-width600:220 aspect ratio, capped only
by the available viewport height. It stays vertically centered instead of filling
the screen height. Edge-to-edge phone gameplay remains as in build.20.
Delivery:316543 bytes, SHA-256
`c5d3cf8e0e7443b3764004a35f0efe552c8ae4ff1a033a6c23d2267829948900`.
Chromium/WebKit attract12 and skill action client pass; all64 Chromium delivery
comparison scenes are pixel-identical. Published HTML then worker over FTPS;
both HTTPS hashes match. Physical Galaxy S10e/Android12 also passes the actual
production browser/TWA checks: all three attract panels in both landscapes,
matching delivery SHA-256, proportions, centering, action hit targets and Help/
Settings with trusted touch. Screenshots inspected; no live highscore requests.

Previous edge-to-edge build: `2026-10-21.20`, worker cache `dino-run-v46`.
Landscape attract mode fills the viewport, including the camera cutout area.
Phone landscape gameplay fills the width and remaining height above its72px
touch-control row; the logical world adapts through `Game.resize` to keep artwork
proportions. Portrait layout and simulation speeds/score constants are unchanged.
Delivery: 316,525 bytes, SHA-256
`2632f28034f344b4cf908f0d5b69695336e38bd07a28d8728851a33fcbd53197`.
Chromium source/release comparisons pass all64 scenes; delivery update tests pass
three layouts. Attract12 and architecture12 pass in Chromium/WebKit. Source also
passes the physical Galaxy S10e browser/fullscreen menu-overlay runner in six
orientations, including real touch/resume/jump. The delivery itself was not loaded
on the phone. More evidence: [progress.md](progress.md). Published on2026-10-21
at the user's request: HTML first, worker last over FTPS; both HTTPS SHA-256
hashes match the local files.

```powershell
npm ci
npm run build
```

The locally installed, exactly pinned development tools run in this order:

1. Terser 5.51.2 compresses/mangles the three inline scripts. Property names,
   public hooks and the Chromium copyright/attribution are preserved.
2. CSSO 5.0.5 minifies all six stylesheets (including the embedded fonts and
   the help template). Rule
   restructuring is disabled: its default merging incorrectly moved the
   `var(--bg)` fallback after `color-mix()` and changed button transparency.
3. HTMLMinifier-Terser 7.2.0 minifies markup, preserving inline text spacing,
   explicit tag boundaries and SVG attribute case. Whitespace nodes inside the
   transformed round menu are retained for pixel-identical WebKit painting; its
   attributes are still minified. The menu boundary uses balanced section tags
   so nested attract slides are protected as a complete element. The transformed
   Game over overlay also retains its layout-sensitive whitespace. JS/CSS are not
   minified again.

Official documentation: [Terser](https://github.com/terser/terser),
[CSSO](https://github.com/css/csso),
[HTMLMinifier-Terser](https://github.com/terser/html-minifier-terser).
`package-lock.json` pins transitive dependencies. `.gitattributes` keeps the
source/delivery line endings stable. Repeated builds produce identical HTML.

## Physical verification (2026-10-21.13)

Final delivery SHA-256:
`148f844668776db41f260e56b6e5b29e6b4575c5affed280343d4c1651f07c03`.
Galaxy S10e SM-G970F, Android 12, Chrome 155.0.8059.84: Settings/Help in
browser/fullscreen portrait and both landscape rotations; rotation while open;
paused gameplay, controls, resume/jump and highscore initials/cancel/local save
passed. Normal rAF and 48 trusted touch events; zero browser errors. Screenshots
inspected. Storage, rotation and owned USB/preview helpers restored/closed.
No live API calls or deployment. Report: `output/small-refactor/phone/device`.

## Size (UTF-8 bytes, build 2026-10-21.13)

| Stage | Bytes |
| --- | ---: |
| Readable source | 558,506 |
| After Terser | 363,301 |
| After CSSO | 322,321 |
| Final HTML | 314,392 |

Saved: **244,114 bytes (43.71%)**, before transport compression. About 31 KB
are the two embedded OFL fonts (base64 WOFF2, which compresses poorly). The optional
songs are not counted or altered by the HTML build. `release/size-report.json` contains these stages,
tool versions, SHA-256 hashes and measured gzip/Brotli sizes. Gzip level 9 gives
109,348 bytes; Brotli quality 11 gives 98,132 bytes. These are measurements only;
this build does not configure a server or create required compressed sidecars.

## Use

- Copy/open `release/dino.html` directly for offline `file://` play. It has no
  required external JavaScript, CSS or image files. To use menu music, optionally
  place `dino-boom-in-the-dunes.mp3` (default) and/or `dino-jump-jump.mp3` beside
  it. Choose the song in Settings → Theme song; the choice is saved locally.
- On the existing website, use it as the replacement **dino.html in the original
  directory**. Keep the existing PHP API, configuration/data, service worker,
  manifest/icons and both optional songs in their existing locations. This preserves
  relative API/PWA URLs. The generated `release` folder alone is not a complete
  PHP/PWA deployment. Nothing is uploaded or deployed by the build.
- Do not edit the generated HTML. Rebuild after changing the source. The source
  game/build identifier stays unchanged because this is packaging of that game.
- Hosted updates now pin HTML to the active worker's cache. Publish the generated
  HTML together with the updated root worker (v39 for this build). Increment both
  BUILD and CACHE_NAME on future releases. See [UPDATES.md](UPDATES.md) for the
  staging/consent contract, first-upgrade limitation and upload order.

## Upload

`npm run deploy` publishes the finished delivery; `npm run build` never uploads.
Run it only after the build and the verification below pass.

1. Create `ftp.txt` in the repository root (git-ignored, never commit it): the
   first line is the game URL, then `Server:`, `Username:` and `Passwort:` lines.
   The URL path (`/apps/dino/`) is also the FTP target directory.
2. `npm run deploy -- --dry-run` checks the delivery without uploading: it needs
   `BUILD` in `release/dino.html`, a delivery newer than `dino.html`, and refuses
   when the live worker already has the same `CACHE_NAME` (override: `--force`).
3. `npm run deploy` uploads `release/dino.html` as `dino.html`, then
   `service-worker.js` **last**, so a worker never caches a mismatched game. It
   uses the system `curl` (FTP over TLS required; `--plain-ftp` allows
   unencrypted FTP). The password is passed through stdin, not as an argument.
4. It then fetches both files over HTTPS and compares SHA-256 hashes with the
   local files. A mismatch fails the command.

Extra files are uploaded only on request, before the HTML:
`npm run deploy -- --also highscores-lib.php --also manifest.webmanifest`.
Only a fixed list is accepted (PHP API/admin scripts, manifest, icons, songs).
Configuration, `highscores-data/`, secrets and tests can never be uploaded.
Upload `highscores-lib.php` when the score rules changed (see LEVEL-BONUS.md).

## Verify

Use `DINO_PLAYWRIGHT` for an existing Playwright ESM installation if necessary;
see `FEATHER.md` for the Windows WebKit setup. Run with Chromium, then with
`DINO_BROWSER=webkit`:

```powershell
node tests/release.mjs
node tests/game-contract.mjs release/dino.html
node tests/jump-feather.mjs release/dino.html
node tests/shield-bubble.mjs release/dino.html
node tests/attract-screen.mjs release/dino.html
node tests/game-over-flow.mjs release/dino.html
```

`tests/release.mjs` checks hashes/reproducibility and compares both DOM UI and
gameplay against the readable source: start/attract demo/power-ups, settings, help, feather gameplay,
shield pickup/protection/duck/pop,
automatic name entry, the brief Game over overlay and return to attract in four
desktop/mobile layouts. The lifecycle
suite audits named client/PHP constants in the readable source and exercises the
selected delivery artifact in the browser, including standalone file/offline and
hosted service-worker fallback. Live highscore submission is disabled.
The fixture normalizes pointer position before screenshots to compare native
controls in the same hover state. Pixel comparisons remain exact. Optional
`DINO_RELEASE_LAYOUTS` selects comma-separated layout names for diagnostics;
leave it unset for the complete comparison.

Run `node tests/skill-client.mjs release/dino.html` for the installed web-game
skill action client. Set `DINO_TEST_OUTPUT=output/release` for reports/screenshots.

For an authorized Android phone with Chrome open, start a temporary safe server
using `node tests/android-preview.cjs release/dino.html`, establish the ADB
bridges documented in `FEATHER.md`, and run
`node tests/android-feather.mjs release/dino.html`. The fixture adds test/API
configuration before the unchanged compact scripts. SHA-256 checks verify which
artifact is loaded and cached. The runner restores rotation and closes its tab;
stop the temporary server and remove the test USB bridges afterward.

## Current delivery verification (2026-10-21.12)

Delivery: 314376 bytes, SHA-256
`2ceb3cccb162ea7c9a9341b1c4cb8428ee9be63b9ba05088e3821d58c3f79b33`.
Worker cache v38. Settings and Help now appear as bounded modal overlays over
visible paused gameplay. Help retains its embedded offline content, browser Back
and direct links, with Escape and native modal focus handling. The new
`menu-overlays.mjs` suite verifies three desktop/touch layouts in Chromium/WebKit.
All 86 Chromium transition checks and 64 source/release comparisons pass;
installed skill client and lifecycle/offline7 pass. Screenshots inspected. No deployment.
Physical Galaxy S10e (Android12, Chrome155.0.8059.84) also passes six real
browser/fullscreen orientations, dialog rotation, touch settings/resume/jump and
highscore name cancel/local save using this exact hash. Normal rAF,48 trusted
touches; no emulation or live API. Runner restores origin storage/rotation and
closes its own tab. Artifacts: `output/menu-overlays/device`.

## Previous delivery verification (2026-10-21.11)

Delivery: 312960 bytes, SHA-256
`57bce47e6257d1e2f7e034697a30070ac1b35dd6e7e370f64d723126891969d9`.
Worker cache v37. Highscore name entry is a centered modal overlay over the
frozen gameplay, with a light backdrop and responsive controls. The highscore
list retains its full-screen layout. Chromium round-end/save/cancel checks pass
three desktop/touch layouts on source and delivery; WebKit delivery passes the
same three layouts. All 86 Chromium screen-transition checks and the installed
skill client pass. All 64 source/release UI and gameplay scenes are pixel-identical
in Chromium. Screenshots inspected, including compact landscape. No deployment.

## Previous delivery verification (2026-10-21.10)

Delivery: 311132 bytes, SHA-256
`ed56c93a53e643b477f2aa563180c9d9304e0b7594ad30198060d9b2ba8d49a8`.
Worker cache v36. Safe level/checkpoint bonus tally, bounded earned points,
synchronized coin flight/audio and automatic attract loop without preview controls.
See [LEVEL-BONUS.md](LEVEL-BONUS.md) for rules and test evidence.
**Publish the updated `highscores-lib.php` before or with the HTML and worker**:
it accepts the new bonus-inclusive score bound. Existing score data is retained.
No upload or deployment is part of the build.

## Previous delivery verification (2026-10-21.9)

Delivery: 307991 bytes, SHA-256
`f30ce710622a30c73c4a4c9546086041cdf95039cf08a97d33b29b400b1a84cf`.
Worker cache v35. Fixed sun anchor shared by all renderers: scores, demo and
power-up screens no longer jump between idle drift and the running demo position.
Attract regression measures the painted sun across repeated switches/demo resets
in ten layouts. Installed skill client passes; screenshots inspected.
No deployment.

## Previous delivery verification (2026-10-21.8)

Delivery: 308093 bytes, SHA-256
`f7d75d1a99caa78102e82feaf7c5a799b617715c7d95d38bd33487bd54a3504f`.
Worker cache v34. More readable eye-roll in the existing random jump and idle
poses: lift, upper-eye sweep, hold and return, with a slightly enlarged eye.
Reduced motion uses a static upward glance; blinking cannot mask the expression.
Installed skill client passes; six-phase jump/idle/reduced-motion captures and
gameplay state/screenshots inspected. No deployment.

## Previous delivery verification (2026-10-21.7)

Delivery: 307951 bytes, SHA-256
`1560f52d7ade6a6920d4ab2fa50c393f56a07a659e23b67c36ca06fbe62772a3`.
Worker cache v33. Sun and halo moved left of the lives/1UP HUD, including idle
drift. Chromium delivery lives checks pass desktop, portrait and compact landscape;
screenshots inspected. Installed skill client verifies gameplay. No deployment.

## Previous delivery verification (2026-10-21.6)

Delivery: 307950 bytes, SHA-256
`4aada6ade9d10fcf8b7cae0dd6f9ce4d79ff135f75b822cb34d377ac199aa90b`.
Worker cache v32. Arcade credits, a prominent empty-wallet INSERT COIN target,
animated counter/coin feedback and metallic coin sound; see [COINS.md](COINS.md).
Chromium and WebKit delivery coin checks pass nine layouts each. Physical
Galaxy S10e checks pass ten browser/fullscreen orientation states with trusted
touch, normal animation frames, actual audio signal and non-overlapping actions.
Source/release rendering, lifecycle and skill-client evidence is recorded in
[progress.md](progress.md). No deployment.

## Previous delivery verification (2026-10-21.5)

Delivery: 296079 bytes, SHA-256
`22f5e947a64ce03318a911d77a7c280817d084b10e74bd7c70fc1aa44f8a8694`.
Worker cache v31. Three starting lives, score-based extra lives up to five,
recovery protection and responsive heart/next-reward HUD; see [LIVES.md](LIVES.md).
Chromium source/release64 scenes are pixel-identical; final lives checks pass
Chromium/WebKit delivery in3 layouts each. Lifecycle/offline and skill client
pass; shield, boss, feather, training, round-end and architecture regressions
pass. Validation and limitations: `doc/progress.md`; artifacts: `output/lives/`.
No deployment or physical-device run in this iteration.

## Previous delivery verification (2026-10-21.4)

Delivery: 292344 bytes, SHA-256
`fe5f0727a0b67ea4a2e3f47f802f9307ca546300044aac75ec0ed38bf0fca875`.
Worker cache: v30. Includes the saved Arcade effects switch, automatic menu
performance probe, expanded menu/initials lettering and sprite prewarming.
Reproducible build; Chromium compares64 source/release scenes pixel-identically.
Effects-setting checks pass Chromium source/delivery and WebKit delivery;
arcade checks pass delivery in both engines. Chromium delivery lifecycle/offline7
and the installed skill client pass. Results: `doc/progress.md`; artifacts:
`output/effects-release/`. The physical Galaxy S10e run of
`tests/android-effects.mjs` (probe kept effects on; busy-round frame times) is
recorded in [ARCADE.md](ARCADE.md). No deployment this iteration.

## Previous delivery verification (2026-10-21.3)

Delivery: 284581 bytes, SHA-256
`2731337d73f57b1647b8eaf1f293113690700f72581ee170fd43dd2d684d3250`.
Chromium compares all 64 source/release scenes pixel-identically. The arcade
suite passes Chromium source/delivery and WebKit source/delivery in three
layouts; Chromium attract (10 layouts), round-end flow (source and delivery),
86 transition checks, lifecycle/offline 7, architecture 11, skill client, boss,
shield, feather, rock training, volume and update suites pass; WebKit attract
passes 10 layouts. Details: [ARCADE.md](ARCADE.md). No physical-device test or
deployment in this iteration.

## Previous delivery verification (2026-10-21.2)

Delivery: 242053 bytes, SHA-256
`fd2ba41cedfc72c8b2b44e9b2d1a2896221b822b31087910ce2f0f48ba8ecb2d`.
Rebuilding reproduces the artifact. Chromium compares all 64 source/release
UI/gameplay scenes pixel-identically. New arcade checks pass Chromium source
and WebKit delivery in three desktop/touch layouts each. Existing attract
checks pass ten layouts per engine; Chromium passes 86 screen-transition checks,
seven lifecycle/offline scenarios, round-end flow in three layouts and the
installed develop-web-game action client. WebKit delivery passes the seven
lifecycle/offline scenarios and round-end flow in three layouts. Evidence: `output/arcade/` and
[ARCADE.md](ARCADE.md). No physical-device test or deployment in this iteration.

## Previous delivery verification (2026-10-21.1)

Delivery: 239028 bytes, SHA-256
`407253dbd00a094947b14bf39976a71d2aadfed799b643cfb2c4b87dfaa4edfe`.
Rebuilding reproduces the artifact. Chromium compares all 64 source/release
UI/gameplay scenes pixel-identically. The actual minified delivery passes the
real-worker update suite in three desktop/touch layouts per engine (Chromium
and WebKit), including offline activation, two tabs, waiting-worker replacement,
failed precaching, timeout/retry and natural activation. Both engines also pass
all seven lifecycle/file/offline scenarios and the three-layout round-end/name
entry suite. Chromium passes real MP3 playback, offline switching and all six
cached range cases, plus the installed skill client.

Screenshots of notice layouts, Help/About version, offline gameplay, dark/reduced
motion and activation retry were inspected. Reports: `output/updates/`, including
`comparison/comparison-chromium/report.json`. These are desktop browsers and
mobile emulation; no physical-phone verification or production upload was done.
See [UPDATES.md](UPDATES.md) before publishing HTML with its updated worker.

## Previous delivery verification (2026-10-19.5)

Reinstalled pinned tools with `npm ci` and rebuilt using `npm run build`.
The result is byte-identical to the existing delivery: 233679 bytes, SHA-256
`631ad37b2576a25c3262b4d971e3e110d9c922594e1296a200d6e271df0df0a5`.
The generated artifact includes the larger rock opening, endless feedback,
short training intervals, Exit control and regular selected-mode acceleration.

All 64 Chromium source/release scenes compare pixel-identically.
Chromium delivery passes all seven lifecycle/offline scenarios, six-wave
training in three desktop/touch layouts (including acceleration/cap, result
sounds, score isolation and Exit), and the installed skill action client.
Screenshots and text state inspected. Artifacts: `output/release-final/`.
WebKit also passes all seven lifecycle/offline scenarios on this delivery.
The strict WebKit comparison did not complete: first run found one differing
pixel in desktop attract-powerups; the unchanged repeat passed that scene but
found 13 low-intensity differences (maximum10/255) at portrait demo text edges.
Screenshots show no layout defect. Exact comparison tolerances were preserved;
full WebKit pixel identity is not claimed. This verification uses browser
emulation, not a physical phone.

## Previous rock training delivery verification (before endless feedback)

Build `2026-10-19.1`, delivery SHA-256:
`1e7c5ce55873aecc6011f77748e08046aff41103a7ec4499793f57824c1339d6`.
Chromium compares all 64 source/release scenes pixel-identically. Training
checks cover consecutive rocks, score isolation and next-round switching in
desktop and touch layouts; see BOSS.md. Physical verification below is for the
previous build.

## Stone Jaw physical delivery verification

Build `2026-10-18.12`, delivery SHA-256:
`ad05658b85c3d1a7a6204ec4b564868edb85a8496831429b26c09d11afa28e6d`.
Physical Galaxy S10e/SM-G970F, Android12, Chrome155.0.8059.81 passed 14 boss
scenarios in portrait/landscape with normal rAF and trusted touch: clean passage
at three selected speeds, pause/paused rotation, both collision bands, shield
shatter and reduced motion. Eligibility/other pickups are controlled fixtures;
no manual stepping or live score submissions. Screenshots inspected, no browser
errors, rotation/storage restored and own helpers closed. See [BOSS.md](BOSS.md)
and `output/rock-boss/physical/device/android-rock-boss.json`.

## Full-width attract delivery

Build `2026-10-17.2`, SHA-256:
`edbddd381b1bdc54f5ab5de07134ec584f6aa21458192a60ccc87c55208badc3`.
Landscape uses the full safe width, a compact height and side-by-side preview
and START. Responsive preview worlds preserve the artwork proportions while
the actual game keeps its existing dimensions. Source and compact attract tests
pass ten layouts per engine, including paused rotation/resizing. Lifecycle and
offline suites pass both artifacts in Chromium/WebKit. All 48 source/delivery
comparison scenes per engine are pixel-identical (96 total). Physical Galaxy A53
attract/touch/shield checks pass against the source on port 8765; the compact artifact
was not directly loaded on the phone. See [ATTRACT.md](ATTRACT.md) and
`output/attract-wide/verification.json`.

## Previous attract delivery verification

Build `2026-10-17.1`, SHA-256:
`9d37db43e1a8c96565a76a77869cd42a470bd551c7c1ff80150fd45d7fb64133`.
The new attract behavior passes five desktop/touch layouts in both engines,
against source and release. All 48 UI/gameplay comparison scenes per engine
(96 total) are pixel-identical. See [ATTRACT.md](ATTRACT.md) and
`output/attract/verification.json` for the validation evidence. The readable
source of this build also passes physical Galaxy A53 tests: attract rotation,
touch starts, shield, feather, restart and offline reload in both orientations.
This phone run used the source through the existing 8765 server, not the compact
artifact. See `output/attract/phone/verification.json` and [ATTRACT.md](ATTRACT.md).

## Previous shield delivery verification

Build `2026-10-16.1`, SHA-256:
`2977b167fd2ae999bf7e2fade85da8b56b2d59af4e2f030e2ccc034f24f6c92d`.
Chromium 151.0.7922.34 and WebKit 26.5 each pass 40 pixel-identical
source/release scenes, including the shield in all four layouts. Further shield
behavior and offline evidence is recorded in [SHIELD.md](SHIELD.md).
The shield build has not been tested on a physical phone.

## Previous physical-device verification (build 2026-10-15.6)

Previously tested delivery SHA-256:
`d8307ad3117e97cc46f8d3ec1d6da113d1fbd7e3648844073ad24aa4046f3072`.

- Chromium 151.0.7922.34 and WebKit 26.5: all 24 UI/gameplay comparisons per
  engine are pixel-identical; all seven lifecycle/offline scenarios and three
  feather desktop/phone layouts per engine pass. The skill action client passes.
- Connected Galaxy A53/SM-A536B, Android 16, Chrome 155.0.8059.79: actual portrait
  and landscape touch controls, feather, duck, pause, help, restart, automatic
  name dialog and service-worker offline reload/air jump pass with this hash.
  No viewport emulation or manual simulation stepping on the phone. Scenarios
  control unrelated hazards/pickup locations. Direct Android `file://` opening
  was not tested; standalone file behavior passed in both desktop engines.
- Screenshots inspected, phone rotation settings restored, own test tab closed,
  USB bridges removed and temporary server stopped. No live score submissions.
- Reports/screenshots: `output/release`; aggregate `verification.json`.

## Arcade fonts and event lettering (2026-10-21.3)

Embedded Lilita One/Press Start 2P (OFL), pixel HUD with milestone digit wave,
cached Canvas callouts, LEVEL banners, short event shake, title letter drop,
GAME OVER slam and score tally. Worker cache is v29; publish the rebuilt HTML
and worker together using [UPDATES.md](UPDATES.md). See [ARCADE.md](ARCADE.md).

## Arcade presentation (2026-10-21.2)

Larger gold/cream title, layered text depth/glow, anchored START label pulse and
light sweep, readable score milestone punches, record emphasis and larger
GAME OVER points. Existing pause and reduced-motion behavior apply. Design
references and repeatable checks: [ARCADE.md](ARCADE.md). Worker cache is v28;
publish the rebuilt HTML and worker together using [UPDATES.md](UPDATES.md).
