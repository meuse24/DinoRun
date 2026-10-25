# Exit-Button im Goodbye-Dialog

Umgesetzt in Build `2026-10-25.9`, Cache `dino-run-v71`.

## Spielervertrag

- Der Goodbye-Dialog („Bye-bye, Dino!“) zeigt unter **New session** die zweite
  Aktion **Exit game**. New session bleibt die Standardaktion; im flachen
  Landscape stehen beide Knöpfe nebeneinander.
- Exit ruft `window.close()` auf. Zu diesem Zeitpunkt ist das Spiel bereits
  pausiert, stumm, aus dem Vollbild und der Rekord gespeichert (`Runner.quit()`).
  Es gibt keinen `beforeunload`-Handler, daher fragt kein Browser nach.
- Lehnt der Browser das Schließen ab, bleibt der Dialog offen und ein
  `role="status"`-Hinweis nennt den Ausweg der Plattform: `Ctrl+W`/`⌘W` am
  Desktop (Tab oder App-Fenster), Tab-Übersicht bzw. „zuletzt verwendete Apps“
  auf Android und Wischgeste/Tab-Übersicht auf iOS. Der Hinweis wird bei Bedarf in
  den sichtbaren Bereich gescrollt; New session funktioniert weiter.

## Plattformregel

Browser schließen per Skript nur Fenster, die per Skript geöffnet wurden oder deren
Tab genau **einen** History-Eintrag hat (HTML „script-closable“; Chromium
`DOMWindow::Close`, Firefox und WebKit analog). Erfolgreiche Aufrufe setzen
`window.closed` sofort auf `true`; Ablehnungen sind still. Darauf beruht die
Hinweis-Entscheidung.

- Frischer Browser-Tab, installierte Desktop-PWA, Android-TWA: Start mit
  History-Länge 1, Exit schließt.
- Tab mit vorheriger Navigation (anderer Seite, Help im Browser-Modus): Hinweis.
- iOS-Home-Screen-Apps ignorieren `window.close()`: Hinweis.

## Help ohne History-Eintrag im App-Modus

Help legte bisher immer per `pushState` einen Eintrag an, damit Zurück den Guide
schließt. Danach war die History-Länge 2 und Exit in der App wirkungslos.

- Im App-Modus (`display-mode` standalone/fullscreen beim Start oder
  `navigator.standalone`) mit `CloseWatcher`-Unterstützung nutzt Help
  `replaceState`; die History bleibt bei 1.
- System-Zurück wird auf Android an den **fokussierten Frame** geleitet. Der
  Fokus liegt im Help-iframe, daher erreicht Zurück den CloseWatcher des modalen
  Dialogs nicht (gemessen: Chrome verließ den Tab). Deshalb erhält das same-origin
  Help-iframe einen eigenen `CloseWatcher`, solange Help sichtbar ist.
- Schließt der Browser den Dialog direkt (wiederholtes Zurück/Escape ohne
  Nutzeraktivierung, nicht abbrechbares `cancel`), stellt das `close`-Event die
  Ansicht einmalig wieder her. Das verspätete `close` der eigenen
  `applyView()`-Schließung wird ignoriert, weil der Guide dann bereits versteckt
  ist.
- Browser-Modus und Browser ohne `CloseWatcher` behalten `pushState` und damit die
  Browser-Zurück-Taste für Help.

## Prüfung

`node tests/exit-game.mjs [game.html]` (Chromium): startet Chromium direkt mit der
Spiel-URL, weil Playwright-Tabs einen zusätzlichen `about:blank`-Eintrag haben.
Prüft das echte Schließen ohne Dialog im frischen Tab, den Hinweis nach Help-History
samt New session, Help ohne History-Eintrag im simulierten App-Modus inklusive
direkter Dialogschließung und Exit, genau einen Rückschritt im Browser-Modus sowie
die Goodbye-Aktionen in Desktop, Portrait 320×640 und Landscape 663×234.

### Gerätenachweis 2026-10-25 (Samsung RF8MB125SXA, Chrome 155)

- Installierte TWA `info.meuse24.dinorun` (Produktionsstand .8): Start mit
  History 1 und `display-mode: fullscreen`; `window.close()` beendet die
  CustomTabActivity, Android kehrt zur vorherigen App zurück. Nach Help und Zurück
  (alter `pushState`-Weg) ist die History 2 und `window.close()` wirkungslos.
- Neuer Code in Chrome-Tab über `adb reverse`, App-Modus per `matchMedia`-Stub:
  echter Touch auf Help und echte Zurück-Taste schließen Help dreimal in Folge,
  Chrome bleibt offen, History bleibt 1. Echter Touch auf Exit schließt den Tab.
- Ohne iframe-Watcher verließ Zurück Chrome; Settings (ohne iframe) schloss per
  `cancel` korrekt. Browser-Modus: Hinweis „Close this tab in the browser tab
  overview.“ sichtbar. Das erste Zurück nach dem allerersten Help-Öffnen im
  Browser-Modus wird in Baseline .8 und im neuen Stand gleichermaßen verschluckt.
- Die TWA selbst lädt die Produktionsseite; der neue Help-Weg in der echten TWA
  ist erst nach einem Deployment prüfbar.
