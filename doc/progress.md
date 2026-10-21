Original prompt: verschaffe dir einen überblick über das game. verwende die besten skills für 2d vektor game developer und prüfe ob die implementierung der nachfolgenden findings sinn machen. insgesamt oder evtl optional über einen schalter in den settings. ohne einfluß auf das aussehen des games. gib mir deine findings.

## 2026-10-21: Player-controlled updates, implementation and plan

- User requested a researched update notification implemented for the minified game hosted at https://meuse24.info/apps/dino/dino.html, preserving offline and file play; also requested the game version in Help/About. Applied develop-web-game skill. Plan/contract, primary-source research and deployment instructions: UPDATES.md.
- Build 2026-10-21.1, cache v27: stage without skipWaiting, activate on explicit message, reload only the consenting document, leave other tabs' runs alive, quiet safe-menu notice with Later, visibility/update detection, timeout/retry and input lock. Active-version cache-first HTML and cache-scoped assets prevent waiting-cache leakage. Help/About reads the actual BUILD identifier.
- Initial real-worker Chromium and WebKit lifecycle tests passed in three layouts, including no first-install reload, waiting/current installs, gameplay suppression, Later, two tabs, offline activation/play, failed required downloads, missing optional songs and closing all tabs. Chromium baseline-independent contract7 and installed skill client passed. Inspected gameplay and three notice screenshots; changed translucent notice background to opaque for readability. Expanded keyboard/touch, Help and stalled-activation coverage; final source/minified and regression checks in progress.
- Final delivery: 239028 bytes, SHA-256407253dbd00a094947b14bf39976a71d2aadfed799b643cfb2c4b87dfaa4edfe; reproducible build. Chromium final source/delivery update tests pass3 layouts each; WebKit final delivery passes3, including native keyboard/touch, dark/reduced motion, Help/dialog suppression, activation timeout/input lock, third-release-after-other-tab-takeover and cleanup of obsolete/failed caches. Existing source/delivery contract7 passes in Chromium/WebKit; final delivery round-end/name flow passes3 layouts in both engines. Chromium64 source/release scenes pixel-identical; real MP3/offline switching/range6 and installed skill client pass. Inspected notice/Help/version/retry/dark/offline gameplay and skill screenshots; syntax and diff checks clean. Native fullscreen activation excludes update-notice input. No live score calls, phone test, upload, commit or remaining implementation TODO. Publish instructions and v26 migration limitation recorded in UPDATES.md; release notes and AGENTS command updated. Production read-only HEAD checks confirmed correct MIME types and validators, previous233679-byte HTML still hosted.

## 2026-10-13: Performance review

- Review only; no changes to game implementation, assets, settings, physics or build number.
- Applied develop-web-game skill. Native Canvas 2D renderer; Phaser skill does not apply to this implementation.
- Reviewed Game, Renderer, Horizon, Effects, Runner, SessionView, diagnostics, input, audio, highscore integration and service worker.
- Checked Canvas and Path2D behavior against WHATWG HTML and MDN primary documentation.
- Ran existing skill Playwright client against local dev-server, with start, jump and duck actions. Visually inspected output/performance-review/skill-client/shot-0.png; no error artifact produced.
- Additional browser review: desktop, portrait DPR 3, landscape DPR 3, prefers-reduced-motion. Verified jump, landing, duck, particle cap, settings pause/resume and absence of page errors. Inspected screenshots. Runtime evidence: output/performance-review/runtime-review.json.
- Short frozen-state instrumentation of 120 Renderer.draw calls measures CPU submission/preparation only, excludes asynchronous rendering/compositing, and cannot establish actual mobile FPS. Mountains account for roughly 46–50% in these artificial runs.
- Landscape emulation: CSS canvas 828 x 303.59, backing 2400 x 880, internal scale 4. Portrait: CSS 366 x 191.70, backing 1098 x 575, internal scale 2.614.
- Main opportunity without intended visual change: bounded cache of deterministic mountain geometry and retained vector paths; keep dynamic shading, parallax, clipping, cloud occlusion, subpixel motion and gameplay RNG intact.
- Cactus/cloud Path2D caches are secondary. Raster sprites require visual equivalence checks for subpixel sampling, scaling, alpha composition and resizing; existing ghost and GO sprites already use caching.
- willReadFrequently is a readback optimization hint, not a portable guarantee of higher FPS or main-thread CPU rendering. Existing code documents A53 improvement from 34 to 60 FPS and cached ghost avoidance of a severe canvas-filter slowdown. Preserve this evidence; future backend override should be measured on real devices and requires context recreation/reload.
- Reduced motion already prevents new particles entirely. Halving particles or reducing backing resolution changes visuals and fails the strict appearance requirement.
- Filtering bounds live objects but allocates new arrays. Biggest allocation candidate is per-frame mountain geometry. Stable in-place particle compaction/pooling is optional if profiling shows GC stalls; preserve draw order and cosmetic RNG.
- Rendering follows requestAnimationFrame, not a 60 FPS render cap. High-refresh devices can draw more than 60 times/sec. An optional render cap changes motion smoothness.
- Follow-up recommendation: profile real target devices using existing opt-in report (FPS, median/p95/max frame intervals), add update/render timing if needed; compare day/night, turbo, landing, death/ghost and orientation. No unsupported claim that 95% of devices achieve 60 FPS.
- If implementation is requested later, prioritize geometry/Path2D caching with image comparisons across scenes, scales and transitions. Do not introduce reduced graphics silently.

## 2026-10-13: Implemented vector caches (build 2026-10-13.1)

- User authorized the preferred implementation: bounded geometry caching, targeted vector path caches, fewer temporary allocations, no graphics reduction and no settings switch.
- Renderer holds exactly two viewport-sized mountain geometry/path windows. A window is rebuilt when its world tile, logical viewport width or geometry parameters change; coordinates remain near the viewport even in long runs. Paths preserve original face order, quadratic cactus corners, cloud subpaths, night shading, cloud occlusion and fractional movement.
- Two lazy cactus path entries; cloud paths and rounded RGB strings cached with weak references to existing interpolated views. Paths are independent of pixel density; raster caches were not introduced.
- Stable in-place compaction of obstacle/cloud/particle arrays preserves ordering, RNG consumption and the 100-particle cap. Particle palettes now use shared constants.
- Canvas sizing formula, context backend selection, settings markup and all simulation constants are unchanged. Build identifier updated.
- Added render_game_to_text plus opt-in __dinoTest.manualFrames/advanceTime for deterministic browser tests. Normal play keeps the requestAnimationFrame loop.
- Added tests/render-cache.mjs. Run with the original HTML as its first argument and a local preview URL as its optional second argument. DINO_PLAYWRIGHT may name an installed Playwright ESM entry. The original reference is currently at %TEMP%/dino-performance-review/dino.before.html.
- Passed 70 deterministic before/after image comparisons: desktop, mobile portrait/landscape, dark scheme and reduced motion; day/night transitions, tile boundaries, very long world distances, boost/particles, jump/duck, ghost, idle and resize on an existing renderer. Maximum measured channel difference: 5/255; maximum changed pixel fraction: 0.01175%. These are sparse antialiasing differences from translated retained vectors, not exact pixel identity. Tests gate channel differences <=8 and changed area <0.02%.
- Passed 12,000 frame advances per configuration against the original code (five configurations), comparing complete sampled simulation/effect traces. Included 191 landings, 41 destroyed obstacles, 21 collisions/restarts and 852 spark events per run. Particle maximum remained 97 in this scenario; cap 100 separately confirmed.
- Cache reuse/bounds validated through 1,000 world positions: two windows, at most 11 mountains per window in the tested viewports; cactus paths reused. Obstacle/cloud/particle arrays reused during updates.
- Existing skill Playwright client ran against final build using deterministic frames. Visually inspected output/render-cache/skill-client-final/shot-0.png and JSON state. No console/page errors. Inline JavaScript syntax passed.
- Runtime review also confirmed jump/landing/duck, particle cap and settings pause/resume after cache changes. Output/performance-review/runtime-review.json now contains the post-change review (the initial report was overwritten by that follow-up run).
- Evidence: output/render-cache/visual-comparison.json and runtime-comparison.json. Paired scrolling CPU drawing measurements showed modest savings (roughly 3–8% in most tested contexts), not a guaranteed FPS increase on actual phones. Rasterization dominates at high backing resolution; do not report the larger earlier frozen-state CPU preparation reduction as a full rendering speedup.
- WebKit verification was attempted but the installed Windows engine could not launch (spawn UNKNOWN). Chromium verification passed; Safari/iOS hardware remains untested.
- Follow-up: if tuning further, measure actual target phones via the existing opt-in log. Do not lower resolution, particle quantity or frame rate without a separate user request.

## 2026-10-13: Snow caps follow mountain contours (build 2026-10-13.2)

- User reported that the snow tips no longer fit the mountains. The fixed-width snow polygons were also present in the pre-optimization reference; irregular flanks exposed their mismatch.
- Snow paths now trace the actual summit/flank/shoulder segments to the snowline. Interior notches scale with each flank instead of using fixed horizontal offsets. Generation remains inside the bounded mountain tile cache.
- Added tests/snow-caps.mjs with exact non-snow image comparisons and segment containment checks. Passed 54 image comparisons across desktop, portrait and landscape/dark configurations, day/night transitions, fractional offsets, tile crossings and long distances. Passed 156 mountain contour checks, including narrow peaks and distant world tiles; no page errors.
- Ran the existing skill Playwright client with start, jump and duck actions. Inspected its gameplay screenshot/state and the before/after desktop/mobile screenshots. Evidence: output/snow-caps/report.json and output/snow-caps/skill-client.
- Follow-up: no remaining work for this correction. Local files updated; no deployment performed.

## 2026-10-15: Standalone HTML refactoring — contract and plan

- User requested a plan and implementation using Git, with a single playable
  HTML file, offline/file support and only optional external menu music.
- Read develop-web-game skill. Plan: REFACTORING.md. Work branch:
  `refactor/single-html`; original implementation revision: `10f6b21`.
- Added baseline-independent tests/game-contract.mjs. It starts its own isolated
  HTTP fixture and tests a temporary directory containing only dino.html with
  networking disabled, including blocked localStorage. Highscore calls are
  injected and never reach the live service.
- Baseline passed: inline script syntax; client/PHP score constants; desktop,
  portrait, landscape, offline file and blocked-storage file lifecycles. Covered
  keyboard start/jump/duck, settings/help pause, focus/context restoration,
  reduced motion, protected death, local save after online failure, mode change,
  restart clock preservation, new session reset and persistent mode records.
- Playwright reused from D:/projects/pacman/node_modules/playwright/index.mjs;
  set DINO_PLAYWRIGHT to that installed ESM entry when running tests here.
- Baseline HTML saved at output/refactoring/dino.before.html for comparisons.
- Added ignore rules for future runtime data/config, output and node_modules.
  Previously tracked runtime files are untouched and excluded from new commits.
- Next: consolidate resets/preferences, then extract browser/page components;
  run contract and visual/deterministic comparisons against the starting HTML.

## 2026-10-15: Embedded components (build 2026-10-15.1)

- Consolidated Game.resetRound while preserving RNG/entity reset order.
  newSession explicitly resets the session clocks; beginRound preserves them
  and still emits restart before the initial jump.
- GamePreferences owns saved mode and per-mode record keys, validation and a
  memory fallback. Records now survive mode switches with blocked storage for
  the lifetime of the page, without changing persistent storage keys.
- BrowserLifecycle owns focus/context/motion state and browser event bindings,
  pause reasons and input eligibility. Runner retains simulation coordination,
  event effects, pause transitions and the rAF loop.
- GamePage owns settings feedback/dialogs, audio activation, round buttons and
  embedded guide/history navigation. Added an embedded component map and section
  labels. No CSS, physics, vector artwork, render caches or dependencies changed.
- Hosted mode retains manifest/install icon links. File mode embeds the original
  192px icon and no longer requests sibling installation assets. The playable
  artifact remains one HTML; optional music and online services are independent.
- First reset/preferences comparison passed all 70 pixel-exact scenes and all
  five 12,000-frame deterministic traces against 10f6b21. Final full comparison
  follows the browser/page extraction.
- Current contract checks pass all six scenarios, including real rAF pause/resume,
  a live service worker offline reload, touch duck, corrupt saved preferences,
  blocked-storage records and an isolated HTML with no required file requests.
- Ran the actual develop-web-game client via tests/skill-client.mjs. The wrapper
  only locates Playwright and serves a safe fixture; no live score requests.
  Inspected shot-1 plus portrait, standalone-file and hosted-offline screenshots.
- Found an existing hosted-offline dependency on the supposedly optional song:
  cache.addAll included it. Follow-up makes song caching best effort and checks
  installation with its HTTP response deliberately set to 404.

## 2026-10-15: Refactoring completed and verified

- Service-worker cache v4 now caches required installation assets separately from
  the optional song. Hosted offline install/reload succeeds when music is 404.
- Extended game-contract.mjs to six scenarios, real rAF pause/resume, touch duck,
  direct file Help links, corrupt stored preferences, blocked-storage per-mode
  records and explicit standalone request checks. All passed on the final build.
- Final comparison against 10f6b21 passed: 70/70 Canvas scenes pixel-identical
  (max channel difference 0; changed pixels 0); all five simulation/effect traces
  match across 12,000 frame advances per configuration, preserving cache bounds,
  RNG behavior, landings, turbo destruction, collisions and restarts.
- Snow checks passed 54 non-snow image comparisons and 156 contour checks. The
  test now intercepts retained snow paths instead of altering production source.
- Added DINO_TEST_OUTPUT support to comparison scripts. Final reports are under
  output/refactoring/comparison; original tracked historical outputs restored.
- Ran tests/skill-client.mjs using the actual installed skill client, with two
  action bursts for start/jump/landing/duck and a positive score. No error files;
  inspected gameplay screenshot/state and mobile/night/turbo/file/PWA examples.
- Inline script syntax, Node script syntax, service-worker syntax, shared PHP/JS
  constants and git diff --check passed. Backend PHP code is unchanged. No real
  highscore requests or mutable-data changes were made.
- All four plan steps completed; REFACTORING.md contains architecture/results
  and AGENTS.md documents the repeatable commands. Git branch:
  refactor/single-html. No deployment performed.
- Remaining required work: none. Safari/iOS hardware remains untested; no
  performance gain is claimed for this structural refactoring.

## 2026-10-15: Jump feather implementation (build 2026-10-15.2)

- User requested the proposed single-charge feather powerup, a plan, updated
  embedded help, documentation/tests/Git, plus smartphone emulation and WebKit.
- Applied develop-web-game skill; reviewed MDN's game-loop guidance. Plan:
  FEATHER.md. Branch: feature/jump-feather; baseline implementation: 10b7c4b.
- Added JumpFeather with deterministic eligibility/cooldown, swept-AABB pickup,
  no stacking/expiry and one stored air jump. Ground jumps/landing preserve it;
  death, restart and new session clear it. No new gameplay RNG consumption.
- Added a bounded Trex.airJump impulse through the existing Game.jump command.
  Retained ordinary jumps/landing buffer, input rising-edge behavior, speed,
  scoring and collision rules. Chili can coexist; no immunity is added.
- Feather spawn checks follow the horizon update and reserve space behind the
  pickup, preventing future cacti from spawning onto it. Retry unsafe slots.
- Inline Canvas feather badge/collectible, capped turquoise burst feedback,
  collection/use audio and accessible announcements; reduced motion suppresses
  particles. Readiness hint is dismissed as soon as the charge is spent.
- Added the Jump feather help card with every control, persistence/consumption,
  non-stacking, limits and Chili interaction. Extended text state with feather.
- Added tests/jump-feather.mjs: real keyboard/pointer/touch and gamepad edges,
  normal/air/third jumps, pickup mid-jump, no stacking, swept collection, RNG
  isolation, spawn/cooldown/reserved corridor, natural scrolling collection,
  Chili, pause, orientation, reduced motion, altitude and death/reset/help.
- Initial feature tests passed in Chromium 151.0.7922.34 and WebKit 26.5 for
  desktop plus Android/iPhone-style touch/DPR portrait and landscape emulation.
- WebKit's preinstalled host dependency validator failed with spawn UNKNOWN.
  Actual WebKit 26.5 launches successfully when the validator is skipped using
  PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1. Real browser tests then run.
- Windows WebKit's offline flag rejects initial file navigation and offline
  service-worker main navigation. HTTP is blocked before file load, then the
  flag is enabled; hosted offline tests close origin sockets instead. Both
  engines passed the six core lifecycle scenarios with these documented harness
  differences. Physical Android/iPhone hardware remains untested.
- General regressions in progress: 70 scenes and five 12,000-frame traces per
  engine against 10b7c4b, with new spawning disabled via a test-only hook.

## 2026-10-15: Feather compatibility and regression verification

- Final feature runs passed on Chromium 151.0.7922.34 and WebKit 26.5: desktop,
  smartphone portrait and smartphone landscape per engine, with actual touch
  controls plus keyboard/mouse and simulated gamepad rising-edge inputs.
- Final general game-contract runs passed all six scenarios per engine (12
  total), including the isolated single-file game, blocked storage, embedded
  help/direct links, saved records, service-worker fallback with missing music
  and the real rAF pause/resume loop. No uncaught page errors.
- Ran the actual develop-web-game client after implementation and final visual
  adjustment. Inspected normal gameplay, pickup/charge/air-jump and mobile help
  screenshots in both engines. The charge badge stays clear of the dino's face;
  the ready hint is hidden immediately on use. Syntax and diff checks passed.
- The initial legacy comparison exposed a fixture setup issue: its separately
  constructed simulation still enabled the new feather, so new gameplay rightly
  diverged. Explicitly disabled feather in both legacy fixtures; feature tests
  keep it enabled. On mismatch, the test now writes a compact first differing
  state, with unchanged equality/visual tolerances.
- Chromium legacy regression passed: all 70 scenes pixel-identical, all five
  12,000-frame simulation/effect traces equal to Git baseline 10b7c4b.
- Final WebKit legacy comparison passed as well: all 70 scenes pixel-identical
  and all five 12,000-frame traces match. Across both engines: 140 identical
  scenes and 120,000 simulation advances per version; cache/particle checks pass.
- Verified the saved baseline is byte-identical to git show 10b7c4b:dino.html.
  Aggregated final results: output/feather/verification.json. Reports, screenshots
  and engine/harness details are documented in FEATHER.md and test commands in
  AGENTS.md. No live highscore requests, mutable data changes or deployment.
- All requested work completed. No remaining required implementation or testing
  tasks. Physical Android/iPhone hardware testing is outside the emulation run.

## 2026-10-15: Physical Galaxy A53 test and short-screen hit-target fix

- User connected a physical Samsung SM-A536B / Galaxy A53: Android 16, Chrome
  155.0.8059.79. User opened Chrome; connected through ADB/CDP in a new test tab.
  Used no viewport/device emulation and restored OS orientation settings after
  each run (auto=1, rotation=0, read back). Other Chrome tabs remain open.
- Added android-preview.cjs (loopback-only fixture, live scores disabled) and
  android-feather.mjs (normal rAF, trusted CDP touches, actual OS orientation).
  Physics uses real time; pickup locations/unrelated hazards are controlled.
- Passed feather collection, normal/air/third-jump behavior, duck, pause/resume,
  help/back and death/restart/reset in both real orientations. Inspected phone
  screenshots. No page/console errors in the final run.
- Offline reload and a subsequent air jump passed after disconnecting only the
  test origin's USB reverse bridge; service worker supplied the game. No phone
  Wi-Fi/mobile-data setting changes or real highscore requests.
- Found a preexisting restart hit-target bug in the actual short landscape view:
  record feedback extended the result card into an empty portion of the touch
  grid (z-index 2). The transparent grid intercepted Play again. Reproduced in
  a 663x234 touch viewport with a prior record and elementFromPoint diagnostics.
- Fixed with pointer-events:none on the transparent grid and auto on its buttons
  and links. No visual or physics changes. Updated BUILD to 2026-10-15.3.
- Added compact-landscape and direct restart hit-testing to game-contract.mjs.
  Final build passed seven lifecycle scenarios in each engine (14 total), the
  actual-phone test, skill action client, syntax and diff checks. Prior .2 legacy
  image/simulation comparisons were not repeated for this CSS-only fix.
- Short four-second controlled device scenes measured about 60 FPS; this is not
  a sustained-play guarantee. Exact metrics and screenshots are under
  output/feather/device; physical direct-file opening/iPhone remain untested.
- Hardware procedure and outcomes are documented in FEATHER.md and AGENTS.md.

## 2026-10-15: Scoped architecture refactoring

- User authorized extracting the highscore workflow and making world width explicit, followed by a Git commit. Plan and boundaries: ARCHITECTURE.md.
- Baseline: f74c0b8, saved under output/architecture/baseline.html. Keep the single HTML, appearance, gameplay rules and automatic name-dialog timing.
- Build 2026-10-15.6: HighscoreController owns immutable rounds, top-10
  qualification, save/retry locks, online loading and store/API coordination.
  HighscoreView now handles DOM/input/focus; Runner controls automatic entry
  timing. Device detection stays in Runner. No backend changes.
- A late retry cannot clear the lock of a newer round's save. Confirmed old
  saves still persist locally without changing the new round's dialog.
- Game owns world.width, explicitly shared with Horizon, ChiliTurbo,
  JumpFeather, Renderer and Effects. Obstacle creation and Canvas sizing receive
  dimensions explicitly. Game.resize validates width and does not reset a round.
- Added tests/architecture.mjs: the actual controller runs in a Node VM without
  window/document/navigator; injected stores/deferred APIs cover qualification,
  ties, cancellation, blocked names, local fallback, duplicate save/retry locks,
  same-ID retries, stale responses and online refresh. Browser tests cover two
  independent worlds, resize/rotation and automatic dialogs for qualification
  arriving before/after the death scene. All 11 scenarios pass in both engines.
- Existing lifecycle/offline/file tests pass all seven scenarios per engine;
  feather controls/physics/help pass desktop and mobile portrait/landscape in
  Chromium 151.0.7922.34 and WebKit 26.5. No uncaught browser errors.
- Ran the installed develop-web-game client; inspected gameplay, charged feather
  and automatic name-dialog screenshots in both engines. HTML/CSS/icons/help
  before the game script are unchanged from the verified Git baseline.
- Chromium comparison passed 70 pixel-identical scenes and five matching
  12,000-frame simulation/effect traces. Legacy fixtures now pass width/world
  explicitly to separately created models; equality and visual tolerances stay
  unchanged. Initial WebKit comparison produced one empty Canvas PNG; added
  dimension/context-loss diagnostics. The long shared-process run reproduced
  the empty export (1098x575, contextLost=false); fresh-browser probes exported
  both versions correctly. Isolated each comparison version/configuration in a
  fresh browser process, keeping all workloads/tolerances. Final Chromium and
  WebKit reruns passed: 70 pixel-identical scenes and five equal 12,000-frame
  traces per engine (140 scenes, 120,000 frame advances per version in total).
- Docs: ARCHITECTURE.md and AGENTS.md. Artifacts: output/architecture and
  output/feather. Android preview remains stopped; no physical-phone rerun or
  live highscore requests. Inline syntax, Node syntax and diff checks pass.
- Final verification completed on 2026-10-16; aggregate:
  output/architecture/verification.json. No required tasks remain before commit.

## 2026-10-16: Compact standalone delivery

- User requested Terser, CSSO/clean-css, then HTMLMinifier, software installation and exact size savings; subsequently requested the actual connected-phone test.
- Installed pinned local dev tools (Terser 5.51.2, CSSO 5.0.5, HTMLMinifier-Terser 7.2.0), with package lock. Added repeatable build script and separate release/dino.html; readable game source/build remain unchanged.
- Build processes all three inline scripts, then all three styles (including help), then markup. Preserves Chromium attribution, SVG case, inline spacing and public properties; no runtime imports.
- Initial visual comparison caught CSSO restructuring changing utility-button transparency. Reduced case confirms it moves the background fallback after color-mix. Disabled restructuring and rebuilt: 330338 -> 169433 UTF-8 bytes, saved 160905 bytes (48.71%).
- Delivery/report/usage documented in RELEASE.md. Regression fixtures now accept an artifact path; named client/server constant audit still reads the source while browser behavior checks execute the actual release.
- Desktop/mobile browser validation in progress. Physical Galaxy A53 is connected, but Chrome was in the background and CDP did not respond; user asked to bring Chrome forward. Phone settings restored after the failed connection attempt. Temporary safe release preview will be stopped after testing.
- Isolated a second visual difference to HTML whitespace collapse in the round
  menu (WebKit landscape: 194 edge pixels, maximum channel delta 9). JS-only and
  CSS-only builds were identical; preserving that menu's whitespace fixed it.
  Its attributes still pass through HTMLMinifier; other markup is collapsed.
  CSS animation phases are frozen consistently in UI comparisons.
- Final artifact: 169903 bytes, saving 160435 bytes (48.57%). Gzip/Brotli
  measurements: 58300/51775 bytes. The source remains 330338 bytes, unchanged.
- Final physical-device run passed on Galaxy A53/SM-A536B, Android 16, Chrome
  155.0.8059.79 in actual portrait and landscape, with trusted touches and normal
  rAF (controlled pickup/obstacle fixtures). Passed feather/duck/pause, help,
  death/restart, automatic name dialog and offline reload/air jump after removing
  only the test origin's USB bridge. SHA-256 matches the final release artifact.
  Inspected screenshots. Rotation restored (auto=1, rotation=0), own tab closed,
  test bridges removed and temporary server stopped. No live score submissions.
- Final validation passed: 24 pixel-identical source/release UI and gameplay
  scenes per engine (48 total), all seven lifecycle/offline/file scenarios per
  engine, feather checks in three layouts per engine and the installed skill
  action client. Chromium 151.0.7922.34 / WebKit 26.5. The single WebKit settings
  click timeout during a parallel run passed on rerun and in the final suite.
- Final hash d8307ad3117e97cc46f8d3ec1d6da113d1fbd7e3648844073ad24aa4046f3072;
  aggregate output/release/verification.json. Build reproducibility/hash checks,
  inline/Node syntax, npm installation audit (zero findings) and diff checks
  pass. Source dino.html and live backend/data are unchanged. No required work
  remains before commit.

## 2026-10-16: Shield bubble

- Request: plan and implement a collectible bubble surviving one cactus or bird collision; research webgame best practices and use Git.
- Baseline 7530590, clean working tree; branch feat/shield-bubble. Saved source under output/shield/baseline.html. Plan, research and player contract: SHIELD.md.
- Applying develop-web-game skill; retain standalone Canvas architecture, fixed steps, explicit world and independent cosmetic effects.
- Implemented ShieldBubble with deterministic spawn/cooldown, swept pickup and exact one-obstacle protection. Added Canvas shell/emblem/pop, separate sounds, accessible announcements/help, and shared-world/reset integration. Chili preserves protection on cacti; shield catches birds. Worker cache bumped to v5.
- First visual inspection: shell remains readable around running/jumping/ducking dino; no added assets. New offline test uses actual obstacle classes. Fixed fixture isolation (unrelated incoming obstacle) and waits for existing asynchronous live-region/resize updates; no corresponding gameplay defects.
- Source regression suites: Chromium/WebKit contract (7 each), architecture (11 each), feather (3 layouts each) and installed skill action client pass. Source/release shield verification in progress.
- Source/release comparison passes 40 pixel-identical scenes per engine (80 total), including shield pickup/protected/duck/pop. Expanded delivery fixture waits until the opening clear/countdown period before collecting.
- Isolated WebKit landscape-to-portrait test issue: the emulated iPhone profile supplied a portrait screen with an initial landscape viewport. Inner/visual viewport changed but layout viewport/media queries stayed landscape. Matching initial screen to viewport fixes the minimal reproduction (world resizes 600 -> 420). Updated only the new test harness; no game workaround. Full source/release shield reruns underway.
- Corrected-profile shield source tests now pass all three layouts in WebKit 26.5; Chromium 151.0.7922.34 also passes all three. Covered natural/swept collection, deterministic/no-stack/cooldown/safe corridors, real cactus/cluster/bird contacts, next/simultaneous hits, same-step pickup, Chili/feather, duck near-miss, pause/pickup/pop clocks, orientation, reset, reduced motion and help. No browser errors/external requests.
- Delivery contract and feather passed both engines. Delivery shield passed Chromium; corrected-profile WebKit and installed release skill-client are completing. All 80 source/release comparisons passed; inline/Node syntax, hash/size checks and git diff --check pass.
- Final delivery shield checks pass three layouts in Chromium and WebKit; source/delivery installed skill-client runs pass. Contract/feather pass against both artifacts in both engines; 80 source/release comparison scenes are pixel-identical. New shield tests have no uncaught/browser-console errors and request only their isolated HTML.
- Inspected source/delivery gameplay, pickup/shell/jump/duck/pop, touch layouts, help and night images. The WebKit dark-mode snapshot also needed the existing asynchronous media-query update to settle; added a wait and verified source/release night renders separately.
- Final report: output/shield/verification.json. Build 2026-10-16.1, delivery 174403 bytes, SHA-256 2977b167fd2ae999bf7e2fade85da8b56b2d59af4e2f030e2ccc034f24f6c92d. Source is 339320 bytes. Reproducibility, hashes, inline/Node syntax and diff checks pass. Updated release documentation and test instructions.
- No physical-phone shield run, live highscore requests, deployment or backend/data edits. All required implementation/verification tasks complete; optional future check: physical Android/iPhone shield playtest.

## 2026-10-17: Rotating attract screen

- User request: rotate highscores, demo gameplay and power-up showcase; keep a prominent Start button visible across all panels, replacing the former Start game and removing the separate Highscores button.
- Applying develop-web-game. Baseline 3d5aa95 saved under output/attract/baseline.html; branch feat/attract-rotation.
- Plan: responsive idle-only layout, persistent CTA, manual slide dots and pause, accessible/reduced-motion behavior. Isolated silent demo Game/Renderer with private RNG; existing HighscoreController supplies real scores/local fallback, no demo persistence. Verify rotation/input/pause/reset/data isolation in Chromium/WebKit and phone layouts, rebuild delivery and commit.
- Implemented AttractScreen: 8-second top-10 preview (five rows per page), 10-second real-physics demo and 9-second power-up showcase. Persistent orange START replaces the former label/button appearance; removed scores-open and adapted score-dialog focus fallbacks. Three dots select directly; Pause freezes rotation/demo. Reduced motion defaults to paused.
- Demo uses a separate Game/world and seeded random stream, no Runner audio/highscore/stat listeners. Authored opening shows real cactus jumps and bird ducking. Scores reuse HighscoreController, with explicit online/cached/local labels, empty state and bounded refresh; late mode responses cannot overwrite the selected list.
- Initial source checks pass Chromium/WebKit in five layouts, including 320x568 and 663x234. Visual QA caught a small-screen grid auto-minimum shifting Start/covering it with utility controls; bounded the row and compacted cards. Start hit targets, install action and all phase positions now pass. Contract (7) and architecture (11) pass Chromium. Final regressions/delivery checks in progress.
- Final source and compact-delivery attract checks pass all five layouts in Chromium 151.0.7922.34 and WebKit 26.5. Also tested deferred online responses across mode changes, cached fallback, no repeat polling, no focus stealing, reduced motion, actual touch/keyboard starts, private RNG/world and zero record/stat contamination. Demo now guarantees jump and duck examples; manual slide selection keeps a running demo active.
- Release QA found the previous round-menu regex stopped at the first nested section, corrupting the compact DOM. Fixed the builder to find balanced section tags and protect the complete menu with temporary markers. Rebuilt; Chromium passes all 48 source/release scenes. WebKit comparison finishing. No tolerance changes.
- Source contract/architecture pass both engines (7/11 scenarios each); compact contract passes both engines (7 each). Feather/shield regressions and final WebKit comparison are finishing. Installed skill client passes source and compact delivery. Build 2026-10-17.1; worker cache v6; new help line explains the rotating start screen.
- Final validation: Chromium 151.0.7922.34 / WebKit 26.5 attract tests pass five layouts each for source and release. All 96 source/release UI/gameplay scenes are pixel-identical. Source contract/architecture pass 7/11 scenarios per engine; release contract passes 7 per engine; feather and shield regressions pass three layouts each per engine.
- Inspected all attract phases and small portrait/landscape, installation and gameplay screenshots. Installed skill action client passes source/release. Normal-rAF Chromium delivery smoke passes automatic demo rotation and actual mouse start without manual frames. Inline/Node syntax, reproducible build/hash checks and git diff --check pass.
- Final aggregate: output/attract/verification.json. Source 360922 bytes; release 189665 bytes (47.45% smaller), SHA-256 9d37db43e1a8c96565a76a77869cd42a470bd551c7c1ff80150fd45d7fb64133. Plan/behavior/commands/results: ATTRACT.md; release docs updated.
- All implementation work complete. No backend/data changes, live test-score requests, deployment or new physical-phone test. Optional follow-up: physical Android/iPhone UI playtest.

## 2026-10-17: Requested physical-phone verification

- Authorized Galaxy A53 / SM-A536B connected over USB, Android 16, Chrome 155.0.8059.79. Current compact artifact SHA-256 9d37db43e1a8c96565a76a77869cd42a470bd551c7c1ff80150fd45d7fb64133.
- Safe android-preview server running on 8877 (PID recorded under output/attract/device/server.pid), live scores disabled. Added own ADB forward 9223 and reverse 8877; neither existed before this run. Keep them until the requested manual test-page opening is complete; remove own bridges/server after testing.
- Existing android-feather runner cannot complete CDP initialization (30-second and 60-second timeouts). Browser version and read-only Browser.getVersion answer; initialization waits on existing Chrome targets. No physical gameplay test has passed yet. Rotation settings remain restored to auto=1, user_rotation=0.
- A compound direct ADB test-URL opening/screenshot action was rejected by automatic review (blocked by policy). Requested that the user restart Chrome and open http://127.0.0.1:8877/dino.html manually. Awaiting that step before dependent device tests.
- Prepared tests/android-attract.mjs for actual rotation, persistent START targets, trusted touches, each-panel starts, preview pause and shield/next-hit checks. Node syntax passes; physical execution remains pending. No game/build changes or new test claims.
- Resolved the CDP initialization problem with a localhost relay that disables root auto-attach and attaches only newly created test targets. Existing user tabs are left alone. Promoted the helper to tests/android-cdp-relay.mjs with configurable upstream/port and the installed Playwright WebSocket dependency; physical connect/create/read/close probe passes.
- Used the user's existing 8765 server. Stopped the separate safe 8877 preview and removed its bridge. Physical tests verify the actual readable source response SHA-256: 1d39734816f5a6922908f1f535c52b0b226ed8185075f6f3cf2580d1820627fd, build 2026-10-17.1. The compact artifact was not directly loaded in this run; earlier 96 pixel-identical comparisons cover equivalence.
- tests/android-attract.mjs passes actual portrait (320x581) and short landscape (637x234), automatic full-panel rotation, preview/settings pause, fixed/unobstructed START and real touch starts from every panel. Shield pickup/cactus protection/subsequent lethal bird contact passes; 21 trusted touch inputs, no browser errors. Android reports a 60 px target as 59.999992 px; allowed 0.01 px floating-point rounding in the test, with no product change.
- tests/android-feather.mjs now supports an existing local URL, disables live scores before initialization, checks response/cache SHA-256 and restores legacy local record keys. Physical portrait/landscape collection, ground/air jump, no third jump, duck, pause, help, restart and automatic name dialog pass. Offline service-worker reload/air jump passes with the test origin's USB bridge disconnected. 15 trusted touches, no browser errors. Four-second controlled samples: 60.1/59.5 FPS, not a sustained-play guarantee.
- Inspected actual-device attract/power-up/demo, shield/protection/pop and offline air-jump screenshots. Reports: output/attract/phone/device/attract-report.json and output/attract/phone-regression/device/report.json; aggregate output/attract/phone/verification.json.
- Cleanup completed and read back: task-initial rotation restored to auto=1/user_rotation=0; own test tabs closed; own 8877 preview and CDP relay stopped; own reverse 8765/8877 and forward 9223 removed. Original dev-server PID21964 remains running on8765, HTTP200 verified. No live score submissions, game/build changes or deployment.
- Final Node syntax checks for all three Android scripts and git diff --check pass. Physical test tooling and repeatable commands documented in ATTRACT.md, FEATHER.md and repository/release guidelines. All requested phone verification is complete.

## 2026-10-17: Full-width compact landscape attract screen

- Request: use the available window/screen width in landscape and reduce the attract screen's vertical footprint, as gameplay already does. Applying develop-web-game; branch fix/attract-landscape-width, baseline 42ac833 saved under output/attract-wide/baseline.html.
- Confirmed 1080 px attract cap at 1920/1366 desktop widths and a 680 px stacked menu. Plan: remove cap, use the existing Canvas's undistorted 600:220 landscape aspect, arrange preview/START side by side in all landscape windows, keep small-phone targets and portrait layout. Validate responsive bounds/input in Chromium/WebKit, inspect images, rebuild compact delivery and test physical Android if connected.
- First CSS change: all landscape uses the horizontal menu with width/height bounded only by available viewport and Canvas proportions. Typography/cards scale with container width. Build 2026-10-17.2, worker cache v7. Validation in progress.
- Wide/short-window review showed an aspect-ratio width limit would still leave side margins. Final layout uses the full safe width at every landscape ratio, with a maximum 520 px height. The isolated demo and an independent idle backdrop adapt their own world width to the actual Canvas ratio; real gameplay world and physics stay unchanged. This preserves vector proportions instead of stretching the scene. Added full-HD/laptop/short-wide/tablet/wide-phone layouts and assertions for width, height, equal rendering scale and world isolation.
- First 10-layout source runs pass Chromium/WebKit; skill client and lifecycle/architecture suites pass both engines. Added paused repeated-resize coverage, which exposed WebKit retaining a stale auto aspect-ratio grid height after landscape/portrait changes. Replaced the circular auto/percentage height with explicit page-container-width sizing. Physical run initially stopped because Chrome was in Android's background/recents (screenshot timeout); no gameplay result claimed from that attempt.
- Final source and compact attract tests pass all 10 layouts in Chromium 151.0.7922.34 / WebKit 26.5, including repeated paused landscape/portrait changes. Final source lifecycle/offline and compact Chromium lifecycle checks pass seven scenarios each; compact WebKit and final WebKit source/release comparison are finishing. Installed skill client rerun passes after the final change. No browser errors.
- Physical Galaxy A53 / SM-A536B, Android16, Chrome155.0.8059.79 passes actual portrait320x581 and landscape637x234: full panel rotation, preview/settings pause, fixed full-width layout, 21 trusted touches/start from each panel, shield pickup/cactus survival/next bird death. Normal rAF, controlled hazards, exact source response hash7cc14cbcb77db22baca776c87983f03c29361419f63319da5f5677f8c329f868. Inspected actual-device screenshots. Source tested on existing8765 server; compact not directly loaded on phone.
- Cleanup read back auto=1/user_rotation=0. Own tabs closed, scoped CDP relay stopped, own forward9223/reverse8765 removed. User's server PID21964 remains running, HTTP200 verified. No live submissions or backend/data edits.
- Final compact WebKit lifecycle/offline check passes all seven scenarios. First WebKit pixel comparison differed only in the native mode-select fill (56,569 device pixels, maximum channel delta4); all surrounding settings pixels and earlier gameplay/attract scenes were identical. An unchanged rerun is in progress to distinguish native-control raster variability from a delivery defect; tolerance remains exact zero.
- Reproduced the native-select difference and captured geometry/computed styles: identical dimensions/styles, but WebKit reported :hover=false for source and :hover=true for delivery. Normalize the pointer to (0,0) before snapshots so controls are compared in the same interaction state. Added select diagnostics on future failures and an optional DINO_RELEASE_LAYOUTS filter for targeted reproductions. No product changes or tolerance relaxation.
- With normalized pointer state, the targeted WebKit landscape run passes all 12 pixel-identical UI/gameplay scenes. Final full WebKit comparison running. Chromium's final-build comparison already passed 48 pixel-identical scenes. Source and compact attract suites pass 10 layouts per engine; source/compact lifecycle/offline suites pass seven scenarios per engine; architecture passes 11 per engine; installed skill client passes. Build remains 2026-10-17.2, source363019/release190739 bytes (47.46% saved), release SHA-256 edbddd381b1bdc54f5ab5de07134ec584f6aa21458192a60ccc87c55208badc3.
- Final full WebKit comparison passes all 48 pixel-identical source/delivery scenes with zero tolerance, matching Chromium's 48 (96 total). Aggregate output/attract-wide/verification.json validates all 40 attract layout/artifact/engine combinations, 28 lifecycle scenarios, 22 architecture scenarios, physical Android result/hash, screenshots, cleanup and generated artifact hashes. Inline/Node syntax, reproducibility and diff checks pass. All requested work complete; no remaining TODOs or deployment.

## 2026-10-17: Password-protected web highscore moderation

- User approved a separate PHP web console with password login, normal/relaxed lists, individual deletion and confirmed resets, reusing the existing locking/backup logic. Branch feat/web-highscore-admin, baseline c737fe3. No production deployment or real-score operations authorized/needed.
- Plan: disabled without configured password hash, HTTPS required except explicitly enabled loopback PHP CLI preview; strict cookie sessions, idle/absolute expiry, CSRF on every POST, persistent bounded login throttle, server-side confirmations and fresh-list checks for reset. Shared moderation helpers retain CLI behavior. Mobile-friendly UI without external assets/scripts. Test with isolated data/config/session directories and real PHP plus Chromium/WebKit; no live API requests.
- PHP was absent from PATH. Downloaded portable PHP8.4.26 NTS x64 from official windows.php.net into ignored output/admin-web/php and verified its SHA256 against the official release index. Existing server8765 and the user's open phone game remain running. Shared helper/CLI implementation in progress.
- Implemented score-console.php (no scripts/external assets), config-gated hashed-password login, HTTPS/loopback guard, strict expiring sessions, persistent login throttling, CSRF, one-use review tokens, reset revision checks, no-store/CSP/frame protections, shared locked backups/mutations and the CLI create-password helper. Added setup/config/deployment guide ADMIN.md and a credential-free example config. No real configuration/data changed.
- First Chromium run passes real PHP/CLI/security checks and four complete no-JavaScript layout flows. Initial fixture API read omitted required v=1; corrected only the test URL. WebKit successfully performs the UI flow but its screenshot helper injects an unnonced caret stylesheet, which the CSP correctly rejects. Keep natural caret in captures instead of weakening CSP. Visual inspection also caught table-caption styling needing native table-caption display on desktop; corrected CSS and rerunning both engines.
- Chromium rerun passes all checks/layouts. Instrumented WebKit console phases and inspected installed Playwright1.62.1 screenshotter: remaining four nonce rejections occur exactly at the four screenshots because WebKit always injects an empty body{} style for animation synchronization, independently of caret hiding. Keep the strict product CSP and no-JavaScript context; record only these exact screenshot-helper rejections separately, assert their count, and continue failing on every other browser error. No authentication/CSP bypass in tests.
- WebKit now passes all security/HTTP/CLI checks and four complete no-JavaScript layouts, including the separately identified screenshot-only CSP rejections. Inspected desktop and 320/390 px phone layouts plus dark landscape confirmation. Final code review found a recovery edge case inherited from the CLI backup: when the reader falls back to .bak, a timestamped backup must copy that valid source rather than the corrupt primary. Fixed the shared helper and added an exact recovered-backup regression; final rerun underway. No game HTML/build or release artifact changes.
- Final PHP8.4.26 security/unit/real-HTTP/CLI checks pass in Chromium151.0.7922.34 and WebKit26.5; four complete no-JavaScript UI flows per engine pass, with no application browser/PHP errors. Exact recovered-backup regression, competing reset conflict, denied backup write, session expiry/revocation, CSRF/replay and persistent login limits all pass. Final game-contract Chromium regression passes seven scenarios. Screenshots inspected after the desktop-caption fix. PHP/Node syntax and diff checks pass.
- All temporary test PHP servers, sessions, configurations, scores and credentials cleaned up by the runners. Existing server8765 PID21964 remains running, HTTP200 verified; user's phone game/USB connection left in place. Real server configuration/data, dino.html and release artifacts unchanged. Setup commands and limitations in ADMIN.md; aggregate output/admin-web/verification.json. Implementation complete, activation requires the owner's private server password hash; no deployment performed.

## 2026-10-17: Change the administrator password in the web console

- User successfully activated the deployed console and requested password changes while signed in. Added a dedicated account page with current/new/repeated password, password-manager autocomplete, CSRF, shared persistent reauthentication throttling and server-side validation. Minimum 15 Unicode characters, maximum 72 UTF-8 bytes avoids bcrypt truncation; incorrect current password, mismatch, reuse, invalid UTF-8 and null bytes are rejected without echoing input.
- Persist only a salted hash in guarded `data_dir/admin-password.php`, with private permissions and atomic replacement under the existing storage lock. Compare the expected hash inside the lock to reject competing updates. The config remains the activation/recovery authority: changing its hash supersedes saved credentials; an empty hash still disables the console. Corrupt credential state fails closed. Successful changes clear the current session and revoke every previous session through the hash fingerprint.
- Existing scores, PHP config, game HTML and minified release remain untouched. ADMIN.md documents the two-file FTP update, changing passwords, storage/backup and SSH recovery. Pre-existing user changes to the example configuration are left untouched and excluded from this commit.
- Final isolated PHP8.4.26/Chromium151/WebKit26.5 runs pass eight security/CLI/HTTP check groups and four no-JavaScript responsive UI flows per engine, including password change/cancel/relogin. Wrong/current/repeated/unchanged passwords, UTF-8 bounds, malformed credential state, throttling, CSRF, parallel update conflicts, config recovery/disable and all-session revocation pass. Explicit guarded-file HTTP execution reveals no hash; fault injection during atomic replacement preserves the current hash and removes temporary secrets. Scores/config remain identical. Desktop, small-phone and dark landscape password screenshots inspected; no application browser/PHP errors. PHP/Node syntax and diff checks pass. Reports output/admin-web/{chromium,webkit}, aggregate output/admin-password/verification.json. Temporary servers/state cleaned; existing game server8765 PID21964 left running. No deployment or real-data changes.

## 2026-10-17: Allow short alphanumeric administrator passwords

- User requested shorter passwords with letters/digits as the only character condition. Removed the 15-character minimum from server and form; accept 1–72 ASCII letters/digits, including letters-only or digits-only values. The maximum retains bcrypt's no-truncation boundary. Existing passwords remain usable for login and current-password verification. Updated help/error messages and ADMIN.md.
- Acceptance checks pass for one character, letters-only, digits-only, mixed short passwords and exactly 72 characters; empty, 73-character, whitespace, punctuation, Unicode and null-byte input is rejected. Full isolated PHP8.4.26/Chromium151/WebKit26.5 validation passes eight security groups and four no-JavaScript layouts per engine. Browser flows change to an eight-character password, check native special-character rejection and sign in again. Updated mobile screenshot inspected; no application browser/PHP errors. PHP/Node syntax and diff checks pass; aggregate output/admin-password/verification.json refreshed. Temporary test servers/state cleaned. Pre-existing private/configuration files left untouched and excluded from the commit; no deployment or live data operations.

## 2026-10-17: Link to highscore administration in Settings debug area

- User clarified that a link should be added. Added a native keyboard/touch-accessible link inside the collapsed Settings → Debug log area, opening the existing HTTPS score console in a new tab with noopener/noreferrer. Absolute destination also works from standalone/local game copies. Build 2026-10-17.3, PWA cache v8; authentication remains in the existing console. ADMIN.md and console comment updated; private configuration files left untouched.
- Rebuilt release/dino.html: 363566 → 191146 bytes (47.42% saved). Twelve isolated source/release Chromium/WebKit link flows pass in desktop, 320px portrait and landscape: collapsed visibility, target URL, native keyboard activation, new-tab navigation, retained paused game, 48px target and no overflow/errors. Destination is intercepted; no live admin/API requests. Installed develop-web-game action client passes, gameplay and phone/landscape debug screenshots inspected. Final Chromium lifecycle/offline regression passes all seven scenarios; inline/Node/PHP syntax and diff checks pass. Artifacts output/admin-link. No deployment, private configuration or live-data changes.

## 2026-10-17: Simple English for highscore administration

- User requested simple English throughout the admin page and its game link. Translated login, account/password forms, lists, delete/reset review, labels/accessibility text, statuses and all displayed errors; document language is en. Game debug link now reads Manage highscores (new tab), build 2026-10-17.4, cache v9. Behavior, password policy and authentication are unchanged. Updated browser selectors and setup instructions.
- User also asked about possible additional settings. Suggested separate music/effects volume, reduced effects, automatic fullscreen, and attract slide speed/demo toggles; no new settings requested or implemented.
- Final PHP8.4.26/Chromium151/WebKit26.5 runs pass eight security groups and four complete no-JavaScript admin flows per engine using English labels, including login, delete/reset/cancel, short-password change, relogin and logout. Twelve isolated source/release link flows and installed develop-web-game action client pass. English desktop lists, small-phone password form, phone debug link and gameplay screenshots inspected; no app errors. PHP/Node syntax and diff checks pass. Release rebuilt: 363561 → 191141 bytes (47.43% saved). Aggregate output/admin-english/verification.json; no deployment, private configuration or live-data changes.

## 2026-10-17: Separate music and effects volume controls

- User requested the proposed volume sliders. Added native keyboard/touch range controls (0–100%) with visible percentages and saved browser preferences, keeping the Sound switch as a shared mute. Existing default levels remain music45/effects100. Music changes preserve playback position; zero pauses/mutes the optional track. A shared effects GainNode scales every sound, ramps changes over12ms and silences already scheduled effects; recreated contexts reuse the saved level. Muted effects avoid unnecessary oscillator creation. Build2026-10-17.5, cachev10. UI/help remain simple English.
- Plan: validate actual music-element volume and independent controls, master mute/restore, storage/reload/invalid values/unavailable storage, native touch/keyboard controls and all effect paths via rendered audio, including context replacement and scheduled death sounds. Inspect desktop/phone layouts, run the installed skill client and lifecycle checks, rebuild and compare source/release. No changes to private config or live scores.
- Implemented and tested source/release sliders in Chromium151/WebKit26.5 across desktop, 320px portrait and landscape. Native keys/touch, independent zero/full channels, mute/edit/unmute, reload, invalid/blocked storage pass. Chromium renders all effect paths at full/quarter/zero/mute: RMS quarter/full=0.25, zero/mute exactly0; context replacement keeps the saved gain. Windows headless live audio clocks can stall; Windows WebKit has no OfflineAudioContext and rejects PCM playback. Its fixture retains native media volume/muted properties but simulates playback lifecycle; DSP is explicitly unsupported there and verified in Chromium. Details in VOLUME.md.
- Source lifecycle/offline suite passes7 scenarios. Installed skill client passes source and compact; desktop/phone/landscape settings and gameplay screenshots inspected. Compact built368518→194113bytes (47.33% saved). Chromium comparison passes48 pixel-identical scenes. WebKit first full comparison found16 differing glyph-edge pixels in portrait Settings; unchanged targeted and full reruns pass12/48 scenes exactly. No product/tolerance change. Final source/release volume runs pass in both engines (DSP verified in Chromium, explicitly unavailable in the installed Windows WebKit port); both complete comparisons give96 exact scenes. Syntax/diff checks pass. Aggregate output/volume/verification.json, VOLUME.md documents behavior and test limitations. Existing8765 server retained; private files/live data untouched, no deployment.

## 2026-10-18: Two selectable theme songs (build 2026-10-18.1)

- User supplied Theme_song2.wav as the new default theme and requested a saved Settings choice between both songs, plus the same economical mono MP3 encoding as the first song. Applied develop-web-game. Existing unrelated private/config-file changes were left untouched.
- Added Theme song with Boom in the Dunes (new default) and Dino Jump Jump. Browser preference dino-music-track is validated against the track list; switching reuses one audio element, resets position/unavailability and respects master mute, zero volume and game/menu lifecycle. The audio test state includes the selected track. Settings/help and Suno attribution updated; native picker shares the existing Settings styling.
- WAV probe: stereo 48 kHz PCM, 121.2 seconds, 23,284,240 bytes. Existing MP3: mono 22,050 Hz, constant 64 kbit/s. Converted the new song to dino-boom-in-the-dunes.mp3 using those settings. Asked about the earlier two-minute limit; proceeding with that limit after optional clarification time, used pitch-preserving atempo=1.015. MP3 probe: mono 22,050 Hz/64 kbit/s, 119.419955 seconds, 956,179 bytes. Source WAV untouched; encoding command documented in VOLUME.md.
- Service worker cache v11 independently caches both optional tracks and serves byte ranges for either. Updated lifecycle allowlists and safe Android preview asset map. Added real-MP3 hosted/offline/range checks and extended volume scenarios with native keyboard song choice, reload, invalid/blocked storage, mute/zero switching, missing-track recovery and pause/resume.
- Initial Chromium/WebKit source volume suites pass 11 groups each; Chromium renders DSP, Windows WebKit playback remains simulated as documented. Both real MP3s decode in Chromium, including offline reload/switch and six prefix/suffix/invalid-range checks. Source lifecycle suite passes seven scenarios without optional audio assets. Installed skill client passes; inspected gameplay, desktop and 320px Settings screenshots. Adjusted picker styling to match existing settings; final delivery checks pending.
- Final validation: source/release volume+song suites pass 11 groups each in Chromium151.0.7922.34 and WebKit26.5 (Windows WebKit media playback simulated, DSP unavailable there and rendered in Chromium). Actual source/release MP3 decoding, default/saved choice, offline reload/switch and all six byte-range cases pass in Chromium. Source/release lifecycle checks pass seven scenarios each. Both engines pass all 48 source/release UI/gameplay comparisons, 96 exact matches total; build is reproducible. Installed skill action client passes after final styling. Inspected final Chromium/WebKit portrait/landscape Settings and gameplay screenshots; no application errors. Release is 195,138 bytes from 370,338-byte source (47.31% saved), SHA-256 527ee744cc18ededf8ea78b64c0569f285adc42f9e0c4d6a0aa73e11b4ecc41f. Syntax/diff checks pass; VOLUME.md/RELEASE.md updated. Aggregate output/theme-songs/verification.json. No deployment, physical-device test or listening verification. No remaining implementation work; the optional duration preference can be revised by regenerating the MP3 from the preserved WAV.

## 2026-10-18: Round-end overlay and automatic attract return (build 2026-10-18.2)

- User requested a brief Game over overlay followed by required highscore name input and an automatic return to attract; remove the old result card, show its Off button beside Help/Settings on attract, test desktop and attached phone, then commit. develop-web-game applied. Previous completed theme-song changes committed separately as a1ab9aa; private/config deletion and untracked password/config/WAV files remain excluded.
- Implemented a pointer-transparent overlay throughout the existing 2.6-second death animation, protected against restart/skip input. Removed result/retry markup and obsolete styles/bindings. Game.returnToAttract resets only round state; session clocks/statistics, scores and audio preferences persist. Successful local/online name save and cancel/close return directly to attract; a rejected name stays editable. Off remains in the utility group and is now attract-only; its existing session summary/new-session behavior is retained.
- Controller tracks asynchronous qualification without DOM access; Runner waits for it after the animation, opens late eligible entry, or returns without entry on failure/nonqualification. Added desktop/physical game-over-flow tests with actual collision, pause during death, no-score return, invalid then saved name, cancel, delayed qualification, accumulated stats and trusted Off/new-session input. Updated lifecycle/release/Android regression harnesses; service-worker cache v12.
- Initial Chromium/WebKit flow tests pass desktop/portrait/short-landscape, architecture passes Chromium11 and source lifecycle passes7. Inspected overlay, attract utilities, phone-size layouts and installed skill gameplay screenshots. Attached Galaxy A53 is authorized. Physical harness is running against the safe fixture, normal rAF and trusted touch; original fixture storage/rotation are restored. Final release/device validation pending.
- Final behavior hardening: close/save/cancel completes the attract return synchronously, including native dialog cancel, preventing a frame before the queued close event from reopening name entry. Desktop Escape fixtures disable fullscreen before initialization so Escape targets the dialog rather than the browser's fullscreen layer. Added late nonqualification coverage; both positive and negative online resolution finish correctly. Moved the optional install action to the free upper-right landscape area after three utility buttons exposed an overlap; ten-layout attract checks pass.
- Final Chromium151/WebKit26.5 flow checks pass three desktop/touch layouts, including invalid-then-local-save, cancel/Escape, late qualification/nonqualification, pause protection, five cumulative deaths and Off/new-session. Both architecture suites pass11, lifecycle/offline suites pass7, and attract suites pass10 layouts. Installed skill client passes after final game logic; inspected gameplay/overlay/returned-attract/entry/Off and narrow-layout screenshots. WebKit release comparison initially found4/19 differing glyph-edge pixels in overlay text; preserving only the overlay's layout-sensitive whitespace (same established approach as the transformed round menu) fixes it without tolerance changes. Both final comparisons pass52 exact UI/gameplay scenes,104 total. Build reproducible; inline/Node syntax and git diff checks pass.
- Physical Galaxy A53 SM-A536B, Android16, Chrome155.0.8059.79: normal rAF with actual controlled cactus collision and15 trusted touches per orientation pass the full five-round flow in portrait320x711 and landscape711x320. Tests cover no-score return, rejected/then-saved name, cancel, late positive/negative qualification, retained session statistics and Off/new-session. Existing Android feather/air-jump/duck/pause/help/automatic-name/restart/offline-reload suite also passes; short controlled samples59.9/58.9FPS are not sustained performance claims. No viewport emulation/manual frames or live API requests. Original fixture storage and rotation(auto1,user0) restored; own tabs, preview/relay and USB8877/9223 bridges cleaned; existing8765 server untouched.
- Final source368901bytes SHA-256 f1dae3ff1ebd1af758780ec0eb0f386feac26e5ddcadae0aec14f1378711155d; delivery194091bytes(47.39% saved), SHA-256 5fc33e04ce2b41c69384154d5bcd96bb040d009af31c824466aa19156a9c31d0. Phone-tested compact a1750427054558d2e42e2ab61e159f64ebf72fb9b974752e72171da5b858536c differs only by38 retained overlay whitespace bytes: normalizing that block reproduces the tested hash exactly. Final game source/logic is unchanged, and final packaging passes both complete comparisons. GAMEOVER.md/RELEASE.md document behavior and evidence. Aggregate output/game-over/verification.json. Ready to commit; no deployment or remaining implementation work.

## 2026-10-18: Additional physical Galaxy S10e compatibility check

- User connected an older USB phone and requested testing. Identified Samsung SM-G970F / Galaxy S10e, Android12/API31, Chrome154.0.8037.127, serial RF8MB125SXA. Initial USB transport disappeared during setup; no game/phone-setting changes had started. Stopped own helper while awaiting reconnection. User reconnected; ADB/Chrome CDP are now stable.
- Testing unchanged build2026-10-18.2 compact artifact SHA-256 5fc33e04ce2b41c69384154d5bcd96bb040d009af31c824466aa19156a9c31d0 through the isolated safe8877 preview and scoped9224 relay. Only one authorized device connected. Original rotation auto1/user0, no pre-existing ADB bridges. Tests use normal rAF and trusted real-phone touch, with live highscore API disabled. Preserve original fixture storage/rotation and clean test-only tabs/helpers/bridges afterward.
- All physical suites pass on the exact final compact hash: game-over-flow(5 rounds in each orientation,15 trusted touches each), android-attract(2 orientations,25 trusted touches, real rotation/demo/power-up showcase/preview pause/settings/starts from all panels/shield first-hit survival and subsequent death), android-feather(touch pickup/air jump/duck/pause/help/death/automatic name/attract restart/hosted offline reload and air jump). No browser errors, emulation, manual frames or live score requests. Inspected portrait/landscape overlay, attract, entry, shield, air-jump and offline screenshots.
- Investigated an attract baseline failure specific to older Chrome: landscape Start remained :active with the intended matrix(1,0,0,1,0,2) pressed transform. Updated only the physical harness to toggle the real preview pause control twice before measuring its resting baseline. This clears retained press state; the existing1px position tolerance is unchanged and both layouts pass. Report includes initial active state/transform and final target geometry. Game source, release artifact, build and graphics remain unchanged.
- Device browser viewports: fullscreen portrait360x760/landscape760x360, short browser portrait360x617/landscape673x280, DPR3. Four-second controlled samples:59.9176/59.9131FPS,240 frames each, median16.7ms and p95=16.8ms; no sustained-performance guarantee. Android12/API31, Chrome154.0.8037.127. Initial USB interruption was transport-only and did not recur after user reconnection.
- All test-created tabs/helpers and own8877 reverse/9223 forward removed, original rotationauto1/user0 confirmed and fixture records/preferences restored. Existing8765 server left alone. Evidence output/s10e-2026-10-18/verification.json and per-suite reports/screenshots; GAMEOVER.md/ATTRACT.md/FEATHER.md updated. No deployment or remaining compatibility work for this device.

## 2026-10-18: Inline m24 logo

- User requested the m24 logo directly embedded with only a quick test; applied develop-web-game. Replaced its Base64 img with the same SVG paths, scoped brand-logo CSS selectors, preserved responsive sizes and accessible name via a unique title ID. Build 2026-10-18.3; regenerated compact release and size report.
- Quick Chromium checks pass source and release via file:// with networking disabled at desktop1280x800 and phone emulation390x844: logo colors, accessible name, aspect ratio/responsive size, game start and no page errors. Installed skill client passes against release; inspected desktop/mobile title and gameplay screenshots under output/inline-logo. No physical-device or broad regression runs requested. Initial scratch checks needed harness-only corrections (Windows import URL, responsive clamp assumption and unique screenshot selector); game implementation unchanged after first edit. No remaining work for this change.

## 2026-10-18: Screen transitions (build 2026-10-18.4)

- User requested the complete TRANSITIONS.md plan, phases 1–7 in order, on branch feat/screen-transitions with one commit per phase; private/config files and the config-example deletion stay excluded; live highscore API never contacted; game rules and timings unchanged.
- Phases 1–6 (e3cbf87, e10d91b, ea05e75, 79d4467, 623defd, 5e98279): ScreenTransition (full/basic/fallback View Transition forms, coalescing, owner cleanup, external skips, root-tap safety net), ScreenPresenter, ElementMotion, CSS tokens and reduced-motion rules; T1–T14 via CSS animations, native dialog transitions and View Transitions; saved-row highlight, staggers, hint fades. Canvas HUD fade and menu FLIP omitted (optional).
- Each phase: the eight existing suites plus tests/screen-transitions.mjs (85 checks) pass in Chromium and WebKit 26.5; attract-screen and game-over-flow also pass with DINO_TRANSITIONS=1. Phase 1 additionally passed without startViewTransition and with real View Transitions at animation none. Existing tests turn transitions off via init script; only two enabled-only transitionDone() waits were added to attract-screen.mjs. No tolerance changes.
- Findings: WebKit 26.5 lacks `overlay`, so dialogs close at once there (as planned for Firefox); WebKit captures the Help iframe in its snapshot; headless WebKit latency is reference only. Fixed during phase 5: a duplicate `result` view-transition-name when qualification arrived during the T5b exit.
- Physical Galaxy S10e SM-G970F, Chrome 155.0.8059.81 (after phases 2, 4, 5): game-over-flow --android and android-transitions pass; at most one frame over 33 ms per transition, START latency median difference ≤5 ms and p95 within one frame. Rotation restored (auto1/user0), own tabs/helpers removed, existing 8765 server untouched. Reports under output/transitions/device-phase2/4/5. Galaxy A53 not measured; Firefox manual check still open.
- Phase 7: build 2026-10-18.4, service-worker cache dino-run-v13. Release keeps all View Transition, @starting-style, allow-discrete, overlay and motion keyframe syntax. tests/release.mjs passes 52 pixel-identical scenes in Chromium and WebKit; screen-transitions.mjs passes against release/dino.html in both. Source 413219 bytes SHA-256 544d612f505f9d82b386a9bcb7e701a50f54ae6a8363ae394734d58819c3508f; delivery 216376 bytes (47.64% saved), SHA-256 a1ac3dbe32052089f873c1e271c89d0984d8aa58d00ae5b6bbe109415421c99b. Not pushed.
- Follow-up: physical Galaxy A53 SM-A536B, Chrome 155.0.8059.79, release/dino.html via the safe 8877 preview and scoped relay. game-over-flow --android passes both orientations. android-transitions frame criterion not met but not caused by transitions: run 1 portrait T4 had three 33 ms frames (baseline T2 also three); one rerun passed portrait, while landscape on/off was T2 5/7, T4 4/4, T6 4/3 over 33 ms, almost all single dropped VSyncs with the baseline equally or more affected. START latency on/off within one frame in all runs. User chose to document the result; test and threshold unchanged. Rotation auto1/user0 restored, own tab/preview/relay/bridges removed, 8765 untouched. Reports output/transitions/device-a53 and device-a53-rerun.
- Follow-up: user manually checked desktop Firefox 158.0 (dialogs without `overlay`) against release 2026-10-18.4 on the safe 8877 preview with live scores disabled: Settings, name entry cancel/save, Goodbye/New session and Help forward/back worked flawlessly. Not automated; preview stopped afterward. No open transition work remains.
- Review follow-up (build 2026-10-18.5, cache dino-run-v14): P1 Help return into a running round ran help-back as a document-wide View Transition while the round resumed, so taps hit HTML; returns into a round (state not attract) now apply at once, attract keeps T11. P2 raiseModalDialogs() replayed the Goodbye statistics stagger; raised dialogs carry data-raised, keeping child animations settled until a real close. Two regression checks (86 total) fail against the previous build at exactly these points and pass now. tests/release.mjs lacked the transitions-off hook (one WebKit T7a mid-state capture under load); added like the other suites, tolerances unchanged. All eight suites plus screen-transitions pass in Chromium/WebKit, attract-screen/game-over-flow also with DINO_TRANSITIONS=1; release.mjs 52 pixel-identical scenes and screen-transitions against the release pass in both. Source 414180 bytes SHA-256 d80f8fda0ac8a451c96d2b42e5d13e4f7a26128c688f9fe2ab441f15c888fafa; delivery 216623 bytes (47.70% saved) SHA-256 b2e7d36f149505d0b28d44c0b038da2cd9676f5ad134d135462e961ab2696218. No device rerun after this fix.
- Repository cleanup: private local files (admin password note, local config copy with a password hash, 23 MB source WAV) added to .gitignore; the accidentally deleted highscores.config.example.php restored (referenced by ADMIN.md). feat/screen-transitions fast-forwarded into master; all fully merged feature branches deleted with git branch -d. No remote, nothing pushed; no secret appears in history.

## 2026-10-18: Heading animation plan

- User requested lightweight, game-appropriate heading animations, a written plan, stepwise Git work and practical desktop/attached-phone checks. Applied develop-web-game. Plan in HEADING-MOTION.md; branch feat/heading-animations. Initial worktree clean; attached physical Galaxy S10e SM-G970F available. Existing screen transitions remain the integration points. No sub-agents needed.


- Implemented nested heading spans and four short CSS gestures (hop, step, landing, farewell wave), plus one 4.8s/2px logo float. Finite effects use existing ElementMotion lifecycle; the infinite logo deliberately does not. Help receives the shared stylesheet and a visibility class, so each real opening replays. Reduced motion disables all new effects; the existing transitions test switch also disables Help motion. No input or simulation changes. Build 2026-10-18.6 / cache v15.
- Chromium passes all 86 transition checks and game-over flow in three layouts; installed skill action client passes. Physical Galaxy S10e/Chrome155 passes full collision/name save/cancel/late qualification/Off flow in both orientations with transitions enabled. Practical heading review covers settings, help, title, powerups, name and goodbye; logo pause/raise and reduced-motion checks pass. Fixed a CSS specificity bug in logo pause found by that review. Short physical idle samples: median16.7ms/p95=16.8ms, 0 frames >33ms with/without motion in both layouts (not sustained performance evidence). Reports/screenshots in output/heading-motion. WebKit and final release checks underway.


- Final validation: source passes86 screen-transition checks in Chromium151/WebKit26.5; Windows WebKit requires PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 as documented. Source game-over flow with transitions on passes3 desktop/touch layouts and2 physical S10e orientations. Practical heading review passes Chromium/WebKit desktop/portrait/short-landscape and physical S10e portrait/landscape; final screenshots including Game over inspected. Pause specificity fixed and permanently covered within the T1 transition check. Screenshot timing in the disposable review was corrected to await overlay visibility; game behavior was already correct.
- Release built:418109 ->219411bytes,47.52% saved; only2788bytes larger than build.5 (+560B Brotli). Chromium and WebKit each pass all52 pixel-identical source/release comparisons. Release passes installed skill client, all86 transition checks (including logo pause), and attract rotation/input/10-layout suite with transitions enabled. Source standalone/offline lifecycle suite passes7 scenarios. No console/page errors, syntax/diff checks pass. HEADING-MOTION.md and RELEASE.md document behavior/evidence. Physical menu samples at72frames each: medians16.7ms/p95<=16.9ms with/without motion, no frame>33ms; limited short samples only.
- Completed: phone rotation restored auto1/user0; fixture storage restored; own phone tab, safe preview, scoped relay and USB8877/9223 bridges closed. No live API submissions or deployment. Plan, implementation and delivery recorded as separate commits on feat/heading-animations. No remaining TODOs.


## 2026-10-18: Make heading motion visible and add breathing (build 2026-10-18.7)

- User saw no heading animation at http://127.0.0.1:8765/dino.html and explicitly requested breathing. Audit confirms the server already delivered build.6, and native headed Edge with reducedMotion=no-override starts the animations (OS reduced motion is false there); no browser/system preference was changed. Entry-only motion was too brief/subtle, and Help/name entrance could run behind a View Transition snapshot.
- Added 4.8s CSS breathing (scale1..1.025 and0..-2px translate) to visible heading spans, sharing preview/game pause and respecting reduced motion. Finite entry gestures remain independent; menu step now380ms/12px. Help and morph entry defer their heading until vt.finished, guarded by generation. Infinite heading names remain outside motion cleanup/waits; no simulation/input changes or new libraries. Build.7/cachev16, release regenerated419861->220458bytes,47.49% saved.
- Expanded existing86 transition checks with persistent visual breathing/pause and post-snapshot heading age assertions. Chromium release and WebKit source both pass86; source earlier Chromium86 also passes. Installed skill client passes source/release; release game-over-flow with transitions passes3 layouts. Chromium52 source/release pixel comparisons pass. Practical desktop/mobile review and physical Galaxy S10e/Chrome155 portrait/landscape pass; screenshots inspected and no page errors. After the phone slept/locked, stopped pending phone progress until the user explicitly unlocked/opened Chrome; resumed successfully. Short72-frame idle samples with/without motion are all median16.7ms/p95=16.8ms,0 frames>33ms, not a sustained benchmark. Rotation restored auto1/user0 and fixture storage restored; own tab/helpers/bridges removed. Existing8765 preview retained.


- WebKit pixel comparison limitation: initial full run stopped at portrait/start37pixels(max27), unchanged full retry stopped at landscape/start24pixels(max14). Inspected diff: sparse glyph-edge pixels on the unchanged START and empty-score text, not heading geometry. Unchanged targeted portrait+landscape rerun passes all26 scenes exactly; tolerances unchanged. No clean full52 WebKit comparison for build.7 is claimed. All functional transition checks pass. No remaining implementation TODOs.


## 2026-10-18: Visible heading breathing and focus policy (build 2026-10-18.8)

- User again reported no main-title motion and barely visible Help/Settings breathing. A normal headed Edge recording (not manually paused animation samples) confirmed the prior whole-cycle word-width change was only about2.7px. The main heading also froze whenever the window lost focus, because its decorative CSS inherited gameplay pause.
- Separated entry and idle motion onto nested heading-ink/heading-breath spans. Main logo and both words breathe as one lockup, using plain transform,3.2s,scale1..1.06 and0..-4px. Shared highscore text now targets the innermost span, preserving the breathing wrapper. Technical dialog raises retain a settled entry while allowing breathing afterward. Separate heading-paused policy excludes blur alone: the simulation still pauses immediately, visible menu text can move on a second monitor; hidden/covered menus and deliberate preview pause stop it. Reduced motion/test switch remain respected. Build.8/cachev17.
- Actual normal-rAF headed Edge time series: main width268.64..284.67px, top123.48..129.57px; Settings/Help top14.02..20.04px. Inspected screenshots and recorded WebM, extracted title-preview.gif without changing motion. Artifacts output/heading-visible. Updated existing86 transition checks assert actual title width delta>10px/ratio1.06, blur freezes simulation but keeps visible title moving, and deliberate pause works. Chromium source86 and WebKit release86 pass; Chromium52 source/release pixel scenes exact. Source skill-client passes; release game-over flow with transitions passes3 desktop/touch layouts. Source/release rebuilt421019->221242bytes,47.45% saved. Source syntax/diff checks pass. This revision tested desktop/emulated layouts; no new physical-phone run, previous build.7 device evidence remains historical. No live submissions or system preference changes. Existing8765 preview retained; no remaining implementation TODOs.

## 2026-10-18: Subtle traveling heading wave (build 2026-10-18.9)

- User requested a slight wave over the accepted breathing. Added heading-ripple CSS with +-1.5px vertical motion/+-0.3deg rotation over3.2s, offset90ms per glyph. Existing6%/4px whole-heading breathing stays unchanged. Glyph spans are prepared once (cached by text) and dynamic highscore updates reuse them; Help uses the same helper. No per-frame JS, libraries or gameplay changes. Complete accessible h1/h2 names retained via aria-label, decorative glyphs aria-hidden; whitespace remains text. All pause/hidden/dialog/reduced-motion rules extend to glyphs. BUILD.9/cachev18; release423637->222745bytes,47.42% saved.
- Source installed skill client, Chromium86 transition checks, release game-over with transitions in3 layouts and Chromium52 pixel-identical source/release scenes pass. Four targeted source/release Chromium/WebKit flows validate actual distinct glyph positions/phase, exact accessible heading names, pause, reduced motion, Help and retained text nodes across commits. Real headed Edge time series/video/screenshots inspected; wave GIF output/heading-wave/title-wave.gif. No new physical-device run for this decorative revision. No live API submissions or system preference changes; existing8765 retained. No open implementation TODOs.

## 2026-10-18: Stronger heading wave (build 2026-10-18.10)

- User liked the wave and requested more pronounced shape. Only CSS tuning: glyph travel ±1.5->±3.5px, rotation ±0.3->±1deg, phase90->200ms; accepted3.2s cycle and whole-heading breathing retained. Build.10/cachev19; rebuilt release423636->222746bytes(47.42% saved).
- Installed skill-client passes; gameplay screenshot inspected. Four targeted source/release Chromium/WebKit flows pass actual differing glyph positions/phase, accessible heading names, pause, reduced motion, Help and stable text updates. Normal headed Edge video/main/settings/help screenshots inspected; new GIF output/heading-wave-strong/title-wave.gif. No new test code or broad regression reruns for this parameter-only adjustment. No live submissions, system preferences or physical-device actions. No remaining TODOs.

## 2026-10-18: Physical wave validation and code-quality review

- User requested the latest wave on the attached phone, then added a code-quality/refactoring review; both requests completed together. No game-code edits. Safe preview served release/dino.html; phone asserted its SHA-256 against the build report. Galaxy S10e SM-G970F/Chrome155.0.8059.81 passed portrait360x617 and landscape673x280: real3.3s wave traces(197/198 samples, relative first/last-letter travel range14.2px), trusted touch, pause/resume, Settings, Help, START, Game over, entry cancel, Goodbye/New session, technical dialog raise and tab-local Reduced Motion. Screenshots inspected and no page errors. Active-animation1.2s samples each: median16.7ms/p95=16.8ms,0frames>33ms. Baseline landscape had4frames>33ms(p95=33.4), no claim of guaranteed sustained FPS. Fixture storage/rotation(auto1/user0) restored; own tab/preview/relay and USB8877/9223 bridges removed, existing8765 retained. Evidence output/heading-phone-review/phone-review/report.json.
- Reviewed frontend/animation integration and architecture (not a full PHP security audit). Current Chromium architecture11 and lifecycle/offline7 pass. AST inspection confirms Game/HighscoreController have no browser-global references; Renderer has1471lines of largely vector rendering, Runner471lines. Focused reproduction of the real setHeadingText confirms cache key ignores offset: DINO/0 then DINO/5 leaves first glyph at phase index0. Current static titles do not exercise it, so low-priority latent issue. Recommend small animation responsibility cleanup/CSS parameter centralization/cache correction; no broad architecture rewrite needed. Comment-based extraction in architecture tests is another low-priority maintenance concern. Details CODE-REVIEW.md, machine findings output/heading-phone-review/quality-findings.json. No unsolicited refactoring applied; no outstanding device work.


## 2026-10-18: Small heading-animation refactor (build .11)

- Applied develop-web-game skill. User authorized the three scoped cleanup items from CODE-REVIEW.md.
- Runner-owned HeadingMotion consolidates glyph/cache setup, deferred dialog/Help starts and heading pause policy. Per-target tokens reject stale transition completions; CSS still drives animation with no frame-loop work.
- Text/offset WeakMap cache fixes the reproduced phase bug; offset-only updates retain glyph nodes. Central CSS parameters preserve all existing motion values. No new dependency.
- Added tests/heading-motion.mjs against the actual Runner-owned presenter, accepting source/release; cache, Unicode/space phases, accessible names, stale/rejected/closed/fallback transition cases pass Chromium/WebKit.
- BUILD 2026-10-18.11, service-worker dino-run-v20, rebuilt release and updated size documentation.
- First complete transition run: 86 passed; architecture: 11 passed; installed skill client passed with screenshots/state inspected. Final-artifact verification and before/after visual checks recorded under output/heading-refactor/.

- Final .11 source transition suite: all 86 passed; release installed skill client passed, latest screenshots/state inspected. Source/release: all 52 Chromium scenes pixel-identical and build reproducible. Both engines/source+release passed targeted actual-wave and new cache/transition checks.
- Before/after animation captures: 12 identical geometry/transforms/durations/phases/names; ten exact raster matches, two only 6/4 edge pixels (max channel deltas 7/12). Images inspected; initial exact-PNG assertion exposed minor glyph rasterization variation, not a transform/layout change. Existing release tolerances unchanged. Report output/heading-refactor/visual/comparison.json.
- Physical .11 retry: device connected but keyguard Bouncer locked after waking; asked user to unlock, no answer yet. No phone tabs, USB bridges or helper processes opened. Previous physical .10 verification remains separately labelled; no new phone result claimed.
- Remaining optional work: physical .11 smoke check when unlocked; older architecture source-extraction robustness is outside this cleanup. No further animation refactor needed for the present scope.


## 2026-10-18: Stone Jaw boss encounter (in progress)

- User requested a rare rock boss with a jump-through opening. Applied develop-web-game skill; plan/player contract in BOSS.md. Working branch feat/stone-jaw-boss; baseline 66bf423 saved in output/rock-boss/baseline.html.
- Added DOM-free RockBoss scheduler/entity, 36s first eligibility, corridor draining/reservation, 1.8s warning, upper/lower collision bands, speed-scaled thickness, shield shatter and one-shot clearance. Existing pickups move but new spawns wait; Chili must expire before warning and cannot burn stone. No score bonus or gameplay RNG consumption by the boss scheduler.
- Inline cached vector rock/face/opening, announcement/clearance notices, synthesized bass/success tones, capped debris and reduced-motion support. Help/text-state hooks updated; attract simulations explicitly exclude the boss. BUILD .12/cache v21. Validation and tuning pending.

- Final boss geometry uses a broad stone head and speed-scaled lower jaw, y28..190 below the HUD, glowing passage y78..166. One cached vector path per current width, existing particle cap, no new library or asset. Fixed a discovered gameplay exploit: jump/duck input must not stall the clearing phase and leave an indefinitely empty scoring corridor.
- Added tests/rock-boss.mjs with six full short-jump sweeps, actual roof/floor/opening collisions, Chili resistance, single shield shatter, shield/score preservation on clean pass, feather, pickup/hazard draining, exact 36s schedule/grace, cooldown, death/reset, pause, rotation, reduced motion, attract exclusion and actual keyboard/touch. Eight groups pass source/release in Chromium and WebKit. Timing windows 5–13 fixed steps, including the artificial minimum relaxed speed. UI tests wait for actual dialog-close/media-query events before stepping (initial harness races corrected).
- Chromium shield (3 layouts), WebKit feather and release shield (3 each), architecture11, game-contract7, screen-transitions86, attract10 layouts and source/release installed skill clients pass. Boss help changes required updating the shield help contract assertion. Extended real offline audio rendering includes both boss sounds; volume/mute suite11 groups passes.
- Release rebuilt reproducibly 438338 -> 230851 bytes. Expanded source/release comparison to64 exact Chromium UI/gameplay captures, adding boss warning/approach/clear in four layouts. Boss, skill-client and release screenshots inspected; no browser errors. Reports under output/rock-boss/final and release.
- Physical boss test not performed: Galaxy S10e connected but asleep/locked; requested unlock asynchronously, no reply so far. Browser touch/rotation tests are emulation. No USB bridges, test phone tabs or phone helper processes started. Normal-rAF desktop/touch review recorded separately under output/rock-boss/live.

- Normal-rAF final release preview passed desktop keyboard and portrait trusted touchscreen input (actual pointer target touch-jump), no manual simulation stepping or page errors; videos/screenshots inspected. Initial Playwright locator.tap actionability interception in live mobile emulation was resolved in the review harness by sending trusted touchscreen input to the verified button center; regular locator.tap remains covered/passing in repeatable boss tests. output/rock-boss/live/report.json. Short frame samples after clearance are not a device/performance benchmark.
- Final review: standalone source/delivery, cached vector rendering, bounded existing effects, gameplay pause and unchanged score/API rules preserved. No further implementation TODOs. Optional physical-device boss smoke test awaits an available unlocked phone; no new device result claimed.


## 2026-10-19: Physical Stone Jaw validation

- User requested the connected phone test. Applied develop-web-game skill; actual Galaxy S10e SM-G970F/Android12/Chrome155.0.8059.81 was awake with Chrome open. Safe release preview on8877, scoped own-target CDP relay9224 and USB bridges9223/8877; checked exact release SHA ad05658b85c3d1a7a6204ec4b564868edb85a8496831429b26c09d11afa28e6d. Production code/build unchanged.
- Added repeatable tests/android-rock-boss.mjs. Actual normal-rAF and trusted CDP touch, with only eligibility, constant selected speed and unrelated collectible spawning controlled. Both360x617 portrait and673x280 landscape passed seven scenarios each: clean passages normal6/8.5 and relaxed5.3, Settings pause plus paused physical rotation, missed/ledge hit and death freeze, held/roof hit, single shield shatter, page-local reduced motion with no debris. No manual simulation stepping or live submissions. All14 scenarios passed without a game fix.
- Screenshots inspected, no page/console errors. Landscape approach caught a normal fading Settings exit; later scenes are clear. Warning-phase30-frame samples each median16.7ms/p95=16.8ms/no>33ms; no sustained game-performance claim. Report and PNGs output/rock-boss/physical/device/.
- Restored all preview-origin storage and rotation(auto1/user0); runner closed only its own tab. Verified helper process command lines before stopping own preview/relay; removed only own8877 reverse and9223 forward. Existing Chrome tabs and8765 preview preserved. Follow-up harness guards custom-server artifact hash, disables live scores before load and keeps rotation cleanup robust if page close fails.
- BOSS.md/RELEASE.md/AGENTS.md updated with physical result and repeat command. No outstanding boss implementation or physical-test TODOs.


## 2026-10-19: Debug rock training

- User requested a Debug switch for continuous rock practice. Applied develop-web-game skill; baseline saved output/rock-training/baseline.html. Session-only switch applies next run, following existing mode selection; no forced loss of an active round.
- RockBoss training reserves spawning continuously (including the inter-wave idle frame), skips long eligibility/cooldowns but retains warning/clearance timing. Training runs at fixed selected-mode pace, with no ordinary hazards or power-up spawns. Training flag remains in DOM-free simulation; debug UI lives in Runner.
- Training excludes personal records, highscore qualification/name entry and session stats; result/footer label the practice round. Reload resets the Debug switch. BUILD2026-10-19.1/cachev22. Tests/build/documentation pending.

- Completed: source training tests pass Chromium and WebKit in three layouts each; release passes Chromium in three layouts and all eight existing boss checks. Three actual-input waves per layout, no unexpected spawns, fixed pace, records/stats isolated, next-round switching and reload reset verified. Architecture11, lifecycle7 and installed skill client pass; screenshots/state inspected under output/rock-training. Fixed a test-only hidden-role lookup after reload by selecting the hidden switch by ID.
- Built release2026-10-19.1 (232101 bytes, SHA256 1e7c5ce55873aecc6011f77748e08046aff41103a7ec4499793f57824c1339d6), updated size documentation and test commands. New training checks are desktop/touch emulation, not physical Android. Existing physical boss verification remains documented separately.
- Final validation: WebKit release training also passes all three layouts; Chromium source/release comparison passes all64 scenes pixel-identically. Documentation complete, no remaining implementation TODOs.


## 2026-10-19: Endless rock training feedback

- Applied develop-web-game skill. Training now records floor/roof contact per rock, never kills the player, and emits exactly one trainingResult after the rock passes. Canvas vector green check/red X lasts the existing clearance interval; ascending/descending short synth notes use the existing audio gain/mute path. No new asset, timer or animation loop. Normal boss collision handling unchanged.
- Switching training Off returns the living practice round to attract, allowing a normal next START without reloading. Training still excludes scores and session stats. Build2026-10-19.2/cachev23; release regenerated.
- Six encounters per layout test clean passages, no jump, held roof hit and successful recovery, exact result/audio dispatch count, survival, exit, normal return and score isolation. Chromium source passed three desktop/touch layouts; eight normal boss regressions, eleven architecture scenarios and installed skill client passed. Screenshots and skill JSON inspected under output/rock-feedback. Physical phone not tested this iteration.
- Final: WebKit release passed all three layouts as well. Documentation updated; no remaining implementation TODOs.


## 2026-10-19: Easier rock opening and training exit

- User approved larger opening/thinner rock plus visible training exit. Applied develop-web-game skill. Shared geometry opening60..170 (+25% height), speed-scaled thickness6 instead of8. Visible Beenden button only while training; keyboard/touch exits to attract and switches training Off. BUILD2026-10-19.3/cachev24, delivery regenerated.
- Chromium eight boss checks and three six-wave training layouts passed; exit tested with keyboard Enter and trusted touch, hidden again at attract. All six short-jump timing windows widened; normal6 133->183ms, relaxed4.2 83->133ms. Installed skill client passed; gameplay, exit UI and skill screenshots/state inspected. No physical Android test this iteration. Artifacts output/rock-easier.
- Final WebKit delivery training/exit checks passed all three layouts. No outstanding implementation TODOs.


## 2026-10-19: Training pace and short audio

- Applied develop-web-game skill. Beenden renamed Exit. Training-only warning600ms/result700ms (1900ms less waiting per cycle), warning audio suppressed during practice. Success660/880Hz and failure330/196Hz use two short notes over200ms via existing gain/mute path. Normal boss timing and tones unchanged. BUILD2026-10-19.4/cachev25, release rebuilt and size documentation updated.
- Chromium source and WebKit delivery pass six-wave training/Exit tests in desktop/portrait/landscape. Chromium real offline DSP verifies distinct audible result signals, under205ms duration and mute. Existing eight normal boss tests and installed skill client pass. Screenshots/skill state inspected under output/rock-pace. No physical-device test this iteration.


## 2026-10-19: Regular acceleration in training

- Applied develop-web-game skill. Removed the training exception from regular acceleration; both modes now share the existing speed increment/cap. No changes to score isolation, collision feedback or training intervals. BUILD2026-10-19.5/cachev26 and rebuilt delivery.
- Chromium training tests pass desktop/portrait/landscape with six real-input encounters. Assert increasing speed between rocks, exact selected-mode per-frame acceleration and stable maximum speed; survival, result sounds, Exit and records remain covered. Artifacts output/rock-acceleration. No physical phone test this iteration.
- Final WebKit release passes all three training layouts; installed skill client passed and screenshots/state inspected. No outstanding implementation TODOs.


## 2026-10-19: Consolidate Markdown documentation

- Moved all16 tracked project Markdown files into doc/, including release/MINIFIZIERUNG.md and root AGENTS.md, as requested. Dependency and generated output directories were not moved.
- Updated the minification guide's relative release link, doc/progress.md location and external test/comment references. Existing sibling documentation links still resolve in doc/. Commands remain relative to the project root. No game, delivery or runtime behavior changes.
- Moving AGENTS.md means it no longer supplies automatically discovered repository-wide agent instructions; this consequence was communicated to the user. Future progress records belong here in doc/progress.md.
- Validation: all16 tracked Markdown files are under doc/, all13 local Markdown links resolve, git diff --check clean. No gameplay tests needed for documentation moves and comments.


## 2026-10-19: Restore root agent instructions

- Returned AGENTS.md to the repository root so future agents automatically discover repository-wide instructions. General project documentation remains in doc/.
- Updated all root agent documentation references to doc/ paths and removed the obsolete relocation note. Verified referenced Markdown paths exist; no runtime change.


## 2026-10-19: Final minified delivery verification

- User requested a polished minified release and directed attention to release/. Applied develop-web-game skill. npm ci completed with zero reported dependency vulnerabilities; npm run build reproduces existing build2026-10-19.5 exactly, 442896->233679 bytes (47.24% saved). No game changes, build-number bump or deployment necessary. Delivery SHA256631ad37b2576a25c3262b4d971e3e110d9c922594e1296a200d6e271df0df0a5.
- Chromium release lifecycle/offline7, training3 layouts/six waves including real DSP and acceleration/cap, installed skill client passed. Reviewed attract/training/skill screenshots and JSON state under output/release-final. No live highscore submission or physical-device test. Source/release full comparisons running.

- Full Chromium comparison64 pixel-identical. First WebKit comparison stopped at desktop attract-powerups with one differing antialiased pixel (110,439), source(246,244,240) vs release(218,221,223); visually inspected. Repeating the unchanged full WebKit comparison; the same scene already passes on the second run. Tolerances remain unchanged.

- Second WebKit strict comparison passed the initial scene but stopped at portrait/attract-demo: 13 pixels/max10 at text-edge bounds236,572..718,675 in1170x2532 image. Visually reviewed, no layout defect; no game change or weakened comparison tolerance. Full WebKit pixel equivalence is not claimed. Finishing WebKit standalone/offline contract check; no further visual retries.

- Final WebKit release contract7 passed. Release is regenerated and ready at release/dino.html with unchanged exact artifact hash; verification evidence/known strict WebKit raster differences documented. No pending helper processes or implementation changes.


## 2026-10-21: Arcade typography and feedback

- User requested research-led arcade lettering, sizes, glow and motion, Git cleanup and commits. Applied develop-web-game skill. Committed all existing update-notice work first as e6323bb; clean starting tree. Baseline saved in output/arcade/baseline.html. Research and implementation rationale in ARCADE.md: original 2048/Hextris styles, GDC Juice It or Lose It, web.dev animation performance/reduced motion.
- Build2026-10-21.2/cachev28: larger gold/cream title, navy outline/extrusion/glow, stronger glyph tilt; START label depth/beat and composited sheen with fixed hit target; supporting/night headings; larger current score, one milestone punch instead of blinking, record glow/punch and stronger GAME OVER score. Reuses existing simulation timers, heading motion, pause and reduced-motion listener; no new assets, gameplay or audio changes.
- New arcade-type suite passes Chromium source and WebKit delivery in desktop/320px portrait/compact landscape: stable hit targets sampled through effects, pause, live reduced motion, dark HUD accent, continuously readable Canvas milestones, settle and accessible score labels. Test fixture now waits for media-change delivery and the manual-frame menu exit before screenshots. Inspected menu/night/gameplay/record/Game-over screenshots and installed skill client state; no new console/page errors.
- Chromium attract10 layouts, round-end flow3 layouts, lifecycle/offline7 and installed skill client passed. Final Chromium transition86 and source/release64 pixel-identical comparisons passed; WebKit delivery attract10 layouts, lifecycle/offline7 and round-end flow3 layouts passed. Release rebuilt:457006->242053 bytes (47.04% saved), SHA256 fd2ba41cedfc72c8b2b44e9b2d1a2896221b822b31087910ce2f0f48ba8ecb2d. No deployment or physical-device test.

- Final review: inspected Chromium and WebKit menu/night/record and compact/portrait Game-over captures. All requested work is complete; no remaining implementation TODO. Tests use isolated fixtures with live scores disabled. Ready to commit; publish separately if requested.

## 2026-10-21: Arcade fonts and event lettering (second pass)

- User request: more arcade feeling for animated lettering, sizes and effects (glow, motion), researched against strong web games; clean Git first and commit; first attempt (build .2) judged moderate. Applied develop-web-game workflow (implement, Playwright screenshots, inspect, fix).
- Build 2026-10-21.3/cache v29: embedded Lilita One + Press Start 2P (OFL, attribution asserted by build), CSS arcade layer (title letter drop/halo/twinkles, START beat/light/sweep, pixel kickers and score digits, GAME OVER slam/tally), Canvas lettering sprite cache, pixel HUD with milestone digit wave, callouts, LEVEL banner, event shake. Gameplay, scoring and audio unchanged.
- Fixed during review: title halo offset, ghosted day HUD shadow, hard-edged score glow, fallback face on first Canvas frame (preload), Windows CRLF introduced by edit scripts (restored LF).
- Passed: arcade-type (Chromium source/delivery, WebKit source/delivery), attract (Chromium, WebKit), game-over-flow (source, delivery), screen-transitions 86, game-contract 7, architecture 11, skill client, rock-boss, shield-bubble, jump-feather, rock-training, volume-controls, update-notice, release 64 pixel-identical. Release 284581 bytes, SHA-256 2731337d73f57b1647b8eaf1f293113690700f72581ee170fd43dd2d684d3250.
- TODO for next agent: measure Android frame times with the new callouts/banner (tests/android-attract.mjs, android-transitions.mjs); consider a short score count-up sound tick; no deployment done.


## 2026-10-21: Package improved effects and minified release

- User requested committing all further effects improvements and a minified release. Applied develop-web-game workflow. Preserved the submitted EffectsSetting/performance probe, expanded dialog/Help/initials effects, Canvas gating/prewarming and coach/banner coordination, plus the new desktop and Android test scripts. Build2026-10-21.4/cachev30.
- Rebuilt delivery:523682->292344 bytes,44.18% saved; gzip103996/Brotli93607 bytes. SHA256 fe5f0727a0b67ea4a2e3f47f802f9307ca546300044aac75ec0ed38bf0fca875. Updated release/design documentation. Physical Android script included but not executed; no deployment.
- Chromium effects-setting source and delivery and WebKit delivery pass two layouts each. Installed skill client passes; gameplay screenshot/state and automatic-off Settings screenshot inspected. Final Chromium64 source/release scenes are pixel-identical and the build is reproducible. Chromium and WebKit delivery arcade checks pass3 layouts each (fonts, fixed START target, pause, milestones, callouts, night/reduced motion); delivery lifecycle/offline7 passes in Chromium. Reviewed WebKit compact-landscape menu screenshot. Source/release hashes match the report; diff and new test-script syntax checks pass. No remaining packaging TODO.

## 2026-10-21: Effects measurements and physical-device correction

- Correction: tests/android-effects.mjs was executed on the authorized Galaxy S10e (SM-G970F, Android 12, Chrome 155) with the safe preview, USB bridges and CDP, for the .4 artifact. Real first-launch probe: 16.7 ms intervals, 0.4-0.5 ms work, effects stay on in both orientations. Busy round on/off: landscape 57.8/59.8 FPS, portrait 60/59.8 FPS. Before idle prewarming landscape was 55 FPS (p95 33.4 ms). The device screenshot exposed the coach hint covering the LEVEL banner, fixed before .4. Rotation restored, bridges removed, preview stopped.
- Throttled desktop measurements (1x/4x/6x, builds .2/.3/.4, effects on/off) and the probe rule are in ARCADE.md.
- Also passed for .4 source (Chromium): attract, round-end, 86 transitions, architecture 11, boss, shield, feather, rock training, volume, update; WebKit delivery attract 10 layouts.
- TODO: try the probe on a genuinely weak phone (S10e is fast enough); consider re-probing an auto-off device later.


## 2026-10-21: Three lives and score-based rewards

- User requested three starting lives, balanced point-based extra lives and HUD display. Applied develop-web-game skill. Baseline saved output/lives/baseline.html; previously committed tree was clean. Build2026-10-21.5/cachev31. Contract and tuning rationale: LIVES.md.
- Game owns start3/cap5, growing thresholds500/1250/2250/3500/5000/... (interval grows250), one-shot crossing and consumed full-cap milestones. Surviving contact preserves the round and grants1800ms simulation recovery, removes contacted hazards/clears rock; shield/Chili retain priority and feather survives. Last life alone triggers existing death/highscore flow. Practice remains unlimited and isolated.
- Canvas/portrait HUD hearts and next1UP score, accessible labels, static turquoise recovery outline/translucency, announcements and existing feedback sounds; Help updated. Legacy terminal-collision fixtures explicitly use one remaining life. New lives suite covers both modes, real hazard geometry, third-hit death, grace/cap/reward thresholds, power-ups, boss roof/floor, practice, pause/rotation and controls.
- Initial Chromium source and WebKit delivery lives3 layouts each and round-end flow3 layouts each passed; skill client screenshot/state and desktop/portrait/landscape hearts/recovery screenshots inspected. Final refinement awards a same-frame milestone before damage and keeps life-loss audio from being overwritten by boss-clear feedback; final delivery lives tests pass Chromium/WebKit3 layouts each, including that boundary. Final Chromium64 source/release scenes are pixel-identical, reproducible build and skill client pass; WebKit delivery lifecycle/offline7 passes. Chromium shield3 layouts, boss8 checks, feather3 layouts, training3 layouts/six waves, round-end3 layouts, lifecycle/offline7 and architecture11 passed. Inspected final gameplay/hearts, night/reward, recovery and skill screenshots/state. Release296079 bytes, SHA256 22f5e947a64ce03318a911d77a7c280817d084b10e74bd7c70fc1aa44f8a8694. Syntax/diff/hash checks clean. No live scores, phone run or deployment; no outstanding implementation TODO.

## 2026-10-21: Arcade coin cabinet and physical phone validation

- User requested INSERT COIN with credits, conditional START, metallic coin sound and arcade effects based on ARCADE.md; emphasized a prominent zero-credit button and overlap-free phone orientations. Applied develop-web-game skill and existing ARCADE guidance. Previously committed starting tree clean; parallel developer session reported stopped. Build2026-10-21.6/cachev32.
- Per-tab credits start0/cap99, persist on reload, tolerate blocked storage; every player start path spends one credit for a full three-life round. No free keyboard/canvas/gamepad/restart bypass, no repeat payment on jumping. Initial START hidden. Large gold INSERT COIN replaces the exact future START target; becomes a secondary deposit control once funded. Menu, Canvas and portrait HUD credit counts; Debug reset. Trusted insertion does not trigger landscape fullscreen.
- Gold layered lettering/glow, fixed hit targets, coin tilt/flip, sweep, pulse, count punch and +1 feedback honor pause, Effects off and reduced motion. Six-partial metallic double strike/ascending ping uses existing effects volume/mute/unlock. COINS.md documents the contract; legacy gameplay fixtures explicitly seed99 credits, new coin/phone suites start0.
- Final delivery coins tests pass Chromium9 and WebKit9 layouts, including320x568 and663x234; cover gates, native input, persistence, target replacement, balance cap/reset, focus, lives and animation. Chromium audio DSP measures peak0.1426, quarter-volume energy ratio0.0625, mute/zero silence and short tail. Windows WebKit file reload temporarily clears browser offline mode while network routes remain blocked.
- Final Chromium release64 source/delivery scenes pixel-identical and reproducible, contract/offline7, attract10 and installed skill client pass. Earlier same-task regressions passed transitions86, round-end3, lives3, architecture11 and WebKit attract10. Inspected final skill screenshot/state and physical empty/credited menus, HUD/gameplay and both layouts; no new console/page errors.
- Connected Galaxy S10e SM-G970F/Android12/Chrome155: tests/android-coins.mjs passes on the exact final minified SHA, twice; final run adds pairwise action overlap assertions including Install. Ten actual browser/fullscreen viewport states across portrait and both landscape rotations,19 trusted touch events, three paid starts with3 lives, reload persistence, pause/rotate/resume/jump. Normal rAF, no credit seed. Real running AudioContext signal peak0.14269784 (automated signal verification, not human listening). Reports/screenshots output/coins/physical-spacing/device; emulator evidence kept separate. Original rotation restored(auto1/user0), own tab closed, origin preferences restored, relay stopped and own USB forward/reverse removed. No live scores or deployment.
- Release307950 bytes,43.61% smaller than source546148; gzip107593/Brotli96667. SHA2564aada6ade9d10fcf8b7cae0dd6f9ce4d79ff135f75b822cb34d377ac199aa90b. Documentation and test commands updated. No remaining implementation TODO; final diff/syntax checks and commit complete this task.
