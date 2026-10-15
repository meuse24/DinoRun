# Jump feather plan

## Player contract

- A blue/turquoise feather pickup stores one air jump, with no expiry or stacking.
- Jump normally, release, then press the existing jump control again in the air.
  Keyboard, pointer, touch button and gamepad use the same game command.
- Ground jumps and landing do not spend the charge. Death, restart and a new
  session clear it. Pausing freezes pickups. Chili and feather can coexist.
- A small feather beside the dino indicates a charge. Collection and use have
  distinct visual/audio feedback; meaning never relies on color alone.
- Air-jump lift is bounded near the screen top. Cacti and birds remain dangerous;
  the feather does not change speed, score rules or invulnerability.
- The game remains one offline/file-capable HTML, with optional external song.

## Implementation sequence

1. Save Git baseline `10b7c4b`; add this plan and focused browser regressions.
2. Add a small simulation component for feather spawning/charge, swept pickup
   collision and cooldown. Use deterministic timers without consuming the
   obstacle/chili RNG. Spawn with space around hazards and the chili pickup.
3. Implement one explicit airborne impulse through Game.jump, preserving normal
   jumps and the existing landing buffer. Consume only on a successful air jump.
4. Render an inline Canvas feather, pickup halo and charge indicator. Add brief
   feedback, reduced-motion handling, accessible announcements and help text.
5. Test behavior and rendering in Chromium and WebKit, including smartphone
   portrait/landscape touch emulation and isolated offline file loading. Exercise
   collection, no stacking, first/second/third jumps, landing, top bounds, Chili,
   pause, death/restart/session reset and real inputs. Inspect screenshots.
6. Run the develop-web-game action client, game contract and old-behavior visual/
   deterministic regressions with feather spawning disabled only in tests.
   Document evidence, update BUILD and commit the completed feature.

## Engineering basis

- Keep input, fixed-step simulation and rendering distinct, as described in
  [MDN's game-loop anatomy](https://developer.mozilla.org/en-US/docs/Games/Anatomy).
- Use explicit transitions (empty -> charged -> spent) and reuse the existing
  collision/input pipeline. Bound live pickups to one, avoid per-frame DOM work,
  and keep cosmetic effects outside gameplay randomness.
- Build on the existing swept-AABB pickup approach so fast movement does not
  skip a collectible. Preserve accessibility and reduced-motion behavior.

## Compatibility evidence

- Smartphone testing uses Playwright touch/DPR/mobile viewport emulation.
  It does not establish physical Android/iPhone performance or Safari hardware
  compatibility by itself. Record engine versions and exact outcomes below.
- The preinstalled WebKit 26.5 / Playwright 1.62.1 currently fails to launch on
  this Windows environment (`spawn UNKNOWN`). Investigating a runnable WebKit
  installation before implementation; do not report a failed launch as a pass.
