# Arcade credits

Introduced in build `2026-10-21.6`, worker cache v32.

## Player contract

A new tab starts with **0 credits**. INSERT COIN adds one free virtual credit,
up to99. One credit buys a complete round with three starting lives and all
score-based extra lives described in [LIVES.md](LIVES.md). Jumping and life
rewards cost no credits. Training entry costs one credit too. The tab's
`sessionStorage` preserves credits on reload; blocked storage falls back to memory.

START is hidden in the initial markup until credits are available. At zero, the
large gold INSERT COIN occupies the future START slot. Lettering, coin tilt,
light pulse and sweep attract attention without moving the touch target.
After insertion, the deposit button becomes smaller beside the credit meter;
START appears in exactly the same large slot. Further deposits do not move START.
Credits also appear in the Canvas and portrait HUD.
Settings' Debug section includes Reset coins for returning the balance to zero.

Keyboard, canvas, gamepad and coordinator start/restart all use the same payment
gate. A new round spends exactly one credit; an empty balance cannot start.
Active-round jump input never spends. Deposits are accepted only on the available
attract menu, not during a round or modal/update interaction. Returning without
credits focuses INSERT COIN. The first insertion click may request fullscreen like any first click.

## Effects and sound

The treatment follows [ARCADE.md](ARCADE.md): embedded display/pixel faces,
gold/cream lettering, navy outline, warm extrusion and static glow. Coin flip,
digit punch and floating +1 give immediate feedback. Motion uses transform and
opacity, respecting pause, Effects off and reduced motion.

The metallic coin sound has six short sine partials, a two-hit strike and an
ascending final ping, lasting about400ms. It uses existing audio unlock, effects
volume and master mute, requiring no asset. Rejected deposits do not ring.
Validation measures rendered audio and the actual phone AudioContext signal;
this is not human listening verification.

## Validation

```powershell
node tests/coins.mjs release/dino.html
$env:DINO_BROWSER = 'webkit'
node tests/coins.mjs release/dino.html
```

The isolated offline suite starts at zero and checks nine desktop, tablet and
phone sizes, including320x568,663x234 and844x234. It covers all start gates,
keyboard/touch deposits, exact target replacement, reload, cap/storage errors,
payment, lives, focus, motion settings and audio energy/mute/volume. Legacy
gameplay fixtures explicitly preload99 test credits; production has no seed.
The gameplay simulation itself has no wallet.

Physical Android uses authorized USB Chrome and the scoped relay from
[FEATHER.md](FEATHER.md):

```powershell
adb forward tcp:9223 localabstract:chrome_devtools_remote
node tests/android-cdp-relay.mjs
# In another terminal, with the relay running:
node tests/android-coins.mjs release/dino.html
```

The runner serves the exact artifact on its own port8878, verifies SHA-256,
uses its own tab, normal rAF and trusted touch, disables live scores and worker
installation, and restores origin settings and rotation. It removes its own
reverse bridge. Stop the relay and remove the test forward afterward.

Galaxy S10e SM-G970F, Android12, Chrome155: ten browser/fullscreen states across
portrait and both landscape rotations; paid starts, pause/rotate/resume, reload,
real audio signal, action viewport/hit/overlap checks and screenshots. Reports
and captures live in `output/coins/`. Emulated Chromium/WebKit results are
separate from physical verification. No live scores or deployment.
