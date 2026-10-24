# Ausgelieferte Medien

- `images/`: PNG-Icons, Vorschaubild und SVG.

Die beiden optionalen MP3-Menütitel liegen direkt neben `../dino.html` im
Repository-Stamm, nicht unter `assets/`.

`npm run deploy` lädt diese Dateien und das Manifest vor HTML und Worker hoch.
Die WAV-Quelle liegt lokal unter `../asset-sources/audio/` und bleibt Git-ignoriert.
Native Android-Bilder bleiben in `dino-android/app/src/main/res/`.

Eine einzelne `dino.html` bleibt ohne diese Medien offline spielbar. Für
optionale Musik beim Kopieren die MP3-Dateien direkt neben die HTML-Datei legen.
