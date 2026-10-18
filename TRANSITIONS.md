# Plan: Weiche Screen-Übergänge (View Transition API und CSS)

Status: **Umgesetzt** in Build `2026-10-18.4` (`dino.html`, PWA-Cache
`dino-run-v13`), Branch `feat/screen-transitions`, Phasen 1–7. Der Plan
bezog sich auf Build `2026-10-18.3`; er legt fest, welche Übergänge wie
animiert werden, mit welchem Mechanismus, wo sie technisch andocken und wie
sie geprüft werden. Ergebnisse und Abweichungen: Abschnitt 8.1.

## 1. Ziele und Leitprinzipien

Die Regeln orientieren sich an dem, was Studios mit sehr gutem „Game Feel“
konsequent tun (Nintendo-Menüs, Celeste, Hades, Super Meat Boy, Hollow Knight,
Tetris Effect) sowie an Material-/Apple-Motion-Richtlinien:

1. **Input schlägt Animation.** Ein Übergang darf niemals Spielinput
   verzögern oder schlucken. START reagiert weiterhin auf `pointerdown`; der
   Sprung startet im selben Frame. Celeste/Super Meat Boy: Neustart in unter
   einer Sekunde, keine Wartezeit durch Menügrafik.
2. **Der Mechanismus folgt dem Input.** Dokumentweite View Transitions
   machen während ihrer Laufzeit die ganze Seite unbedienbar (Messung in
   3.1). Sie werden deshalb nur dort eingesetzt, wo das Spiel ohnehin
   pausiert ist und ein kurzer Input-Verlust keine Folgen hat. Überall, wo
   START, Spielfläche oder Touch-Buttons bedienbar sind, laufen gewöhnliche
   CSS-Animationen auf den echten Elementen.
3. **Die Welt bleibt Kontinuität.** Wie im Original-Chrome-Dino läuft die
   Landschaft hinter dem Menü weiter. Menü und HUD „treten zur Seite“, die
   Welt wird nie überblendet, eingefroren oder schwarz abgeblendet.
4. **Kurz und asymmetrisch.** UI-Eintritte 200–320 ms mit `ease-out`
   (abbremsend), Austritte etwa ⅔ davon mit `ease-in` (beschleunigend).
   Nichts im Spielfluss dauert länger als 350 ms. Ruhige Momente
   (Session-Ende) dürfen bis 450 ms gehen.
5. **Richtung hat Bedeutung.** Vorwärts (tiefer ins Menü, Hilfe öffnen) kommt
   von rechts bzw. unten, zurück geht in die Gegenrichtung. Karussell-Slides
   bewegen sich in Richtung des Indexwechsels.
6. **Kleine Wege.** Translationen 8–24 px, Skalierung 0,96–1,0.
7. **Stabile Anker.** START bleibt an Ort und Stelle; die Punktzahl morpht
   in die Namenseingabe, statt zu verschwinden und wiederzukommen.
8. **Präsentation ändert keine Spielregeln.** Simulationszeiten
   (`DEATH_SCENE_MS`, `DEATH_SKIP_MS`, Countdown, Attract-Dauern) bleiben
   unverändert.
9. **Barrierefreiheit.** `prefers-reduced-motion: reduce` → nur kurzer
   Crossfade (120 ms) ohne Bewegung oder direkter Wechsel. Fokus und
   Live-Region-Ansagen bleiben inhaltlich wie bisher; Fokus wird erst
   gesetzt, wenn das Ziel sichtbar ist.

## 2. Inventar der Screens und Übergänge

Mechanismen: **A** = CSS-Animation auf echten Elementen, **B** = native
Dialog-Animation per CSS, **C** = View Transition API (Details in Abschnitt 3).

| Nr. | Von → Nach | Auslöser im Code | Häufigkeit | Mech. |
|---|---|---|---|---|
| T1 | Laden → Attract | Seitenstart | 1× | A |
| T2 | Attract-Slide ↔ Attract-Slide | `AttractScreen.select()` | alle 8–10 s | A |
| T3 | Highscore-Seite 1 ↔ 2 | `AttractScreen` (4-s-Seiten) | alle 4 s | A |
| T4 | Attract → Spiel | `Runner.start()` → Event `start` | sehr oft | A |
| T5 | Spiel → Todesszene | Event `crash` | sehr oft | A |
| T5b | Todesszene → Warten auf Qualifikation | `deathSceneEnd`, `qualifying` | selten | A |
| T6 | Todesszene/Warten → Attract | `finishRound()` → `returnToAttract()` | sehr oft | A |
| T7a | Todesszene → Namenseingabe (sofort bekannt) | `finishRound()` → `openEntry()` | gelegentlich | C |
| T7b | Warten → Namenseingabe (späte Antwort) | `finishRound()` nach Antwort | selten | B |
| T8 | Namenseingabe → Attract | Save/Cancel/Escape → `returnToAttract()` | gelegentlich | B + A |
| T9 | Highscore-Liste ↔ Eingabe im Dialog | `showList()` / `openEntry()` | selten | C |
| T10 | Spiel/Attract ↔ Settings | `settings.showModal()` / `close` | gelegentlich | B |
| T11 | Spiel/Attract ↔ Hilfe (`#info`) | `GamePage.showView()` / `hashchange` | selten | C |
| T12 | Attract → Goodbye | `Runner.quit()` → `showGoodbye()` | selten | B |
| T13 | Goodbye → Attract (New session) | `Runner.newSession()` | selten | B + A |
| T14 | Install-Hilfe auf/zu | `install-help` Dialog | selten | B |

Bewusst ohne Übergang (Abschnitt 6): Countdown 3‑2‑1‑GO, Tag/Nacht,
Pause/Fortsetzen, Orientierungs-/Größenwechsel, Fullscreen-Wechsel,
`raiseModalDialogs()`. Coach-Hinweise, Turbo-HUD und Rekord erhalten nur
kleine CSS-Fades.

## 3. Technische Grundlage

### 3.1 Messbefund: Hit-Testing während einer View Transition

Isolierter Test am 2026-10-18 mit Playwright (Chromium 151, WebKit 26.5):
eine Seite mit einem benannten Button, einem unbenannten Button und einer
Fläche, `::view-transition { pointer-events: none; }`, laufende
3-s-Transition, Klicks auf alle drei Ziele.

| | Ziel während der Transition | Ziel danach |
|---|---|---|
| Chromium 151 | `HTML` (alle drei) | jeweiliges Element |
| WebKit 26.5 | `HTML` (alle drei) | jeweiliges Element |

Folgerungen:

- Während einer **dokumentweiten** View Transition erreicht kein
  Pointer-Event die Elemente der Seite – auch nicht die unbenannten, weil
  die Wurzel selbst erfasst ist. `pointer-events: none` verhindert nur, dass
  die Pseudo-Elemente das Ereignis fangen; es landet dann auf `html`.
  Listener an `pageEl`, START oder den Touch-Buttons erhalten nichts.
- Ein Ereignis, das auf `html` landet, lässt sich nicht als vertrauenswürdiges
  Ereignis weiterreichen (Fullscreen und Audio-Freischaltung brauchen das).
  Ein Umleiten ist daher keine Lösung.
- **Element-scoped** Transitions (`element.startViewTransition`) lassen
  Bereiche außerhalb bedienbar (Chromium 151: START außerhalb erhielt den
  Klick), fehlen aber in WebKit 26.5. Sie sind deshalb keine Basis.
- Tastatur und Gamepad sind nicht betroffen.

Der Test wird als Regression in `tests/screen-transitions.mjs` übernommen.

### 3.2 Auswahl des Mechanismus

| Mechanismus | Einsatz | Warum |
|---|---|---|
| **A** CSS-Animation auf echten Elementen | alles, was bei laufender oder bedienbarer Spielfläche passiert: T1–T6, Attract-Teil von T8/T13 | Hit-Testing bleibt erhalten; DOM-Wechsel synchron wie heute |
| **B** native Dialog-Animation (`@starting-style`, `transition-behavior: allow-discrete`, `overlay`) | Öffnen/Schließen modaler Dialoge: T7b, T8, T10, T12, T13, T14 | Spiel ist pausiert; `showModal()`/`close()` bleiben synchron; jeder Schließweg (auch Escape, `appinstalled`) animiert automatisch |
| **C** View Transition | nur, wo ein echter Mehrwert entsteht und das Spiel pausiert ist: Score-Morph T7a, Ansichtswechsel im Dialog T9, Hilfe-Navigation T11 | Shared-Element-Morph und Seitenwechsel sind mit CSS allein nicht sauber machbar |

Grundregel: **Keine dokumentweite View Transition, solange START, die
Spielfläche oder Touch-Steuerung bedienbar sind.** Damit ist der frühere
Konflikt „keine VT während `game.playing` vs. T4“ aufgelöst: T4 ist keine VT.

### 3.3 Mechanismus A: CSS-Animationen auf echten Elementen

- DOM-Zustand ändert sich **synchron** wie heute; es entsteht keine
  Verzögerung und kein neues Timing-Problem.
- **Eintritt:** Das Element wird sichtbar und erhält eine Klasse mit
  `@keyframes` (`.enter-start`, `.enter-panel`, …). Bedienbare Elemente
  starten nie unsichtbar (START ab Deckkraft 0,6, ohne Verzögerung).
- **Austritt:** Das Element bleibt kurz sichtbar mit `data-leaving`,
  `inert` und `pointer-events: none`, damit Taps durchfallen und kein Fokus
  darauf landen kann. Nach `Promise.all(el.getAnimations().map(a => a.finished))`
  wird es `hidden`. Eine Sicherheitsfrist (Dauer + 100 ms) erzwingt
  `hidden`, falls kein Animationsende kommt.
- **Per-Frame-Setzen:** `SessionView.updateRoundPanel()` berücksichtigt den
  Austritt: `panel.hidden = !idle && !panelLeaving`. Andere Schreiber
  (`handleEvent`, `draw`) bleiben unverändert synchron.
- **Unterbrechung:** Kehrt der Zustand während eines Austritts um
  (z. B. sehr schneller Tod), werden laufende Animationen per `cancel()`
  beendet, `data-leaving` entfernt und der Eintritt gestartet.
- **Slides (T2/T3):** `AttractScreen.select()` und der Seitenwechsel der
  Highscores rufen den Übergang ausdrücklich auf: Die alte Slide bleibt
  während des Austritts absolut positioniert im selben Grid-Feld, die neue
  tritt ein. Slides, Dots und Score-Seite sind damit Teil desselben
  synchronen Ablaufs; eine Zustandserkennung per Frame ist nicht nötig.
- Animiert werden nur `opacity` und `transform` (Compositor, keine
  Layoutkosten).

### 3.4 Mechanismus B: native Dialog-Animationen

```css
dialog { opacity: 0; transform: translateY(24px);
  transition: opacity var(--vt-exit) var(--ease-in),
              transform var(--vt-exit) var(--ease-in),
              overlay var(--vt-exit) allow-discrete,
              display var(--vt-exit) allow-discrete; }
dialog[open] { opacity: 1; transform: none;
  transition-duration: var(--vt-enter); transition-timing-function: var(--ease-out); }
@starting-style { dialog[open] { opacity: 0; transform: translateY(24px); } }
dialog::backdrop { … analog mit eigener Dauer … }
```

- `showModal()` und `close()` bleiben **synchron** an ihren heutigen Stellen.
  Absichtsflags, verzögertes Öffnen und Fokus-Verschiebung sind für diese
  Dialoge nicht nötig. `finishRound()` darf weiter `dialog.open` prüfen.
- **Alle Schließwege animieren automatisch**: Back-Button, nativer
  Escape (Settings, Install-Hilfe), abgefangenes `cancel` (Scores),
  `appinstalled` (Install-Hilfe), `close()` aus Code.
- `raiseModalDialogs()` schließt und öffnet sofort wieder; dort werden die
  Transitions für diesen Takt per Klasse `no-motion` am Dialog
  ausgeschaltet, damit kein Aus-/Einblenden sichtbar wird.
- Der Backdrop wird über `::backdrop` selbst animiert und liegt damit immer
  korrekt über der Spielfläche.
- Unterstützung: `@starting-style` und `allow-discrete` in aktuellen
  Chromium-, WebKit- und Firefox-Versionen; die `overlay`-Eigenschaft fehlt
  in Firefox. Dort und in älteren Browsern verschwindet der Dialog beim
  Schließen ohne Austrittsanimation, öffnet aber animiert. Das wird per
  `@supports (overlay: auto)` bewusst so akzeptiert und im Test geprüft.
- Bedienbarkeit: Dialoge sind während der eigenen Animation normal
  bedienbar (echte Elemente).

### 3.5 Mechanismus C: View Transitions

#### 3.5.1 Aufrufformen (MDN-Kompatibilitätsdaten, geprüft 2026-10-18)

| Stufe | Erkennung | Aufruf | Typ-Selektor |
|---|---|---|---|
| Voll | `'types' in ViewTransition.prototype` | `document.startViewTransition({ update, types: [type] })` | `:active-view-transition-type(type)` |
| Basis | `typeof document.startViewTransition === 'function'` | `document.startViewTransition(update)` | `:root[data-vt="type"]` |
| Fallback | sonst | `update()` direkt | – |

- Callback-Form: Chrome/Edge 111+, Safari 18+, Firefox 144+, Samsung
  Internet 22+.
- Optionsform und Typen: Chrome/Edge 125+, Safari 18.2+, **Firefox 147+**,
  Samsung Internet 27+.
- Fallback u. a. iOS/iPadOS vor 18 (dort für jeden Browser, da alle WebKit
  nutzen). Kein Polyfill.
- In Stufe „Basis“ wird `data-vt` vor dem Aufruf gesetzt und nur von der
  eigenen Transition entfernt (3.5.2).

#### 3.5.2 `ScreenTransition`

```text
ScreenTransition
  level              'full' | 'basic' | 'none'
  enabled            level !== 'none' && testHooks.transitions !== false
  request(type)      merkt den Übergang vor; Start in einem Microtask
  pending            true zwischen Aufruf und updateCallbackDone
  current            eigene, noch laufende ViewTransition oder null
  skip(reason)       nur externe Abbrüche (3.5.6)
```

- **Erkennen und Anwenden sind getrennt.** Aufrufer ändern den logischen
  Zustand und rufen `request(type)`. Der Update-Callback ist immer
  `presenter.commit()`. `commit()` wendet den aktuellen Zielzustand
  verbindlich an – **auch während `pending`** (es ist ja der ausstehende
  Callback), fordert **nie** selbst eine Transition an und ist gegen
  Wiedereintritt geschützt (Flag `committing`).
- **Sammeln im selben Takt:** Mehrere `request()` im selben Task werden im
  Microtask zu einer Transition mit dem höchstpriorisierten Typ
  zusammengefasst (T7a vor T9).
- **Neue Anforderung während `pending`:** gleicher Typ → nichts tun, der
  Callback übernimmt den neuesten Zustand. Anderer Typ → die Transition per
  `skipTransition()` ohne Animation beenden; der Callback läuft laut
  Spezifikation trotzdem und wendet den neuesten Zustand an. Ein falscher
  Typ wird so nie animiert. Danach wird keine neue Transition für dieselbe
  Änderung gestartet.
- **Neue Anforderung während der Animation:** alte Transition
  `skipTransition()`, dann neue starten.
- **Idempotenz:** Weil `commit()` immer den neuesten Zustand herstellt,
  schadet ein nach `skipTransition()` noch laufender, veralteter Callback
  nicht.
- **Aufräumen nur durch den Eigentümer:** `finished.finally()` setzt
  `current = null` und entfernt `data-vt` nur, wenn `current` noch genau
  diese Transition ist.
- `ready`/`finished`-Ablehnungen werden abgefangen und protokolliert.

#### 3.5.3 Presenter für die C-Übergänge

Nur die Darstellung, die in T7a, T9 und T11 wechselt, läuft über
`presenter.commit()`:

- T7a: Overlay ausblenden, `showModal()` des Scores-Dialogs, Eingabeansicht.
- T9: Listen-/Eingabeansicht im Scores-Dialog, Titel.
- T11: `infoView.hidden`/`pageEl.hidden`, `document.title`, danach
  `runner.resize()` und Zeichnen, dann Fokus.

**Rekursionsschutz:** `resize()` und `draw()` rufen heute über
`sessionView.update()` wieder Präsentationscode auf. Innerhalb von
`commit()` wird das Zeichnen über eine Variante ohne Präsentationsschritt
ausgeführt (`renderer.draw()` direkt, bzw. `draw()` prüft `committing` und
überspringt `sessionView.update()`). Der nächste reguläre Frame setzt den
idempotenten Zustand ohnehin.

**Per-Frame-Sperre:** Während `pending` schreibt `updateRoundPanel()` das
Game-over-Overlay nicht, sonst stünde der Zielzustand bereits im alten
Snapshot.

**Fokus nach Anwendung:** `openEntry()` und `showView()` melden
`presenter.focusAfterApply(el)`; gesetzt wird am Ende von `commit()`
(im Fallback sofort). Die letzte Anmeldung gewinnt; das Ziel muss sichtbar
sein, sonst `gameEl`.

#### 3.5.4 Absichtsflag und Schließwege des Scores-Dialogs

Nur der Scores-Dialog wird verzögert geöffnet (T7a). Er erhält
`HighscoreView.isOpen` (synchron gesetzt) und eine `generation`, die bei
jedem Öffnen steigt.

| Schließweg | Behandlung |
|---|---|
| Back-/Cancel-Button, Save | `close()`: `isOpen = false`, `dialog.close()`, synchron `returnToAttract()` (wie heute) |
| Escape (`cancel`) | bereits abgefangen → `close()` |
| natives `close`-Ereignis | `onClose()` ignoriert es, wenn `dialog.open` **oder** `isOpen` gilt (Dialog wurde inzwischen neu geöffnet bzw. Öffnen ist vorgemerkt) oder die `generation` nicht zu der Instanz passt, die geschlossen wurde |
| `raiseModalDialogs()` | `skip('raise')`, `isOpen` bleibt; das verspätete `close` wird über `dialog.open` ignoriert (wie heute) |
| Öffnen vorgemerkt, dann Abbruch vor `commit()` | `commit()` liest `isOpen === false` und öffnet nicht |

`finishRound()` und `browser.pauseReasons()` prüfen `isOpen || dialog.open`
für diesen Dialog, damit weder doppelt geöffnet noch zu spät pausiert wird.
Settings, Goodbye und Install-Hilfe bleiben synchron (Mechanismus B).

#### 3.5.5 Ebenen, Namen pro Typ, Backdrop

Die Transition-Ebene liegt über der Seite; benannte Gruppen liegen über
`root`. Ein Backdrop in `root` dunkelt benannte Flächen darüber nicht ab.
Deshalb werden Namen **nur für den jeweiligen Typ** vergeben, etwa
`:active-view-transition-type(entry) #round-score { view-transition-name: result; }`
(und analog mit `[data-vt="entry"]`). Weil Typ bzw. `data-vt` vor dem
Erfassen gesetzt sind, gelten die Namen schon im alten Snapshot.

| Typ | Benannt | In `root` |
|---|---|---|
| `entry` (T7a) | `result` (`#round-score` → `#entry-result`), `sheet` (Scores-Dialog) | Welt, übriges Overlay, Backdrop |
| `forward`/`back` im Dialog (T9) | `scores-body` | alles andere, `root` ohne Animation |
| `help-forward`/`help-back` (T11) | – | alles (Seite ↔ iframe) |

- Welt, Panel und Touch-Steuerung sind in C-Übergängen **nie** benannt.
  Sie liegen in `root` unter dem Backdrop, der sie damit korrekt abdunkelt.
  Das ist möglich, weil das Spiel bei allen C-Übergängen pausiert bzw. nach
  der Todesszene steht – ein `root`-Crossfade erzeugt keine Geisterbilder.
- `root` wird pro Typ explizit gestaltet (nie der Browser-Standard).
- `::backdrop` gehört zu `root`; der `root`-Crossfade ist zugleich der
  Backdrop-Fade.

#### 3.5.6 Abbrüche und Input-Sicherheitsnetz

`skip()` nur bei **externen** Ereignissen: `resize`, `orientationchange`,
`screen.orientation` `change`, `fullscreenchange`, `visibilitychange`
(verborgen), Fensterfokus verloren, `raiseModalDialogs()`. Nie aus
`updatePause()`, `resize()` oder `commit()`.

Sicherheitsnetz: Ein `pointerdown`, dessen Ziel während einer laufenden
Transition `document.documentElement` ist, beendet die Transition per
`skipTransition()`. Das Ereignis selbst ist verloren (3.1), der nächste Tap
trifft aber sofort sein Ziel. Betroffen sind nur T7a, T9 und T11 bei
pausiertem Spiel.

## 4. Gestaltung der einzelnen Übergänge

Easing-Tokens:
`--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)`,
`--ease-in: cubic-bezier(0.4, 0, 1, 1)`,
`--ease-pop: cubic-bezier(0.34, 1.56, 0.64, 1)` (leichtes Überschwingen).

### T1 Laden → Attract (A)

`#round-panel`: Fade + 12 px nach oben, 320 ms `--ease-out`. START ohne
Verzögerung ab Deckkraft 0,6. Welt sofort sichtbar.

### T2 Attract-Slide wechseln (A)

- Alte Slide: Fade out + 16 px in Laufrichtung, 180 ms `--ease-in`
  (`data-leaving`, `inert`).
- Neue Slide: Fade in + 16 px aus Gegenrichtung, 260 ms `--ease-out`,
  60 ms Versatz. Rückwärts per Dot gespiegelt.
- Aktiver Dot: die vorhandene Breite 8 → 24 px als CSS-Transition (`width`
  an einem einzelnen kleinen Element ist vertretbar) bzw. `transform: scaleX`.
- START, Dots und Pause-Button bleiben unbewegt und jederzeit bedienbar.
- Attract pausiert oder Tab verborgen → sofort umschalten.

### T3 Highscore-Seite 1 ↔ 2 (A)

Crossfade der Liste, 200 ms; Zeilen optional 20 ms Stagger. Kein Weg.

### T4 Attract → Spiel (A, kritischster Übergang)

Vorbild: Nintendo-Startbildschirme und Chrome-Dino selbst – die Figur ist
schon da, das Menü räumt nur das Feld.

- `game.start()` und der erste Sprung laufen synchron im Input-Handler.
- `#attract-content`: `data-leaving`, Fade out + 12 px nach oben + Scale
  0,98, **160 ms** `--ease-in`; Taps fallen sofort zur Spielfläche durch.
- START: Scale 0,9 + Fade out, 140 ms (wirkt wie ein „Drücken“).
- Portrait-HUD `#hud-score`: Fade in 200 ms, 80 ms Versatz. Das Desktop-HUD
  wird im Canvas gezeichnet und erscheint mit der Welt (optionaler
  Canvas-Alpha-Anstieg in Phase 5).
- `#menu-controls` springt in die `controls-raised`-Position; optional eine
  FLIP-Animation (`transform`, 220 ms).
- Touch-Buttons: Fade in 160 ms; sofort bedienbar.
- Countdown bleibt im Canvas. Gesamtdauer ≤ 300 ms.

### T5 Spiel → Todesszene (A)

Trefferfeedback (Hit-Stop, Partikel) bleibt im Canvas. Das ganze
`#game-over-overlay` (Überschrift, Score, Feedback) erhält einen „Pop“:
Scale 0,85 → 1 + Fade, 220 ms `--ease-pop`, 120 ms `animation-delay`
(= `DEATH_HIT_MS`). Portrait-HUD und Touch-Buttons blenden 120–150 ms aus.
Pausiert das Spiel, pausiert die CSS-Animation mit
(`animation-play-state: paused` über die Pause-Klasse), damit Overlay und
eingefrorene Todesszene zusammenpassen.

### T5b Todesszene → Warten auf Qualifikation (A)

Overlay: Fade out + 8 px nach oben, 150 ms. Welt bleibt sichtbar.

### T6 Todesszene/Warten → Attract (A)

- Overlay (falls sichtbar): Fade out, 150 ms.
- `#attract-content`: Fade in + 16 px von unten, 280 ms `--ease-out`,
  60 ms Versatz.
- START: Scale 0,92 → 1, Deckkraft 0,6 → 1, 240 ms `--ease-pop`, ohne
  Verzögerung, sofort bedienbar und fokussiert (wie heute).

### T7a Todesszene → Namenseingabe (C, Score-Morph)

Vorbild: Arcade-Klassiker und Tetris Effect – die erreichte Zahl wandert in
die Eintragung.

- Typ `entry`, ein gemeinsamer Übergang mit dem Ende der Todesszene: Overlay
  aus und Dialog auf im selben `commit()`.
- `result`: `#round-score` morpht in `#entry-result`, 320 ms `--ease-out`.
- `sheet`: von unten 24 px + Fade, 260 ms. `root` (übriges Overlay, Welt,
  Backdrop) 200 ms Crossfade.
- Fokus auf die erste Picker-Spalte nach `commit()`.
- Der Dialog trägt während T7a die Klasse `no-motion`, damit seine eigene
  B-Animation nicht doppelt läuft.

### T7b Warten → Namenseingabe (B)

Keine Morph-Quelle mehr. Normaler Dialog-Eintritt wie T10, synchron.

### T8 Namenseingabe → Attract (B + A)

`close()` synchron wie heute; der Dialog tritt per B aus (24 px nach unten,
180 ms), das Attract-Panel tritt per A ein (wie T6). START ist sofort
bedienbar. Eintrag-Morph in die Highscore-Liste entfällt: Er bräuchte eine
dokumentweite VT genau in dem Moment, in dem START wieder bedienbar ist.
Ersatz (Phase 5): die neue Zeile im Highscore-Slide 600 ms hervorheben (A).

### T9 Highscore-Liste ↔ Eingabe im Dialog (C)

Typ `forward`/`back`: `scores-body` 20 px horizontal + Fade, 220/160 ms;
`root` ohne Animation.

### T10 Settings (B)

Öffnen: Desktop/Landscape Fade + Scale 0,96 → 1, 240 ms; Phone-Portrait
Bottom-Sheet 32 px von unten, 260 ms; Backdrop 200 ms. Schließen: Umkehr
160 ms `--ease-in` – auch bei nativem Escape.

### T11 Hilfe (`#info`) (C)

- `help-forward`: `root`-Old 24 px nach links + Fade auf 0,6, `root`-New
  von rechts 48 px + Fade, 280 ms. `help-back` gespiegelt, 220 ms.
- `showView()` setzt den logischen Zustand (Hash) und fordert an; `commit()`
  schaltet iframe/Seite, Titel, Resize, Zeichnen, Fokus.
- Die Hilfe ist `srcdoc` aus derselben Datei. Zu prüfen bleibt, ob WebKit
  den iframe-Inhalt im Snapshot erfasst; sonst dort nur Crossfade.

### T12 Goodbye (B)

Backdrop 400 ms Fade, Dialog Scale 0,94 → 1 + Fade, 360 ms. Statistikzeilen
40 ms Stagger (max. 6).

### T13 Goodbye → New session (B + A)

Dialog-Austritt 200 ms (B); Attract-Panel wie T1 (A), START sofort
bedienbar und fokussiert.

### T14 Install-Hilfe (B)

Wie T10 ohne Bottom-Sheet. Schließen auch durch `appinstalled` animiert.

## 5. Zeit- und Bewegungstabelle

| Nr. | Mech. | Austritt | Eintritt | Weg | Reduced Motion |
|---|---|---|---|---|---|
| T1 | A | – | 320 ms | 12 px ↑ | Fade 120 ms |
| T2 | A | 180 ms | 260 ms (+60) | 16 px ↔ | Fade 120 ms |
| T3 | A | 200 ms Crossfade | – | 0 | sofort |
| T4 | A | 160 ms | 200 ms (+80) | 12 px ↑ | sofort |
| T5 | A | 150 ms | 220 ms (+120) | Scale 0,85 | Fade 120 ms |
| T5b | A | 150 ms | – | 8 px ↑ | Fade 120 ms |
| T6 | A | 150 ms | 280 ms / START 240 ms | 16 px ↑ | Fade 120 ms |
| T7a | C | 200 ms | 320 ms Morph / 260 ms Dialog | 24 px ↑ | Fade 120 ms |
| T7b | B | – | 260 ms | 24 px ↑ | Fade 120 ms |
| T8 | B+A | 180 ms | wie T6 | 24 px ↓ | Fade 120 ms |
| T9 | C | 160 ms | 220 ms | 20 px ↔ | Fade 120 ms |
| T10 | B | 160 ms | 240–260 ms | Scale/32 px | Fade 120 ms |
| T11 | C | 220 ms | 280 ms | 24–48 px ↔ | Fade 120 ms |
| T12 | B | – | 360–400 ms | Scale 0,94 | Fade 120 ms |
| T13 | B+A | 200 ms | 320 ms | Scale 0,98 | Fade 120 ms |
| T14 | B | 160 ms | 240 ms | Scale 0,96 | Fade 120 ms |

Alle Werte als CSS-Custom-Properties an einer Stelle.

## 6. Bewusste Ausnahmen

| Vorgang | Grund | Stattdessen |
|---|---|---|
| Countdown 3‑2‑1‑GO | im Canvas, simulationsgetaktet | unverändert |
| Tag/Nacht | bereits kontinuierlich (`nightAlpha`) | unverändert |
| Coach-Hinweise, Turbo-HUD, Rekord | innerhalb der Runde | CSS-`opacity`-Transitions (150 ms) |
| Pause/Fortsetzen ohne Screenwechsel | sofortige Rückmeldung | unverändert |
| Orientierung/Resize | Layout-Reflow nie animieren | laufende A-Animationen beenden, C `skip()` |
| Fullscreen an/aus | Browser-Notiz, Maße ändern sich | wie Resize |
| `raiseModalDialogs()` | technisches Re-Open | `no-motion`, C `skip()` |
| Eintrag-Morph nach dem Speichern | bräuchte VT bei bedienbarem START | Hervorhebung der Zeile (A) |

## 7. Umsetzungsphasen

1. **Fundament:** CSS-Tokens und Reduced-Motion-Regeln; Hilfsfunktionen für
   A (`enter`, `leave` mit `data-leaving`, `inert`, Sicherheitsfrist,
   Abbruch); B-Grundregeln für alle Dialoge inkl. `no-motion`;
   `ScreenTransition` (drei Stufen, Sammeln, Typ-Regel, Token-Aufräumen),
   `presenter.commit()` mit Rekursionsschutz, `focusAfterApply`,
   `isOpen`/`generation` des Scores-Dialogs, externe `skip()`-Listener,
   Sicherheitsnetz; Test-Hooks `__dinoTest.transitions = false` und
   `__dinoTest.transitionDone()`.
   In dieser Phase laufen alle Übergänge **ohne sichtbare Animation**. Zu
   prüfen sind ausdrücklich beide C-Pfade: (a) sofortige Anwendung ohne VT
   (Fallback) und (b) asynchrone Anwendung über eine echte VT mit
   `animation: none`. Nur (b) deckt die neuen Timing-Probleme auf. Bestehende
   Tests müssen in beiden Pfaden grün sein.
2. **Kernschleife (A):** T4, T5, T5b, T6.
3. **Attract (A):** T1, T2, T3.
4. **Dialoge (B):** T7b, T8, T10, T12, T13, T14.
5. **View Transitions (C):** T7a, T9, T11.
6. **Feinschliff:** Highscore-Zeilen-Hervorhebung, Stagger, optionaler
   Canvas-HUD-Fade, FLIP für `#menu-controls`, Easing-Tuning auf Geräten.
7. **Auslieferung:** `BUILD` und PWA-Cache-Version erhöhen, `npm run build`,
   prüfen, dass CSSO/Terser `::view-transition-*`,
   `:active-view-transition-type()`, `@starting-style` und
   `allow-discrete` unverändert lassen; `progress.md` und dieses Dokument
   aktualisieren.

## 8. Validierung

Neuer Test `tests/screen-transitions.mjs [game.html]` (Chromium und
`DINO_BROWSER=webkit`, Highscore-API per `__dinoTest.highscoreApiUrl = null`).

**Hit-Testing (Regression zu 3.1):** isolierte Seite wie in 3.1; erwartet
`HTML` während einer dokumentweiten VT. Ändert ein Browser dieses
Verhalten, schlägt der Test fehl und der Plan wird neu bewertet.

**Input während A-/B-Übergängen** (vertrauenswürdige Maus-/Touch-Ereignisse,
normale rAF-Schleife):

- Tap auf START während T2/T3 und während des Eintritts in T6/T8/T13 startet
  die Runde im selben Takt.
- Tap auf die Spielfläche während T4 erreicht `InputController` (Ankunft:
  Event-Zähler bzw. Jump-Buffer). Spielreaktion getrennt und regelkonform:
  am Boden Sprung; in der Luft ohne Feder kein zweiter Sprung; mit Feder
  Luftsprung.
- Touch-Buttons während T4 bedienbar.
- Ein austretendes Element (`data-leaving`) erhält nie Fokus oder Klicks.

**Animationen laufen wirklich:** Für A/B enthält `el.getAnimations()` die
erwarteten Animationen; für C wird `transition.ready` erfüllt und
`document.getAnimations()` enthält `::view-transition-*`-Animationen mit
den erwarteten Namen. Zwischenzustände bei 50 % (`currentTime` setzen,
Screenshot, Deckkraft/Transform). Danach: kein `::view-transition`,
`current === null`, kein `data-vt`, kein `data-leaving`.

**Zustand, Fokus, Schließwege:**

- T7a vs. T7b mit sofortiger und verzögerter (positiver/negativer)
  Qualifikation; kein doppeltes `openEntry`.
- Escape im Namensdialog während T7a; Schließen vor `commit()`; verspätetes
  `close` nach erneutem Öffnen.
- Settings per Escape und Install-Hilfe per simuliertem `appinstalled`:
  animierter Austritt, Pause endet, kein Wiederöffnen.
- `raiseModalDialogs()` während eines offenen Dialogs: kein sichtbares
  Aus-/Einblenden.
- Fokus stets auf einem sichtbaren Element.
- Externer Resize/Fullscreen/Fokusverlust während jedes Mechanismus →
  Endlayout identisch zu heute.

**Latenz unter echtem Rendering:** normale rAF-Schleife, Zeit von
vertrauenswürdigem Input bis zum ersten Frame mit Sprungpose, je 30 Läufe
mit und ohne Übergänge; Median und p95 dürfen sich um höchstens einen Frame
unterscheiden. Desktop in Chromium/WebKit und auf den physischen Geräten.

**Aufrufformen:** Läufe mit simulierter Stufe „Basis“ (`types` entfernt)
und „Fallback“ (`startViewTransition` entfernt). Firefox-Verhalten für B
(ohne `overlay`) einmal manuell bzw. per Playwright-Firefox prüfen.

**Reduced Motion:** keine Translationen/Skalierungen, höchstens 120 ms Fade.

**Simulation unverändert:** gleiche Event-Folge und Scores mit und ohne
Übergänge bei manueller Schrittsteuerung.

Bestehende Tests setzen `__dinoTest.transitions = false` (schaltet A, B und
C ab), damit Screenshots und pixelgenaue Vergleiche deterministisch bleiben;
Toleranzen bleiben unverändert. Zusätzlich je ein Lauf von
`attract-screen.mjs` und `game-over-flow.mjs` mit aktivierten Übergängen.

Physische Geräte (Galaxy A53, Galaxy S10e): Frame-Zeiten während T2, T4,
T6, T7a; höchstens zwei Frames über 33 ms pro Übergang; Latenzmessung mit
vertrauenswürdigem Touch. Emulator- und Geräteergebnisse getrennt
berichten. Screenshots/Videos nach `output/transitions/`.

### 8.1 Ergebnisse der Umsetzung (2026-10-18)

Commits: `e3cbf87` Fundament, `e10d91b` Kernschleife, `ea05e75` Attract,
`79d4467` Dialoge, `623defd` View Transitions, `5e98279` Feinschliff, danach
die Auslieferung (Build `2026-10-18.4`, Cache `dino-run-v13`).

**Desktop (Playwright, Chromium und WebKit 26.5):** Nach jeder Phase liefen
game-contract, architecture, attract-screen, game-over-flow, jump-feather,
shield-bubble, volume-controls und theme-songs mit abgeschalteten Übergängen
sowie `tests/screen-transitions.mjs` (85 Prüfungen) grün; dazu
attract-screen und game-over-flow mit `DINO_TRANSITIONS=1`. Phase 1 lief
zusätzlich ohne `startViewTransition` (Fallback) und mit echter VT bei
`animation: none`. Auslieferung: `tests/release.mjs` vergleicht in beiden
Engines 52 Szenen pixelgenau gleich, und `screen-transitions.mjs` gegen
`release/dino.html` besteht in beiden Engines. CSSO/Terser erhalten
`::view-transition-*`, `:active-view-transition-type()`, `@starting-style`,
`allow-discrete`, `overlay`, `@supports (overlay: auto)` und alle 14
`motion-`-Keyframes. Toleranzen sind unverändert.

**Physisches Gerät (Galaxy S10e SM-G970F, Chrome 155.0.8059.81, kein
Emulator):** Nach den Phasen 2, 4 und 5 liefen `game-over-flow.mjs --android`
und `tests/android-transitions.mjs` über die sichere USB-Vorschau und das
begrenzte CDP-Relay. Pro Übergang (T2, T4, T5, T6, T7a) traten höchstens ein
Frame über 33 ms auf (Grenze zwei), Einzelwerte bis 50 ms bei T2/T7a. Die
START-Latenz bei 30 Läufen mit/ohne Übergänge unterscheidet sich im Median
um ≤ 5 ms; beim p95 liegt sie mit bis zu 16 ms knapp innerhalb eines Frames
(Querformat). Rotation zurückgesetzt (auto 1, user 0), nur eigene Tabs und
Helfer geschlossen. Berichte: `output/transitions/device-phase2`,
`device-phase4`, `device-phase5`.

**Physisches Gerät (Galaxy A53 SM-A536B, Chrome 155.0.8059.79, kein
Emulator), nach Phase 7 mit `release/dino.html`:**
`game-over-flow.mjs --android` besteht in beiden Orientierungen. Bei
`android-transitions.mjs` ist das Frame-Kriterium **nicht erfüllt, aber nicht
durch die Übergänge verursacht**:

- Im ersten Lauf hatte T4 im Hochformat (320×581) drei Frames mit 33 ms; in
  der Baseline hatte T2 ebenfalls drei. Das Querformat lief danach nicht
  mehr.
- In einer Wiederholung bestand das Hochformat. Im Querformat (637×234)
  lagen über der Grenze mit/ohne Übergänge: T2 5/7, T4 4/4, T6 4/3. T5 hatte
  0/0, T7a 1/0.

Fast alle langsamen Frames sind genau ein verworfener VSync (33 ms). Die
Baseline ist genauso oft oder öfter betroffen. Das Gerät erreicht die Grenze
in diesem Zustand also schon ohne Übergänge nicht. Die START-Latenz mit/ohne
Übergänge unterscheidet sich in allen Läufen um höchstens einen Frame:

| Lauf | mit Übergängen (Median / p95) | ohne (Median / p95) |
|---|---|---|
| Hochformat | 40,8 / 59,2 ms | 34,8 / 64,2 ms |
| Hochformat, Wiederholung | 42,0 / 65,4 ms | 40,7 / 48,2 ms |
| Querformat | 53,9 / 82,0 ms | 55,4 / 89,8 ms |

Test und Grenzwert sind unverändert. Rotation zurückgesetzt (auto 1, user 0),
nur eigene Tabs, Vorschau, Relay und Bridges beendet. Berichte:
`output/transitions/device-a53`, `device-a53-rerun`.

**Engine-Befunde:**

- WebKit 26.5 unterstützt `overlay` nicht: Dialoge öffnen animiert, schließen
  aber sofort, wie für Firefox vorgesehen. Der Test prüft das
  `overlay`-abhängig.
- WebKit erfasst den Hilfe-iframe im neuen Snapshot (T11). Der
  Crossfade-Fallback aus Abschnitt 9 war nicht nötig.
- Die Latenz in WebKit headless (ohne Compositor/VSync) wird nur als
  Richtwert protokolliert (`assessed: false`); maßgeblich ist das Gerät. Die
  Chromium-Latenz liegt innerhalb eines Frames.
- WebKit meldet für `::backdrop` den Pseudo-Element-Namen `''`; der Test
  normalisiert das.
- Firefox 158.0 (Desktop, B ohne `overlay`) einmal manuell geprüft, nicht per
  Playwright: Release `2026-10-18.4` über die sichere Vorschau (8877, ohne
  Live-API). Settings, Namenseingabe (Abbrechen und Speichern), Goodbye mit
  New session und Hilfe hin und zurück liefen einwandfrei.

**Testanpassungen:** Bestehende Tests schalten die Übergänge per
Init-Skript ab, außer bei `DINO_TRANSITIONS=1`. Die beiden
`transitionDone()`-Wartepunkte in `attract-screen.mjs` (vor der Prüfung,
dass START unsichtbar ist, und vor der Power-up-Geometrie) gelten nur bei
`DINO_TRANSITIONS=1`.

**Abweichungen vom Plan:**

- T4 hält das austretende Menü absolut an seiner Position
  (`#stage.attract-leaving`), statt es im Fluss zu lassen.
- T1 und T13 blenden START nur über die Deckkraft ein (`motion-dim-in`),
  ohne Skalierung, damit die Geometrie von START gleich bleibt.
- Nach T13 bleibt der Fokus auf der Spielfläche, nicht auf START.
- Das Portrait-HUD bleibt während der Todesszene sichtbar.
- Der optionale Canvas-HUD-Fade und FLIP für `#menu-controls` sind
  weggelassen.

**Gefundener und behobener Fehler (Phase 5):** Qualifiziert sich ein Score
spät, während das T5b-Ergebnis noch ausblendet, trugen zwei Elemente den
Transition-Namen `result`. Jetzt beendet `commit()` den laufenden Austritt,
und die Namen gelten nur für `#scores[open]`. Regressionstests sind
ergänzt.

## 9. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Dokumentweite VT schluckt Pointer-Input | VT nur bei pausiertem Spiel (3.2); Sicherheitsnetz (3.5.6); Regressionstest |
| Veralteter Update-Callback nach `skipTransition()` | idempotentes `commit()` (3.5.2) |
| Ältere Transition räumt neuere auf | Token-Prüfung |
| Falscher Typ nach Zusammenfassen | anderer Typ → ohne Animation beenden (3.5.2) |
| Rekursion `commit()` → `draw()` → Präsentation | `committing`-Flag (3.5.3) |
| Scores-Dialog öffnet doppelt / schließt falsche Instanz | `isOpen`, `generation` (3.5.4) |
| Backdrop dunkelt benannte Flächen nicht ab | Namen nur pro Typ, Welt/Panel nie benannt (3.5.5) |
| Optionsform in Chrome < 125 / Safari < 18.2 / Firefox < 147 | dreistufige Erkennung |
| Austretende Elemente fangen Taps | `inert`, `pointer-events: none` |
| Firefox ohne `overlay` | Dialog schließt ohne Austrittsanimation (akzeptiert) |
| WebKit erfasst iframe anders | Crossfade-Fallback in T11 |
| Minifier verändert neue Syntax | `tests/release.mjs` |
| Screenshot-Tests werden flaky | Test-Hook schaltet alle Übergänge ab |
