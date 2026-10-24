# Glow berry

Introduced in the release series through `2026-10-24.11` / cache `dino-run-v61`.
Local build and recorded publication history: [RELEASE.md](RELEASE.md).

The round fuchsia berry awards exactly 25 points once when an airborne dino
touches it. It adds neither credits nor a stored power-up. Missing it has no
penalty. Its center is y108; the 24×24 collection box sits above the standing
dino. Feather jumps, Chili and shield do not change the award.

The first attempt waits at least 12 seconds of active play, excluding the
opening/countdown. Collection or a miss starts a private, deterministically
seeded 18–26 second cooldown. Losing a life keeps this timer. Round reset clears
the pickup, count and berry points. Pause, Help, Settings, backgrounding and
the level tally freeze it. Training and attract simulations disable berries.
Pending bonuses and reserved boss corridors dismiss an existing berry and
block new spawns.

## Safe placement

The [archived design](archive/GLOW-BERRY-PLAN.md) assumed `last.gap` always bounds the next obstacle. Actual
`Horizon.update()` also creates one immediately when the last obstacle leaves
the world. A safe gap therefore uses the smaller of the authored gap and
`world.width + 10`. It cannot rely on an offscreen obstacle retaining a large gap.

Independent-jump placement reserves the remaining full-jump landing travel,
three steps to reach berry height, and a following short-jump flight plus
player width/padding. Rising before and traveling across the preceding obstacle
are deducted from the full flight. A timed retry targets a short safe window
instead of always skipping it in 300 ms increments. The berry may appear in the
right visible region if the reaction requirement is satisfied.

Because two separate jumps do not fit on many ordinary worlds, the implementation
also supports a berry centered above a newly approaching cactus. This rewards
the existing safe jump without adding a second jump obligation. Birds, triple
large cacti, large cacti below speed6 and double large cacti below speed9 are
excluded from this placement. These bounds preserve the tested minimum six-step
safe short-jump window. The normal standalone berry has a substantially wider
collection window. Both placements require 450 ms of visible reaction time,
allowing six steps of jump lead and the maximum Chili forward position when
active. Narrow/high-speed combinations can still skip spawns. Once the cooldown
has expired, a new obstacle triggers a placement attempt immediately, so a
300 ms retry cannot miss its brief entrance window. The cooldown is never bypassed.

Two-minute seeded runs with normal bonus/boss scheduling produced1/3 berries
in420-wide normal/relaxed worlds and4/4 in600-wide worlds. These are reproducible
fixture observations, not guaranteed spawn counts. Actual safe short-jump
windows for the allowed cactus cases are6–14 steps (including relaxed speed4.2);
standalone berry collection windows are25–31 steps.

No obstacle is moved, delayed or suppressed. Berry timing consumes no shared
gameplay RNG. Without collecting berries, the seeded obstacle and other pickup
traces remain bitwise equal. Collecting adds real score, so existing score-based
bird eligibility and day/night gates can naturally occur earlier.

## Rendering and score integration

Two bounded, lazily built Canvas sprites hold the fuchsia body and radial aura,
at up to scale3. A frame draws at most two images; effects off draws only the
body. No live shadow/filter/gradient or Canvas readback is used for the berry.
The 220 ms visual entrance grows from70% to100%; its hitbox stays fixed.
Reduced motion keeps it still. Four spawn sparks and six collection sparks
reuse the capped particle pool. Pink/white `+25` uses cached arcade text and
remains readable with effects off; reduced motion removes its movement.
A simultaneous extra-life callout is offset so the texts do not overlap.
The next level/checkpoint tally recaps the completed section's berries in a
pink row and flies at most six representative cached sprites to the score
alongside the bonus coins. Their points were paid at collection; the recap
never adds them again. Effects off/reduced motion retain the row without flight.
The short rising two-note triangle sound follows effect volume and master mute.

`Game.refreshScore()` sums distance, level bonus and `berryScore` without changing
the level bonus's distance budget. Life milestones are consumed once, including
when crossed by a berry. `berries` records the round count; SessionStats includes
“Glow berries collected”. Help and the fourth static attract card explain +25.
Compact portrait cards leave room for the advice and persistent START button.

Client and PHP plausibility bounds add zero before12s, then
`25 * (1 + floor((durationMs - 12000) / 18000))`. Both constants and boundary
calculations are audited in `tests/game-contract.mjs`; PHP tests accept the
bound and reject bound+1. Existing scores are retained; new runs have additional
earning opportunities. **Publish `highscores-lib.php` before or together with
the new HTML and worker.** A HTML/worker-only upload is insufficient.

## Verification

`tests/glow-berry.mjs [game.html]` covers short-jump windows, real cactus collision
windows, ground/duck exclusion, cooldown/reset/lives/bonus/boss, five layouts,
seeded traces, points/stats, cache bounds, effects off, reduced motion and pause.
It uses an isolated standalone HTML, disables online scores, and accepts
`DINO_BROWSER=webkit`. Screenshots/report: `output/glow-berry/{chromium,webkit}`.

`tests/android-glow-berry.mjs [game.html]` uses normal rAF and trusted touches on
an unlocked USB phone. It owns origin8886, a dynamic ADB forward and scoped
relay9240, restores rotation/origin storage, and closes its own tab. Six S10e
collection/pause/effect checks passed; screenshots were inspected. Sound
invocation is checked, not a captured acoustic signal.

Optional `android-gc-performance.mjs` phases `play,berry,berryCollect` measure a
matched old scene, one persistent berry and bounded feedback. S10e ABBA short
landscape samples were59.91–59.92 FPS in all phases; berry scene work was
2.56–2.59 ms versus2.65–2.72 ms for the old scene, within run variability.
GC events still occur in both versions; these samples do not establish a
heap-growth or long-term thermal guarantee. The graphics path measured here
predates the final placement refinements, which do not change the sprite/effect
implementation. Reports/traces: `output/glow-berry/android-performance`.

The sustained runner now tags `berryPickup` and `berryCollect` frames. Physical
A53 verification is unavailable in this session; emulator and physical evidence
are kept separate. This document and the release notes record final checks.

Final browser verification: five berry layouts each in Chromium and WebKit,
including the generated release in Chromium;12 Chromium attract layouts;
PHP syntax and bonus-bound tests; lifecycle/offline7, level bonus, lives,
effects, arcade type, feather, shield and rock boss. Particle/controller/HUD
pooling passes against the saved pre-change source. A stale pooling assertion
was corrected to accept a stably absent glyph-offset buffer in the existing
direct-text renderer; its failure was reproduced on the baseline first.
Build `.9` compared all64 Chromium source/release scenes pixel-identically; the installed game
skill action client passes on the release. The final generated HTML also passes
the six trusted-touch S10e checks. A separate66-second S10e normal-rAF pilot
with real hazards/power-ups, refilled lives and trusted taps held59.9 FPS in
all four windows (mean draw2.42 ms); it included visible berry frames. This
short run is a smoke measurement, not the usual12-minute sustained test.
Performance evidence above covers the berry implementation before the final
placement refinements. The published `.11` artifact additionally passes six
trusted collections, three real-rAF berry recaps (pause and no double scoring),
both sky phases and daytime name dialogs on S10e in portrait/both landscapes.
The artifact hash equals the verified live HTML. This last device run does not
repeat the performance benchmark. Evidence: `output/glow-berry/published-device`.
