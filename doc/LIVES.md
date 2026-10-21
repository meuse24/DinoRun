# Lives and score rewards

Build `2026-10-21.5`, worker cache `dino-run-v31`.

## Player contract

- Every normal or relaxed round starts with **3 lives**, with a maximum of **5**.
  Hearts show remaining lives; `1UP` shows the next reward's total score.
- Each unprotected cactus, bird or Stone Jaw contact costs one life. A surviving
  hit keeps the same round, score, speed, position, jump state and controls.
  It does not end the round or open highscore entry.
- After a surviving hit, **1.8 seconds of simulation-time recovery** prevents
  repeat damage. The dino becomes translucent with a static dashed turquoise
  outline. Pause freezes this timer. There is no flashing, including with
  reduced motion or Arcade effects disabled.
- A contacted cactus/bird is removed so it cannot hit twice. A survived rock
  encounter clears the rock. Recovery contacts do not consume a shield.
- Chili still burns cacti; it does not protect against birds or rock. A charged
  shield absorbs contact before lives are spent. A feather supplies a jump,
  never hit immunity; a surviving hit preserves it.
- The final life produces the existing death scene and highscore/name flow
  exactly once. Restart, return to attract and new session reset lives/rewards.
- Rock training retains unlimited practice; its HUD says PRACTICE/∞ and it
  neither earns nor spends normal-round lives.

## Reward balance

| Total points | Reward | Next interval |
| ---: | --- | ---: |
| 500 | +1 life | 750 |
| 1,250 | +1 life | 1,000 |
| 2,250 | +1 life | 1,250 |
| 3,500 | +1 life | 1,500 |
| 5,000 | +1 life | 1,750 |
| 6,750 | +1 life | 2,000 |

Each interval grows by 250 points. This is an initial tuning choice: the first
reward requires a sustained run, while later rewards grow farther apart as the
player can survive longer. Both modes use the same point thresholds. These are
not playtest-derived balance claims; future tuning can use actual run results.

Threshold crossing, rather than exact equality, triggers awards. Each threshold
is consumed once, including at the five-life cap; lives cannot be banked for
later damage. Rewards are applied before collisions in that frame, so reaching
a milestone can save the last life. Lives never change the score formula or
grant extra points. Existing stored highscores are retained.

## Implementation and validation

`Game` owns lives, thresholds, recovery and hit resolution. No DOM/audio is used
in that simulation. `Renderer` draws Canvas hearts/recovery; `SessionView` owns
portrait HUD text and accessible labels. `Runner` handles announcements, short
feedback and existing sounds. `render_game_to_text` includes lives, maximum,
next threshold and recovery time.

```powershell
$env:DINO_PLAYWRIGHT = 'D:/projects/pacman/node_modules/playwright/index.mjs'
node tests/lives.mjs
node tests/shield-bubble.mjs
node tests/rock-boss.mjs
node tests/jump-feather.mjs
node tests/game-over-flow.mjs
node tests/game-contract.mjs
node tests/architecture.mjs
node tests/skill-client.mjs
npm run build
node tests/release.mjs

$env:DINO_BROWSER = 'webkit'
$env:PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1'
node tests/lives.mjs release/dino.html
node tests/game-over-flow.mjs release/dino.html
```

The lives suite uses real obstacle collision boxes and movement, both game modes,
the three-hit sequence, clusters, birds, rock floor/roof, recovery expiry, all
power-up interactions, cap/no banking/no duplicate awards, same-frame milestone
and contact, training, reset, pause, rotation, actual jump input after damage,
night/reduced motion and desktop/portrait/landscape HUD captures. Network access
and score submission are disabled. Older terminal-collision suites now explicitly
start those fixtures on their final life, keeping their death-path assertions.

Screenshots and reports: `output/lives/`. Browser touch emulation is separate
from physical Android verification; no phone run or deployment in this iteration.
