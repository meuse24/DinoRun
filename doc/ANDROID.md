# Android Trusted Web Activity

The Android Studio project lives in `dino-android/`. It wraps the production game
at `https://meuse24.info/apps/dino/dino.html`; it does not bundle a second copy of
the game. Gameplay and service-worker updates remain website releases.

## Project and tools

- Package: `info.meuse24.dinorun`, launcher name: Dino Run.
- Android version: 1.0.0, version code 1; compile/target SDK 36, minimum SDK 24
  (Android 7), required by Android Browser Helper 2.7.4. Bubblewrap's initial
  default of 21 does not build with that dependency.
- Fullscreen presentation and default device orientation; notifications disabled.
- Bubblewrap CLI 1.27.0 is a pinned, local development dependency. Use `npm ci`
  inside `dino-android/` to reinstall it. The web game's root npm project is unchanged.
- Java: Temurin 17.0.20.1 x64, installed under `%USERPROFILE%\.bubblewrap\temurin-17`.
  The download was SHA-256 checked against Adoptium's package metadata.
- The existing Android Studio SDK is reused at `%LOCALAPPDATA%\Android\Sdk`.
  Build Tools 36.1.0 were added. Bubblewrap's older SDK path check expects `tools/`,
  so that path is a directory junction to the existing `cmdline-tools/latest/`.
- Machine-specific tool paths are in `%USERPROFILE%\.bubblewrap\config.json`.
  Android Studio's bundled Java 25 is not the JDK used for this project.

Open **the `dino-android` directory** with Android Studio, let Gradle sync, and set
Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK to
the Java 17 installation above if the IDE chooses a different runtime.
An IDE Run/debug build uses a different certificate; use the signed release APK
below when checking the production website's Digital Asset Links verification.

## Build and install

```powershell
cd D:\projects\dino\dino-android
npm ci
npm run doctor
npm run android:build
npm run android:install
```

`build.ps1` runs Bubblewrap's unsigned build, then signs the APK and AAB using
passwords supplied through environment variables to the signing tools. Password
values are not placed in command arguments. Final artifacts:

- `dino-android/app-release-signed.apk`: installable device build.
- `dino-android/app-release-bundle.aab`: signed bundle for a future Play submission.

Generated binaries, Gradle state, local IDE settings, dependencies and signing
material are ignored by Git. Do not commit signing material or `ftp.txt`.

## Signing and backup

The local signing key is `dino-android/signing/dino-upload.keystore`, alias
`dino-upload`. The random password is saved as Windows DPAPI protected SecureString
in `signing/password.clixml`; only the current Windows user on this machine can
decrypt that file. `build.ps1` loads it automatically. It was not printed in logs.

**Back up the keystore and put its password into a password manager.** Copying only
the encrypted CLIXML file to a different machine is not sufficient. To reveal the
password locally for your own password-manager entry, run this yourself in a
private PowerShell terminal (do not paste its output into issues or commits):

```powershell
$secret = Import-Clixml D:\projects\dino\dino-android\signing\password.clixml
[System.Net.NetworkCredential]::new('', $secret).Password
```

On a replacement Windows machine, save the recovered password using
`Read-Host -AsSecureString | Export-Clixml ./signing/password.clixml` and restore
the original keystore. Do not regenerate a key for updates to an installed app.

## Website verification

The public certificate fingerprints are in `dino-android/assetlinks.json` and
`twa-manifest.json`. The public JSON must be hosted at exactly:

`https://meuse24.info/.well-known/assetlinks.json`

It must return HTTP 200, `application/json`, and no redirect. This is the domain
root, not `/apps/dino/.well-known/`. No private key belongs on the server.

`node deploy-assetlinks.mjs` prepares the JSON and preserves existing statements.
`npm run assetlinks:deploy` explicitly uploads only that public JSON through FTPS,
using the root repository's ignored `ftp.txt`. It then verifies the public HTTPS
response, MIME type and SHA-256. It does not deploy the game or service worker.

Without a matching statement for the installed certificate, Chrome falls back
to a Custom Tab with a toolbar. Do not disable origin verification to hide errors.

## Configuration and updates

Web media now live under `assets/images/` and `assets/audio/`. Both icon URLs
in `twa-manifest.json` and the embedded web manifest use the new image paths;
native `app/src/main/res/` images stay in Android's required resource folders.
Regenerate future Android builds after publishing the new website assets.
The manifest checksum remains the generator's record of the last regeneration;
it is not manually advanced for this source edit. The installed TWA continues
to load the website; no APK rebuild is needed for the web release itself.

Change Android app settings in `twa-manifest.json`, then run:

```powershell
npm run android:update
npm run android:build
```

The update command deliberately preserves version code/name. Before distributing
an Android update, increment `appVersionCode` and set `appVersion` and
`appVersionName` consistently in the manifest. Bubblewrap regenerates Android
sources; direct edits to generated files may be overwritten. `update.ps1` stops
the Gradle daemon first to release Windows file locks, and pins the regenerated
Gradle distribution checksum from the official HTTPS endpoint.

Keep `enableSiteSettingsShortcut: true`: with Browser Helper 2.7.4, disabling it
omits `ManageDataLauncherActivity` while launch code still tries to disable that
component. The first device run exposed this startup crash. Enabling the standard
site-settings entry includes the component and avoids this generator/library bug.

For Play App Signing, add the **Play app signing certificate** SHA-256 from Play
Console to `assetlinks.json` before testing a Play-delivered build. The local/upload
certificate alone does not verify an app signed with Google's different key.
Store submission, developer account setup and production rollout are separate
steps; generating an AAB does not publish anything to Google Play.

## Device verification

`node tests/android-attract-proportional.mjs` (from the repository root) verifies
the published game's exact delivery hash, proportional attract layout in both
landscapes, three panels, primary-action hit targets and trusted Help/Settings
input in the actual installed TWA and a temporary direct Chrome tab. Run with the
app at its start menu after publishing the current local delivery. It may accept
the app's normal waiting-worker update offer. It restores rotation and the saved
fullscreen preference, blocks highscore requests and removes its own ADB forward
and browser tab. Reports: `output/attract-proportional/physical/`.

With the installed app open on the connected Galaxy S10e, run
`npm run android:verify` from `dino-android/`. For another device, set
`DINO_ANDROID_SERIAL`. The script creates and removes its own dynamic ADB forward,
selects only the visible page with this app's `android-app://` referrer, and tests
Help/Back, Settings, page-scoped offline reload and Home/relaunch. It does not
start gameplay, submit scores, clear storage or change device connectivity.
Reports and settled physical screenshots go to `output/android-twa/`.

After successful online startup and worker caching, verify offline reopening.
A fresh installation with no previously cached website requires a network
connection. Test rotation, touch, Back, dialogs, audio, background/foreground and
website update notices in the actual signed app. Browser/emulator results alone
do not establish TWA behavior on a physical phone.

Keep automated gameplay isolated from live highscore writes. Do not clear the
user's Chrome data or change global browser flags for a TWA test.

### Initial verification, 2026-10-21

Both `npm run android:update` and `npm run android:build` pass. APK v2/v3
signatures verify; `jarsigner -verify` validates the signed AAB (the normal
self-signed Android certificate warnings remain). The HTTPS asset-links response
matches the uploaded SHA-256 and Google's Digital Asset Links API reports
`linked: true` for this package and certificate.

Physical Galaxy S10e / SM-G970F, Android 12: five smoke-check groups above pass;
screenshots inspected. Android app referrer and fullscreen media query confirm
the actual TWA context. The installed APK's SHA-256 matches the final build.
No live POST requests, global network changes or leftover ADB forwards.
This smoke run does not establish gameplay, rotation or actual audio performance.

- APK: 1,337,110 bytes, SHA-256
  `2fce08fd5601722dcf466d49ab6d1c45a9f0ddb087ac12a0d8b7cdd601832098`.
- AAB: 1,408,929 bytes, SHA-256
  `07d0b43f547c297f50c635032ab7ebe42bc9e87a221e32e97601b389912323aa`.

Only `/.well-known/assetlinks.json` was published. The production game and
service worker were not changed, and no Google Play submission was performed.

## References

- [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli)
- [Chrome TWA quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
- [Digital Asset Links](https://developers.google.com/digital-asset-links/v1/getting-started)
