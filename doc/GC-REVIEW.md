# GC and object pooling review (2026-10-24)

The initial review below was followed by the implementation and measurements
documented at the end. The previous sprite-geometry implementation remains intact.

## Findings

1. **Particles are the clearest bounded pooling candidate.** `Effects.burst`
   creates an object for every particle. `Effects.update` already compacts the
   active array in place, but expired objects are discarded. `Renderer.view`
   also creates a WeakMap-backed view for each previously unseen particle.
   The existing limit of 100 active particles makes a per-Effects free list
   bounded and predictable. Reset must return active objects to the pool.
   Every field, especially `prevX`/`prevY`, must be initialized on reuse; preserve
   spawn order, active order, the cap and RNG calls. Avoid a general pool framework.
2. **Avoid frame-local HUD allocations directly.** `SessionView.updateHud`
   builds a nested fields array each frame. `Renderer.drawPixelText` creates an
   offsets array for the score callback even outside milestone motion.
   `drawDistanceMeter` creates a callback and HUD diagnostic object every draw.
   `pixelGlyph` builds string keys even on a cache hit and is prominent in the
   sampling profile. Reuse a diagnostic record, cache stable label components,
   and avoid constructing offsets when no digit moves. Pooling strings is not
   the appropriate solution.
3. **Gamepad polling creates avoidable collections.** `poll` uses
   `Array.from(...).filter(...)` even with no connected controller. Button reads
   create a state object and `Object.entries` arrays; `anyPressed` creates an
   `Object.values` array. Iterate the browser-provided list directly and use
   fixed current/previous state records. Keep release gating, disconnect handling
   and multi-controller selection unchanged.
4. **Pickup collision rectangles can be scratch records or scalar comparisons.**
   Chili, feather and shield construct player/swept rectangles each step while
   visible. Main obstacle collision checks already use scalar coordinates and
   shared hitboxes. Some short-lived rectangles may be optimized away by V8;
   source-level object literals alone do not prove runtime heap pressure.
5. **Do not pool everything.** Obstacles and clouds spawn comparatively rarely;
   their arrays already compact in place. `capturePrevious` and several render
   methods contain local callbacks; moving a callback out is simpler than a pool,
   and optimizers may already eliminate it. Event objects must remain stable for
   consumers that retain them; reusing a mutable `step` event would change the
   listener contract. Do not pool events without an explicit lifetime design.

## Local experiment

Output-only scripts under `output/sprite-review/` load the HTML through an
isolated Playwright route. No live score API, normal rAF or physical phone is
involved. Two runs each advance 1,200 fixed simulation steps (20 seconds), after
180 warm-up steps, with rendering, HUD and gamepad polling. Audio is disabled;
extended recovery keeps the game alive. The stressed run requests 48 additional
confetti particles every 30 steps; the existing 100-particle cap still applies.

| Scenario | Particle spawns in measured interval | Total pool objects in prototype, including warm-up |
| --- | ---: | ---: |
| Running fixture | 592 | 36 |
| Additional bursts | 1,617 | 100 |

The prototype returns expired objects to a free list and reassigns every spawn
field rather than creating a fresh object literal. It stays in ignored output;
it has not undergone the full gameplay/visual regression suite. Spawn counts
are actual counters; capacities include active and available pool entries.
They demonstrate reuse, not a measured percentage reduction in total GC cost.

Chromium HeapProfiler sampling at a 1,024-byte interval includes objects already
collected by minor/major GC. Besides particle births, prominent attributed sites
include `pixelGlyph`, particle updates/drawing/views and `updateHud`. The view
allocation samples declined in the pool prototype. Much allocation activity
remained, so pooling particle records alone does not eliminate the hot-path
allocation problem. Samples estimate attributed allocation volume; they are
neither exact object counts nor measurements of GC pause duration or FPS.

Reports: `output/sprite-review/allocation-summary.json`,
`output/sprite-review/pool-allocation-summary.json` and their `.heapprofile`
files. Prototype: `output/sprite-review/pool-experiment.html`.

## Recommendation

Implement a small capped particle pool, then remove the avoidable HUD/gamepad
temporary collections. Measure each change separately, including actual GC
pauses and frame-time percentiles on the target phone. Validate particle identity
reuse, complete reset, unchanged random sequence, interpolation, effect toggles,
reduced motion and existing visual/gameplay comparisons before shipping.

Short-lived allocations can be cheap in a generational collector; retaining
objects is therefore a tradeoff, not an automatic speedup. See the
[V8 GC explanation](https://v8.dev/blog/trash-talk) and the
[HeapProfiler sampling protocol](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/).

## Implemented in build 2026-10-24.2 / cache v52

- `Effects` keeps a per-instance free list and returns expired/reset particles.
  Active plus available entries remain at most100. Every reused spawn resets all
  fields, including undefined previous coordinates for correct first-draw
  interpolation. RNG call order, the active ordering and effect limits remain
  unchanged. Rock colors now use a shared constant instead of an array per spawn.
- `drawEffects` interpolates x/y as local numbers instead of constructing or
  retaining prototype-backed render views for particles. Other entities retain
  their established renderer views. No new events or obstacle/cloud pools.
- The HUD reuses its digit-offset array, milestone callback and diagnostic
  record. Inactive scores skip digit-offset construction. A bounded16-style /
  64-keys-per-style table reuses glyph cache keys while retaining the existing
  bounded glyph/run caches and their invalidation behavior.
- DOM HUD fields are formatted when their underlying values change instead of
  rebuilding a nested field array and identical labels each frame.
- Gamepad polling scans the browser-provided list without `Array.from`, `filter`,
  `Object.entries` or `Object.values`. Two fixed boolean records alternate as
  current/previous input, preserving release gating and controller selection.

`tests/gc-pooling.mjs <baseline.html>` compares2000 steps, all eight particle
kinds, expiry, cap, reset, recycled interpolation, reduced motion, controller
edges/unsupported mappings/disconnection/provider errors and HUD milestones.
Chromium and WebKit pass with286 identical particle-state samples and21 identical
input events per version. Distinct active particle identities observed fall from
6117 to100; the array survives reset, and input state uses two records instead of
12 in the exercised sequence. These are exact identity counts, not heap estimates.

## Desktop measurements

`tests/gc-performance.mjs <baseline.html>` runs isolated Chromium processes in
before/after/after/before order for each scenario. Each sample has180 warm-up
steps, then1200 fixed steps (20 simulated seconds). Extended recovery prevents
deaths equally in both versions; audio/live scores are disabled. Measured work
includes polling, simulation, DOM HUD and Canvas rendering. These tight-loop
submission measurements are **not rAF FPS or GPU-completion measurements**.

GC traces are collected without allocation profiling. Allocation sampling runs
separately with a4096-byte interval, including already-collected objects, because
profiling changes timings. Before/after state snapshots match. Chromium151 on
Windows, no other browser suites during the measurement:

| Scenario | Mean work ms/step, before → after | Estimated allocated MB, before → after | Main-thread GC ms, before → after |
| --- | ---: | ---: | ---: |
| Day | 5.161 → 4.791 | 23.16 → 13.85 | 21.09 → 10.95 |
| Night | 5.231 → 5.071 | 23.35 → 15.31 | 24.04 → 14.17 |
| Extra particle bursts | 5.600 → 5.368 | 42.38 → 25.46 | 25.71 → 23.11 |

Observed reductions: mean work3.1–7.2%, estimated allocated volume34–40%, total
traced GC duration10–48%. GC duration/count columns average two samples per
version; allocation volume is one sampled estimate per version/scenario. This is
an observed local result, not a statistical guarantee for other hardware. In
particular, stress GC count increased22.5→25.5 while total GC time fell, and one
night GC maximum increased: not every pause becomes smaller. Raw reports/traces:
`output/gc-optimization/performance-cpu1/`.

Synthetic submission loops periodically stall on queued graphics work (hundreds
of milliseconds), so their p99/max must not be presented as visible game-frame
latency. An initial4x synchronous run amplified this artifact and was stopped.
For CPU rates above1 the harness now yields through native rAF before each
measured step. That probe is recorded separately; it does not emulate a phone's
GPU, memory, thermal limits or browser scheduler.

The paced4x CPU probe uses240 steps per sample, again before/after/after/before:
mean work22.213→17.631ms (-20.6%), p95 work48.10→39.10ms (-18.7%), summed
main-thread GC119.71→95.52ms (-20.2%). Per-run mean work ranges21.54–22.88ms
before and15.31–19.95ms after. These are four short throttled desktop samples,
not measurements from a middle-class smartphone. Report:
`output/gc-optimization/throttled-paced/performance-cpu4/report.json`.

## Physical Galaxy S10e results

User connected and unlocked Samsung SM-G970F, Android12, Chrome155.0.8059.84.
Normal rAF, trusted Settings/fullscreen/START touch, effects on and audio disabled.
First exploratory runs verified portrait/landscape rendering of the actual final
release. Those runs also revealed automatic bonus tally transitions near the
stress phase; they are not used as the final controlled performance result.

The final comparison uses both versions packaged with identical release tooling:
baseline build2026-10-24.1 SHA256
`4b556c0b4a73110a4b04f1c1bb12659f00169604b20e05745689f9637a9f6470`,
new build2026-10-24.2 SHA256
`0312faf05eb385ab791156025e23273eee591ea5731f637ad5b2b99de08ffbcd`.
Actual HTTP response hashes were verified. Four landscape runs in baseline/new/
new/baseline order, three5-second phases each. Non-colliding obstacles remain
visible; automatic bonus, boss, pickups and automatic level banners are disabled
equally in this private fixture. The stress phase explicitly requests48 confetti
particles plus a callout every400ms and a banner every fourth request. No live
highscores. The Canvas stays1520×576 with no resize during measurement.

| Phase | Mean update/HUD/render work ms, before → after | Reduction | Traced GC ms per5s, before → after |
| --- | ---: | ---: | ---: |
| Day | 1.955 → 1.785 | 8.7% | 18.36 → 14.28 |
| Night | 2.340 → 2.205 | 5.8% | 31.52 → 26.52 |
| Night with extra effects | 3.455 → 2.995 | 13.3% | 34.38 → 35.82 |

Values average two measurements per version/phase. Mean observed FPS remains
59.87–59.88; frame interval p95 stays16.8ms. No measured controlled frame exceeds
20ms, before or after. Work p95 changes3.05→2.80ms day,5.20→5.10ms night and
5.80→5.20ms stress. Thus the measured benefit is headroom (up to0.460ms mean work
per frame here), not increased FPS. GC duration improves22.2%/15.9% day/night but
increases4.2% under stress; this does not establish universally shorter pauses.
Battery temperature30.3–30.6°C during these four short runs. These are observed
results on this device, not a guarantee for all phones or sustained thermal load.

Own origin8893, own scoped relay9237/dynamic ADB forward, own tab only. Test-origin
localStorage and original rotation(auto1/user1) restored; own forward/reverse and
relay removed. Screenshots of final effects/night and portrait rendering inspected.
Reports/traces/screenshots: `output/gc-optimization/android-controlled/`; prior
exploratory runs: `android/` and `android-matched-release/` in the same directory.

Repeat with unlocked Chrome and an installed Playwright:

```powershell
$env:DINO_PLAYWRIGHT = 'D:/projects/pacman/node_modules/playwright/index.mjs'
$env:DINO_CURRENT_HTML = 'release/dino.html'
$env:DINO_PERF_LAYOUTS = 'landscape'
node tests/android-gc-performance.mjs output/gc-optimization/baseline-release/dino.html
```

Final regression checks: Chromium70/70 pre/post Canvas scenes pixel-identical,
five identical12000-step simulation/effect traces per version; Chromium and WebKit
pool/controller tests; Chromium arcade3 layouts, feather3 layouts, effects2,
architecture12, source/release lifecycle/offline7 each, installed skill client
against source and release. Release reproducible and all64 source/release UI/game
scenes pixel-identical. No deployment.
