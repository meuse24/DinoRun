# Glühbeere: Implementierungsplan

> Historisches Dokument, archiviert am 2026-10-25. Beschreibt den jeweils
> genannten Build, keine aktuelle Betriebsanleitung. Projektpfade und Befehle
> beziehen sich weiterhin auf das Repository-Stammverzeichnis.
> Aktueller Einstieg: [Dokumentationsindex](../README.md).


Stand: 24. Oktober 2026 (geprüfte Fassung). Vorschlag zur Umsetzung; noch kein
implementiertes Spielverhalten. Werte sind Startwerte für Spieltests; Zahlen zur
Sprungphysik sind aus `CONFIG` (Build 2026-10-24.8) berechnet und im Test zu bestätigen.

## Ziel und Spielregeln

Ein gelegentliches, freiwilliges Sprungziel bringt Abwechslung zwischen den
Hindernissen. Die Glühbeere gibt sofort **25 Punkte**, aber keine Credits und
keinen gespeicherten Power-up-Effekt. Verpassen hat keine Strafe.

- Maximal eine Beere gleichzeitig; erster Spawnversuch frühestens nach 12 Sekunden
  aktiver Spielzeit (`game.gameTime`, dieselbe Uhr wie `durationMs`). Nach Einsammeln
  oder Verpassen folgt eine Pause von 18–26 Sekunden aus einem eigenen
  deterministischen Zufallsstrom (eigene `RandomSource`, wie Pose-/Tail-RNG).
  Hindernis-, Chili-, Feder- und Schildfolgen bleiben bitgleich.
- Diese Zeiten gelten pro Runde. Ein verlorenes Leben setzt den Timer nicht zurück
  und verkürzt keine Abstände; Pause, Hilfe, Einstellungen, Hintergrund, Countdown
  und Levelbonus-Sequenz zählen nicht mit.
- Keine Spawns in der Startfreiphase (`gameTime < clearTime`), im Felstraining,
  in Attract-/Demo-Runden oder solange `spawnBlocked` gilt (Bosskorridor oder
  anstehender Levelbonus). Eine bereits sichtbare Beere wird vor Beginn der
  Bonussequenz abgewickelt (gilt als verpasst, ohne Strafe).

## Aussehen: leuchtendes Fuchsia

Die Beere bekommt eine Farbe, die das Spiel bisher nicht verwendet. Rot scheidet
aus: Chili (`#f04432` mit goldener Aura), Leben-Herzen (`#b83b3b`) und Boss-
Schriftzüge sind bereits rot; Gold ist Chili-Aura, Münzen und Bonus, Lavendel der
Schild, Cyan die Feder, Grün Kakteen und »Clear«.

| Rolle | Farbe |
| --- | --- |
| Körper | `#ff2e9a` (leuchtendes Fuchsia) |
| Schattenseite | `#c4146f` |
| Kontur | `#6e0b45`, 1,5 logische px |
| Glanzlicht / Spitzlicht | `#ffd1ea` / `#ffffff` |
| Kelchblätter | `#45b86f` (vorhandenes Spielgrün) |
| Aura | `rgba(255, 64, 170, .38)` → transparent |
| »+25«-Schrift (`ARCADE_TEXT.berry`) | Fill `#fff0f8` → `#ff5cb4`, Glow `#ff7ac4` |

- Form: runde Beere, ca. 20 logische px Durchmesser, zwei kleine Kelchblätter oben,
  heller Glanzbogen links oben. Keine Herzform, damit sie nicht wie ein Leben wirkt.
- Unterscheidung von Chili unabhängig von Farbe: rund statt länglich, schwebt in
  Sprunghöhe statt auf Bodenhöhe, Aura in Fuchsia statt Gold.
- Form und Kontur müssen in Graustufen sowie bei Protanopie/Deuteranopie erkennbar
  bleiben; die helle Glanzkante sichert den Kontrast am Nachthimmel, die dunkle
  Kontur am hellen Taghimmel. Beides per Screenshot prüfen (Tag, Nacht, Übergang).
- Die »+25«-Rückmeldung ist pink/weiß, nicht rot, und erscheint nicht im Bereich
  der Herz-/1UP-Anzeige.

## Höhe und Erreichbarkeit

Aus der vorhandenen Physik (`initialJumpVelocity` 12 + (speed − 6)/10, `gravity`
0,6, `minJumpHeight` 30, `dropVelocity` −5) ergibt sich:

- Stehende Dino-Hitbox: Oberkante `GROUND_Y − 47` = y 143.
- Kürzester Sprung (sofort losgelassen): Hitbox-Oberkante erreicht ca. y 86
  (ca. 57 px Hub), Flugzeit ca. 27 Simulationsschritte.
- Voller Sprung: ca. 125 px (Grundtempo) bis 140 px (Höchsttempo) Hub.

Vorschlag: Beerenmitte `GROUND_Y − 82` (y 108), Sammelfläche 24 × 24 (y 96–120).
Damit liegt sie 23 px über dem stehenden Dino, wird vom kürzesten Sprung sicher
überdeckt und auch beim Auf- oder Absteigen eines vollen Sprungs berührt. Sie liegt
unterhalb der HUD-Zone (bis y 55). Feder oder Chili sind nie Voraussetzung.

- Ein fliegender Dino sammelt die Beere bei Kontakt einmalig ein, auch im
  Federsprung oder mit Chili. Schild und Chili verändern den Punktewert nicht.
- Kollision wie bei Chili/Feder/Schild: horizontal überstrichene Fläche
  (`oldX`…`x`). Vertikal ist kein Sweep nötig, weil die Dino-Hitbox (47 px) höher
  ist als jeder vertikale Schritt (≤ ca. 14 px) und die Sammelfläche 24 px hoch ist.
  Ducken am Boden sammelt nie.
- Testkriterium: Bei Grund- und Höchsttempo (mit und ohne Chili) muss es für den
  kürzesten Sprung ein Absprungfenster von mindestens 6 Simulationsschritten geben;
  Stehen und Ducken dürfen in keinem Fall sammeln.

## Erscheinen und faire Platzierung

Die Beere bewegt sich mit `travelSpeed` (inklusive Chili-Multiplikator) wie die
anderen Pickups. Beim Eintritt in den sichtbaren Bereich wächst sie über 220 ms
von 70 % auf 100 % (nur Darstellung), die Aura leuchtet einmal auf, höchstens vier
kurzlebige Funken. Kein bildschirmweiter Blitz, keine Kameraerschütterung, kein
Spawn-Ton. Danach pulsiert nur die Aura langsam; die Sammelfläche bleibt konstant.

Faire Platzierung ohne Eingriff in die Hindernisgenerierung: `Horizon` legt beim
Erzeugen jedes Hindernisses dessen Folgeabstand `gap` fest; das nächste Hindernis
erscheint frühestens bei `last.x + last.width * last.size + last.gap`. Die Beere
wird deshalb nur in die bereits bekannte Lücke hinter dem letzten Hindernis gesetzt:

- `vorlauf`: Abstand vom rechten Rand des letzten Hindernisses bis zur Beere
  mindestens Landestrecke eines vollen Sprungs über dieses Hindernis plus Puffer,
  damit der Spieler nach dem Hindernis landen und erneut abspringen kann.
- `nachlauf`: Abstand von der Beere bis zum frühestmöglichen nächsten Hindernis
  mindestens Flugstrecke des kürzesten Sprungs (≈ 27 Schritte × `travelSpeed`)
  plus Dino-Breite und Puffer.
- Beide Strecken werden aus aktuellem `travelSpeed` berechnet, nicht als feste
  Pixel. Vögel zählen als Hindernis (Höhenband y 111 überschneidet sich mit der
  Beere). Andere Pickups halten mindestens `SHIELD.spawnGap` Abstand.
- Passt die Lücke nicht, wird nach 300 ms erneut versucht (wie bei den anderen
  Pickups); dauerhaft unpassende Lücken führen nur zum Auslassen, nie zum
  Verschieben von Hindernissen. Dadurch bleibt die Hindernisfolge unverändert und
  es ist keine nachträgliche Korridorreservierung nötig.
- Reaktionszeit: Zwischen Sichtbarwerden der Beere und dem Absprungpunkt des
  Dinos müssen auch auf schmalen Welten und mit vorgerücktem Chili-Dino
  (`TREX_START_X + world.width / 3`) mindestens 450 ms liegen, sonst kein Spawn.

Beim Einsammeln verschwindet die Beere sofort. Ein kurzes »+25« über dem Dino
über die vorhandenen `effects.callout`, höchstens sechs Funken aus dem bestehenden
Partikelpool und ein eigener kurzer Synthesizer-Klang (zwei aufsteigende Töne,
klar unterscheidbar von `sound.coin()`) bestätigen den Erfolg. Ton folgt
Effektlautstärke und Stummschaltung. Ein `aria-live`-Hinweis ist nicht nötig
(Punkte werden ohnehin angesagt/angezeigt); keine Dialogunterbrechung.

## Performance

Grundlage sind die bisherigen Messungen (Galaxy A53: Canvas-Filter pro Frame
unter 5 FPS, vgl. `ghostSprite`; GPU-fähiger Einzelkontext, direkte HUD-Schrift).

- Zwei kleine vorberechnete Sprites, gebaut wie `ghostSprite`: Beere (Körper,
  Kontur, Kelch, Glanz) und Aura (radialer Verlauf). Nur ein Eintrag pro
  Sprite, ersetzt bei geänderter Renderskala (`ctx.getTransform().a`), keine
  wachsende Map. Logische Größe ca. 26 × 30 bzw. 44 × 44 px; bei Skala 3 also
  unter 140 × 140 Pixel.
- Pro Frame höchstens zwei `drawImage`-Aufrufe (Aura mit `globalAlpha` und
  Skalierung für Puls/Erscheinen, dann Beere). Keine Pfade, Verläufe,
  `shadowBlur`, `filter` oder `globalCompositeOperation` im Lauf; keine
  `getImageData`-Rücklesung, damit der Hauptkontext GPU-fähig bleibt.
- »+25« über `arcadeText` mit neuem Stil `berry`: einmal pro Skala gerastert und
  im vorhandenen `textSprites`-Cache wiederverwendet.
- Funken über eine neue Partikelart `berry` im vorhandenen Pool
  (`freeParticles`), Farben `['#ff2e9a', '#ffd1ea', '#ffffff']`; keine neue
  Partikelliste und keine Überschreitung der bestehenden Obergrenze.
- Pickup als ein wiederverwendetes Objekt (`{ x, prevX, y, age }`), kein neues
  Objekt pro Spawn, Hitbox-Rechteck wiederverwendet; kein eigener Timer,
  `requestAnimationFrame`-Loop oder DOM-Element. Interpolation über `prevX`.
- Sprites werden lazy beim ersten sichtbaren Frame gebaut, nicht beim Laden.
  Zum Vermeiden eines Erst-Frame-Rucklers dürfen sie im Countdown vorab erzeugt werden.
- Messung: Physisches Android (A53 als Referenz) mit `android-sustained-
  performance.mjs` und `android-gc-performance.mjs` gegen die gesicherte
  Vorher-Version; Frames mit sichtbarer Beere und Sammelmoment getrennt markieren.
  Kein pauschales 60-FPS-Versprechen; wiederholbare Verschlechterung oder neue
  Speicherzuwächse werden vor dem Release untersucht.

## Effekte und Barrierefreiheit

- »Arcade effects« aus: Beerensprite und lesbares »+25« bleiben; Aura, Puls,
  Erscheinen-Animation und Funken entfallen (nur ein `drawImage` pro Frame).
- Reduzierte Bewegung: zusätzlich kein Skalieren und kein wandernder Punktetext;
  »+25« erscheint statisch und blendet aus. Punkte und Sammelbarkeit bleiben gleich.

## Integration in Architektur und Punkte

1. `GLOW_BERRY`-Konstanten (`firstSpawnMs` 12000, `respawnMinMs` 18000,
   `respawnMaxMs` 26000, `points` 25, `y`, `radius`) und eine Klasse `GlowBerry`
   neben `JumpFeather`/`ShieldBubble`. `Game.world` explizit übergeben; Resize,
   Reset, Lebensverlust, Pause und `spawnBlocked` berücksichtigen.
2. `Game` führt `berryScore` und `berries` (Anzahl). Die Punkteformel steht heute
   doppelt (`updateBonus` und Hauptschritt): durch eine Methode
   `refreshScore()` = Streckenpunkte + `bonusScore` + `berryScore` ersetzen.
   Das Levelbonus-Budget rechnet weiter nur mit Streckenpunkten (`baseScore`).
   Nach dem Gutschreiben direkt `awardLives()` aufrufen; Meilensteine werden wie
   bisher verbraucht, sodass eine Schwelle genau einmal auslöst.
3. Ereignis `berry` über `emit`; `Runner` spielt Ton und Callout, `Renderer`
   zeichnet. Simulation ohne DOM-Zugriff. `render_game_to_text` erhält
   Position, Timer, Anzahl und `berryScore`. Rundenstatistik ergänzt
   »Glow berries collected«.
4. Client-`maxPlausibleScore()` und `dino_max_score()` gemeinsam erweitern
   (Konstanten in beiden Dateien synchron halten):
   bisherige Grenze + `25 * (1 + floor((durationMs - 12000) / 18000))` für
   `durationMs ≥ 12000`, sonst + 0. Die Grenze ist konservativ, weil der
   Spawntimer nur mit `gameTime` läuft und die Beere nach dem Spawn erst noch
   zum Dino fliegen muss.
5. Alte Highscores bleiben unverändert. Die höhere Punktechance neuer Runden in
   `doc/progress.md` und der Hilfe dokumentieren.
6. Deployment-Reihenfolge: Der erweiterte PHP-Validator muss vor oder mit dem
   neuen HTML ausgeliefert werden, sonst lehnt der Server gültige Runden ab.

## Hilfe und Startbildschirm

Die Spieltexte sind Englisch. Hilfetext:

> Glow berry: Jump to catch the glowing pink berry for 25 bonus points. Missing it
> costs nothing. It does not use or replace your power-ups.

Die Power-up-Vorschau bekommt die Überschrift »Power-ups & bonuses« und eine
vierte Karte »Glow berry — Jump and catch it. +25 points.« mit statischem SVG
in denselben Farben wie im Spiel (Kreis `#173f69`, Rand `#ff7ac4`). Das Raster
`.attract-powerups` wechselt auf breiten Flächen auf 2 × 2 (oder 4 Spalten ab
ausreichender Breite); die kompakte Listen-Darstellung für kleine Hoch- und
Querformate bleibt, muss aber vier Zeilen fassen. START bleibt jederzeit sichtbar
und bedienbar. Kein animierter Canvas und kein dauerhaftes HUD-Symbol.

## Umsetzung und Prüfung

1. Vorher-Version (`dino.html` und `release/dino.html`) als Referenz sichern.
   Simulation, Platzierung und Punkte zunächst mit einfacher Kreisgrafik.
2. Sprites, Rückmeldung, Ton und Effekt-/Bewegungseinstellungen ergänzen;
   danach Hilfe und responsive Vorschau.
3. `tests/glow-berry.mjs` (isolierte Fixture, `highscoreApiUrl = null`):
   Mindestzeiten, genau eine Beere, kürzester Sprung bei Grund-/Höchsttempo mit
   und ohne Chili, Stehen/Ducken sammelt nie, Absprungfenster ≥ 6 Schritte,
   Verpassen, keine Doppelwertung, Leben/Meilensteine, Pause, Reset, Rotation,
   Feder/Schild, Boss und Levelbonus. Hindernisfolge mit und ohne Beere
   bitgleich vergleichen; Nachlauf bis zum nächsten Hindernis bei schmalen Welten
   und vorgerücktem Chili-Dino prüfen. Screenshots Tag/Nacht ansehen.
4. `php tests/bonus-score.php` um Grenzfälle direkt vor/an/nach 12 s, 30 s,
   48 s sowie gültige und um einen Punkt zu hohe Summen erweitern;
   Client- und Servergrenze für dieselben Eingaben vergleichen.
5. Regressionen: `game-contract`, `level-bonus`, `lives`, `attract-screen`,
   `effects-setting`, `arcade-type`, `gc-pooling`, `shield-bubble`,
   `jump-feather`, `rock-boss`; neue Suite in Chromium und WebKit.
6. Physisches Android separat: Touch-Sprung, Hochformat und beide Querformate,
   sichtbare Beere und Sammeleffekt, Effekte an/aus, Framezeiten und GC
   sequentiell messen; Emulation als solche ausweisen.
7. Danach `BUILD`, Worker-/Releaseversion und Dokumentation gemäß
   `doc/RELEASE.md` aktualisieren, Build erzeugen und `tests/release.mjs`
   ausführen. Deployment nur auf ausdrücklichen Auftrag (Reihenfolge siehe oben).

Abnahme: Die Beere ist ohne Spezialfähigkeit mit einem kurzen Sprung fair
erreichbar, gibt exakt 25 zusätzliche Punkte, ist durch Farbe und Form klar von
Chili, Herzen und anderen Pickups zu unterscheiden, bleibt auf kleinen Displays
verständlich und erzeugt keinen reproduzierbaren relevanten Performanceverlust.
Dieser Plan führt keinen Build, Gerätetest oder Upload aus.

## Ergebnis der Codeprüfung bei der Umsetzung

Die Platzierungsannahme zu `last.gap` musste korrigiert werden: Bei leerer
Hindernisliste erzeugt `Horizon` das nächste Hindernis sofort. Die tatsächliche
Folgegrenze berücksichtigt deshalb auch das Verschwinden des letzten Hindernisses.
Für übliche Spielfeldbreiten ergänzt eine Beere über einem sicher überspringbaren
Kaktus die seltenen Lücken mit zwei getrennten Sprüngen. Vögel und zu enge
Kurzsprungfenster bleiben ausgeschlossen. Hindernisse werden nicht verändert.
Die Details, getesteten Grenzen und Nachweise stehen in [GLOW-BERRY.md](../GLOW-BERRY.md).
