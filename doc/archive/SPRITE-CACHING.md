# Rendering cache review

> Historisches Dokument, archiviert am 2026-10-25. Beschreibt den jeweils
> genannten Build, keine aktuelle Betriebsanleitung. Projektpfade und Befehle
> beziehen sich weiterhin auf das Repository-Stammverzeichnis.
> Aktueller Einstieg: [Dokumentationsindex](../README.md).


## Bewertung des ursprünglichen Prompts

Der Ansatz ist grundsätzlich sinnvoll, ein vollständiger Wechsel zu Raster-Sprites
ist für diesen Spielstand jedoch weder notwendig noch mit allen Vorgaben vereinbar.

- Kakteen, Wolken und Berge besitzen bereits gespeicherte `Path2D`-Geometrie.
  Arcade-Schrift, HUD und Todesgeist werden bereits als Rasterbilder gespeichert.
  Die dokumentierte Nacht-Optimierung in Build `2026-10-21.24` erreichte auf dem
  damaligen Testtelefon bereits ungefähr 60 FPS. Ein neuer CPU-Engpass oder
  GC-bedingte Aussetzer sind durch den vorgeschlagenen Prompt nicht nachgewiesen.
- Schwanz, Arme, Augenrollen, Atembewegung und Feuer sind stufenlose Animationen.
  Ein Schlüssel nur aus Pose, Frame und Blinzeln würde unterschiedliche Bilder
  zusammenlegen. Zeitwerte als Schlüssel würden dagegen unbegrenzt wachsen.
- `drawImage` ist keine Garantie für einen schnelleren Gesamtframe. Rasterisierung,
  Transfers, Kontextwahl und Auflösung sind zu messen. `OffscreenCanvas` allein
  verlagert keine Arbeit in einen Worker. Ein Atlas ist für wenige kleine Varianten
  keine zwingende Verbesserung und fügt Auflösungs- und Ausschnittverwaltung hinzu.
- Ganzzahlige logische Zielkoordinaten würden die bestehende interpolierte Bewegung
  verändern. Bei skaliertem Canvas entsprechen sie zudem nicht automatisch ganzen
  Gerätepixeln. Unveränderte Bewegung hat Vorrang vor pauschalem Pixel-Snapping.
- Eine feste Zahl von Schlüsseln begrenzt nicht allein den Speicher: Rastergröße,
  DPR, Größenwechsel und mehrere Renderer müssen ebenfalls berücksichtigt werden.
  Lazy-Rasterisierung kann beim ersten Auftreten eines Frames selbst stocken.
- 60–120 FPS lassen sich aus einer API-Änderung nicht zusichern. Bildwiederholrate,
  Gesamtrendering und Zielgerät bestimmen die erreichbare Rate.

[Mozilla beschreibt Offscreen-Vorzeichnung als mögliche Canvas-Optimierung](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas),
[die OffscreenCanvas-Dokumentation erklärt die zusätzliche Worker-Übergabe](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas).
Die konkrete Entscheidung hier beruht auf dem vorhandenen Code und den Vergleichen.

## Überarbeiteter, umgesetzter Task-Prompt

> Untersuche vorhandene Render-Caches und wiederkehrenden Pfadaufbau in `dino.html`.
> Erhalte Spiellogik, Hitboxen, interpolierte Positionen, stufenlose Animationen,
> Offline-Spiel und die bestehenden visuellen Vergleichstoleranzen.
>
> Prüfe Raster-Caching zunächst an einer kleinen statischen Objektgruppe. Übernimm
> es nur, wenn Bildvergleich und Messung dafür sprechen; andernfalls verwende
> begrenzte gespeicherte Vektorpfade für unveränderliche Geometrie. Erweitere
> bestehende Caches gezielt, ohne eine zweite universelle Registry oder einen Atlas
> vorauszusetzen. Rasterpfade müssten Geräteauflösung, Speicherbudget, Kontextfehler
> und einen funktionierenden Vektor-Fallback berücksichtigen.
>
> Cache keine Zeitstempel, Positionen oder kontinuierlichen Animationsparameter.
> Belasse dynamische Silhouetten und Effekte beim unmittelbaren Zeichnen. Prüfe
> feste Cache-Grenzen und Wiederverwendung bei wechselnden Positionen und Skalen.
> Belege weniger Pfadaufbau-Aufrufe; unterscheide CPU-Aufrufkosten von tatsächlichen
> FPS und GPU-Arbeit. Teste beide Flügelstellungen und Dino-Posen, Darstellung,
> deterministische Spielverläufe, Steuerung und Offline-Lifecycle. Dokumentiere
> Messgrenzen und erstelle eine geprüfte Release-Datei ohne Veröffentlichung.

## Umsetzung und Nachweise

- Der verworfene Kaktus-Rasterversuch verringerte im lokalen isolierten Mikrotest
  die Aufrufzeit von 0,0308 auf 0,01695 ms/Kaktus, veränderte aber 5.776 Pixel bei
  zwölf Kakteen, maximal um 85 Kanalwerte. Damit ist die Bildtreue nicht erfüllt.
  Versuch und Bericht liegen ausschließlich unter `output/sprite-review/`.
- Übernommen wurden sechs Flugsaurierpfade (Körper, zwei Flügel, Schnabel, Auge,
  Pupille) und fünf Dino-Detailpfade (Bauch, Kiefer, drei Rückenschuppen).
  Pro Renderer existieren genau elf zusätzliche Pfade, ohne DPR-Varianten oder
  dynamische Schlüssel. Die Varianten werden beim ersten Gebrauch erstellt.
- Der Flugsaurier benötigt anschließend 0 statt 24 Pfadaufbau-Aufrufe pro Zeichnung;
  der Dino-Körper 15 statt 44. Die dynamische Schwanzkontur bleibt unverändert.
  Das Schuppen-Koordinatenarray wird nur einmal angelegt. Kein neuer Offscreen-
  Canvas wird benötigt; damit entsteht auch kein neuer Canvas-Kompatibilitätspfad.
- `tests/sprite-geometry.mjs <baseline.html>` prüft beide Flügelstellungen,
  acht Dino-Posen in drei Transformations-/Animationszuständen, Transparenz und
  Mund-Clipping sowie 2.000 Positions-/Skalenwechsel ohne neue `Path2D`-Objekte.
  Chromium: 15 abweichende Pixel von 864.000, WebKit: 16; jeweils maximal drei
  Kanalwerte. Das liegt unter der unveränderten bestehenden Kantentoleranz
  (maximal acht Kanalwerte, weniger als 0,02 % geänderte Pixel).
- Der vorhandene Chromium-Rendervergleich besteht mit 70 Szenen in fünf Layouts,
  maximal drei Kanalwerten Differenz und fünf unveränderten 12.000-Schritt-
  Spiel-/Effektverläufen je Version. Seine Messreihe ist kein FPS-Test: vier
  Layouts zeigten geringere Aufrufkosten, Desktop zunächst höhere. Deshalb wird
  daraus kein allgemeiner Geschwindigkeitsgewinn abgeleitet.
- Eine anschließende Desktop-Gegenprobe ohne parallele Tests wechselte die beiden
  Versionen in acht Messblöcken ab. Der Mittelwert sank von 3,817 auf 3,652 ms
  pro vollständigem Render-Aufruf (rund 4,3 %). Die Einzelwerte überlappen;
  die Messung erfasst Aufrufkosten, weder GPU-Abschluss noch Telefon-FPS.
- Zusätzlich bestehen Chromium-Architektur (12 Szenarien), Feder/Steuerung
  (drei Layouts), der installierte Skill-Spielclient sowie Lifecycle/Offline
  für Quell- und Release-Datei (je sieben Szenarien). Screenshots des tatsächlichen
  Spielclients und der animierten Vergleichsposen wurden visuell geprüft.
- Die Release-Datei wurde reproduzierbar erzeugt; alle 64 Vergleiche zwischen
  Quelle und Release sind pixelidentisch. Build `2026-10-24.1`, Worker-Cache v51.

Reproduzierbare gezielte Prüfung mit einer vorher gespeicherten HTML-Version:

```powershell
$env:DINO_PLAYWRIGHT = 'D:/projects/pacman/node_modules/playwright/index.mjs'
node tests/sprite-geometry.mjs output/sprite-review/baseline.html
$env:DINO_BROWSER = 'webkit'
$env:PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1'
node tests/sprite-geometry.mjs output/sprite-review/baseline.html
```

Telefon-Layouts wurden emuliert. Für diese Änderung liegt keine neue Messung auf
einem physischen Telefon und kein Nachweis stabiler 120 FPS vor.
