# Repository Guidelines

Project documentation lives in `doc/`; start with `doc/README.md`.
Completed plans and historical reports live in `doc/archive/`. Commands and plain project paths below
are relative to the repository root unless stated otherwise. Keep this file
in the repository root so its instructions apply to the entire project.

## Project Structure & Module Organization

- `dino.html` contains the UI, styles, and Canvas 2D game code, including `Game`, `Renderer`, `Horizon`, and `Runner`.
- `dino-android/` is the Bubblewrap Trusted Web Activity project. See
  `doc/ANDROID.md` for tools, signing backup, build/install and domain verification.
  Keep its `signing/`, local tool paths and generated APK/AAB files out of Git.
- `service-worker.js` and `manifest.webmanifest` support installation and offline assets.
  Images/icons live in `assets/images/`; optional MP3s live beside `dino.html` in the repository root.
  Local WAV originals live in the Git-ignored `asset-sources/audio/`.
- `highscores.php` exposes the API; `highscores-lib.php` handles validation and file storage; `admin.php` provides CLI moderation.
- `score-console.php` provides password-protected web moderation, disabled until
  configured. `highscores-admin-lib.php` shares backups/mutations with the CLI.
  Web password changes persist a guarded hash in `data_dir/admin-password.php`;
  replacing the configured bootstrap hash resets it and revokes sessions.
  See `doc/ADMIN.md`; keep password hashes and runtime state out of Git.
- `tests/` contains browser regression scripts. `output/` holds generated screenshots and JSON reports. `doc/progress.md` records findings and validation.
- `highscores-data/` holds mutable scores, locks, rate-limit data, and secrets.

## Build, Test, and Development Commands

The readable game runs without a build step. Optional delivery tooling uses
`package.json`/`package-lock.json`; there is no configured linter. Use modern
Node.js supporting `fetch` and `import.meta.dirname`; the backend requires PHP 7.4+.

- `npm test` / `npm run test:core`: architecture and lifecycle/offline checks.
- `npm run test:features [-- game.html]`: sequential browser feature suites.
- `npm run test:release`: source/release comparison and key delivery regressions;
  `npm run test:comparison` runs only the comparison. See `doc/TESTING.md`.
- Playwright is a pinned local development dependency. After `npm ci`, install
  its browsers with `npx playwright install chromium webkit`. Shared test helpers
  live in `tests/helpers/`; `DINO_PLAYWRIGHT` remains an optional override.

- `npm ci` then `npm run build`: generate `release/dino.html` and its size/hash
  report using Terser, CSSO and HTMLMinifier-Terser. See `doc/RELEASE.md`. Keep the
  source HTML readable; tools are development dependencies only.
- `npm run deploy [-- --dry-run] [-- --also <file>]`: upload hosted media and
  manifest, optional extras, `release/dino.html`, then `service-worker.js` via
  FTPS using the git-ignored `ftp.txt`. Verify static hashes over HTTPS.
  Never run it without the user's request; see `doc/RELEASE.md`.
- `node tests/release.mjs`: compare source/release UI, rendering and state in
  desktop/mobile layouts; accepts `DINO_BROWSER=webkit`.

- `node dev-server.js`: serve the game at `http://127.0.0.1:8765/dino.html`. Override the port with `$env:DINO_DEV_PORT = '9000'` in PowerShell. This server proxies highscore requests to the live API; it does not execute local PHP.
- `node --check dev-server.js`: check preview-server syntax.
- `node tests/game-contract.mjs`: run baseline-independent lifecycle, score-rule,
  standalone offline file and hosted offline installation checks. It starts its
  own fixture server and never contacts the live highscore service.
- `node tests/update-notice.mjs [game.html]`: real staged worker updates, safe-menu
  notices, consent/Later, multiple tabs, offline activation, failed downloads and
  activation timeout in desktop/touch layouts. Accepts `DINO_BROWSER=webkit`;
  see `doc/UPDATES.md` for release/cache versioning and hosting instructions.
- `node tests/architecture.mjs`: check the highscore workflow without a DOM,
  deferred responses/retries, independent world widths, mobile rotation and
  automatic name-dialog timing. Also accepts `DINO_BROWSER=webkit`.
- `node tests/skill-client.mjs`: run the installed develop-web-game Playwright
  client against a deterministic fixture with online scores disabled.
  This client, game-contract.mjs, jump-feather.mjs and the Android preview/runner
  accept an optional HTML path to test a generated delivery artifact.
- `node tests/sprite-geometry.mjs <baseline.html>`: compare cached sprite paths,
  animated poses, both bird frames and bounded allocations against a saved
  pre-change HTML. Accepts `DINO_BROWSER`; see `doc/PERFORMANCE.md`.
- `node tests/gc-pooling.mjs <baseline.html>`: deterministic particle reuse,
  cap/reset/interpolation, controller release/disconnect behavior and HUD buffers.
  Accepts `DINO_BROWSER`. `node tests/gc-performance.mjs <baseline.html>` runs
  isolated Chromium work/GC/allocation comparisons; `DINO_CPU_RATE=4` adds CPU
  throttling. Run performance comparisons without concurrent browser suites.
- `node tests/android-gc-performance.mjs <baseline.html>`: physical normal-rAF
  before/after play/night/particle stress, work times and own-page GC traces.
  Requires unlocked Android/Chrome; own origin8893, dynamic ADB forward/scoped
  relay9237, restores rotation/origin storage. See `doc/PERFORMANCE.md`.
- `node tests/jump-feather.mjs`: check feather pickups, all input methods,
  charge/physics/lifecycle/help and phone portrait/landscape emulation using an
  isolated standalone file. Set `DINO_BROWSER=webkit` for the WebKit run;
  `game-contract.mjs` also accepts `DINO_BROWSER`.
- `node tests/shield-bubble.mjs [game.html]`: check shield collection, single-hit
  cactus/bird/cluster protection, Chili/feather interaction, spawning, lifecycle,
  offline rendering and touch portrait/landscape. Accepts `DINO_BROWSER=webkit`;
  see `doc/SHIELD.md` for the player contract and validation evidence.
- `node tests/rock-boss.mjs [game.html]`: Stone Jaw scheduling/corridor safety,
  jump-through trajectories, roof/ledge collisions, shield/Chili/feather, pause,
  reset, rotation and keyboard/touch layouts. Accepts `DINO_BROWSER=webkit`;
  see `doc/BOSS.md` for the player contract and validation evidence.
- `node tests/rock-training.mjs [game.html]`: Debug switch, six consecutive
  rock attempts, survival/result sounds, acceleration/cap, score isolation, exit and reload
  reset in desktop/touch layouts. Accepts `DINO_BROWSER=webkit`.
- `node tests/attract-screen.mjs [game.html]`: check the rotating score/demo/
  power-up preview, persistent Start target, isolated demo, online/local scores,
  pause, reduced motion and ten desktop/touch layouts, including full-width
  landscape and paused orientation changes. Accepts `DINO_BROWSER`.
- `node tests/coins.mjs [game.html]`: zero-credit start gating, deposits,
  persistence, round payment, arcade motion, sound and nine responsive layouts.
  Accepts `DINO_BROWSER=webkit`; see `doc/COINS.md`.
- `node tests/android-coins.mjs [game.html]`: physical Android trusted touch,
  actual coin audio signal, payment and ten browser/fullscreen orientation states.
  Own safe server on8878, scoped CDP relay9224; restores rotation and origin state.
- `node tests/level-bonus.mjs [game.html]`: safe level/checkpoint transitions,
  real obstacle accounting, score caps, coin audio, lives, pause and three layouts.
  Accepts `DINO_BROWSER=webkit`; see `doc/LEVEL-BONUS.md`.
- `php tests/bonus-score.php`: bonus-inclusive server validation boundaries.
- `node tests/android-level-bonus.mjs [game.html]`: physical Android automatic
  attract loop, bonus pause/rotation/resume, touch and actual audio signal;
  own safe server on8879 and scoped CDP relay, restores device/origin settings.
- `node tests/effects-setting.mjs [game.html]`: saved Arcade effects switch,
  Canvas/CSS gating, Help propagation and synthetic performance-probe decisions
  in desktop/touch layouts. Accepts `DINO_BROWSER`; see `doc/ARCADE.md`.
- `node tests/lives.mjs [game.html]`: three-life rounds, growing score reward
  milestones/cap, recovery, cactus/bird/boss and power-up interactions, practice,
  pause/rotation and responsive HUD. Accepts `DINO_BROWSER`; see `doc/LIVES.md`.
- `node tests/android-effects.mjs`: physical-Android effects probe and frame times
  with effects on/off (portrait/landscape); safe preview and bridges as in doc/FEATHER.md.
- `node tests/arcade-type.mjs [game.html]`: embedded arcade faces, callouts/banners,
  anchored START effects, preview pause, readable score milestones, dark colors and dynamic
  reduced motion in desktop/touch layouts. Accepts `DINO_BROWSER`; see
  `doc/ARCADE.md` for design references and verification.
- `node tests/android-preview.cjs` and `node tests/android-feather.mjs`: run the
  controlled physical-Android checks over USB/CDP. Requires Chrome open and the
  ADB bridges documented in doc/FEATHER.md. The runner restores rotation settings,
  closes its own tab and never uses the live score API.
- `node tests/android-attract-proportional.mjs`: check the actual production
  browser and installed TWA attract layout in both landscapes, all three panels,
  portrait demo separation from caption/label/landscape advice,
  delivery hash, aspect, centering and trusted Help/Settings input. Requires the
  app open at its start menu; own dynamic ADB forward, restores rotation and
  fullscreen preference, blocks live scores. See `doc/ANDROID.md`.
- `node tests/android-attract-performance.mjs`: physical fullscreen landscape
  attract FPS per panel with context/density variants (`DINO_PERF_VARIANTS`).
  Requires `DINO_ANDROID_SERIAL`; accepts `DINO_CURRENT_HTML`. Own origin8894,
  dynamic ADB forward/scoped relay9238, restores rotation, blocks live scores.
  Run sequentially; see `doc/PERFORMANCE.md`.
- `node tests/android-sustained-performance.mjs`: one long physical fullscreen
  round (default A53, `release/dino.html`, landscape, 12 min) with a simple pilot
  and refilled lives; FPS/draw/thermal per window. `DINO_SUSTAINED_MIN`,
  `_WINDOW_S`, `_LAYOUT`, `_MIN_FPS`; A/B `_VARIANTS=current,gpu,gpuSingle`, trusted
  taps `_TAP_MS`, rotation `_ROTATE_S`; slow frames tagged with active content.
  Diagnostics: `_NO_OBSTACLES`, `_HIDE`, `_SKIP`, `_BITMAP_HUD`, `_DIRECT_TEXT`.
  Own origin8898/relay9239; temporarily keeps the screen on, restores
  rotation/stay-awake, blocks live scores.
- `node tests/android-attract.mjs`: verify attract rotation, persistent START,
  touch starts and shield collisions on physical Android. Both Android runners
  accept `DINO_ANDROID_URL` for an existing local server and verify its artifact
  hash. `node tests/android-cdp-relay.mjs` optionally scopes CDP to test-created
  tabs when existing Chrome targets block initialization; see doc/FEATHER.md.
- `node tests/android-rock-boss.mjs [game.html]`: physical Stone Jaw touch,
  three approach speeds, pause/rotation, roof/ledge hits, shield and reduced motion.
  Defaults to the safe preview on8877 and scoped relay9224; see `doc/BOSS.md`.
- `php -l highscores-lib.php`: check PHP syntax; repeat for other changed PHP files.
- `node tests/admin-web.mjs`: isolated real-PHP CLI/HTTP/security checks and four
  responsive browser layouts without JavaScript. Requires PHP (`DINO_PHP`) and
  Playwright (`DINO_PLAYWRIGHT`); accepts `DINO_BROWSER=webkit`. Own temporary
  data/config/session directories and PHP server; never contacts the live API.
- `node tests/volume-controls.mjs [game.html]`: music/effects sliders, native
  keyboard/touch input, persistence, master mute and rendered audio scaling.
  Accepts `DINO_BROWSER=webkit`; see `doc/VOLUME.md` for Windows audio harness limits.
- `node tests/theme-songs.mjs [game.html]`: actual MP3 decoding, saved theme-song
  selection, offline switching and cached byte-range responses in Chromium.
  Both optional MP3 files are served from an isolated local fixture.
- `node tests/game-over-flow.mjs [game.html] [--android]`: brief death overlay,
  automatic attract return, name save/cancel, delayed qualification, Off and
  session statistics. Default runs desktop/touch layouts; `--android` uses the
  authorized phone, normal rAF, trusted touch and the safe USB preview/relay.
- `node tests/screen-transitions.mjs [game.html]`: screen transitions (CSS,
  dialog and View Transition paths), input during transitions, focus, close
  paths, reduced motion and latency; accepts `DINO_BROWSER=webkit`. Other
  suites turn transitions off unless `DINO_TRANSITIONS=1`. See `doc/TRANSITIONS.md`.
- `node tests/exit-game.mjs [game.html]`: goodbye Exit closes fresh tabs/app windows
  via a directly launched Chromium, refusal hint, history-free Help in app mode and
  three layouts. Chromium only; see `doc/EXIT.md`.
- `node tests/menu-overlays.mjs [game.html]`: Settings/Help modal sizing,
  paused visible gameplay, scrolling/settings controls, focus isolation, Escape,
  browser Back and direct Help links in desktop/touch layouts. Accepts `DINO_BROWSER`.
- `node tests/android-menu-overlays.mjs [game.html]`: physical Android trusted
  touch, Settings/Help in browser/fullscreen portrait and both landscapes,
  rotation while open, resume/jump and highscore name cancel/save. Own safe
  origin8881; requires scoped CDP relay, restores rotation and origin storage.
- `node tests/android-transitions.mjs`: physical-Android frame times during
  transitions and START latency with/without them; same bridges as above.
- With the preview running, execute `node tests/render-cache.mjs <baseline.html>` or `node tests/snow-caps.mjs <baseline.html>`. Both require a saved pre-change HTML file, Playwright, and its Chromium browser. `DINO_PLAYWRIGHT` can point to an installed Playwright ESM entry.
- Set `DINO_TEST_OUTPUT` to direct comparison artifacts to a separate directory.
  Keep the game in one self-contained HTML, with no required sibling assets for
  `file://` play. The menu song is optional; hosted PWA assets remain separate.
- See `doc/FEATHER.md` for the tested engine versions, Windows WebKit harness
  workarounds and repeatable compatibility commands. Report emulator results
  separately from physical-device verification.

## Coding Style & Naming Conventions

Follow surrounding indentation: two-space nesting in HTML/JavaScript and four spaces in PHP. Use JavaScript `camelCase`, class `PascalCase`, uppercase constants, and PHP `dino_` prefixed snake_case functions. Preserve Chromium attribution. Keep shared gameplay/API constants synchronized and update `BUILD` when sharing a changed game build.

## Testing Guidelines

Tests use Playwright and Node strict assertions; no coverage percentage is configured. Name scripts descriptively under `tests/`, such as `snow-caps.mjs`. Validate deterministic gameplay, rendering, mobile orientations, and browser errors. Inspect generated screenshots; preserve existing visual tolerances. Disable highscore submission through `window.__dinoTest.highscoreApiUrl = null` in browser tests.

## Commit & Pull Request Guidelines

Use Git with short imperative commit subjects, such as `Fix mountain snow contours`. Include the behavior changed, verification commands, relevant issues, and before/after screenshots for visual changes in pull requests.

## Configuration & Data

Keep secrets and mutable score data out of contributions. Configure storage through `highscores.config.php` or `DINO_HIGHSCORES_CONFIG`; prefer a data directory outside the web root. Preserve locking and atomic file replacement.

## Embedded Architecture

- `Game.world` owns logical width; change it through `Game.resize(width)`. Pass
  this world explicitly to simulation entities, renderer and effects. Browser
  orientation detection belongs to the coordinator, not the simulation.
- `HighscoreController` owns round identity, qualification, persistence, online
  loading and retries. It has injected store/API dependencies and no DOM access.
- `HighscoreView` owns dialog rendering, name input and focus. `Runner` decides
  when eligibility may open the dialog, including after the death scene.
- See `doc/ARCHITECTURE.md` for the scoped design and validation procedure.
