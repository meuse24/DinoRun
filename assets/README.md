# Ausgelieferte Medien

- `images/`: PNG-Icons, Vorschaubild und SVG.
- `audio/`: die beiden optionalen MP3-Menütitel.

`npm run deploy` lädt diese Dateien und das Manifest vor HTML und Worker hoch.
Die WAV-Quelle liegt lokal unter `../asset-sources/audio/` und bleibt Git-ignoriert.
Native Android-Bilder bleiben in `dino-android/app/src/main/res/`.

Eine einzelne `dino.html` bleibt ohne diese Medien offline spielbar. Für
optionale Musik beim Kopieren die relative Struktur `assets/audio/` beibehalten.
