# Shield bubble

## Plan and player contract

- Collect a violet bubble with a shield emblem automatically, using the existing
  player hit area. Store one charge until a damaging cactus or bird collision.
- Pop the bubble and remove that entire obstacle (including a cactus cluster).
  The next separate damaging collision is lethal, even during the pop animation.
  No global invulnerability window or score bonus. Chili burns cacti first and
  preserves the shield; birds consume it. Feather and shield can coexist.
- First eligible spawn: ten seconds of obstacle play; consumed or missed bubbles
  wait 24 seconds. Retry occupied slots after 300 ms. Keep 180 logical pixels
  clear around obstacles and other pickups, and reserve the incoming corridor.
- Keep scheduling deterministic and independent of gameplay randomness. Freeze
  during pause; clear on death, round/session reset. Resize shares Game.world.
- Draw inline Canvas vectors: shield-marked collectible, transparent shell around
  the standing/ducking/jumping dino, short pop ring. Give distinct synthesized
  collection/pop sounds, live-region feedback and concise English help.
  Reduced motion keeps the static shell and suppresses bursts/expanding rings.

## Implementation and verification sequence

1. Save Git baseline 7530590; implement a DOM-free ShieldBubble component and
   integrate spawning, collection and single-hit consumption into Game.
2. Add rendering, audio, accessible feedback and help; update BUILD.
3. Add deterministic offline browser regressions for natural/swept collection,
   safe slots, no stacking, cooldowns, cactus/bird/cluster hits, subsequent death,
   simultaneous contacts, turbo/feather coexistence, pause/reset/rotation and
   reduced motion. Check desktop and touch portrait/landscape in both engines.
4. Run existing gameplay, architecture, feather and installed skill-client tests;
   inspect gameplay screenshots and errors. Rebuild and verify compact delivery.
5. Record outcomes here and in progress.md; commit completed changes in Git.

## Research applied

- [MDN: 2D collision detection](https://developer.mozilla.org/en-US/docs/Games/Techniques/2D_collision_detection):
  simple hitboxes and broad/narrow checks. Reuse existing hazard boxes; keep the
  decorative bubble from enlarging the player's vulnerable collision area.
- [MDN: Anatomy of a video game](https://developer.mozilla.org/en-US/docs/Games/Anatomy):
  preserve the existing fixed-step update/render split and pause behavior.
- [Phaser's collectible tutorial](https://phaser.io/tutorials/making-your-first-phaser-3-game/part8):
  overlapping collection disables the collectible immediately. Apply the same
  single-consumption rule without adding an engine or runtime dependency.
- [Designing Game Feel: A Survey](https://arxiv.org/abs/2011.09201):
  feedback makes events legible. Collection and impact use different sounds and
  visual states; the emblem and shell communicate protection beyond color alone.

The exact timing and one-obstacle rule are design choices for this runner,
not claims that one particular game or source mandates those values.

## Repeatable commands

Use a local Playwright installation, or point DINO_PLAYWRIGHT to its ESM entry.
On this workstation:

```powershell
$env:DINO_PLAYWRIGHT = 'D:/projects/pacman/node_modules/playwright/index.mjs'
$env:DINO_TEST_OUTPUT = "$PWD/output/shield"
node tests/shield-bubble.mjs
node tests/game-contract.mjs
node tests/architecture.mjs
node tests/jump-feather.mjs
node tests/skill-client.mjs
npm run build
node tests/release.mjs
node tests/shield-bubble.mjs release/dino.html
node tests/game-contract.mjs release/dino.html
node tests/jump-feather.mjs release/dino.html
node tests/skill-client.mjs release/dino.html
```

Run browser checks again with `DINO_BROWSER=webkit`; Windows WebKit also needs
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` here, as explained in FEATHER.md.
The new mobile fixture matches screen and viewport orientation at creation:
mixing an iPhone portrait screen with an initial landscape viewport leaves
WebKit's layout viewport/media queries stale when rotating back to portrait.
The isolated reproduction passes with matching dimensions. This is a test
emulation setup correction; gameplay has no browser-specific workaround.

## Verification

- Build `2026-10-16.1`; worker cache `dino-run-v5`. Source and compact delivery
  remain standalone; no new runtime dependencies or image assets.
- Chromium 151.0.7922.34 / WebKit 26.5: existing source contract (seven scenarios),
  architecture (11 scenarios), and feather (three layouts) pass per engine.
- New source shield checks pass all three layouts in both engines: natural and
  swept collection, safe slots/other pickups/corridor, RNG isolation, persistent
  single charge, cooldown, cactus/cluster/bird contact, same-step pickup/contact,
  simultaneous hazards, subsequent lethal contact, turbo/feather, near misses,
  pause, portrait/landscape rotation, reset, reduced motion and offline help.
- Source/release comparison passes 40 pixel-identical UI/gameplay scenes per
  engine, including shield pickup, protection, duck and pop in four layouts.
- Screenshots of the pickup, standing/jumping/ducking shell, impact, night and
  help have been inspected. Physical-phone shield testing is not established by
  the touch/DPR/viewport emulation; this build has no physical-device run.
- Delivery: 339,320 -> 174,403 bytes (48.60% saved), SHA-256
  `2977b167fd2ae999bf7e2fade85da8b56b2d59af4e2f030e2ccc034f24f6c92d`.
- New shield checks also pass all three layouts against the compact delivery in
  both engines. Delivery contract (seven scenarios) and feather (three layouts)
  pass per engine. The installed develop-web-game action client passes against
  source and delivery. Inline scripts/Node syntax, hashes and diff checks pass.
- WebKit dark-mode rendering was separately checked for source and release after
  waiting for the asynchronous media-query update; inspected both night images.
- Reports/screenshots and aggregate: `output/shield/verification.json`. No
  required implementation tasks remain; a physical-phone run is optional.
