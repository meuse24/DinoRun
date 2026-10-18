# Music and effects volume

Settings → **Theme song** switches between **Boom in the Dunes** (the new
default) and **Dino Jump Jump**. The choice is saved as `dino-music-track`.
Switching starts the selected song from the beginning and keeps the volume and
Sound mute state. Invalid/missing preferences use the new song; blocked storage
still allows switching for the current page. Both songs remain optional for
standalone play and are independently cached for hosted offline installation,
including byte-range responses. A missing song does not block game installation
or prevent switching to the other song.

`dino-boom-in-the-dunes.mp3` is converted from the supplied `Theme_song2.wav`
using the first song's mono, 22,050 Hz, constant 64 kbit/s MP3 settings.
The WAV is 121.2 seconds; a pitch-preserving 1.5% tempo increase keeps the MP3
below two minutes (119.420 seconds, 956,179 bytes). The original WAV is untouched.

```powershell
ffmpeg -hide_banner -nostdin -i Theme_song2.wav -map 0:a:0 -vn -af atempo=1.015 -ac 1 -ar 22050 -c:a libmp3lame -b:a 64k -map_metadata -1 -metadata title="Dino Run - Boom in the Dunes" -metadata artist="m24" dino-boom-in-the-dunes.mp3
```

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
retains the optional song player. All synthesized
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
node tests/theme-songs.mjs
$env:DINO_BROWSER = 'webkit'
$env:PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1'
node tests/volume-controls.mjs
# Both engines also accept release/dino.html as the last argument.
```

The isolated fixture disables the highscore API and intercepts every request.
Desktop, 320px portrait and phone landscape cover independent channels, native
keyboard/touch input, zero/full levels, playback position, mute/edit/unmute,
reload, invalid stored values and blocked storage. Song selection additionally
covers saved choice, native keyboard input, mute/zero-volume switching, recovery
after a missing song and paused/active gameplay. Actual HTMLAudioElement volume
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

`tests/theme-songs.mjs` uses both actual MP3 files and an isolated local HTTP
server. Chromium verifies media decoding, default/saved selection, offline reload
and switching, plus prefix/suffix/unsatisfiable byte ranges for both cached songs.
It accepts `release/dino.html`; no real highscore service is contacted.

Reports/screenshots: `output/volume/{chromium,webkit}-{source,release}`. Browser
phone layouts are emulation, not physical-device or listening verification.
The installed develop-web-game client and lifecycle/offline suite are also used;
source/release screenshots are compared with the existing exact-pixel harness.

Build 2026-10-17.5: source and release pass the volume suite in Chromium
151.0.7922.34 and WebKit 26.5, with the platform limits above recorded explicitly.
All 96 source/release comparison scenes match exactly. Chromium also passes the
seven lifecycle/offline scenarios; the installed skill action client passes.
Aggregate: `output/volume/verification.json`. No live score requests or data changes.

Build 2026-10-18.1 adds the theme-song selector. Source and release pass all 11
volume/song groups in Chromium 151.0.7922.34 and WebKit 26.5, with the same
Windows WebKit media/DSP limits above. Both actual MP3s decode and play in the
Chromium source/release hosted and offline fixtures; all six cached byte-range
cases pass for each artifact. Both engines pass all 48 source/release comparison
scenes (96 exact matches total). Chromium source/release lifecycle checks pass
seven scenarios each; the installed skill action client passes and screenshots
were inspected. Evidence: `output/theme-songs/verification.json`. These are
desktop/browser-emulation checks, not physical-phone or listening verification.
