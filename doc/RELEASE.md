# Compact delivery

`release/dino.html` is the generated standalone delivery file. Keep editing the
readable root `dino.html`; the game itself still needs no build step to run.

## Rebuild

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

## Size (UTF-8 bytes, build 2026-10-21.6)

| Stage | Bytes |
| --- | ---: |
| Readable source | 546,148 |
| After Terser | 355,698 |
| After CSSO | 315,719 |
| Final HTML | 307,950 |

Saved: **238,198 bytes (43.61%)**, before transport compression. About 31 KB
are the two embedded OFL fonts (base64 WOFF2, which compresses poorly). The optional
songs are not counted or altered by the HTML build. `release/size-report.json` contains these stages,
tool versions, SHA-256 hashes and measured gzip/Brotli sizes. Gzip level 9 gives
107,593 bytes; Brotli quality 11 gives 96,667 bytes. These are measurements only;
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
  HTML together with the updated root worker (v32 for this build). Increment both
  BUILD and CACHE_NAME on future releases. See [UPDATES.md](UPDATES.md) for the
  staging/consent contract, first-upgrade limitation and upload order.

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

## Current delivery verification (2026-10-21.6)

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
