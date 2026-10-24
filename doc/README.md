# Dokumentation

Stand der Bereinigung: 2026-10-25; abgeglichen mit lokalem Build
`2026-10-25.1` und Worker-Cache `dino-run-v63`.
Der Index beschreibt Repository-Code, Skripte und Verweise. Datierte Browser-
und Geräteergebnisse stehen im Arbeitsprotokoll; sie bestätigen keinen aktuell
abgefragten Produktionsstand.

## Einstieg und Betrieb

- [Repository-Übersicht](../README.md): lokal starten und Projektaufbau.
- [Release](RELEASE.md): Build, Minifizierung, Prüfung und Veröffentlichung.
- [Hosted Updates](UPDATES.md): Cache-Versionen, Zustimmung und Offline-Verhalten.
- [Android](ANDROID.md): TWA, Werkzeuge, Signierung und Geräteprüfung.
- [Highscore-Verwaltung](ADMIN.md): Einrichtung, Moderation und Sicherungen.
- [Architektur](ARCHITECTURE.md): Zuständigkeiten und Simulationsreihenfolge.
- [Tests](TESTING.md): Installation, Testgruppen und gemeinsame Testhilfen.
- [Performance](PERFORMANCE.md): aktueller Renderpfad, Caches und Messbefehle.
- [Arbeitsprotokoll](progress.md): letzter Implementierungsstand und neue Arbeiten.

## Spielverhalten und gezielte Prüfungen

| Thema | Dokument |
| --- | --- |
| Startmenü, Demo und Vorschau | [ATTRACT.md](ATTRACT.md) |
| Virtuelle Münzen | [COINS.md](COINS.md) |
| Leben und Zusatzleben | [LIVES.md](LIVES.md) |
| Levelbonus und Beeren-Rückblick | [LEVEL-BONUS.md](LEVEL-BONUS.md) |
| Feder / Luftsprung; Browser- und USB-Testaufbau | [FEATHER.md](FEATHER.md) |
| Schild | [SHIELD.md](SHIELD.md) |
| Stone Jaw und Training | [BOSS.md](BOSS.md) |
| Glühbeere | [GLOW-BERRY.md](GLOW-BERRY.md) |
| Rundenende und Namenseingabe | [GAMEOVER.md](GAMEOVER.md) |
| Arcade-Darstellung und Effekte | [ARCADE.md](ARCADE.md) |
| Überschriften | [HEADING-MOTION.md](HEADING-MOTION.md) |
| Screen-Übergänge und Menü-Overlays | [TRANSITIONS.md](TRANSITIONS.md) |
| Musik und Lautstärke | [VOLUME.md](VOLUME.md) |

Die Feature-Dokumente behalten datierte Testergebnisse. Ein älterer Testnachweis
ist keine Prüfung des heutigen Builds. Für Befehle gilt das Repository als
Arbeitsverzeichnis. `output/` enthält lokale, nicht versionierte Nachweise;
Verweise darauf sind keine mitgelieferten Dateien.

## Archiv und Pflege

[Archivübersicht](archive/README.md): abgeschlossene Pläne, Reviews, frühere
Release-Stände und das bisherige Gesamtprotokoll. Historische Empfehlungen
können durch spätere Implementierungen ersetzt sein.

Aktuelle Regeln und wiederholbare Befehle gehören in die jeweilige Fachanleitung.
Buildbezogene Ergebnisse gehören ins Arbeitsprotokoll; lange abgeschlossene
Serien ins Archiv. Größen und Hashes kommen aus `release/size-report.json`.
Die doppelte Anleitung `MINIFIZIERUNG.md` wurde in [RELEASE.md](RELEASE.md)
zusammengeführt und entfernt.
