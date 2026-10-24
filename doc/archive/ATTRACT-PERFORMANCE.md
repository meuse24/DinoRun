# Physical S10e / A53 attract comparison (2026-10-24)

> Historisches Dokument, archiviert am 2026-10-25. Beschreibt den jeweils
> genannten Build, keine aktuelle Betriebsanleitung. Projektpfade und Befehle
> beziehen sich weiterhin auf das Repository-Stammverzeichnis.
> Aktueller Einstieg: [Dokumentationsindex](../README.md).


User report: S10e appears to hold 60 FPS in landscape attract while the newer
A53 is substantially slower. The relative difference reproduces; continuous
60 FPS on S10e does **not** reproduce in the matched fixture below.

## Method

`tests/android-attract-performance.mjs` uses source build `2026-10-24.4`,
SHA-256 `2d1e5a73fbf7573ba573fd87bcb109af582363da6c9dbbf0c586473686a87c2b`,
an isolated localhost origin8894, dynamic device-specific ADB forward and scoped
CDP relay9238. Chrome fullscreen, real OS landscape rotation, normal rAF;
no viewport emulation, manual stepping or live score access. Both phones run
Chrome155.0.8059.84; S10e SM-G970F runs Android12, A53 SM-A536B Android16.
Effects are forced on except in the effects-off intervention. Local scores are
empty and credits99 in the shared fixture. Each panel has1.5s warmup and6.5s
sampling; screenshots are taken after sampling. Sequential runs only.

Original rotation settings are restored and checked; own pages, relay and USB
bridges are removed. Existing user tabs/preview bridges are preserved. These
are controlled short samples, not a sustained gameplay or TWA certification.

## Results

FPS in panel order: scores / demo / power-ups.

| Device / intervention | Scores | Demo | Power-ups |
| --- | ---: | ---: | ---: |
| S10e current, first pass |42.05|45.38|51.49|
| S10e current, repeat |51.06|42.41|55.21|
| S10e CPU raster, DPR2 |56.90|52.74|54.43|
| S10e GPU requested + DPR2 |59.82|59.82|59.82|
| A53 current, first pass |28.86|30.24|30.32|
| A53 current, repeat |32.78|31.78|29.16|
| A53 effects off |32.01|32.64|28.47|
| A53 all CSS animations off |24.51|32.25|29.78|
| A53 CPU raster, DPR2 |51.41|49.08|44.79|
| A53 GPU requested, native density |29.55|29.85|29.70|
| A53 GPU requested + DPR2, confirmation1 |59.92|59.92|59.45|
| A53 current between confirmations |28.57|27.57|28.96|
| A53 GPU requested + DPR2, confirmation2 |59.91|59.90|59.91|

A53 focused demo with FPS display enabled: current31.94, CPU DPR1.5
54.01, CPU DPR1 58.00, Canvas drawing bypass59.87, current repeat33.34.
Another native-density experiment promoting Canvas to a compositor layer
reached36.46; it is not the effective solution. The display's500ms FPS value
agrees with the independent rAF sampler, subject to its shorter window.

Native backing: A53 2400x880 (DPR3.375), S10e2280x836 (DPR3).
DPR2 backing: A531422x521, S10e1520x557. CSS geometry and simulation aspect
stay unchanged; only Canvas detail softens. DOM text/buttons retain full density.
Screenshots of native and DPR2 GPU-requested demo were visually inspected.

Both devices have power save off. A53 reports thermal status2 in focused tests
and the first confirmation, then status1 in the remaining confirmation blocks;
S10e reports status0. Android defines status2
as moderate thermal throttling; see [Thermal API](https://developer.android.com/games/optimize/adpf/thermal).
The A53 still reaches60 with the combined intervention under status2, so
thermal state may contribute but is not a complete explanation.

## Interpretation and recommendation

The game explicitly requests software Canvas raster on coarse-pointer devices
(`willReadFrequently:true`) and leaves attract at native DPR. This combination
is expensive on these phones. A53 JavaScript draw calls take about1.1–1.3ms
despite~30FPS. Disabling CSS effects does not resolve it, while reducing pixel
count helps and combining DPR2 with the default GPU-eligible context resolves
the sampled deficit. This implicates the raster/compositing/transfer path;
we did not trace GPU completion or isolate the exact browser-internal operation.

`willReadFrequently:false` permits the browser's default acceleration choice;
it does not prove the actual backing is GPU-resident. See the
[Canvas specification](https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-will-read-frequently).
The diagnostic changes both destination and matching coarse-pointer text-cache
context hints. GPU alone and density alone do not reproduce the combined result.

Recommended next implementation: evaluate the combined GPU-eligible context
and DPR2 budget on touch landscape, with an adaptive density fallback if needed.
Avoid a model-name special case and avoid globally disabling arcade effects.
The context is chosen at bootstrap and cannot be switched in place just on
entering attract; any default-context change also needs gameplay/night HUD,
callout, rotation and source/release validation before release. Earlier CPU
preference was based on older measurements; changing it without these checks
could regress other scenes/devices. No shipped HTML, build/cache version,
release artifact, deployment or device power setting was changed by this audit.

## Reproduce

```powershell
$env:DINO_ANDROID_SERIAL = 'RFCW10RPKVW' # A53; S10e = RF8MB125SXA
$env:DINO_TEST_OUTPUT = 'output/attract-performance/repeat-a53'
$env:DINO_CURRENT_HTML = 'output/gpu-landscape/baseline.html' # saved .4 source for the intervention matrix
$env:DINO_PERF_VARIANTS = 'gpuCap2,current,gpuCap2'
$env:DINO_PERF_FPS = '1'
node tests/android-attract-performance.mjs
```

Optional `DINO_PERF_PANELS=1` selects demo only; `DINO_PERF_SAMPLE_MS` controls
sample duration. Variants also include `effectsOff`, `cssOff`, `cap2`, `cap15`,
`cap1`, `gpu`, `noCanvas`, `promote`. Do not run other browser/performance suites
concurrently. Reports and screenshots: `output/attract-performance/` under
`RF8MB125SXA`, `RFCW10RPKVW`, `a53-focused`, `a53-compositing`, `a53-confirm`
and `s10e-confirm`. Reports record source hash, context attributes,
browser/device versions, timing percentiles and restored rotation; later runs
also capture thermal state. One A53 intermediate cleanup readback differed
after leaving fullscreen. Added a settling delay and strict restoration check;
at the end of the entire task A53 was explicitly restored to its initial
auto1/user0 and checked twice. S10e retained its initial auto1/user1. Existing
S10e preview reverse8877 remains available; all diagnostic bridges were removed.

To check the final build directly, set `DINO_CURRENT_HTML=release/dino.html`
and `DINO_PERF_VARIANTS=current`; experimental source rewrites require readable
source, while the current-only check also accepts minified delivery artifacts.

## Implemented in build 2026-10-24.5 / cache v55

At the user's request, attract allows the browser's default acceleration
choice and landscape coarse-pointer attract uses the same DPR2 budget as play.
Touch rounds retain their tested CPU context, with matching HUD glyph/run
caches. Portrait density, CSS dimensions, world sizing, game logic and effects
choices are unchanged. Desktop retains its single default context.

A 2D context cannot change its raster preference in place. Touch devices retain
one preview and one play backing, swapping the same two Canvas elements at mode
boundaries. Only one is in the DOM. Input/focus stay on the existing page/game
containers. Context loss/restoration is bound once to each backing; inactive
backing events do not pause the active view. HUD bitmaps are cleared at a switch
to match their destination. Memory cost is one additional backing, roughly3MiB
at the measured landscape dimensions; this is pixel storage, not measured
browser-process memory. No adaptive resolution or per-model rule was added.

The generated standalone delivery is321988 bytes, SHA-256
`02314104de941b682d8f3b43d71f2006889e6df18e63d5fd189c1132361617fb`.
It is prepared locally; the published build remains.4/v54.

Initial all-GPU candidate comparison (not the final hybrid;
`output/gpu-landscape/{s10e,a53}/report.json`),
normal rAF with effects enabled,4.5s per scene:

| Phone / orientation / version | Demo | Day play | Night | Stressed night |
| --- | ---: | ---: | ---: | ---: |
| S10e landscape .4 |59.06|59.95|58.61|59.28|
| S10e landscape .5 |59.95|59.50|57.06|59.06|
| S10e portrait .4 |59.95|59.94|59.94|59.94|
| S10e portrait .5 |59.28|59.94|59.72|59.94|
| A53 landscape .4 |49.15|60.17|60.17|59.95|
| A53 landscape .5 |60.18|60.17|59.71|60.16|
| A53 portrait .4 |60.17|60.18|60.17|60.16|
| A53 portrait .5 |60.17|60.15|60.16|60.16|

Conditions differ from the earlier audit: S10e battery28–29°C, A53~32°C,
versus~34°C earlier. Thus the old build can also approach60FPS, particularly
on S10e; the gap is not fixed for a phone model. The new S10e night sample still
has occasional delayed frames (3.89% over20ms); it is not a universal60FPS
guarantee. Stable-frame p95 remains16.8ms. Both orientations and night callout/
HUD screenshots were inspected. Highscore submissions were disabled throughout.

The extra physical feather/touch/rotation suite caught a regression missed by
the isolated performance fixture: all-GPU A53 landscape45.95FPS, repeat45.2,
versus57.9 on the old CPU build in the same workflow. This is why the final
implementation uses GPU-eligible attract and CPU gameplay. Exact browser-internal
attribution was not established. The final hybrid passes the full physical suite
on A53, including air jump, duck, pause, rotation, Help, death/restart, name dialog
and real offline reload/air jump; its short input-tail samples are56.4 portrait
and54.9 landscape FPS. These include work absent from the isolated fixture and
are not a60FPS guarantee. The CPU preference and backing dimensions match the
old gameplay path. Reports distinguish the initial all-GPU candidate from the
final delivery by hash; `*-functional-repeat` refers to the final hybrid.

Final hybrid S10e also passes the full physical touch/offline suite, with short
input-tail samples58.4 portrait/58.6 landscape FPS. Both phones used the exact
final delivery hash above. Source and release are pixel-identical in64 Chromium
UI/gameplay scenes. Chromium151 and WebKit26.5 pass architecture12, arcade3,
screen transitions86 and lifecycle/offline7 per engine; attract12 passes on
Chromium source and WebKit release. New attract regressions verify the density
budget, one attached Canvas, repeated reuse of the same two nodes, correct
context preference and ignored inactive-backing events. Night HUD tests verify
the actual cached glyph/run context preferences match their destination.
The installed skill client passes against the final release; gameplay screenshot
and text state were inspected. Physical Android and desktop browser engine tests
are separate evidence; the installed production TWA has not been updated/tested
with this locally prepared build.

Final delivery S10e performance (hash `02314104...`,
`output/gpu-landscape/s10e-final-{play,attract}`): all three landscape attract
panels59.86FPS,12s per panel, zero sampled intervals over20ms. Both landscape
and portrait: demo59.87, play/night/stressed-night59.86FPS,4.5s per phase,
zero intervals over20ms, p95=16.8ms. Battery37.2–37.3°C in this run.

Final delivery A53 performance (hash `02314104...`,
`output/gpu-landscape/a53-final-{play,attract}`), thermal status0, battery
33.1–33.3°C: all three landscape attract panels59.70/59.86/59.86FPS,12s per
panel, at most0.28% sampled intervals over20ms, p95=16.8ms, preview context
`willReadFrequently:false`, backing1422x521. Landscape demo/play/night/stressed
night59.86/59.87/59.87/59.64; portrait59.64/59.85/59.86/59.86FPS,4.5s per phase,
p95=16.8ms, at most0.37% intervals over20ms. No browser errors; rotation
restored to auto1/user0. Demo screenshot inspected. Cooler than the earlier
~34°C audit, so this confirms the final build under these conditions only.

## Build 2026-10-24.6 / cache v56: one GPU context, direct HUD text

Sustained A/B on A53 (`tests/android-sustained-performance.mjs`, 4x5 min,
trusted taps every 1s, rotation every 2 min, thermal 1): build .5 hybrid
59.58/58.88 FPS, all-GPU 31.05/31.17 FPS (71% frames >20ms) from the first
window. Not heat, taps, rotation, obstacles or the backing swap. The isolated
scaling fixture now also gives all-GPU demo 60.18 but play 35.8; the earlier
60 FPS all-GPU play sample does not reproduce. Bisection: skipping HUD
`drawPixelText` restores 57-60 FPS on GPU; ImageBitmap glyph caches do not
help (~29, and CPU drops to ~28); direct `fillText` in the pixel face gives
59.4-60.1. Copying dozens of per-glyph cache canvases per frame was the cost;
the attract demo draws no HUD, which is why GPU attract was fast.

Implemented: `drawPixelText` uses `fillText`, glyph/run caches removed; one
GPU-eligible context (no CPU play backing, no `syncCanvas`); ghost sprite
without the CPU hint. Delivery 319645 bytes, SHA-256 `96140b8c...`.

Physical results on that delivery (`output/hud-direct/`), Chrome 155:

| Check | A53 | S10e |
| --- | ---: | ---: |
| 10 min play, taps + rotation: mean / worst window | 59.86 / 59.69 | 59.85 / 59.76 |
| frames >20 ms / slow-frame share | 0.04% / 0.36% | 0.02% / 0.85% |
| landscape attract panels (12 s each) | 59.92 / 59.93 / 59.94 | 59.78 / 59.86 / 59.86 |
| functional suite, post-input portrait / landscape | 58.4 / 58.7 | 58.3 / 58.3 |

The previous CPU gameplay path had a 3.8-4% slow-frame share in 20 min A53 runs.
Content lift among slow frames stays near 1 for callouts (0.93/0.95), recovery
ghost (0.98/0.84) and shake (1.00/1.11), so a lettering atlas is not warranted.
The functional suite passed touch, feather, duck, pause, rotation, Help,
death/restart, name dialog and offline reload on both phones; HUD screenshots
inspected. Its first attempt hit a stale build .5 service worker on test origin
8897 (hash check failed as intended) and was rerun on fresh origin 8899. One A53
attract attempt timed out waiting for setup and passed on retry. Rotation
restored on both phones (A53 auto1/user0, S10e auto1/user1).
