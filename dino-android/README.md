# Dino Run Android

Bubblewrap Trusted Web Activity for https://meuse24.info/apps/dino/dino.html.

Open this directory in Android Studio. Setup, signing backup, build/install,
website verification and Play signing details: [doc/ANDROID.md](../doc/ANDROID.md).

```powershell
npm ci
npm run doctor
npm run android:build
npm run android:install
```

The APK and AAB appear in this directory. Signing material remains under the
Git-ignored `signing/` directory and must be backed up separately.
