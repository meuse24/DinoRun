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
   Nur das kleine Logo läuft dauerhaft, ausschließlich im sichtbaren,
   unpausierten Startmenü. Die Vorschau-Pause stoppt es ebenfalls.
4. Barrierefreiheit: bei prefers-reduced-motion keine neuen Effekte.
   Der bestehende Testschalter transitions=false schaltet sie mit ab.
   Technisches Neuöffnen von Dialogen darf die Überschrift nicht neu starten.
5. Prüfung: kurze Browser-Sichtprüfung bei Desktop und Telefonformaten,
   vorhandene Skill-/Übergangs-/Game-over-Prüfungen, physisches Android in
   beiden Orientierungen, anschließend Release bauen und vergleichen.

Die Bewegung ist bewusst klein (2–10 px) und kurz (ca. 240–360 ms).
SVG-Pfadanimationen sind hier nicht nötig: Das kompakte Logo bleibt auch
während seines Eintritts sofort erkennbar. CSS ist nicht kostenlos;
transform/opacity vermeiden aber Layoutarbeit pro Frame. Grundlagen:
[MDN: Animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance),
[MDN: Reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion).

## Umsetzung und Prüfung

Folgt nach Umsetzung. Screenshots und Berichte: output/heading-motion/.
