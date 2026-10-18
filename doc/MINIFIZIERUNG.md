# Erprobter Ablauf zur Minifizierung von Dino Run

Die bearbeitbare Quelle ist [`../dino.html`](../dino.html). Das Build-Skript
[`../scripts/build-release.mjs`](../scripts/build-release.mjs) erzeugt daraus
[`release/dino.html`](../release/dino.html) im Release-Verzeichnis. Die Quelle bleibt unverändert;
JavaScript, CSS und Hilfe bleiben in der ausgelieferten HTML-Datei eingebettet.

## 1. Voraussetzungen und Installation

Node.js ab Version 22 mit npm verwenden. Alle folgenden Befehle werden im
**Projektverzeichnis**, nicht im Release-Verzeichnis, ausgeführt:

```powershell
Set-Location 'D:\projects\dino'
npm ci
```

`npm ci` installiert die durch `package-lock.json` fixierten lokalen
Entwicklungsabhängigkeiten. Für den erprobten Build sind das:

| Werkzeug | Version | Aufgabe |
| --- | --- | --- |
| Terser | 5.51.2 | JavaScript komprimieren |
| CSSO | 5.0.5 | CSS minifizieren |
| HTMLMinifier-Terser | 7.2.0 | HTML-Markup minifizieren |

Für spätere Builds genügt `npm run build`, solange die Abhängigkeiten bereits
installiert sind. Das ausgelieferte Spiel benötigt weder Node.js noch npm.

## 2. Auslieferungsdatei erzeugen

```powershell
npm run build
```

Das Skript verarbeitet die Quelle in dieser Reihenfolge:

1. **Terser:** Alle drei Inline-Skripte komprimieren, mit `ecma: 2022`,
   `compress: { passes: 2 }` und `mangle: true`. Eigenschaftsnamen werden nicht
   umbenannt, damit API-Felder und öffentliche Test-Hooks erhalten bleiben.
   `inline_script: true` schützt die Einbettung in HTML; die Copyright- und
   Lizenzhinweise einschließlich der Chromium-Attribution bleiben erhalten.
2. **CSSO:** Alle drei eingebetteten Stylesheets minifizieren, einschließlich
   des Stylesheets im Hilfe-Template. Einstellungen:
   `comments: false, restructure: false`.
3. **HTMLMinifier-Terser:** Kommentare, unnötige Attributschreibweisen und
   überschüssigen Leerraum entfernen. SVG-Schreibweise, explizite schließende
   Tags und Abstände zwischen Inline-Texten erhalten. JavaScript und CSS werden
   hier mit `minifyJS: false` und `minifyCSS: false` nicht nochmals optimiert.

**Zwei Einstellungen sind für das unveränderte Aussehen erforderlich:**

- CSSO-Regelumstrukturierung deaktiviert lassen. Mit der Standardeinstellung
  wurde der `var(--bg)`-Fallback hinter `color-mix()` verschoben; dadurch ging
  die Transparenz der Symbolbuttons verloren.
- Im Abschnitt `#round-panel` den Leerraum erhalten. Seine Attribute werden
  separat minifiziert, mit `collapseWhitespace: false`; anschließend schützt
  `ignoreCustomFragments` diesen Abschnitt beim gesamten HTML-Durchlauf. Ohne
  diese Ausnahme unterschieden sich in WebKit 194 Kantenpixel des Menüs.

Seit dem rotierenden Startbildschirm enthält das Menü weitere `section`-Tags.
Das Build-Skript erfasst deshalb den gesamten Menüabschnitt über ausgeglichene
Tags und schützt ihn mit temporären Markierungen. Ein Ausdruck bis zum ersten
`</section>` würde nur einen Teil schützen und die HTML-Struktur beschädigen.

Die vollständigen, tatsächlich verwendeten Optionen stehen im Build-Skript.
Keine pauschalen Minifier-Standardeinstellungen darüberlaufen lassen.

## 3. Ergebnis und Größenbericht prüfen

Der Build schreibt ausschließlich diese beiden Dateien neu und lässt diese
Anleitung erhalten:

- `release/dino.html`: kompakte Auslieferungsdatei.
- `release/size-report.json`: Größe nach jeder Stufe, Werkzeugversionen,
  SHA-256-Prüfsummen sowie gzip-/Brotli-Vergleichswerte.

```powershell
Get-Content release/size-report.json
Get-FileHash release/dino.html -Algorithm SHA256
```

Ergebnis für Spiel-Build `2026-10-17.2` mit breitem, kompaktem Startbildschirm, jeweils UTF-8-Bytes:

| Stufe | Bytes |
| --- | ---: |
| Lesbare Quelle | 363.019 |
| Nach Terser | 220.989 |
| Nach CSSO | 197.318 |
| Fertige HTML-Datei | 190.739 |

**Ersparnis: 172.280 Bytes bzw. 47,46 %.** Der optionale Song ist dabei nicht
mitgerechnet. Die gemessenen Größen mit zusätzlichem gzip/Brotli betragen
63.185/55.844 Bytes; entsprechende Serverkompression wird vom Build nicht
eingerichtet. Nach Quelländerungen gelten die neu erzeugten Berichtswerte.

## 4. Kompakte Datei testen

Die Browserprüfungen benötigen zusätzlich Playwright und dessen Browser.
Auf diesem Rechner ist eine Installation unter folgendem Pfad vorhanden;
bei einer anderen Installation den Pfad anpassen:

```powershell
$env:DINO_PLAYWRIGHT = 'D:/projects/pacman/node_modules/playwright/index.mjs'
$env:DINO_TEST_OUTPUT = 'D:/projects/dino/output/release'
$env:DINO_BROWSER = 'chromium'
node tests/release.mjs
node tests/game-contract.mjs release/dino.html
node tests/jump-feather.mjs release/dino.html
node tests/shield-bubble.mjs release/dino.html
node tests/attract-screen.mjs release/dino.html
```

Dieselben Prüfungen mit WebKit ausführen:

```powershell
$env:DINO_BROWSER = 'webkit'
# Nur für den bekannten defekten Host-Prüfer dieser Windows-Installation:
$env:PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1'
node tests/release.mjs
node tests/game-contract.mjs release/dino.html
node tests/jump-feather.mjs release/dino.html
node tests/shield-bubble.mjs release/dino.html
node tests/attract-screen.mjs release/dino.html
```

Der WebKit-Browser wird dabei tatsächlich gestartet. Zusätzlich kann der
installierte Web-Game-Skill-Client die Auslieferungsdatei prüfen:

```powershell
node tests/skill-client.mjs release/dino.html
```

Die Tests deaktivieren echte Online-Highscore-Einreichungen. Geprüft werden
unter anderem reproduzierbare Builds, Bild- und Zustandsübereinstimmung mit der
Quelle, Desktop-/Smartphone-Layouts, Hilfe, Namensdialog, Feder, Schutzblase, Neustart und
Offline-/`file://`-Betrieb. Berichte und Screenshots liegen unter `output/release`.

## 5. Optional auf dem angeschlossenen Android-Handy prüfen

ADB muss das freigegebene Gerät erkennen. Handy entsperren und Chrome im
Vordergrund geöffnet lassen. In einem ersten Terminal im Projektverzeichnis:

```powershell
node tests/android-preview.cjs release/dino.html
```

In einem zweiten Terminal, ebenfalls im Projektverzeichnis, die oben genannten
Playwright-/Ausgabepfade setzen und anschließend ausführen:

```powershell
adb forward tcp:9223 localabstract:chrome_devtools_remote
adb reverse tcp:8877 tcp:8877
try {
  node tests/android-feather.mjs release/dino.html
} finally {
  adb reverse --remove tcp:8877
  adb forward --remove tcp:9223
}
```

Danach den temporären Server im ersten Terminal mit **Strg+C** beenden. Der
Test prüft die SHA-256-Kennung der geladenen Datei, verwendet echte Touch-Eingaben
und stellt die ursprünglichen Rotationseinstellungen wieder her. Er öffnet und
schließt seinen eigenen Tab. Der Server deaktiviert Online-Highscore-Zugriffe.

Die frühere kompakte Datei (Build `2026-10-15.6`) wurde auf dem Galaxy A53 mit Android 16 und Chrome
155 erfolgreich in beiden Orientierungen sowie nach Offline-Neuladen geprüft.
Chromium und WebKit bestanden zusätzlich zusammen 48 pixelgleiche
Vergleichsszenen. Direktes Android-`file://`-Öffnen war nicht Teil des Handytests.
Der neue Schutzblasen-Build `2026-10-16.1` besteht 80 pixelgleiche
Vergleichsszenen in Chromium/WebKit. Er wurde bisher mit Handyemulation geprüft;
ein physischer Handytest der Schutzblase wurde nicht durchgeführt.
Der neue Startbildschirm (`2026-10-17.1`) besteht Browser-/Handyemulationstests
sowie 96 pixelgleiche Vergleichsszenen. Zusätzlich wurde die lesbare Quelldatei
über den vorhandenen Server auf Port 8765 auf dem Galaxy A53 geprüft: Rotation,
Start aus allen Ansichten, Schutzblase, Feder, Touchsteuerung, Neustart und
Offline-Neuladen bestehen in Hoch- und Querformat. Die kompakte Datei wurde bei
diesem neuen Handytest nicht direkt geladen. Details stehen in [ATTRACT.md](ATTRACT.md).

Build `2026-10-17.2` nutzt im Querformat die gesamte verfügbare Breite und ist
vertikal kompakter: Vorschau links, START rechts. Quelle und kompakte Datei
bestehen zehn Layouts pro Browser, einschließlich mehrfacher Größen- und
Orientierungswechsel. Die Quelle besteht auch den erneuten physischen Galaxy-
A53-Test in beiden Orientierungen, inklusive Start aus allen Ansichten und
Schutzblasenprüfung. Berichte: `../output/attract-wide`.

## 6. Ausliefern

Für die bestehende Website `release/dino.html` als **dino.html am bisherigen
Zielort** einsetzen. Vorhandene PHP-Dateien, Konfiguration und Highscore-Daten
sowie Service Worker, Manifest, Icons und optionalen Song dort beibehalten.
Der Release-Ordner allein enthält keine vollständige PHP-/PWA-Installation.

Für eigenständiges Offline-Spielen genügt die HTML-Datei. Falls gewünscht, den
optionalen Song `dino-jump-jump.mp3` danebenlegen. Die erzeugte HTML-Datei nicht
von Hand bearbeiten; Änderungen an der Quelle vornehmen und neu bauen.
