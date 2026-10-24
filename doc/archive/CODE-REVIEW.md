# Codeprüfung und Bereinigung – Build 2026-10-18.11

> Historisches Dokument, archiviert am 2026-10-25. Beschreibt den jeweils
> genannten Build, keine aktuelle Betriebsanleitung. Projektpfade und Befehle
> beziehen sich weiterhin auf das Repository-Stammverzeichnis.
> Aktueller Einstieg: [Dokumentationsindex](../README.md).


Geprüft: lesbares Frontend `dino.html`, besonders Überschriften,
Screen-Übergänge, Zuständigkeiten und die Architekturtests. Das ist kein
vollständiger PHP-/Sicherheitsaudit. Die Ausgangsprüfung betraf Build .10;
die unten beschriebene Bereinigung ist in Build .11 umgesetzt.

## Befunde der Ausgangsprüfung (.10)

1. **Kleine Cache-Schwäche, niedrige Priorität:** `setHeadingText()` nimmt
   `offset` entgegen, überspringt bei gleichem Text aber jede Aktualisierung
   (`dino.html:7523`). Reproduziert mit der echten Funktion: erst DINO/0,
   danach DINO/5; die erste Glyphe behält `--wave-i: 0`. Die heutigen festen
   Titel lösen diesen Fall nicht aus. Bei künftig umgeordneten Titelteilen
   würde die Wellenphase jedoch nicht angepasst. Text und Offset gemeinsam
   als Cache-Schlüssel verwenden oder die Phase unabhängig aktualisieren.
2. **Animationszustand verteilt, mittlere Wartungspriorität:** Textaufbereitung
   und Initialisierung liegen bei `setHeadingText`, Start nach View Transition
   zusätzlich in `HighscoreView.apply()` und `GamePage.syncGuideHeading()`,
   die Sichtbarkeitspause in `Runner.updatePause()`. Die Zustandswächter sind
   sinnvoll, verlangen bei Erweiterungen aber Änderungen an mehreren Stellen.
   Diese kleine Präsentationsaufgabe innerhalb derselben HTML-Datei bündeln.
3. **Werte mehrfach hinterlegt, niedrige Priorität:** Dauer, Wellenhöhe,
   Neigung und Phasenversatz stehen direkt in Keyframes/Animationsregeln;
   die Dauer und Phasenregel werden für technisch neu geöffnete Dialoge
   wiederholt (`dino.html:2027`, `dino.html:2073`). CSS-Variablen erleichtern
   die häufigen Feinanpassungen und verhindern auseinanderlaufende Varianten.
4. **Fragile Testgrenzen, niedrige Priorität:** `tests/architecture.mjs:13`
   liest Controller über Quelltext-/Kommentargrenzen aus. Das erlaubt die
   DOM-freie Prüfung der echten Implementierung, kann bei rein redaktionellen
   Änderungen jedoch brechen. Bei größerer Umordnung die Extraktion robuster
   gestalten; dafür die Produktionsarchitektur nicht unnötig erweitern.

## Bewertung

Kein großer Umbau erforderlich. `Game` und `HighscoreController` sind
DOM-unabhängig; Darstellung und Browserkoordination liegen in eigenen Klassen.
Die große Einzeldatei erfüllt die bewusste Standalone-Vorgabe. Die Größe des
Renderers allein begründet keinen Umbau: Er enthält viel Vektorzeichenlogik.
Ein kleines Refactoring der Animationsschicht ist vor weiteren Effekten sinnvoll.

In der Ausgangsprüfung bestanden: elf Architektur- und sieben Lifecycle-/Offline-Szenarien.
Die Cache-Schwäche wurde isoliert reproduziert und als Review-Befund belassen.
Maschinenbericht: `output/heading-phone-review/quality-findings.json`.

## Physisches Handy

Release-Build .10 per SHA-256 geprüft, Galaxy S10e SM-G970F mit Chrome
155.0.8059.81. Hochformat 360×617 und Querformat 673×280 CSS-px bestanden:
Welle über einen ganzen Zyklus, Vorschau-Pause/Fortsetzen, Settings, Help,
START, Game over, Namensdialog/Abbrechen, Goodbye/New session und Reduced Motion.
Touch-Eingaben über CDP, normaler rAF, keine Live-Highscore-Anfragen.

Die kurzen Stichproben mit aktiver Animation lagen in beiden Orientierungen
bei Median 16,7 ms, p95 16,8 ms und keinem Frame über 33 ms. Die Querformat-
Baseline ohne Animation hatte vier Frames über 33 ms (p95 33,4 ms); deshalb
keine allgemeine Leistungsgarantie aus diesen kurzen Stichproben ableiten.
Screenshots angesehen, keine Browserfehler. Rotation und Test-Origin-Speicher
wiederhergestellt; nur eigener Tab und eigene USB-/Vorschau-Helfer geschlossen.
Bericht und Bilder: `output/heading-phone-review/phone-review/`.

## Kleine Bereinigung (.11)

Befunde 1–3 erledigt. `HeadingMotion` bündelt Text-/Glyph-Aufbereitung,
Wellenphasen-Cache, Start nach View Transitions und Pausenregeln innerhalb
von `dino.html`. `Runner` besitzt die Instanz; HighscoreView und GamePage
rufen sie für ihre Darstellung auf. Ein Token je Ziel verwirft veraltete
Übergangs-Callbacks; geschlossene Dialoge und verborgene/ersetzte Help-Seiten
werden durch späte Fertigmeldungen nicht aktiviert.

Text und Offset werden in einer WeakMap gespeichert. Reine Offset-Änderungen
aktualisieren vorhandene Glyph-Knoten; identische Updates verändern den DOM
nicht. CSS-Variablen bündeln Tempo, Wellenhöhe, Neigung, Phasenversatz und
Eintrittszeiten. Alle bisherigen Zahlenwerte bleiben erhalten. CSS übernimmt
weiterhin die laufende Bewegung; es gibt keinen zusätzlichen Frame-Loop.

Die neue Prüfung `node tests/heading-motion.mjs [game.html]` verwendet die
wirkliche, über den vorhandenen Runner-Hook erreichbare Instanz. Sie prüft
Offset-Änderungen, Knoten-Wiederverwendung, Leerzeichen/Unicode, zugängliche
Namen, überholte/fehlgeschlagene Übergänge, Schließen und CSS-Fallback.
Quelle und Release bestehen in Chromium und WebKit. Die fragile Extraktion
der älteren Controller-Architekturtests (Befund 4) wurde später mit Build
2026-10-21.13 durch Auswahl benannter AST-Deklarationen ersetzt; siehe
[ARCHITECTURE.md](../ARCHITECTURE.md).


Validierung .11: 86 Übergangsprüfungen und Skill-Client (Release) bestanden;
52 Source/Release-UI-/Spielszenen in Chromium pixel-identisch. Vier gezielte
Wellen-Flows und die neuen Cache-/Callback-Regressionen bestehen jeweils
gegen Quelle/Release in Chromium und WebKit. Zwölf Vorher/Nachher-Aufnahmen
(Titel, Settings, Help; Desktop/Hochformat; beide Engines) haben identische
Transformationen, Geometrie, Dauer, Phasen und zugängliche Namen. Zehn sind
pixel-identisch; zwei unterscheiden sich an 6 bzw. 4 Schriftkanten-Pixeln
(maximaler Kanalunterschied 7 bzw. 12). Screenshots und Spielzustand angesehen,
keine Browserfehler. Berichte: output/heading-refactor/ und final/ darunter.

Physischer Nachtest für .11 derzeit nicht erfolgt: Galaxy S10e angeschlossen,
aber gesperrt; Entsperren angefragt. Die Geräteprüfung von .10 oben gilt nur
für diesen Vorgänger. Desktop-/Touch-Layouts sind Browserprüfungen.
