# Arbeitsprotokoll

Original prompt: ja mach und ordne die dateien und ändere die verweise

Das vollständige bisherige Protokoll liegt im
[Archiv bis 2026-10-24](archive/progress-through-2026-10-24.md).
Hier bleiben der letzte Implementierungsstand und neue Arbeiten sichtbar.
Datierte Ergebnisse beziehen sich auf den jeweils genannten Build.

## 2026-10-25: Kräftigerer Logo-Bass (Build .5 / Cache v67)

- Nutzerwunsch: deutlich mehr Bums. Maximale Logo-Skalierung von 1,18 auf 1,65
  erhöht (2,7-fache Fläche am Peak); quadratische Reaktion betont starke Schläge
  gegenüber leiseren Passagen. 45-ms-Ease-out für einen schnellen Anschlag und
  kurze Nachbewegung. Rechte Logokante verankert, damit DINO frei bleibt.
- Unveränderte Bassdaten und Medienuhr, keine zusätzlichen Timer, Audioknoten,
  Layoutabfragen oder Effekte. Reduced Motion/Effektschalter behalten ihr Verhalten.
- Logo-Suite prüft die neue Peak-Stärke und Titelabstand bei maximaler Skalierung
  in Desktop, 320px-Hochformat und Querformat. Chromium-Quelle bestanden;
  Screenshots visuell geprüft. Skill-Client gegen Quelle bestanden und Gameplay-
  Bild/Zustand geprüft. Logo-Suite auch gegen Release in Chromium sowie Quelle
  in WebKit bestanden (dort nur deterministische Medien-/DOM-Fälle). Attract-Suite
  mit zwölf Layouts bestanden. Release neu gebaut, Syntax und diff --check sauber.
  Keine Veröffentlichung oder physische Geräteprüfung.

## 2026-10-25: MP3s zurück neben die HTML (Build .4 / Cache v66)

- Beide MP3s auf Nutzerwunsch aus assets/audio/ in den Repository-Stamm
  verschoben, direkt neben dino.html. SHA-256 vor/nach dem Verschieben identisch;
  leeren Audioordner entfernt. Bilder und WAV-Originale behalten ihre Orte.
- Spielpfade, Worker-Precache/Range-Handling, gemeinsame Hosting-/Deploymentliste,
  Audio-/Android-Fixtures, Bassdaten-Generator, AGENTS.md und aktuelle Anleitungen
  angepasst. Historische Berichte behalten ihre damaligen Pfade.
- Generator am neuen Ort geprüft: beide eingebetteten Basshüllkurven unverändert.
  Build .4 mit Cache v66 neu erzeugt; keine Veröffentlichung.
- Chromium: npm test (Assets/Deploymentliste, 12 Architektur-, 7 Lifecycle-Fälle),
  Theme-Songs gegen Quelle/Release (echte MP3s, Offline/Byte-Ranges), Logo-Puls,
  elf Volume-Gruppen inklusive DSP und installierter Skill-Client bestanden.
  Zusätzliche Prüfung für beide MP3s direkt neben einer kopierten file://-HTML
  in die bestehende Theme-Song-Suite aufgenommen; gegen Quelle und Release
  bestanden. Skill-Gameplay-Bild/Zustand angesehen, Syntaxchecks aller elf
  betroffenen JS-Werkzeuge/Worker und git diff --check bestanden.

## 2026-10-25: M24 im Songrhythmus (Build .3 / Cache v65)

- Auftrag: sichtbares M24-Logo passend zum Theme-Song pulsieren lassen, mit
  Recherche professioneller Browsertechnik und geringem Ressourcenverbrauch.
  Skill develop-web-game angewandt; keine Subagents, keine Veröffentlichung.
- MDN (AnalyserNode/currentTime) und web.dev (Animation/Compositing) recherchiert.
  Für die zwei festen MP3s Basshüllkurven einmalig mit ffmpeg vorgebacken:
  45–180 Hz, 30 Hz, 16 Stufen, zusammen 7.170 Zeichen. Reproduzierbarer Generator
  unter scripts/bake-logo-pulse.mjs; keine neue Laufzeitabhängigkeit.
- MusicLogoPulse nutzt Medienuhr und vorhandenen Draw-Aufruf. Maximal 18 %
  SVG-Skalierung, kurze Transform-Interpolation, kein FFT/AudioContext/Timer,
  keine Geometrieabfragen; identische Werte schreiben nicht ins DOM. Musikrouting
  unverändert. Stopp bei Pause/Buffering/Fehler/Mute, verstecktem Menü, Gameplay,
  Reduced Motion oder deaktivierten Arcade-Effekten; Medienereignisse setzen
  sofort zurück. Schweben pausiert während des Pulsierens.
- Neue Suite tests/music-logo.mjs in test:features: echte Chromium-Wiedergabe
  beider MP3s erzeugt unterschiedliche Skalen; deterministische Phasen/Seeks,
  Grenzen, Stopps/Erholung, Reduced Motion/Effekte, unveränderte DOM-Werte und
  drei Layouts bestanden. Screenshots visuell geprüft. Kein physischer Gerätetest.
- Chromium: npm test (Assets, 12 Architektur-/7 Lifecycle-Szenarien), alle elf
  Volume-Gruppen inklusive Offline-DSP, echte Theme-Songs/Offline/Range-Requests,
  Heading-Motion und installierter Skill-Client bestanden; Gameplay-Bild/Zustand
  geprüft.
- Release gebaut: 339.761 Bytes, gzip 116.925 Bytes (+2.634 gegenüber .2),
  Brotli 104.499 Bytes (+2.135). Chromium: 64 Source-/Release-Szenen pixelidentisch;
  neue Logo-Suite und echte MP3-/Offline-/Range-Prüfung auch gegen Release bestanden.
  WebKit: Logo-Suite gegen Quelle und Release, elf Volume-Gruppen und Heading-
  Motion bestanden. Seine bekannte fehlende MP3-/DSP-Unterstützung wird nicht
  als Audioprüfung gewertet. Syntaxprüfungen und git diff --check bestanden.
  Nachweise: output/music-logo/{source,release}, output/theme-songs,
  output/refactoring/skill-client und Source-/Release-Vergleich. Keine offenen
  Implementierungsarbeiten; physische Android-Leistungs-/Hörprüfung nicht erfolgt.

## 2026-10-24: Scope-preserving simulation refactoring

- User requested implementing the review recommendation. Applied develop-web-game; no agents. Split Game.update (157 -> 37 lines) into playing/world/pickup phases and separate obstacle/boss collision methods. Preserve statement/event order, fixed-step semantics, random consumption and milestone-before-contact behavior.
- Feather/Shield share swept collection geometry and spawn-clearance helpers. Their original standing bounds, pickup sizes, asymmetric spawn gaps, reset/charge and timer rules remain explicit. No inheritance framework or runtime files. Build .12/cache v62; saved pre-change HTML under output/refactoring-2026-10-24/baseline.html.
- Chromium 151 and WebKit 26.5: architecture (12), game-contract (7), jump-feather, shield-bubble, lives, level-bonus, rock-boss (8), rock-training and glow-berry pass. Chromium release comparison: 64 source/release scenes pixel-identical; installed skill client passes source and release, gameplay state/screenshots inspected.
- Additional baseline checks: expanded Game.update AST matches the original statement tree; 24,000 VM pickup cases match results/state/timers. Chromium render-cache baseline comparison passes 70 pixel-identical scenes and five matching 12,000-frame simulation/effect traces, with bounded/reused caches and no browser errors. Build .12 release is 328911 bytes (27 bytes above .11).
- User requested a phone check during final validation. Physical S10e (SM-G970F, Android12, Chrome155.0.8059.84), generated release hash7fb63e6c..., trusted touch and normal rAF: android-feather passes portrait/landscape controls, charge/air jump/duck/pause, Help, restart/name and real worker-offline reload. android-rock-boss passes seven cases per orientation (three approach speeds, pause/rotation, floor/roof hits, one shield charge and reduced motion). android-level-bonus passes portrait/both landscapes with real audio signal, pause/rotate/resume, bonus accounting and life milestone. Screenshots inspected. Own test origins cleared, bridges removed and original rotation auto1/user1 restored/read back.
- Additional physical shield-collection coverage uses android-attract. Updated its stale three-card expectation (baseline .11 already has four), waited for existing menu transitions/resting Start state, and measured bounds against the fractional visualViewport rather than integer innerWidth (673.333 vs673 CSS pixels), retaining a 0.01 CSS-pixel rounding epsilon. No game/UI change for these harness fixes. Final full portrait/landscape rerun passes: all three panels, six trusted starts, real shield collection, single cactus protection and subsequent unprotected bird death; 19 trusted touches, no browser errors. Shield screenshot inspected. Both own origins cleared, bridges removed, rotation auto1/user1 restored and verified. Scoped relay failed before game initialization; direct CDP works. No deployment.

- Refactoring complete; no remaining implementation TODOs. No commit/deployment requested or performed. Optional Runner feedback/Renderer decomposition remains a separate future maintenance step.

## 2026-10-25: Dokumentation prüfen und aufräumen

- Dokumentation gegen lokalen Build 2026-10-24.12/cache v62, Release-Bericht,
  Build-/Deploy-Skripte und Testdateien geprüft. Vorhandene lokale Änderungen
  erhalten; keine Spiel- oder Release-Datei für diese Arbeit geändert.
- Repository-Einstieg und Dokumentationsindex ergänzt. Abgeschlossene Reviews,
  Pläne und lange Release-/Animations-/Arbeitsprotokolle ins Archiv verschoben;
  aktuelle Performance-Regeln und Messbefehle zusammengefasst.
- Doppelte MINIFIZIERUNG.md nach Übernahme der wichtigen Build-Optionen entfernt.
  Veraltete Schild-/Lebensregeln, Berry-Scoreformel und Vorschaukarten korrigiert.
- Prüfung am Repository; keine neue Browser-/Gerätemessung oder Veröffentlichung.
- Abschlussprüfung: 36 Markdown-Dateien, 138 relative Dateilinks ohne fehlendes
  Ziel; alle dokumentierten Node-/PHP-Skriptpfade vorhanden. Quell-/Release-Hashes
  stimmen mit dem vorhandenen Größenbericht überein; git diff --check bestanden.
  Lokaler Prüfbericht: output/doc-audit-report.json.

## 2026-10-25: Testwerkzeuge und Ausgabedateien konsolidieren

- 160 bisher versionierte Dateien unter output/ (15.847.352 Bytes) aus dem
  Git-Index entfernt. Alle Dateien bleiben lokal erhalten; .gitignore schließt
  neue und alte Testausgaben aus. Keine Historie umgeschrieben, kein Commit.
- Playwright 1.62.1 als feste lokale Entwicklungsabhängigkeit aufgenommen.
  40 Testskripte verwenden tests/helpers/playwright.mjs; die fünf eingebauten
  Pacman-Pfade entfallen. Explizite DINO_PLAYWRIGHT-Overrides bleiben möglich.
  Skill-Client und CDP-Relay verwenden dieselbe Auflösung.
- Neun Browsersuiten teilen die isolierte HTML-Kopie samt begrenztem Cleanup;
  Schild, Leben und Beeren teilen zusätzlich die Fehlererfassung. Spielregeln,
  spezielle Netzwerk-/Worker-Fixtures und Geräteabläufe bleiben unverändert.
- Sequenzielle npm-Gruppen test:core, test:features und test:release ergänzt;
  test:comparison erhält den bisherigen einzelnen Release-Vergleich. Bei einem
  Fehler stoppt die Gruppe. Eigene DINO_TEST_OUTPUT-Verzeichnisse erhalten je
  Skript einen Unterordner. Einrichtung und Befehle: TESTING.md.
- Chromium: Basisgruppe (12 Architektur-/7 Lifecycle-Szenarien) und alle 18
  Feature-Suiten bestanden. Die erste Feature-Ausführung stoppte erwartungsgemäß
  an einer alten Annahme von sieben Goodbye-Statistikzeilen; seit der Beere sind
  es acht. Mit unverändertem HEAD-Testcode isoliert reproduziert. Die Prüfung
  kontrolliert nun bei mindestens sechs Zeilen den 40-ms-Versatz und 200-ms-Cap
  unabhängig von der Zeilenanzahl. Alle 86 Übergangsprüfungen sowie die danach
  verbleibenden Suiten separat vollständig erneut ausgeführt und bestanden.
- Chromium: reproduzierbarer Build und 64 pixelidentische Source-/Release-
  Szenen. Syntaxprüfung aller 46 beteiligten Node-Skripte bestanden. Lokale und
  relative Playwright-Auflösung, fehlgeschlagene Fixture-Anlage/Cleanup sowie
  CDP-Relay-Start ohne Gerät geprüft. Kein Spielcode geändert oder veröffentlicht.
- Abschließend: Skill-Client gegen Release bestanden, Gameplay-Bild/Zustand
  angesehen. WebKit mit relativem Playwright-Override und eigener Gruppen-
  Ausgabe: Architektur 12, Release-Lifecycle/Offline 7 und Release-Leben in drei
  Layouts bestanden. Auch Chromium-Leben-/Beerenbilder geprüft. Keine neue
  physische Geräteprüfung. 144 relative Dokumentationslinks und alle genannten
  Skriptpfade gültig; Quell-/Release-Hashes entsprechen weiterhin dem Bericht.
  Syntax sowie beide git diff --check (Arbeitsbaum/Index) bestanden.

## 2026-10-25: Medien in eigene Ordner verschieben

- User requested moving WAV/PNG and related media into dedicated folders and
  updating references. Applied develop-web-game. Five PNG/SVG files now live in
  assets/images/, two MP3 files in assets/audio/. The local WAV source is under
  asset-sources/audio/; that entire raw-source directory remains Git-ignored.
  All eight moves were SHA-256 verified; native Android resource images stay put.
- Updated HTML icons/social image/music, web manifest, worker, TWA configuration
  and embedded web manifest, fixture servers, tests and current documentation.
  Historical archive/progress entries keep their original paths. BUILD is now
  2026-10-25.1/cache v63; rebuilt standalone release is 328992 bytes.
- Shared hosted asset list drives preview serving and deployment. Deployment
  automatically uploads media and manifest before extras/HTML/worker, preserves
  server-side old URLs and byte-verifies static uploads (not executing PHP).
  Raw sources/config/secrets remain outside the allowlist. No deployment run.
- New assets test verifies exact GET bytes, MIME, HEAD, blocked private paths,
  manifest icons, deployment allowlist, deduplication and upload order without
  credentials/live services. Chromium core: assets, architecture 12 and
  lifecycle/offline 7 passed. Installed skill client passes release; gameplay
  screenshot and render_game_to_text inspected (build .1, playing, no errors).
- Final validation: 64 Chromium source/release scenes pixel-identical and build
  reproducible. Delivery theme songs pass actual MP3 decoding, saved selection,
  offline reload/switching and six cached byte ranges; volume controls pass 11
  groups; staged worker updates pass three layouts. WebKit passes architecture
  12 and delivery lifecycle/offline 7. Static asset/Android-reference checks,
  moved-file hashes, scripts' syntax, documentation links and git diff --check
  pass. No remaining task TODO; no deployment, native APK build or phone run.

## 2026-10-25: Alles committen und Web-Release veröffentlichen

- User explicitly requested committing all changes and deploying. Staged and
  checked the complete project state; private configuration, credentials, raw
  WAV/signing material and local reports remain excluded. Commit a6bbc7d:
  Consolidate documentation, tests and media assets (265 files, including the
  earlier simulation refactoring, documentation cleanup and asset moves).
- Verified source/release and media hashes still match the tested artifacts.
  Authorized dry run confirmed live v61, then npm run deploy -- --tls12 uploaded
  all seven media files, manifest, HTML and worker last. All ten static files
  match local SHA-256 over HTTPS. Build 2026-10-25.1/cache v63 is now published.
- Fresh isolated production Chromium context: correct build/cache, trusted
  START and playing state, actual worker-controlled offline reload, cached icon
  and both MP3s pass. No page errors or live highscore writes. Report/screenshot:
  output/publish-2026-10-25/. No physical-device run or Android APK publication.

## 2026-10-25: Portrait bonus flights reach the visible score

- User reports coins/berries flying straight upward rather than to the score
  in portrait. Reproduced with the actual pre-change .1 HTML: both endpoints
  x160/y208.09 versus visible DOM score x256/y144.875 (320x568 viewport).
  The old renderer targeted world center/y6, and the game canvas clipped the
  part above it. New regression fails on that saved baseline before the fix.
- Applied develop-web-game. Factored shared flight drawing from the tally panel;
  BonusFlightView measures the portrait canvas/HUD and draws the same coin/berry
  artwork on a temporary transparent DPR2 layer spanning both. No input target,
  timer, award, sound or simulation change. Layer is pointer-transparent, reused
  between tallies and detached outside animated portrait bonuses. CSS also hides
  it immediately for reduced motion/effects off while a modal pauses the loop.
- Exact draw-transform assertions check coin/berry arrival inside the visible
  score, rightward coin travel, actual layer bounds and landscape target. Added
  phone resize/landscape/portrait and paused resizing, no leftover layers with
  effects off/reduced motion. Chromium and WebKit each pass three bonus layouts
  against source and delivery; portrait tally/near-arrival screenshots inspected.
  Installed skill client passes source; gameplay screenshot/state inspected.
- Build 2026-10-25.2/cache v64; generated delivery331083 bytes. Saved baseline and
  reports under output/bonus-flight-fix/ and output/level-bonus/.
- Final delivery validation: Chromium and WebKit bonus suites each pass three
  layouts plus portrait resizing/rotation/paused resizing; endpoints coincide
  with the visible HUD within0.1 CSS-px (measured error <0.00001 px at320x568).
  Chromium architecture12, lifecycle/offline7, assets/deployment plan, berry5
  layouts, effects2 layouts and reproducible64-scene source/release comparison
  pass. Installed skill client passes final release; screenshot/state inspected.
  No browser errors, live score writes or physical-device run.
- User explicitly requested commit/deploy. Commit 5f58747 contains the fix and
  its regression/docs. Dry run confirmed published v63; encrypted TLS1.2 upload
  publishes .2/v64 with worker last. All ten static HTTPS hashes match, including
  HTML42e5ba479aa4... and worker7b0d50e49f1d....
- Fresh production Chromium portrait320x568/DPR3 with isolated storage and live
  scores disabled verifies both actual draw endpoints at256/144.875, matching
  the visible HUD within0.00001 CSS-px. Cache v64, no page errors. Live screenshot
  inspected. Evidence: output/bonus-flight-fix/live-report.json and
  live-portrait.png. Browser touch emulation, no new physical-device run.
