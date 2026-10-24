# Screen-Übergänge und Menü-Overlays

Aktueller Code: `ScreenTransition`, `ScreenPresenter`, `HeadingMotion`,
Dialog-CSS und Attract-Präsentation in [dino.html](../dino.html).
Simulation, Score-Qualifikation und Eingabe bleiben bei ihren jeweiligen Besitzern;
Animationen ändern keine Spielzeiten oder Regeln.

## Mechanismen

| Bereich | Umsetzung |
| --- | --- |
| Attract-Eintritt, Panel-/Score-Seitenwechsel, START, Todesszene, Rückkehr | CSS auf echten Elementen; DOM-Zustand ändert sich synchron |
| Settings, späte Namenseingabe, Goodbye, Install-Hilfe | Native Dialoge mit CSS-Ein-/Austritt; showModal()/close() bleiben synchron |
| Sofortige Namenseingabe mit Score-Morph, Listen-/Eingabewechsel, Help-Navigation | View Transition, sofern verfügbar und die betroffene Bedienung pausiert ist |

START, Spielfläche und Touch-Steuerung müssen unmittelbar reagieren.
Beim Start läuft keine dokumentweite View Transition. Der START-Trefferbereich
bleibt über alle Attract-Panels am selben Ort. Ausblendende alte Inhalte sind
`inert` und erhalten keine Pointer-Eingaben.

`ScreenTransition` kapselt API-Verfügbarkeit, laufende Übergänge, Abbruch und
Fallback. Resize, Orientierung, Fullscreen und technisches Dialog-Reopen
überspringen störende Übergänge. Reduced Motion reduziert die Bewegung auf
kurzes Blenden beziehungsweise direkten Wechsel. Fehlende Browserunterstützung
darf Navigation, Speichern oder Schließen nicht verhindern.

## Dialoge, Pause und Fokus

Settings und Help sind zentrierte, intern scrollbar bleibende Overlays über dem
sichtbaren pausierten Spiel. Inhalt und Bedienelemente müssen auch in kurzem
Telefonquerformat erreichbar bleiben. Fokus bleibt im aktiven Modal; Escape,
Browser-Back und direkte Help-Links erhalten ihre vorgesehenen Schließwege.

`ScreenPresenter.restoreAfterDialog()` stellt Pause, Canvas-Größe und Rendering
wieder her, bevor der Aufrufer sein Rückkehr-Fokusziel bestimmt. Eigene Guards,
Highscore-Generationen und Help-History verbleiben bei den zuständigen Views.
`raiseModalDialogs()` ist ein technisches Re-Open ohne sichtbaren Neueintritt.

## Wiederholbare Prüfung

```powershell
node tests/screen-transitions.mjs
node tests/menu-overlays.mjs
node tests/heading-motion.mjs
node tests/game-over-flow.mjs
```

Alle akzeptieren einen optionalen HTML-Pfad, zum Beispiel `release/dino.html`,
und `DINO_BROWSER=webkit`. Setup und Windows-WebKit-Hinweise:
[FEATHER.md](FEATHER.md). Die Übergangssuite prüft CSS-, Dialog- und VT-Pfade,
Input während Animationen, Fokus, Schließwege, Reduced Motion und START-Latenz.
Andere Browsersuiten schalten Übergänge üblicherweise aus; mit
`DINO_TRANSITIONS=1` werden sie ausdrücklich aktiviert.

Physische Prüfungen: `node tests/android-menu-overlays.mjs release/dino.html`
(eigene sichere Origin 8881) und `node tests/android-transitions.mjs` mit dem
USB-/CDP-Aufbau aus FEATHER.md. Letztere misst Frame-Zeiten und START-Latenz.
Für den Test nur autorisierte entsperrte Geräte verwenden; Emulatornachweise und
physische Ergebnisse getrennt berichten.

[Ursprünglicher Plan, Timingtabellen, API-Messungen und damalige Ergebnisse](archive/TRANSITIONS-through-2026-10-24.md)
bleiben als Historie erhalten. Die Browser-Kompatibilitätsangaben darin sind
datiert und wurden bei der Dokumentationsbereinigung nicht neu geprüft.
