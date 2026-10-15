Original prompt: verschaffe dir einen überblick über das game. verwende die besten skills für 2d vektor game developer und prüfe ob die implementierung der nachfolgenden findings sinn machen. insgesamt oder evtl optional über einen schalter in den settings. ohne einfluß auf das aussehen des games. gib mir deine findings.

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
