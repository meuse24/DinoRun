# Dino Run

Canvas-2D-Spiel in einer eigenständig spielbaren HTML-Datei. Die lesbare Quelle
ist [dino.html](dino.html); zum Offline-Spielen kann sie direkt geöffnet werden.
Musikdateien sind optional. Online-Highscores und PWA-Installation benötigen
zusätzlich die gehosteten Dateien.

## Lokal starten

Mit Node.js ab Version 22:

```powershell
node dev-server.js
```

Danach `http://127.0.0.1:8765/dino.html` öffnen. Dieser Vorschau-Server leitet
Highscore-Anfragen an die Live-API weiter und führt kein lokales PHP aus.
Die automatischen Browserprüfungen verwenden isolierte Fixtures; siehe
[Repository-Regeln und Testbefehle](AGENTS.md).

## Projektaufbau

- `dino.html`: Oberfläche, Darstellung und Spielsimulation.
- `service-worker.js`, `manifest.webmanifest`, Icons: gehostete Installation.
- `assets/images/`, `assets/audio/`: Bilder, Icons und optionale MP3s.
- `asset-sources/audio/`: lokale WAV-Quelldatei, von Git ausgeschlossen.
- `highscores*.php`, `admin.php`, `score-console.php`: PHP-Backend (PHP 7.4+).
- `dino-android/`: Android Trusted Web Activity.
- `tests/`: Regressionen; `output/`: lokale Testberichte und Bilder.
- `scripts/`, `release/`: optionale Auslieferungswerkzeuge und generierte Dateien.

[Dokumentationsindex](doc/README.md) · [Build und Release](doc/RELEASE.md) ·
[Android](doc/ANDROID.md) · [Highscore-Verwaltung](doc/ADMIN.md) ·
[Architektur](doc/ARCHITECTURE.md)

Tests: `npm ci`, einmalig `npx playwright install chromium webkit`, danach
`npm test`. Weitere Gruppen und Konfiguration: [Tests](doc/TESTING.md).
