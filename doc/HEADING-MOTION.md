# Lebendige Überschriften

Aktuelle Zuständigkeit: `HeadingMotion` in [dino.html](../dino.html).
Die Klasse bereitet zugängliche Überschriften und dekorative Glyph-Spans vor,
verwaltet Text-/Offset-Caches und startet Bewegung nach Screen-Übergängen.
`Runner` besitzt die Instanz; `HighscoreView` und `GamePage` nutzen sie.

Text und Offset gehören gemeinsam zum WeakMap-Cache-Schlüssel. Ein neuer Offset
aktualisiert vorhandene Glyph-Knoten; identische Updates verändern den DOM nicht.
Tokens verwerfen verspätete Übergangs-Callbacks, damit geschlossene Dialoge oder
ersetzte Hilfeseiten keine Animation nachträglich starten.

## Darstellung und Lebenszyklus

Atmen und Welle laufen über CSS, ohne eigene JavaScript-Frame-Schleife.
Die zentralen `--heading-*`-Variablen steuern Dauer, Hub, Neigung und Versatz.
Der aktuelle Wellenzyklus dauert 3,2 Sekunden mit 3,5 px Hub, 2 Grad Neigung und
200 ms Phasenversatz je Glyph; der gesamte Titel kann zusätzlich atmen.
Das M24-Logo schwebt mit einem eigenen 4,8-Sekunden-Zyklus und 2 px Hub.
Seit Build `2026-10-25.3` ersetzt bei laufendem Theme-Song ein basssynchrones
Pulsieren das Schweben. Vorgebackene Songdaten, Medienuhr, Ressourcen und
Lebenszyklus sind in [VOLUME.md](VOLUME.md#music-reactive-m24-logo) beschrieben.
Arcade-Eintrittseffekte sind in [ARCADE.md](ARCADE.md) beschrieben.

Die h1/h2 behalten vollständige zugängliche Namen, Einzelbuchstaben sind
dekorativ; Leerzeichen bleiben Text. Help erhält dieselbe Aufbereitung in
seinem eingebetteten Dokument. Verborgene Ansichten, Hintergrund-/Vorschau-Pause,
Reduced Motion und der Testschalter `transitions: false` werden berücksichtigt.
Technisches Neuöffnen eines Dialogs darf keinen neuen Eintritt auslösen.
Der frühere Vorschau-Pausenbutton ist entfernt; Settings, Help und
Browser-Lebenszyklus pausieren weiterhin die Vorschau.

## Wiederholbare Prüfung

```powershell
node tests/heading-motion.mjs
node tests/heading-motion.mjs release/dino.html
node tests/screen-transitions.mjs release/dino.html
```

Auch mit `DINO_BROWSER=webkit`; Setup siehe [FEATHER.md](FEATHER.md).
Die Tests prüfen die echte Instanz über den vorhandenen Runner-Hook:
Offset-Änderungen, Knotenwiederverwendung, Unicode/Leerzeichen, zugängliche Namen,
verspätete/fehlgeschlagene Übergänge, Schließen und CSS-Fallback.

[Frühere Gestaltungsiterationen und Messungen](archive/HEADING-MOTION-through-2026-10-24.md)
und [abgeschlossene Codeprüfung](archive/CODE-REVIEW.md) sind historische Nachweise.
