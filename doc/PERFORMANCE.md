# Rendering, Caches und Performance-Prüfung

Stand: lokaler Build `2026-10-25.1`. Aktuelle Implementierung in
[dino.html](../dino.html); alte Messreihen sind unten verlinkt.

## Aktueller Renderpfad

Ein GPU-fähiger Canvas-2D-Kontext mit `willReadFrequently: false` wird für
Attract und Spiel verwendet. Das erlaubt dem Browser seine Beschleunigungswahl,
ist aber kein Nachweis tatsächlicher GPU-Residency. Touch-Querformat nutzt das
DPR2-Budget. CSS-Abmessungen und logische Spielwelten bleiben davon getrennt.
Der Zwischenstand mit getrenntem CPU-Spiel- und GPU-Vorschau-Backing ist ersetzt.

`Renderer.drawPixelText()` zeichnet das Pixel-HUD direkt mit `fillText`;
ruhige Zeilen brauchen einen Aufruf plus gegebenenfalls den 1-px-Nachtschatten.
Hüpfende Meilensteinziffern werden einzeln platziert. Die früheren HUD-Glyph-/Run-
Caches existieren nicht mehr. Arcade-Callouts, Recovery-Geist und Beeren behalten
gezielte Sprite-Caches; Dino-/Vogelkonturen verwenden wiederverwendete `Path2D`.
Demo und Hintergrund wärmen keine unbenutzten Gameplay-Callouts vor.

`Effects` verwendet einen Partikelpool mit höchstens 100 aktiven plus freien
Einträgen. Wiederverwendung setzt alle Felder einschließlich der vorherigen
Interpolationskoordinaten zurück. Gamepad-Abfragen verwenden zwei wechselnde
Zustandsobjekte. DOM-HUD-Inhalte werden bei Wertänderungen formatiert.
Simulationsreihenfolge, Zufallsverbrauch und Effektgrenzen müssen erhalten bleiben.

## Browservergleiche

Befehle aus der Repository-Wurzel; Playwright-/WebKit-Aufbau siehe
[FEATHER.md](FEATHER.md). `baseline.html` muss eine selbst gesicherte passende
Vorher-Version sein. Vergleiche gegen einen alten Build sind nur sinnvoll,
wenn die untersuchten Spielregeln und Test-Fixtures zueinander passen.

```powershell
node tests/sprite-geometry.mjs baseline.html
node tests/gc-pooling.mjs baseline.html
node tests/gc-performance.mjs baseline.html
node tests/arcade-type.mjs
node tests/effects-setting.mjs
```

Die ersten beiden Vergleiche akzeptieren `DINO_BROWSER=webkit`.
`gc-performance.mjs` misst isoliert in Chromium; optional
`DINO_CPU_RATE=4`. Performance-Läufe sequenziell und ohne andere Browsersuiten
ausführen. Allokationszahlen, Zeichenaufrufzeiten und physische FPS getrennt bewerten.

## Physisches Android

Entsperrtes, autorisiertes USB-Gerät mit Chrome und ADB erforderlich.
Diese Runner verwenden eigene Origins/Brücken, sperren Live-Scores und stellen
die veränderten Geräte-/Origin-Einstellungen wieder her. Emulation ersetzt
keine Gerätemessung. `DINO_TEST_OUTPUT` wählt ein separates Ergebnisverzeichnis.

```powershell
$env:DINO_ANDROID_SERIAL = '<adb serial>'
$env:DINO_CURRENT_HTML = 'release/dino.html'
$env:DINO_PERF_VARIANTS = 'current'
node tests/android-attract-performance.mjs

$env:DINO_SUSTAINED_MIN = '12'
$env:DINO_SUSTAINED_VARIANTS = 'current'
node tests/android-sustained-performance.mjs
```

Attract: Origin 8894/Relay 9238, alle drei Panels; optional
`DINO_PERF_PANELS=1` für Demo und `DINO_PERF_SAMPLE_MS` für die Messdauer.
Historische Source-Rewrite-Varianten benötigen die dazu passende lesbare Baseline;
für heutige Auslieferungen explizit `current` verwenden.

Sustained: Origin 8898/Relay 9239, Standard 12 Minuten, Querformat,
30-Sekunden-Fenster, einfacher Pilot und aufgefüllte Leben.
`DINO_SUSTAINED_LAYOUT`, `DINO_SUSTAINED_WINDOW_S`,
`DINO_SUSTAINED_MIN_FPS`, `DINO_SUSTAINED_TAP_MS` und
`DINO_SUSTAINED_ROTATE_S` steuern Messung und Eingabe. Diagnosevarianten und
Schalter stehen im Runner; alte `gpu`/`gpuSingle`-Vergleiche sind kein Ersatz
für eine Messung des unveränderten aktuellen Artefakts.

`node tests/android-gc-performance.mjs baseline.html`: Origin 8893/Relay 9237,
normaler rAF, Szenen-/GC-Vergleich mit eigener Vorher-Datei. Keine gleichzeitigen
Performance-Suiten. Kurze Szenenmessungen belegen keine dauerhafte thermische Stabilität.

## Historische Nachweise

- [Sprite-Geometrie und verworfener Rasterversuch](archive/SPRITE-CACHING.md).
- [Partikel-/Controller-Pooling und damalige GC-Messungen](archive/GC-REVIEW.md).
- [S10e/A53-Vergleich, Zwischenstände und abschließender direkter HUD-Text](archive/ATTRACT-PERFORMANCE.md).
- [Letzter Implementierungsstand](progress.md); frühere Ergebnisse im
  [Gesamtprotokoll](archive/progress-through-2026-10-24.md).

Die historischen 60-FPS-Messungen gelten für deren Artefakte und Bedingungen.
Bei neuem Code, Browser oder Gerät muss neu gemessen werden.
