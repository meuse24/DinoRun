# Build und Release

Die lesbare Quelle bleibt `dino.html`. `npm run build` erzeugt die eigenständig
spielbare Auslieferungsdatei `release/dino.html` und `release/size-report.json`.
Das Spiel selbst benötigt keinen Build-Schritt.

## Stand und Versionsführung

Lokal und veröffentlicht: Build `2026-10-25.12`, Worker-Cache `dino-run-v74` mit Exit-Button
([EXIT.md](EXIT.md)), Schallwellen-Ringen am Logo ([VOLUME.md](VOLUME.md)) und
Installationshinweis ([INSTALL.md](INSTALL.md)); Songs mit Suno-Herkunft ([VOLUME.md](VOLUME.md)).
Der neue Build testet 30 % Logo-Vergrößerung bei halber Bassstärke und maximal
80 % im Startmenü und neben Settings, Help und Highscores;
siehe [VOLUME.md](VOLUME.md). MP3-Dateien liegen direkt neben `dino.html`.
Bilder und Icons liegen in `assets/images/`.
Der aktuelle Bericht ist für Größen und Hashes maßgeblich.

Nach Commit `e1e9dbb` mit `npm run deploy -- --tls12` veröffentlicht;
alle zehn statischen Dateien per HTTPS/SHA-256 bestätigt. Nur Kennlinie/Grenzen,
Syntax, Build und diff geprüft; keine Browsersuiten. Visuelle Bewertung durch Nutzer.

Vorher veröffentlicht: Build `2026-10-25.7`, Worker-Cache `dino-run-v69`.
Nach Commit `060a12a` mit `npm run deploy -- --tls12` veröffentlicht;
alle zehn statischen Dateien per HTTPS/SHA-256 bestätigt. Auf Nutzerwunsch nur
Kennlinie/Grenzen, Syntax, Build und diff geprüft; keine vollständigen Tests.
Die visuelle Abstimmung übernimmt der Nutzer.

Vorher veröffentlicht: Build `2026-10-25.6`, Worker-Cache `dino-run-v68`.
Nach Commit `cbb0e6e` am 2026-10-25 mit `npm run deploy -- --tls12`
veröffentlicht; alle zehn statischen Dateien per HTTPS/SHA-256 bestätigt.
Beide vollständigen Releasegruppen (Chromium/WebKit) bestanden, einschließlich
je 64 pixelidentischer Source-/Release-Szenen. Live-Hochformatprüfung bestätigt
Pulsieren bis 1,65 im Startmenü und in Settings, Help sowie Highscores, dabei
eingefrorene Spielzeit in Menüs. START stoppt die Musik; beide MP3s liegen neben
der HTML im Offline-Cache, Offline-Neuladen und Songwechsel funktionieren.
Keine Highscore-Anfragen. Nachweis: `output/publish-logo/live-report.json`
und Screenshots daneben. Veröffentlichung per FTPS, keine alten Medien gelöscht.

Vorher veröffentlicht: Build `2026-10-25.2`, Worker-Cache `dino-run-v64`;
Korrektur der Flugziele von Bonusmünzen und Beeren im Hochformat.
Nach Commit `5f58747` am 2026-10-25 mit `npm run deploy -- --tls12`
veröffentlicht; alle zehn statischen Dateien per HTTPS/SHA-256 bestätigt.
Live-Hochformatprüfung (320x568): Münze und Beere treffen den sichtbaren Score
bei x256/y144,875; Cache v64 und keine Browserfehler. Nachweis:
`output/bonus-flight-fix/live-report.json` und `live-portrait.png` daneben.

Vorheriger Release `.1` / Cache v63: am 2026-10-25 nach Commit `a6bbc7d` mit `npm run deploy -- --tls12`
veröffentlicht: sieben Medien, Manifest, HTML, zuletzt Worker. Alle zehn Dateien
über HTTPS per SHA-256 bestätigt. Frischer Chromium-Kontext besteht START,
Offline-Neuladen sowie gecachte Icons und beide MP3s, ohne Highscore-Schreibzugriff.
Nachweis: `output/publish-2026-10-25/verification.json`.

Vorher im bisherigen Protokoll dokumentierte Veröffentlichung:
`2026-10-24.11` / `dino-run-v61` am 2026-10-24. Das ist ein historischer
Nachweis, keine erneute Abfrage der Live-Website. Details und damalige Prüfungen:
[Release-Archiv](archive/RELEASE-through-2026-10-24.md).

Vor einer geänderten gehosteten Version `BUILD` in `dino.html` und
`CACHE_NAME` in `service-worker.js` erhöhen. Anschließend neu bauen und prüfen.
HTML und Worker gemeinsam veröffentlichen; die aktive Worker-Version bindet
die ausgelieferte HTML an ihren Cache. Siehe [UPDATES.md](UPDATES.md).

## Bauen und Minifizierung

Node.js ab Version 22, Befehle aus der Repository-Wurzel:

```powershell
npm ci
npm run build
Get-Content release/size-report.json
Get-FileHash release/dino.html -Algorithm SHA256
```

Die durch `package-lock.json` fixierten Entwicklungswerkzeuge sind Terser,
CSSO und HTMLMinifier-Terser. Ihre Optionen stehen in
[scripts/build-release.mjs](../scripts/build-release.mjs):

1. Terser komprimiert alle Inline-Skripte mit `ecma: 2022`, zwei Durchläufen
   und lokalem Name-Mangling. Eigenschaftsnamen, Test-Hooks und Lizenzhinweise
   bleiben erhalten; `inline_script: true` schützt die HTML-Einbettung.
2. CSSO verarbeitet alle eingebetteten Styles, einschließlich Hilfe-Template,
   mit `comments: false, restructure: false`. Umstrukturierung würde die
   Fallback-Reihenfolge von `var(--bg)` und `color-mix()` verändern.
3. HTMLMinifier-Terser minifiziert das Markup ohne zweiten JS-/CSS-Durchlauf.
   Schließende Tags, SVG-Schreibweise und relevante Inline-Abstände bleiben
   erhalten. Der komplette verschachtelte `#round-panel` und das
   `#game-over-overlay` bewahren ihren Leerraum für identische WebKit-Kanten.

Keine feste Anzahl von Stylesheets annehmen: Der aktuelle Bericht zählt drei
Inline-Skripte und sieben Styles. Das Skript prüft Syntax, Standalone-Eigenschaften
und erhaltene Chromium-/Font-Attribution. Die Quelle wird nicht überschrieben;
`release/dino.html` und der Größenbericht dürfen nicht von Hand bearbeitet werden.

## Verwendung

`release/dino.html` direkt für Offline-`file://`-Spiel öffnen oder kopieren.
Optional einen oder beide MP3-Titel direkt daneben kopieren;
Settings → Theme song wählt den gespeicherten Titel.
Ohne diese Dateien bleibt das Spiel eigenständig spielbar. Zum lokalen Testen
von `release/dino.html` mit Musik die MP3s auch direkt neben diese HTML kopieren;
der Build erzeugt weiterhin nur HTML und Größenbericht.

Auf dem Server ersetzt die Datei die bisherige `dino.html` im ursprünglichen
Verzeichnis, nicht unter `/release/`. PHP, Konfiguration, Daten und Manifest
behalten ihre Orte; Icons liegen unter `assets/images/`, Songs neben `dino.html`.
Der generierte Release-Ordner
allein ist keine vollständige PHP-/PWA-Installation. Bauen lädt nichts hoch.


## Upload

`npm run deploy` publishes the finished delivery; `npm run build` never uploads.
Run it only after the build and the verification below pass.

1. Create `ftp.txt` in the repository root (git-ignored, never commit it): the
   first line is the game URL, then `Server:`, `Username:` and `Passwort:` lines.
   The URL path (`/apps/dino/`) is also the FTP target directory.
2. `npm run deploy -- --dry-run` checks the delivery without uploading: it needs
   `BUILD` in `release/dino.html`, a delivery newer than `dino.html`, and refuses
   when the live worker already has the same `CACHE_NAME` (override: `--force`).
3. `npm run deploy` first uploads five images under `assets/images/`, both MP3s beside `dino.html` and
   `manifest.webmanifest`, then optional extras, `release/dino.html` as `dino.html`, then
   `service-worker.js` **last**, so a worker never caches a mismatched game. It
   uses the system `curl` (FTP over TLS required; `--plain-ftp` allows
   unencrypted FTP). The password is passed through stdin, not as an argument.
   On Windows Schannel, the current host rejected default FTPS data uploads
   with451 (read from data connection). `--tls12` pins encrypted FTPS to TLS1.2;
   this succeeded and was byte-verified. Retry with that flag rather than using
   unencrypted FTP. Check/restore any failed PHP upload before publishing HTML.
4. It fetches all uploaded static files over HTTPS and compares SHA-256 hashes
   with the local files. PHP sources cannot be byte-verified through an executing
   HTTP endpoint. A static-file mismatch fails the command.

Extra files are uploaded only on request, before the HTML:
`npm run deploy -- --also highscores-lib.php`.
Only a fixed list is accepted (PHP API/admin scripts, manifest, icons, songs).
Configuration, `highscores-data/`, secrets and tests can never be uploaded.
Raw sources under `asset-sources/` are also excluded. The fixed deployment list
and order live in `scripts/lib/hosted-assets.cjs`. Existing media on
the server are not deleted during path migrations, so older cached pages
can still request their original URLs. No server files are moved by the build.
Upload `highscores-lib.php` when the score rules changed (see
[LEVEL-BONUS.md](LEVEL-BONUS.md) and [GLOW-BERRY.md](GLOW-BERRY.md)).

## Verify

Install the local test tools with `npm ci` and install the Playwright browsers
as described in [TESTING.md](TESTING.md). `DINO_PLAYWRIGHT` is an optional override.
Run with Chromium, then with `DINO_BROWSER=webkit`:

```powershell
npm run test:release
```

`tests/release.mjs` checks hashes/reproducibility and compares both DOM UI and
gameplay against the readable source: start/attract demo/power-ups, settings, help, feather gameplay,
shield pickup/protection/duck/pop,
automatic name entry, the brief Game over overlay and return to attract in four
desktop/mobile layouts. The lifecycle
suite audits named client/PHP constants in the readable source and exercises the
selected delivery artifact in the browser, including standalone file/offline and
hosted service-worker fallback. Live highscore submission is disabled.
The fixture normalizes pointer position before screenshots to compare native
controls in the same hover state. Pixel comparisons remain exact. Optional
`DINO_RELEASE_LAYOUTS` selects comma-separated layout names for diagnostics;
leave it unset for the complete comparison.

Run `node tests/skill-client.mjs release/dino.html` for the installed web-game
skill action client. Set `DINO_TEST_OUTPUT=output/release` for reports/screenshots.

For an authorized Android phone with Chrome open, start a temporary safe server
using `node tests/android-preview.cjs release/dino.html`, establish the ADB
bridges documented in `FEATHER.md`, and run
`node tests/android-feather.mjs release/dino.html`. The fixture adds test/API
configuration before the unchanged compact scripts. SHA-256 checks verify which
artifact is loaded and cached. The runner restores rotation and closes its tab;
stop the temporary server and remove the test USB bridges afterward.

## Additional checks for score changes

The current score includes distance, level bonuses and glow berries. Include
`node tests/glow-berry.mjs release/dino.html`,
`node tests/level-bonus.mjs release/dino.html` and `php tests/bonus-score.php`
when these rules change. The matching server validator must be published before
or with HTML/worker; an HTML-only update does not update server validation.

Results for the latest local implementation: [progress.md](progress.md).
