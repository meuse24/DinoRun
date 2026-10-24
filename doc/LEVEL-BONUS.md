# Level bonus and automatic attract loop

Introduced in build `2026-10-21.10`, worker cache `dino-run-v36`.

## Rewards

Each speed-level crossing snapshots the completed section's performance. At top
speed, a checkpoint continues every30 seconds of active running. The current
two categories are:

| Achievement | Points |
| --- | ---: |
| Cleanly passed obstacle groups | 1 each, up to10 |
| No hits during the section | +5 |

The combined award is limited to10% of the section's integer distance score,
with an additional defensive ceiling of20. The current categories can award at
most15. The obstacle component takes priority if the budget is smaller.
Thresholds and values are initial tuning, not measured retention claims.

A cactus cluster counts once. An obstacle is counted once when its full width
passes behind the player; hit, recovery-removed, shield-hit and Chili-burnt
obstacles cannot earn a clean pass. Shield contacts and boss contacts invalidate
the no-hit category; Chili burning a cactus does not count as damage. Empty
jumps have no value. Existing section counters are separate from session stats.

The snapshot stays fixed while the corridor clears. Actions after the boundary
belong to the next section. Bonus coins increase score, never INSERT COIN credits.
Extra-life thresholds use the full score, so a bonus crossing can grant one life
exactly once. Speed levels remain based on speed rather than bonus points.
Day/night and bird score gates continue to use total score.

## Safe sequence

Pending rewards stop new regular obstacles, collectibles and idle boss starts.
Existing obstacles and pickups finish normally. Active Chili and boss encounters
finish too. The sequence begins only with an empty corridor and a grounded dino;
it never freezes an airborne jump or erases an approaching obstacle.

The1.8-second tally freezes distance, speed, jump physics, recovery and power-up/
boss timers. It does not earn ordinary distance score. The dino grins, two short
rows explain the award, and at most six coins fly toward the score. Six bounded
payment beats add real points, with rising metallic pings. As of build
`2026-10-24.8` / cache v58, flying coins have a 24-unit face diameter (formerly
10), an embossed numeral, highlighted gold rim, a soft halo, three fading trail
dots and a sparkle. They shrink into the HUD while keeping the existing flight
and payment timing. Coin arrival, score
increment and sound share the same timing. Zero-value beats create no coin or
sound. A short final hold/fade leads automatically back to play.

Build `2026-10-24.10` / cache v60 also recaps berries collected in the completed
section. A pink `BERRIES n` / `25*n PAID` row distinguishes their already awarded
points from the new level bonus. Up to six representative cached berry sprites
fly alongside the coins to the same HUD target, within the existing1.8-second
sequence. Larger counts remain fully visible in the row. The recap never pays
berry points again, grants lives again, or changes bonus caps/coin payment/audio.
The count is snapshotted at the level/checkpoint boundary and cleared for the
next section; collections after that boundary belong to the next recap.
Effects off and reduced motion keep the row and suppress the flights. Zero
berries preserve the original two-row panel without additional sprite work.

Jump inputs during the tally do not consume feathers or queue a delayed jump.
Settings, Help, focus loss and device backgrounding freeze the tally through the
existing pause lifecycle. Touch controls remain available; normal input resumes
immediately afterward. Reduced motion and Effects off retain the readable tally
and identical rewards while suppressing coin flight and movement. Audio obeys
effects volume and master mute. No external assets or dependencies are needed.

## Architecture and highscores

`Game` owns section counters, pending snapshots, the tally clock and incremental
payment. `bonusScore` is independent of distance: normal updates calculate
`floor(distance * POINTS_PER_PX) + bonusScore + berryScore`, preserving every payment.
`Renderer` draws the summary/coins; `Runner` handles announcements and synthesized
audio. `render_game_to_text` exposes bonus totals and pending/active tally state.
Attract demo/backdrop games disable rewards; rock training is excluded.

Client `SCORE_BONUS_RATE` and PHP `DINO_SCORE_BONUS_RATE` both equal0.1. The
plausibility bound includes this maximum bonus allowance. **When publishing,
upload `highscores-lib.php` before or together with the new HTML and worker.**
The generated HTML alone does not update the server validator.

Existing local and online records are retained, with no reset or storage-schema
change. New runs can earn the additional bounded points, so pre-bonus records
come from a different scoring rule. No data migration or live score mutation is
performed by this implementation.

## Attract presentation

Navigation dots and the preview pause button are removed. Scores8s → demo10s →
power-ups9s repeats automatically. Settings/Help/background pause still work.
Reduced motion retains the content loop with static transitions and a still
demo. Internal fixture controls can select/pause panels for regression tests;
there are no corresponding player-facing controls. See [ATTRACT.md](ATTRACT.md).

## Verification

```powershell
node tests/level-bonus.mjs release/dino.html
# Repeat with DINO_BROWSER=webkit
php tests/bonus-score.php
node tests/attract-screen.mjs release/dino.html
node tests/android-level-bonus.mjs release/dino.html
```

The isolated browser suite tests real grouped obstacle geometry/contact, no
double accounting, both modes, actual acceleration crossings, a long natural
run through the speed cap/checkpoints, cumulative10% bounds, power-ups, safety,
life rewards, reset, pause, input and desktop/portrait/compact landscape. Audio
DSP checks audible bounded output, short tails, quarter-volume energy scaling,
mute and zero volume. PHP checks accepted/rejected plausibility boundaries in
both modes without storing scores. Live API calls are disabled.

Physical Galaxy S10e SM-G970F/Android12/Chrome155 uses its own tab/server/USB
reverse on8879 with normal rAF, trusted touch and real AudioContext analysis.
The fixture authors a safe level boundary, then verifies actual tally timing,
pause/rotate/resume, three orientations, extra-life/payment and post-tally touch.
It also waits through a real automatic attract loop and checks absent controls.
Source/release SHA-256 is checked; rotation and origin settings are restored.
Stop the scoped relay and remove its test forward afterward, per [FEATHER.md](FEATHER.md).
Reports/screenshots live under `output/level-bonus/`; no deployment is performed.
