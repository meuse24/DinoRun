# Tests ausführen

Node.js ab Version 22 verwenden. Alle Befehle gelten ab Repository-Wurzel.
Playwright ist als feste Entwicklungsabhängigkeit im Projekt hinterlegt:

```powershell
npm ci
npx playwright install chromium webkit
npm test
```

Der Browser-Installationsschritt wird beim ersten Setup beziehungsweise nach
einem Playwright-Update benötigt. Das ausgelieferte Spiel benötigt weder npm
noch Playwright.

## Testgruppen

| Befehl | Inhalt |
| --- | --- |
| `npm test` oder `npm run test:core` | Asset-/Deploymentplan, Architektur und Lifecycle-/Offline-Vertrag |
| `npm run test:features` | Feature-, Eingabe-, UI-, Audio- und Update-Suiten |
| `npm run test:release` | Reproduzierbarer Source-/Release-Vergleich und zentrale Regressionen gegen `release/dino.html` |
| `npm run test:comparison` | Nur der bisherige Source-/Release-Vergleich |

Die Gruppen laufen sequenziell und stoppen beim ersten Fehler. Optional einen
HTML-Pfad übergeben, zum Beispiel `npm run test:features -- release/dino.html`.
Die Architekturprüfung liest immer die lesbare Quelle; der Release-Vergleich
vergleicht immer Quelle und generierte Auslieferung. `test:release` benötigt
einen aktuellen Build (`npm run build`) und prüft dessen Reproduzierbarkeit.

Einzelne Skripte bleiben direkt aufrufbar, etwa `node tests/lives.mjs`.
PHP-/Moderationsprüfungen, Baseline-Vergleiche, Skill-Client, Performance- und
physische Android-Prüfungen werden separat ausgeführt; Befehle stehen in
[AGENTS.md](../AGENTS.md) und den jeweiligen Fachanleitungen.

## Konfiguration

Standardmäßig wird die lokale Playwright-Installation geladen. Falls bewusst
eine andere Installation verwendet werden soll, `DINO_PLAYWRIGHT` auf deren
ESM-Einstieg setzen. Relative Pfade gelten ab dem aufrufenden Arbeitsverzeichnis.
Die Auflösung ist für Browsersuiten, Skill-Client und CDP-Relay identisch.
Es gibt keinen eingebauten Pfad zu einem anderen Projekt.

`DINO_BROWSER=webkit` wählt für kompatible Suiten WebKit; Standard ist Chromium.
Die MP3-/Theme-song-Suite prüft ausdrücklich Chromium. Auf dem bisherigen
Windows-Rechner braucht der defekte WebKit-Hostprüfer zusätzlich
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`; der echte WebKit-Browser läuft
dennoch. Details zu Offline- und USB-Besonderheiten: [FEATHER.md](FEATHER.md).

`DINO_TEST_OUTPUT` wählt das Ausgabeverzeichnis; Testgruppen legen darin einen
Unterordner pro Skript an, damit Berichte sich nicht überschreiben.
`output/` ist vollständig von
Git ausgeschlossen; Bilder und JSON-Berichte bleiben lokal. Alte bisher
versionierte Ausgaben wurden aus der Git-Verfolgung entfernt, lokal erhalten.
Die bestehenden Baseline-Vergleiche erzeugen ihre Vorher-/Nachher-Bilder selbst;
sie benötigen keine eingecheckten Ausgabedateien.

## Gemeinsame Testhilfen

- `tests/helpers/playwright.mjs`: lokale Auflösung oder expliziter Override.
- `tests/helpers/browser.mjs`: isolierte HTML-Kopie mit begrenztem Cleanup und
  gemeinsame Erfassung von Browserfehlern.
- `scripts/test.mjs`: sequenzielle Testgruppen und Weitergabe des HTML-Pfads.

Spielspezifische Fixtures, Viewports, Zufallsquellen, Netzwerk-/Service-Worker-
Szenarien und Geräte-Rotation bleiben in ihren Suiten. Insbesondere dürfen
Offline-Installationstests und physische Gerätetests nicht unbemerkt in dieselbe
Standard-Fixture gezwungen werden. Live-Highscores bleiben in Tests isoliert.
