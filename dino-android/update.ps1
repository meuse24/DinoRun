$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
$previousJavaHome = $env:JAVA_HOME
try {
    $config = Get-Content -LiteralPath (Join-Path $env:USERPROFILE '.bubblewrap/config.json') -Raw | ConvertFrom-Json
    $env:JAVA_HOME = $config.jdkPath
    # R8 on Windows may hold classes.dex open in the Gradle daemon. Stop it before
    # Bubblewrap replaces the generated project, otherwise regeneration can fail.
    if (Test-Path -LiteralPath './gradlew.bat') {
        & ./gradlew.bat --stop
        if ($LASTEXITCODE -ne 0) { throw 'Could not stop the Gradle daemon' }
    }
    & ./node_modules/.bin/bubblewrap.cmd update --skipVersionUpgrade
    if ($LASTEXITCODE -ne 0) { throw 'Bubblewrap project regeneration failed' }
    $propertiesPath = Join-Path $PSScriptRoot 'gradle/wrapper/gradle-wrapper.properties'
    $properties = Get-Content -LiteralPath $propertiesPath -Raw
    $distributionUrl = [regex]::Match($properties, '(?m)^distributionUrl=(.+)$').Groups[1].Value.Trim().Replace('\:', ':')
    if (!$distributionUrl.StartsWith('https://services.gradle.org/distributions/')) {
        throw 'Unexpected Gradle distribution host'
    }
    $checksum = ([string](Invoke-RestMethod -Uri ($distributionUrl + '.sha256'))).Trim()
    if ($checksum -notmatch '^[a-f0-9]{64}$') { throw 'Invalid Gradle distribution checksum' }
    $properties = [regex]::Replace($properties, '(?m)^distributionSha256Sum=.*\r?\n?', '')
    ($properties.TrimEnd() + "`ndistributionSha256Sum=$checksum`n") |
        Set-Content -LiteralPath $propertiesPath -Encoding utf8NoBOM -NoNewline
} finally {
    $env:JAVA_HOME = $previousJavaHome
    Pop-Location
}
