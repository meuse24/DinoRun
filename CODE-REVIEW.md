# Codeprüfung – Build 2026-10-18.10

Geprüft: lesbares Frontend `dino.html`, besonders Überschriften,
Screen-Übergänge, Zuständigkeiten und die Architekturtests. Das ist kein
vollständiger PHP-/Sicherheitsaudit. Spielcode wurde bei der Prüfung nicht geändert.

## Befunde

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

Aktuell bestanden: elf Architektur- und sieben Lifecycle-/Offline-Szenarien.
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
