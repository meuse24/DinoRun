# Private Highscore-Verwaltung

`score-console.php` ist die Weboberfläche für die bestehenden Server-Top-10.
Normal und Relaxed sind getrennt anwählbar. Einzelne Einträge lassen sich
löschen, eine Rangliste oder beide Listen zurücksetzen. Jede Änderung wird auf
einer eigenen Seite bestätigt; beim Zurücksetzen ist zusätzlich `RESET`
einzugeben. Die Oberfläche funktioniert auch auf dem Handy und ohne JavaScript.

## Auf dem Server aktivieren

1. Diese Dateien im bisherigen Spielverzeichnis bereitstellen:
   `score-console.php`, `highscores-admin-lib.php`, `highscores-lib.php` und
   `admin.php`. Die neuen PHP-Dateien werden nicht vom HTML-Minifier verarbeitet.
   Bestehende Highscore-Daten und Konfiguration beibehalten.
2. Im Terminal/SSH des Servers ausführen:

   ```sh
   php admin.php create-password
   ```

   Der Befehl erzeugt ein zufälliges Passwort und den zugehörigen PHP-Passworthash.
   Das Passwort im Passwortmanager speichern. Er ändert weder Daten noch
   Konfiguration. Das Passwort wird nur im Terminal ausgegeben und ist kein
   Kommandozeilenargument, keine URL und kein Git-Inhalt.
3. **Nur die ausgegebene Hash-Zeile** in die vorhandene private
   `highscores.config.php` innerhalb ihres `return [...]` einfügen:

   ```php
   'admin_password_hash' => 'HIER_DEN_AUSGEGEBENEN_HASH_EINSETZEN',
   ```

   Ohne bestehende Konfiguration dient `highscores.config.example.php` als
   Vorlage. Den bisherigen `data_dir` bei einer vorhandenen Installation nicht
   ändern: Dort liegen die bestehenden Ranglisten. Für eine neue Installation
   ein beschreibbares Verzeichnis außerhalb des Web-Document-Roots verwenden.
   Alternativ kann eine private Konfigurationsdatei über
   `DINO_HIGHSCORES_CONFIG` eingebunden werden; sie überschreibt lokale Werte.
4. Die Verwaltung über **HTTPS** öffnen, zum Beispiel unter
   `https://DEINE-DOMAIN/apps/dino/score-console.php`. Das Passwort eingeben.
   Im Spiel wird kein Verwaltungslink ergänzt. Die Datei darf umbenannt werden;
   die Formulare und Weiterleitungen verwenden ihren aktuellen Dateinamen.

Ein leerer oder ungültiger Hash sperrt die Oberfläche mit HTTP 404. Kein
Standardpasswort und keine öffentliche Einrichtungsfunktion sind vorhanden.
Der Dateiname ist zusätzliche Unauffälligkeit; der Zugriffsschutz besteht aus
der serverseitigen Anmeldung. Ein Verzeichnisschutz des Hosters kann zusätzlich
verwendet werden.

Ein TLS-Proxy muss `HTTPS=on` im vertrauenswürdigen PHP-/Webserver-Setup setzen.
Die Anwendung vertraut keinem vom Browser gesetzten `X-Forwarded-Proto`.
Öffentliches HTTP wird abgelehnt. PHP benötigt die Session-Erweiterung, einen
beschreibbaren privaten Session-Speicher und PHP 7.4 oder neuer; für den Betrieb
eine noch unterstützte PHP-Version verwenden.

## Passwort in der Webverwaltung ändern

Für ein Update einer bereits eingerichteten Verwaltung nur `score-console.php`
und `highscores-admin-lib.php` gemeinsam hochladen. Private Konfiguration und
Datenverzeichnis beibehalten; keine neue Ersteinrichtung notwendig.

Nach der Anmeldung oben **Passwort ändern** auswählen. Bisheriges Passwort,
neues Passwort und Wiederholung eingeben, dann **Passwort speichern** drücken.
Das neue Passwort darf 1 bis 72 Zeichen lang sein. Erlaubt sind ausschließlich
Buchstaben `A–Z`, `a–z` und Zahlen `0–9`; reine Buchstaben- oder Zahlenfolgen
sind ebenfalls möglich. Leerzeichen, Umlaute und Sonderzeichen sind nicht erlaubt.
Zu lange Eingaben werden abgelehnt und nicht still gekürzt. Das bisherige
Passwort muss stimmen; das neue muss sich davon
unterscheiden. Fehler geben die Passwörter nicht erneut im Formular aus.

Nach erfolgreichem Speichern sind alle bisherigen Sitzungen ungültig,
einschließlich der aktuellen. Erneut mit dem neuen Passwort anmelden. Eine
fehlgeschlagene Speicherung lässt das bisherige Passwort bestehen.

Gespeichert wird ausschließlich ein gesalzener PHP-Passworthash in
`<data_dir>/admin-password.php`, atomisch unter derselben Dateisperre wie die
Ranglisten. Die Datei erhält Berechtigung `0600` und einen PHP-Abbruchschutz.
Die Konfiguration und die Ranglisten werden dabei nicht verändert. Das
Datenverzeichnis muss weiterhin privat und für PHP beschreibbar sein; die neue
Datei beim Sichern oder Umziehen der Installation mitnehmen. Ein erneuter Upload
der Programmdateien setzt das geänderte Passwort nicht zurück.

**Passwort vergessen:** Im Serverterminal `php admin.php create-password`
ausführen und den neu erzeugten Hash in der privaten Konfiguration ersetzen.
Diese neue Konfiguration macht das gespeicherte Web-Passwort und alle alten
Sitzungen ungültig; mit dem zugehörigen neu erzeugten Passwort anmelden.
Ein leerer Konfigurationshash deaktiviert die Verwaltung weiterhin vollständig.
Beschädigte Passwortdateien sperren den Zugriff mit HTTP 503; sie werden nie
stillschweigend auf ein altes Passwort zurückgesetzt. In diesem Fall die
beschädigte `admin-password.php` per SSH aus dem Datenverzeichnis entfernen
und einen neuen Konfigurationshash setzen. Keine Datei mit Passwörtern in Git
oder ins öffentliche Downloadverzeichnis kopieren.

## Verhalten und Sicherungen

- Vor Löschen und Zurücksetzen wird der vorherige Datensatz nach
  `<data_dir>/backups/highscores-<UTC-Zeit>-<Zufall>.json` kopiert. Schlägt die
  Sicherung fehl, bleibt die Rangliste unverändert. Web und CLI verwenden dieselbe
  Dateisperre und atomische Speicherfunktion. Die API-Idempotenzdaten bleiben
  erhalten.
  Wird eine beschädigte Hauptdatei aus der bestehenden `.bak` gelesen, sichert
  die Moderation diese gültige Wiederherstellungsquelle vor der Änderung.
- Die Weboberfläche zeigt den Sicherungsdateinamen nach erfolgreicher Änderung.
  Backups werden nicht zum Download angeboten; das Datenverzeichnis einschließlich
  Backups muss gegen öffentlichen Abruf geschützt sein. Außerhalb des Webroots
  ist es unabhängig von Apache-/nginx-Regeln geschützt.
- Eine Löschbestätigung gilt fünf Minuten und nur einmal. Zurücksetzen ist an
  die angezeigte Version der betroffenen Listen gebunden. Neue Highscores in der
  Zwischenzeit erfordern eine erneute Prüfung; Einträge werden nicht ungesehen
  mitgelöscht. Abbrechen verwirft die Bestätigung.
- Anmeldung erneuern nach 20 Minuten ohne Aktivität oder spätestens acht Stunden.
  Beim Anmelden wird die Session-ID gewechselt, danach regelmäßig. Passwortwechsel
  durch einen neuen Hash macht bestehende Anmeldungen ungültig. Abmelden ist ein
  geschützter POST und beendet die aktuelle Anmeldung.
- Jede POST-Aktion einschließlich Anmeldung und Abmeldung benötigt einen
  Session-CSRF-Token. Die Cookies sind HttpOnly, SameSite=Strict und unter HTTPS
  Secure. Admin-Seiten verwenden `no-store`, keine fremden Ressourcen und keine
  Scripts; Einbettung in Frames wird blockiert.
- Höchstens fünf Anmeldeversuche pro direkter Client-IP und 30 insgesamt je
  15-Minuten-Zeitfenster, einschließlich erfolgreicher Anmeldungen. Neue Cookies
  umgehen diese Begrenzung nicht. Nur HMAC-Schlüssel der IPs werden im privaten
  `admin-login.php` gespeichert. Beim gemeinsam genutzten Internetzugang teilen
  sich Geräte dieses Limit. Der Browser erhält bei Überschreitung HTTP 429 mit
  `Retry-After`; nach Ablauf des Fensters erneut versuchen.
  Die Prüfung des bisherigen Passworts beim Passwortwechsel nutzt dieselbe
  Begrenzung, damit auch eine bereits offene Sitzung keine unbeschränkten
  Passwortversuche erlaubt.

Die Verwaltungsseite liest direkt den konfigurierten Server-Speicher. Lokale
Browser-Rekorde und bereits angezeigte/cached Listen auf Spielgeräten werden nicht
gelöscht; sie aktualisieren sich über den normalen Spielablauf. Die bestehende
CLI `php admin.php list|remove|reset` bleibt verfügbar.

## Lokal prüfen

Der Node-Spielserver auf 8765 führt kein PHP aus und bleibt unverändert.
Für eine manuelle lokale PHP-Vorschau eine **separate Testkonfiguration mit
separatem Datenverzeichnis** verwenden. Nur dort darf
`'admin_allow_local_http' => true` gesetzt werden. Die Ausnahme funktioniert
ausschließlich mit `php -S` und Verbindungen von 127.0.0.1/::1.

```powershell
$env:DINO_PHP = 'D:/Pfad/zu/php.exe'
$env:DINO_PLAYWRIGHT = 'D:/projects/pacman/node_modules/playwright/index.mjs'
node tests/admin-web.mjs
$env:DINO_BROWSER = 'webkit'
$env:PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1'
node tests/admin-web.mjs
```

Die Tests erstellen eigene temporäre Konfigurationen, Passwörter, Sessions,
Scores, Backups und einen PHP-Server auf einem freien Loopback-Port. Sie testen
CLI und HTTP, Anmeldebegrenzung, CSRF, Session-Wechsel/-Ablauf, Passwortwechsel,
Bestätigungen, Replay, konkurrierende Änderungen, Backupfehler und API-Lesen.
Vier Browsergrößen prüfen Anmeldung, Abbrechen, Löschen, beide Reset-Arten und
Passwortwechsel mit erneuter Anmeldung sowie Abmelden ohne JavaScript.
Die Passworttests umfassen falsches bisheriges Passwort, Wiederholung,
kurze Passwörter, reine Buchstaben/Zahlen, Längengrenzen, unzulässige Zeichen,
Nullbytes, unverändertes Passwort,
CSRF, Drosselung, konkurrierende Änderungen, fehlgeschlagenes atomisches Speichern,
Sitzungswiderruf, Konfigurations-Wiederherstellung und unveränderte
Ranglisten/Konfiguration.
Die TLS-Zustandssimulation prüft Cookie-Flags und die
HTTP-Sperre; sie ersetzt keinen Test der echten HTTPS-Konfiguration des Hosters.
Temporäre Server und Daten werden entfernt. Keine Verbindung zur Live-API.

Playwright 1.62.1 injiziert bei jedem WebKit-Screenshot ein leeres `body {}`-
Stylesheet zum Synchronisieren von Animationen. Die strikte CSP lehnt dieses
korrekt ab. Die fünf exakt zugeordneten Screenshot-Meldungen je Layout stehen
separat im Bericht; andere Browserfehler lassen den Test fehlschlagen. CSP und
JavaScript-Sperre werden für die Bedienungstests nicht umgangen.

## Geprüfter Stand

PHP 8.4.26 und Playwright 1.62.1: alle PHP-/CLI-/HTTP-Sicherheitsprüfungen sowie
vier vollständige Bedienabläufe pro Browser bestanden, in Chromium
151.0.7922.34 und WebKit 26.5. Enthalten sind auch gültige Backups bei beschädigter
Hauptdatei, konkurrierende Resets und unveränderte Daten bei Backupfehlern.
Screenshots von Anmeldung, Listen, Bestätigung und Passwortformular visuell geprüft. Die
Handygrößen sind Browseremulation; ein physischer Handytest dieser Verwaltung
wurde nicht durchgeführt. Der bestehende Spielvertrag besteht zusätzlich alle
sieben Chromium-Szenarien. Spiel-HTML, Build und minifizierte Datei sind unverändert.

Berichte und Screenshots: `output/admin-web/{chromium,webkit}`. Zusammenfassung:
`output/admin-web/verification.json`. Es wurden keine Live-Highscores verändert
und keine Zugangsdaten oder private Konfiguration eingecheckt. Die Aktivierung
auf dem echten Server erfolgt mit dem oben beschriebenen privaten Passwort-Hash.

Grundlagen: [PHP Session-Sicherheit](https://www.php.net/manual/en/features.session.security.management.php),
[PHP password_hash](https://www.php.net/manual/en/function.password-hash.php),
[OWASP Passwortwechsel](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#change-password-feature),
[OWASP CSRF-Schutz](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
