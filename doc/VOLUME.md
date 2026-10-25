# Music and effects volume

## Music-reactive M24 logo

The visible attract-menu M24 logo pulses with each song's bass attacks.
Build `2026-10-25.8` tests a stronger response: half-strength bass expands the
logo by 30%, and peak bass by 80% (3.24 times the resting area). The curve blends
linear and squared bass strength equally, multiplied by 0.8. It replaces .7's
23% / 65% response. A fast attack and short release give it more punch.
The existing floating animation yields while the music pulse is active. The
logo grows away from the title, keeping its right edge, layout size and accessible
name fixed.

Build `2026-10-25.10` adds sound-wave rings. A bass onset (envelope rise of at
least 4 of 15 levels to level 9 or more, at most one per 200 ms) emits a ring in
the logo's own rounded silhouette. Both songs yield about one ring per beat
(21 and 31 in their first 30 s). Stronger hits grow further (1.5–2.4×), start more
opaque and last longer (520–880 ms); the strongest use M24 orange. Three pooled SVG
rings per logo copy animate only transform and opacity via the Web Animations API,
inside the SVG so they follow its pulse. Seeks/loops resynchronize without
emitting; frame steps up to 8 samples still find each onset once. Every stop
condition of the pulse also cancels the rings.

Build `2026-10-25.6` also places a decorative M24 logo beside the Settings,
Highscores / New highscore and Help titles (including Help's iframe). Only the
foreground heading pulses; covered logos reset. Header logos reserve room for
the full 80% pulse so title text and Back remain clear. Decorative copies have
no duplicate title IDs and do not change the headings' accessible names.

For these two fixed tracks, `scripts/bake-logo-pulse.mjs` analyzes the shipped
MP3s once during development with ffmpeg: 45–180 Hz bass, RMS windows at 30 Hz,
slow background subtraction, fast attack and exponential release. Each song is
normalized independently and quantized to 16 levels. Both envelopes together
occupy 7,170 embedded ASCII characters, with no runtime requests or dependencies.
Regenerate them with `node scripts/bake-logo-pulse.mjs` whenever either MP3 changes;
ffmpeg is a development tool and is not needed for ordinary builds or play.

`MusicLogoPulse` reads `HTMLMediaElement.currentTime` in the existing draw loop
and changes only the SVG's `transform`, with a 45 ms ease-out between samples.
It uses the song timeline, including seeks, loops and playback-rate changes;
it does not guess BPM or start an independent animation clock. Browser media
clock precision still applies; this is a visual accompaniment, not sample-accurate
audio scheduling. Identical values do not write to the DOM. There is no additional
AudioContext, FFT, decoder, layout read or analysis buffer. The attract screen
uses its existing draw loop. While a foreground menu pauses that loop, one
30 Hz timer updates only its logo; it does not advance or redraw the game. The
timer stops on closing the menu, hidden/paused/muted audio, Reduced Motion or
effects off, and is disabled in manual-frame tests.

Paused/buffering/missing/blocked audio, mute, music volume zero, gameplay,
hidden menus, background lifecycle pauses, Reduced Motion and disabled Arcade
effects leave the logo unscaled. Media stop/wait/error events reset it immediately;
the normal playing event and draw loop resume synchronization. The existing
audio routing and optional standalone/offline songs are retained.

Research: [MDN AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
describes the live FFT alternative. For the fixed soundtracks we chose baked data
to avoid continuous analysis and audio-routing changes.
[MDN currentTime](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime)
documents the media timeline; [web.dev animation guidance](https://web.dev/articles/animations-guide)
recommends transform/opacity to avoid layout work, and using layer hints sparingly.

`node tests/music-logo.mjs [game.html]` checks actual Chromium MP3 playback
driving varying scales for both songs, deterministic seek/phase and amplitude
bounds, media/lifecycle stops and recovery, dynamic Reduced Motion, the effects
switch, zero DOM mutations for 1,000 unchanged samples and three responsive
layouts, including peak-size title clearance. It also checks Settings, Help,
Highscores and entry headers in three layouts, foreground selection, frozen
gameplay, the independent menu timer and its mute shutdown.
`DINO_BROWSER=webkit` runs the deterministic DOM/CSS cases; the installed
Windows WebKit cannot decode these MP3s. Reports/screenshots are in
`output/music-logo/{source,release}`. These checks are browser emulation, not
physical Android performance or listening verification.

## Tracks and volume controls

Both optional MP3s live directly beside `dino.html`: `dino-boom-in-the-dunes.mp3`
and `dino-jump-jump.mp3`. Keep them beside any copied HTML, including a copied
release artifact. Hosted deployment uploads them to that same directory.

Settings → **Theme song** switches between **TINY ARMS, BIG BASS** (formerly
“Boom in the Dunes”; the default) and **Dino Jump Jump**. The choice is saved as `dino-music-track`.
Switching starts the selected song from the beginning and keeps the volume and
Sound mute state. Invalid/missing preferences use the new song; blocked storage
still allows switching for the current page. Both songs remain optional for
standalone play and are independently cached for hosted offline installation,
including byte-range responses. A missing song does not block game installation
or prevent switching to the other song.

`dino-boom-in-the-dunes.mp3` is converted from the supplied `asset-sources/audio/Theme_song2.wav`
using the first song's mono, 22,050 Hz, constant 64 kbit/s MP3 settings.
The WAV is 121.2 seconds; a pitch-preserving 1.5% tempo increase keeps the MP3
below two minutes (119.420 seconds, 956,699 bytes with tags). The original WAV is untouched.

```powershell
ffmpeg -hide_banner -nostdin -i asset-sources/audio/Theme_song2.wav -map 0:a:0 -vn -af atempo=1.015 -ac 1 -ar 22050 -c:a libmp3lame -b:a 64k -map_metadata -1 -metadata title="Dino Run - TINY ARMS, BIG BASS" -metadata artist="m24" dino-boom-in-the-dunes.mp3
```

### Song provenance (Suno)

Both songs were generated with Suno (model V6, account meuse24) while a Suno Pro
subscription was active: Dino Jump Jump on 2026-10-10 (period 2026-09-15 to
2026-10-15), TINY ARMS, BIG BASS on 2026-10-18 (period 2026-10-15 to 2026-11-15).
Neither is a remix or cover. Lyrics are by Günther Meusburger. Suno's Terms of
Service (revision 2026-08-10) assign Pro/Premier Output rights to the subscriber,
allow commercial use of permitted downloads, require no attribution and forbid
removing Suno's metadata. The invoices are kept privately, not in this repository.

| MP3 | Suno title | Song id | Share link |
| --- | --- | --- | --- |
| `dino-boom-in-the-dunes.mp3` | TINY ARMS, BIG BASS | `a021fc8a-fb4f-413b-803e-d6e355ced0fc` | https://suno.com/s/yH1brWGRlAiRFA1j |
| `dino-jump-jump.mp3` | Dino Jump Jump | `c12ca945-6e26-4edc-a3f6-5bf55a5f68d6` | https://suno.com/s/c6JPJJrvJMg0k4sC |

The shared link https://suno.com/s/p6cPRGkhtyhDSsVd is a later cover (remix) of
TINY ARMS, BIG BASS and is not used. The conversion above dropped Suno's WAV
comment; it was restored in both MP3s without re-encoding (audio packet MD5
unchanged), together with title, artist, composer and the share link:

```powershell
ffmpeg -i in.mp3 -map 0:a -c copy -map_metadata -1 -id3v2_version 3 -metadata title="Dino Run - …" -metadata artist="m24" -metadata composer="Günther Meusburger (lyrics); Suno" -metadata comment="made with suno; created=…; id=…; …" out.mp3
```

Keep these tags when re-encoding either song. Help → About names the songs,
the lyricist, Suno and the Pro plan with both links.

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
# Playwright uses the local installation from npm ci.
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
It also copies the HTML and both MP3s into one isolated directory and verifies
actual `file://` playback of both sibling songs.
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
