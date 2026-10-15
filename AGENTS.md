# Repository Guidelines

## Project Structure & Module Organization

- `dino.html` contains the UI, styles, and Canvas 2D game code, including `Game`, `Renderer`, `Horizon`, and `Runner`.
- `service-worker.js` and `manifest.webmanifest` support installation and offline assets. Images, icons, and optional menu music live in the root.
- `highscores.php` exposes the API; `highscores-lib.php` handles validation and file storage; `admin.php` provides CLI moderation.
- `tests/` contains browser regression scripts. `output/` holds generated screenshots and JSON reports. `progress.md` records findings and validation.
- `highscores-data/` holds mutable scores, locks, rate-limit data, and secrets.

## Build, Test, and Development Commands

There is no build step, package manifest, or configured linter. Use modern Node.js supporting `fetch` and `import.meta.dirname`; the backend requires PHP 7.4+.

- `node dev-server.js`: serve the game at `http://127.0.0.1:8765/dino.html`. Override the port with `$env:DINO_DEV_PORT = '9000'` in PowerShell. This server proxies highscore requests to the live API; it does not execute local PHP.
- `node --check dev-server.js`: check preview-server syntax.
- `node tests/game-contract.mjs`: run baseline-independent lifecycle, score-rule,
  standalone offline file and hosted offline installation checks. It starts its
  own fixture server and never contacts the live highscore service.
- `node tests/skill-client.mjs`: run the installed develop-web-game Playwright
  client against a deterministic fixture with online scores disabled.
- `php -l highscores-lib.php`: check PHP syntax; repeat for other changed PHP files.
- With the preview running, execute `node tests/render-cache.mjs <baseline.html>` or `node tests/snow-caps.mjs <baseline.html>`. Both require a saved pre-change HTML file, Playwright, and its Chromium browser. `DINO_PLAYWRIGHT` can point to an installed Playwright ESM entry.
- Set `DINO_TEST_OUTPUT` to direct comparison artifacts to a separate directory.
  Keep the game in one self-contained HTML, with no required sibling assets for
  `file://` play. The menu song is optional; hosted PWA assets remain separate.

## Coding Style & Naming Conventions

Follow surrounding indentation: two-space nesting in HTML/JavaScript and four spaces in PHP. Use JavaScript `camelCase`, class `PascalCase`, uppercase constants, and PHP `dino_` prefixed snake_case functions. Preserve Chromium attribution. Keep shared gameplay/API constants synchronized and update `BUILD` when sharing a changed game build.

## Testing Guidelines

Tests use Playwright and Node strict assertions; no coverage percentage is configured. Name scripts descriptively under `tests/`, such as `snow-caps.mjs`. Validate deterministic gameplay, rendering, mobile orientations, and browser errors. Inspect generated screenshots; preserve existing visual tolerances. Disable highscore submission through `window.__dinoTest.highscoreApiUrl = null` in browser tests.

## Commit & Pull Request Guidelines

Use Git with short imperative commit subjects, such as `Fix mountain snow contours`. Include the behavior changed, verification commands, relevant issues, and before/after screenshots for visual changes in pull requests.

## Configuration & Data

Keep secrets and mutable score data out of contributions. Configure storage through `highscores.config.php` or `DINO_HIGHSCORES_CONFIG`; prefer a data directory outside the web root. Preserve locking and atomic file replacement.
