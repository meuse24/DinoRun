$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $config = Get-Content -LiteralPath (Join-Path $env:USERPROFILE '.bubblewrap/config.json') -Raw | ConvertFrom-Json
    $manifestHash = (Get-FileHash -LiteralPath './twa-manifest.json' -Algorithm SHA1).Hash.ToLowerInvariant()
    if (!(Test-Path -LiteralPath './manifest-checksum.txt') -or
        (Get-Content -LiteralPath './manifest-checksum.txt' -Raw).Trim() -ne $manifestHash) {
        throw 'Project configuration changed. Run npm run android:update before building.'
    }
    $passwordFile = Join-Path $PSScriptRoot 'signing/password.clixml'
    if (!(Test-Path -LiteralPath $passwordFile)) {
        throw 'Signing password missing. See ../doc/ANDROID.md for key recovery and setup.'
    }
    $securePassword = Import-Clixml -LiteralPath $passwordFile
    $credential = [System.Net.NetworkCredential]::new('', $securePassword)
    $env:BUBBLEWRAP_KEYSTORE_PASSWORD = $credential.Password
    $env:BUBBLEWRAP_KEY_PASSWORD = $credential.Password
    & "$PSScriptRoot/node_modules/.bin/bubblewrap.cmd" build --skipSigning
    if ($LASTEXITCODE -ne 0) { throw "Bubblewrap failed with exit code $LASTEXITCODE" }
    $keyStore = Join-Path $PSScriptRoot 'signing/dino-upload.keystore'
    $java = Join-Path $config.jdkPath 'bin/java.exe'
    $apkSigner = Join-Path $config.androidSdkPath 'build-tools/36.1.0/lib/apksigner.jar'
    & $java -jar $apkSigner sign --ks $keyStore --ks-key-alias dino-upload `
        --ks-pass env:BUBBLEWRAP_KEYSTORE_PASSWORD --key-pass env:BUBBLEWRAP_KEY_PASSWORD `
        --out app-release-signed.apk app-release-unsigned-aligned.apk
    if ($LASTEXITCODE -ne 0) { throw 'APK signing failed' }
    & (Join-Path $config.jdkPath 'bin/jarsigner.exe') -keystore $keyStore `
        -storepass:env BUBBLEWRAP_KEYSTORE_PASSWORD -keypass:env BUBBLEWRAP_KEY_PASSWORD `
        -signedjar app-release-bundle.aab app/build/outputs/bundle/release/app-release.aab dino-upload
    if ($LASTEXITCODE -ne 0) { throw 'App Bundle signing failed' }
    & $java -jar $apkSigner verify --verbose --print-certs app-release-signed.apk
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
} finally {
    Remove-Item Env:BUBBLEWRAP_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:BUBBLEWRAP_KEY_PASSWORD -ErrorAction SilentlyContinue
    Pop-Location
}
