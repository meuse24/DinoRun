# Repository Guidelines

Project documentation lives in `doc/`. Commands and plain project paths below
are relative to the repository root unless stated otherwise. Keep this file
in the repository root so its instructions apply to the entire project.

## Project Structure & Module Organization

- `dino.html` contains the UI, styles, and Canvas 2D game code, including `Game`, `Renderer`, `Horizon`, and `Runner`.
- `service-worker.js` and `manifest.webmanifest` support installation and offline assets. Images, icons, and optional menu music live in the root.
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

- `npm ci` then `npm run build`: generate `release/dino.html` and its size/hash
  report using Terser, CSSO and HTMLMinifier-Terser. See `doc/RELEASE.md`. Keep the
  source HTML readable; tools are development dependencies only.
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
