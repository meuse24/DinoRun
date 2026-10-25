# Installationshinweis (PWA)

Umgesetzt in Build `2026-10-25.11`, Cache `dino-run-v73`.

## Spielervertrag

- Der Button **Install app** im Startmenü bleibt der dauerhafte Einstieg. Er ist
  ausgeblendet in der installierten App, nach erfolgreicher Installation und
  außerhalb von HTTPS/localhost.
- Zusätzlich erscheint nach der **zweiten beendeten Runde** (Rückkehr ins
  Startmenü, Stone-Jaw-Training zählt nicht) eine kleine, **nicht modale** Karte
  „Play Dino Run as an app“ mit **Install** und **Not now**. Sie liegt unten im
  Vorschaubereich und verdeckt weder START, Münzen, Touch-Steuerung noch den
  Install-Button (im flachen Landscape sitzt sie direkt darüber). Sie nimmt keinen
  Fokus und blockiert keine Eingabe; START blendet sie aus.
- Höchstens einmal pro Seitenaufruf. **Not now** pausiert sie für 14 Tage, ein
  zweites Not now beendet sie dauerhaft. **Install** öffnet den nativen Dialog
  (Chromium) bzw. die vorhandene Anleitung (iOS); ein abgelehnter Dialog zählt wie
  Not now.
- Nur wenn Installieren tatsächlich möglich ist: Chromium mit
  `beforeinstallprompt` oder iOS-Safari (Anleitung). Nicht hinter offenen Dialogen,
  nicht wenn `getInstalledRelatedApps()` eine installierte Kopie meldet.

Begründung: `prompt()` braucht eine Nutzeraktion, ein automatisches Overlay wäre
nur ein zusätzlicher Schritt. Ein Hinweis nach erlebtem Spielspaß an einer
natürlichen Pause folgt web.dev „Patterns for promoting PWA installation“.

## Zustand

`localStorage['dino-install-nudge']` = `{ rounds, dismissed, until }`. Speicherfehler
sind still; der Hinweis erscheint dann höchstens einmal pro Seitenaufruf.

## Prüfung

`node tests/install-nudge.mjs [game.html]` (Chromium und WebKit): Anzeige erst nach
der zweiten Runde, Lage ohne Überdeckung in Desktop, Portrait, Landscape, flachem
Landscape und Tablet, Touch-Größe, kein Fokusdiebstahl, START blendet aus, einmal
pro Seite, 14-Tage-Pause und dauerhaftes Ende, nativer Prompt, kein Hinweis ohne
Installationsweg, hinter Dialogen oder in anderen Suiten, Dunkelmodus.
Andere Browser-Suiten sehen den Hinweis nie (`__dinoTest.installNudge` fehlt).
