# Lebendige Überschriften

## Plan

1. Titel: DINO und RUN hüpfen beim Eintritt kurz versetzt auf ihren Platz.
   Das vorhandene M24-SVG schwebt danach um höchstens 2 px in 4,8 Sekunden.
2. Menüs: Hilfe, Settings, Highscores/Namenseingabe und Installation bekommen
   einen kurzen Satz mit sanftem Einrasten. Die wechselnden Attract-Überschriften
   ziehen leicht nach. Game over landet mit einem kleinen Stauchimpuls;
   der Abschied kippt kurz wie ein Winken.
3. Technik: separate Schrift-Spans, CSS-Keyframes auf transform/opacity;
   bestehende Screen-Übergänge und Eingabe bleiben unabhängig. Keine neue
   Animationsbibliothek, Canvas-Schleife oder Filter.
   Seit Build .7 atmen auch sichtbare Überschriften langsam; der
   Vorschau-Pausenschalter stoppt Titel und Logo gemeinsam.
4. Barrierefreiheit: bei prefers-reduced-motion keine neuen Effekte.
   Der bestehende Testschalter transitions=false schaltet sie mit ab.
   Technisches Neuöffnen von Dialogen darf die Überschrift nicht neu starten.
5. Prüfung: kurze Browser-Sichtprüfung bei Desktop und Telefonformaten,
   vorhandene Skill-/Übergangs-/Game-over-Prüfungen, physisches Android in
   beiden Orientierungen, anschließend Release bauen und vergleichen.

Die Bewegung ist bewusst klein (2–10 px) und kurz (ca. 240–360 ms,
zuzüglich des kurzen Eintrittsversatzes).
SVG-Pfadanimationen sind hier nicht nötig: Das kompakte Logo bleibt auch
während seines Eintritts sofort erkennbar. CSS ist nicht kostenlos;
transform/opacity vermeiden aber Layoutarbeit pro Frame. Grundlagen:
[MDN: Animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance),
[MDN: Reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion).

## Umsetzung und Prüfung

Umgesetzt in Build `2026-10-18.6`, PWA-Cache `dino-run-v15` auf
`feat/heading-animations`. Die Namenseingabe nutzt wie bisher den gemeinsamen
Highscores-Header. Seine Schrift sitzt jetzt in einem eigenen Span, sodass
Textaktualisierungen die Animationsfläche erhalten. Die Hilfe lädt denselben
CSS-Block in ihrem eingebetteten Dokument; ihre Sichtbarkeitsklasse startet
den Eintritt bei jedem echten Öffnen neu.

Die endlichen `motion-heading-*`-Animationen im Spieldokument werden von der vorhandenen
ElementMotion-Verwaltung beendet, auch beim Drehen des Geräts. Die
Endlosschleifen `heading-logo-float` und (seit Build .7) `heading-breathe` gehören nicht zu den
Animationen, auf die Screen-Wechsel warten. Die Pausenregel hat Vorrang
vor dem Animations-Shorthand. Ein dabei gefundener CSS-Spezifitätsfehler
wurde korrigiert und der vorhandene Übergangstest um die Logo-Pause ergänzt.

Prüfungen (keine Live-Highscore-Anfragen):

- `node tests/skill-client.mjs`: installierter develop-web-game-Client,
  Start/Sprung/Ducken und Zustandsausgabe, Screenshot angesehen.
- `node tests/screen-transitions.mjs`: 86 Prüfungen in Chromium 151 und
  WebKit 26.5, einschließlich Eingabe während Übergängen, Fokus, Dialoge,
  Reduced Motion und gleicher Simulation. Die Erwartungen für T1/T2
  berücksichtigen jetzt die zusätzlichen Schriftanimationen.
- `DINO_TRANSITIONS=1 node tests/game-over-flow.mjs`: Desktop, 320-px-Telefon
  und kurzes Querformat bestanden, ebenso `--android` auf dem echten Gerät.
- Praktische Sichtprüfung mit normalen rAF-Frames und eingefrorenen
  Zwischenbildern: Titel, Settings, Hilfe, Power-ups, Game over, Namenseingabe,
  Abschied; Logo-Pause, Neuöffnen ohne Wiederholung und Reduced Motion.
  Die temporäre Prüfdatei und Bilder liegen unter `output/heading-motion/`.

Physisches Gerät: **Galaxy S10e SM-G970F, Chrome 155.0.8059.81**, Hochformat
360×617 und Querformat 673×280 CSS-px. Touch-Bedienung und kompletter
Game-over-Ablauf bestanden. Je 1,2 Sekunden Attract-Stichprobe mit/ohne
Bewegung: Median rund 16,7 ms, p95 rund 16,8 ms, jeweils kein Frame über
33 ms (Baseline-p95 im Hochformat 16,9 ms). Das zeigt keinen messbaren Unterschied in diesen kurzen Stichproben;
es ist keine Aussage über Dauerlast oder andere Geräte. Rotation und
Test-Origin-Speicher wurden wiederhergestellt; nur eigene Tabs/USB-Helfer
werden geschlossen.

Windows-WebKit benötigt hier den dokumentierten Harness-Schalter
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` (siehe FEATHER.md).
Der Release-Build ist 219.411 Bytes groß (2.788 Bytes zusätzlich gegenüber
Build .5; Brotli 61.142 Bytes, +560 Bytes). Chromium und WebKit vergleichen
jeweils alle 52 Source/Release-Szenen pixelgenau gleich, bei ausgeschalteten
Übergängen. Der Skill-Client besteht auch gegen die Release-Datei;
die Standalone-/Offline-/Lifecycle-Prüfung besteht sieben Szenarien.
Die kompakte Datei besteht außerdem alle 86 Übergangsprüfungen einschließlich
der neuen Logo-Pausenprüfung sowie den Attract-Test in zehn Layouts mit
aktivierten Übergängen. Keine offenen Umsetzungspunkte.

## Nachbesserung: sichtbar atmen (Build 2026-10-18.7)

Auf Rückmeldung des Nutzers war der einmalige, kurze Titel-Eintritt zu
unauffällig. Die lokale Adresse 8765 lieferte bereits Build .6; ein alter
Serverstand war nicht die Ursache. Ein echter Edge-Lauf ohne Media-Override
startete die Animationen wie vorgesehen. Bei Hilfe und dem Namensdialog
konnte die Eintrittsgeste außerdem hinter dem View-Transition-Snapshot
weitgehend verstreichen.

Jetzt atmen sichtbare Überschriften alle 4,8 Sekunden zwischen Scale 1 und
1,025 mit bis zu 2 px Hub. Der Text bleibt jederzeit lesbar; es entstehen
keine Layoutänderungen pro Frame. Menü-Eintritte dauern 380 ms und haben
12 px Weg. Hilfe und T7a-Namenseingabe starten ihre Schriftanimation nach
`ViewTransition.finished`; Generationen verhindern ein verspätetes Starten
inzwischen geschlossener oder ersetzter Ansichten. Die vorhandene Pause
stoppt auch das Titelatmen. Reduced Motion und technische Dialog-Raises
bleiben bewegungslos. PWA-Cache: `dino-run-v16`.

Die 86 Übergangsprüfungen enthalten jetzt echte Regressionsprüfungen für
das verbleibende Atmen nach dem Eintritt, die gemeinsame Pause und frische
Schriftanimationen nach dem Snapshot (full/basic). Sie bestehen in Chromium
gegen die kompakte Datei und in WebKit gegen die Quelle. Skill-Client und
Game-over-Flow mit aktiven Übergängen bestehen auch gegen den Release.
Chromium vergleicht alle 52 Source/Release-Szenen pixelgleich.
WebKit zeigte in zwei vollständigen Bildvergleichen jeweils 37 bzw. 24
abweichende Pixel an unveränderten Schriftkanten (Portrait/Start bzw.
Landscape/Start). Der unveränderte gezielte Nachlauf beider Layouts besteht
alle 26 Szenen pixelgleich. Die Toleranzen wurden nicht geändert; ein
vollständiger fehlerfreier 52-Szenen-WebKit-Lauf für Build .7 liegt nicht vor.

Erneute praktische Prüfung auf dem entsperrten Galaxy S10e in beiden
Orientierungen bestanden; Screenshots angesehen, keine Browserfehler.
Kurze Attract-Stichproben mit/ohne Bewegung: jeweils Median 16,7 ms,
p95 16,8 ms, kein Frame über 33 ms. Die Aussage bleibt auf diese kurzen
Stichproben beschränkt. Dateien: `output/heading-breathe/`.

## Sichtbare Bewegung und Fokus (Build 2026-10-18.8)

Erneute Nutzerrückmeldung: Haupttitel weiterhin unbewegt, Atmen in Help und
Settings kaum wahrnehmbar. Ein normaler, sichtbarer Edge-Lauf über mehrere
Sekunden bestätigte die geringe Amplitude des vorherigen Builds: DINO allein
änderte seine Breite nur um etwa 2,7 px. Außerdem pausierte der Haupttitel
beim Verlust des Fensterfokus zusammen mit der Simulation.

Eintritt und Atmen liegen jetzt auf getrennten verschachtelten Spans. Das
Atmen verwendet einen normalen transform statt einzelner scale/translate-
Eigenschaften. Der gesamte Haupttitel einschließlich Logo bewegt sich als
eine Einheit, ohne den Wortabstand zu verändern. Der neue Zyklus dauert
3,2 Sekunden, mit bis zu 6 Prozent Vergrößerung und 4 px Hub. Der Edge-Lauf
mit normalem rAF und ohne Media-Override misst am gesamten Titel rund
269 bis 285 px Breite und etwa 6 px Veränderung der oberen Textkante;
Help bewegt sich ebenfalls über etwa 6 px Höhe. Die Videoaufnahme und
Ausschnitte sind unter output/heading-visible/ abgelegt (title-preview.gif).

Die Simulation pausiert bei Blur weiterhin sofort. Ein noch sichtbares,
unverdecktes Attract-Menü darf dabei weiteratmen, etwa auf einem zweiten
Monitor. Die separate heading-paused-Klasse stoppt es bei anderen
Pausengründen (verdeckender Dialog, Hilfe, versteckte Seite). Der bewusste
Vorschau-Pausenschalter stoppt weiterhin Titel und Logo. Technisches
Dialog-Neuöffnen unterdrückt nur den Eintritt, nicht dauerhaft das Atmen.
Reduced Motion und der Testschalter deaktivieren die neuen Effekte wie zuvor.

Die bestehenden 86 Übergangsprüfungen prüfen jetzt die tatsächliche
Titelbreite (mehr als 10 px Unterschied am Maximum), das Weiteratmen bei
Blur bei gleichzeitig pausierter Simulation und die bewusste Pause. Quelle
in Chromium und Release in WebKit bestanden alle 86 Prüfungen. Chromium
vergleicht alle 52 Source/Release-Szenen pixelgleich. Skill-Client gegen
Quelle sowie Game-over-Flow gegen Release mit aktiven Übergängen in drei
Desktop/Touch-Layouts bestanden. Die normalen Edge-Zeitreihen und Screenshots
wurden geprüft. Das ist Desktop-/Emulationsprüfung; für Build .8 wurde kein
neuer physischer Telefonlauf durchgeführt. PWA-Cache: dino-run-v17.

## Leichte Welle (Build 2026-10-18.9)

Auf Nutzerwunsch überlagert eine kleine laufende Welle das bereits
abgenommene Atmen. Die Buchstaben bewegen sich mit 90 ms Phasenversatz um
höchstens 1,5 px nach oben/unten und kippen um höchstens 0,3 Grad. Der Zyklus
bleibt bei 3,2 Sekunden; Scale und Hub der gesamten Überschrift bleiben wie
in Build .8. Die Glyph-Spans werden einmal beim Einrichten erzeugt, bei
Textwechseln nur bei geändertem Inhalt. Pro Frame läuft ausschließlich CSS.

Der Titel behält seinen vollständigen zugänglichen Namen am h1/h2;
dekorative Einzelbuchstaben sind aria-hidden. Leerzeichen bleiben Text.
Hilfe bekommt dieselbe Vorbereitung in ihrem eingebetteten Dokument.
Alle Pausen-, Sichtbarkeits-, Dialog- und Reduced-Motion-Regeln gelten auch
für die Welle. Bei abgeschalteter Bewegung bleiben die Buchstaben inline.
PWA-Cache: dino-run-v18.

Chromium besteht alle 86 Übergangsprüfungen und 52 pixelgleichen
Source/Release-Szenen; Skill-Client und Release-Game-over mit Übergängen
bestehen. Vier gezielte Source/Release-Läufe in Chromium/WebKit prüfen
unterschiedliche tatsächliche Buchstabenpositionen/Phasen, vollständige
zugängliche Heading-Namen, Pause, Reduced Motion, Hilfe und unveränderte
Glyph-Knoten bei wiederholten Präsentations-Updates. Normaler sichtbarer
Edge-Lauf als Video aufgenommen, Screenshots angesehen. Vorschau:
output/heading-wave/title-wave.gif. Keine physische Geräteprüfung für .9.

## Kräftigere Welle (Build 2026-10-18.10)

Auf Wunsch mehr Wellenform: Glyph-Hub von ±1,5 auf ±3,5 px,
Neigung von ±0,3 auf ±1 Grad und Versatz von 90 auf 200 ms erhöht.
Die größere Phasendifferenz bildet einen klareren Bogen über der Zeile;
Atmen und Zyklus bleiben gleich. Ausschließlich CSS-Parameter angepasst.
Cache dino-run-v19, Release neu gebaut. Skill-Client und vier gezielte
Source/Release-Flows in Chromium/WebKit bestanden; normaler sichtbarer
Edge-Lauf aufgenommen und Screenshots kontrolliert. Neue Vorschau:
output/heading-wave-strong/title-wave.gif.
