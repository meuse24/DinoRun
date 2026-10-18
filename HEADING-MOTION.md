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
   Animationsbibliothek, Canvas-Schleife, Buchstabenzerlegung oder Filter.
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
