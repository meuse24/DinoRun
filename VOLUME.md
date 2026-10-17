# Music and effects volume

Settings has separate **Music volume** and **Effects volume** sliders from
0 to 100 percent. Changes apply immediately. Native sliders support keyboard
arrows, Home/End and touch. Percentages remain visible; accessible values include
the percent sign. Small screens stack the two controls.

The existing **Sound** switch mutes both channels without changing their levels.
Sliders can still be adjusted while muted. Music at zero pauses and mutes the
optional track; raising it resumes the current position when menu music is
allowed. Music does not play during active gameplay or the death scene.
Effects at zero do not create new oscillators.

Defaults preserve the previous mix: music 45%, effects 100%. Browser preferences
are `dino-music-volume` and `dino-effects-volume`, alongside the existing
`dino-sound-muted`. Saved zero is valid. Missing, unreadable, empty or out-of-range
values use defaults. If browser storage is blocked, controls still work for the
current page; a reload uses defaults. Quit/restart does not reset the levels.

Music uses the existing media element's volume property, with explicit pause/mute
at zero. Browser/device restrictions on media volume still apply; this change
does not replace the optional song player or require a new asset. All synthesized
effects pass through one GainNode. Twelve-millisecond ramps avoid abrupt gain
changes and also affect tones already scheduled, including the death scene.
Replacing the AudioContext recreates the output gain at the current level.

Sources: [media volume](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/volume),
[GainNode](https://developer.mozilla.org/en-US/docs/Web/API/GainNode),
[AudioParam](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam).

## Verification

```powershell
$env:DINO_PLAYWRIGHT = 'D:/projects/pacman/node_modules/playwright/index.mjs'
node tests/volume-controls.mjs
$env:DINO_BROWSER = 'webkit'
$env:PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1'
node tests/volume-controls.mjs
# Both engines also accept release/dino.html as the last argument.
```

The isolated fixture disables the highscore API and intercepts every request.
Desktop, 320px portrait and phone landscape cover independent channels, native
keyboard/touch input, zero/full levels, playback position, mute/edit/unmute,
reload, invalid stored values and blocked storage. Actual HTMLAudioElement volume
and muted properties are checked. A quiet generated PCM track replaces the song.

Chromium OfflineAudioContext renders all effect paths. After the short ramp,
25% produces one quarter of the full signal amplitude. Zero and master mute
produce silence even for already scheduled sounds. Context replacement preserves
the level. This validates DSP without depending on a sound card: headless Windows
can report a running live audio context while its clock stalls.

The installed Windows WebKit build has no OfflineAudioContext and rejects the
PCM track with MEDIA_ERR_SRC_NOT_SUPPORTED. Its fixture retains a real audio
element for volume/muted properties and simulates only playback/pause/position.
Unsupported DSP checks are explicitly recorded in its report; they are verified
in Chromium. Production code is unchanged by these test accommodations.

Reports/screenshots: `output/volume/{chromium,webkit}-{source,release}`. Browser
phone layouts are emulation, not physical-device or listening verification.
The installed develop-web-game client and lifecycle/offline suite are also used;
source/release screenshots are compared with the existing exact-pixel harness.

Build 2026-10-17.5: source and release pass the volume suite in Chromium
151.0.7922.34 and WebKit 26.5, with the platform limits above recorded explicitly.
All 96 source/release comparison scenes match exactly. Chromium also passes the
seven lifecycle/offline scenarios; the installed skill action client passes.
Aggregate: `output/volume/verification.json`. No live score requests or data changes.
