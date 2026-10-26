# Builds a release APK on this PC, signed with the EAS keystore so it installs over EAS builds
# and keeps phone data. Run with `npm run build:apk:local` after raising app.json's version and
# android.versionCode.
#
# One-time setup:
# - JDK 17 in %LOCALAPPDATA%\Android\jdk-17 and the Android SDK in %LOCALAPPDATA%\Android\Sdk,
#   including "cmake;3.31.6" (or newer): its Ninja 1.12 handles the >260-character object paths
#   that React Native's native libraries produce. Windows long paths must be enabled (LongPathsEnabled).
# - In the build folder: `npx eas-cli credentials -p android` > preview > credentials.json >
#   Download credentials from EAS to credentials.json.
#
# The project is built from a copy outside OneDrive with a short path; syncing build files and
# long native paths both break Gradle on Windows.
param(
  [string]$BuildDir = (Join-Path $env:USERPROFILE 'zepbuild\zepimon-mobile'),
  # The same four as EAS builds; x86 covers emulators and some tablets and Chromebooks.
  [string]$Architectures = 'armeabi-v7a,arm64-v8a,x86,x86_64',
  # Regenerates android/ from scratch; use after adding packages or plugins.
  [switch]$Clean
)

function Invoke-Step([string]$name, [scriptblock]$command) {
  Write-Host "`n== $name" -ForegroundColor Cyan
  & $command
  if ($LASTEXITCODE) { throw "$name failed (exit code $LASTEXITCODE)" }
}

$source = Split-Path $PSScriptRoot -Parent
$android = Join-Path $env:LOCALAPPDATA 'Android'
$env:JAVA_HOME = Join-Path $android 'jdk-17'
$env:ANDROID_HOME = Join-Path $android 'Sdk'
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
foreach ($required in @("$env:JAVA_HOME\bin\java.exe", "$env:ANDROID_HOME\platforms")) {
  if (-not (Test-Path $required)) { throw "Missing $required. Complete the one-time setup at the top of this script." }
}
$credentials = Join-Path $BuildDir 'credentials.json'
if (-not (Test-Path $credentials)) { Write-Warning "No $credentials yet: the APK will build, but signing will stop. See the one-time setup." }

# Two builds in one folder delete each other's files, so only one may run at a time.
New-Item -ItemType Directory -Force $BuildDir | Out-Null
$lock = Join-Path $BuildDir '.build.lock'
if (Test-Path $lock) {
  $owner = Get-Content $lock
  if ($owner -and (Get-Process -Id $owner -ErrorAction SilentlyContinue)) { throw "Another local build is already running (process $owner). Wait for it to finish, then run this again." }
}
Set-Content $lock $PID
try {

Write-Host "`n== Copy project to $BuildDir" -ForegroundColor Cyan
# Keeps the copy's packages, native project, credentials and APKs.
robocopy $source $BuildDir /MIR /XD node_modules android ios .expo dist web-build credentials apk /XF credentials.json *.jks .build.lock /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copying the project failed (robocopy exit code $LASTEXITCODE)" }
Set-Location $BuildDir

$lockHash = (Get-FileHash package-lock.json).Hash
$stamp = 'node_modules\.zepbuild-lock'
if (-not (Test-Path $stamp) -or (Get-Content $stamp) -ne $lockHash) {
  Invoke-Step 'Install packages' { npm ci --no-audit --no-fund }
  Set-Content $stamp $lockHash
}

$env:CI = '1'
if ($Clean) {
  # A running Gradle daemon keeps android/ locked.
  if (Test-Path android\gradlew.bat) { Push-Location android; .\gradlew.bat --stop --quiet; Pop-Location }
  Invoke-Step 'Generate Android project (clean)' { npx expo prebuild --platform android --clean --no-install }
}
# Since SDK 57, prebuild recreates android/ unless told not to; updating keeps Gradle's incremental build.
else { Invoke-Step 'Update Android project' { npx expo prebuild --platform android --no-clean --no-install } }
Remove-Item Env:CI

# Machine-specific settings, like Android Studio writes. The default CMake 3.22.1 bundles Ninja 1.10,
# which fails on long paths, so use the newest installed CMake.
$cmake = Get-ChildItem "$env:ANDROID_HOME\cmake" | Sort-Object { [version]$_.Name } | Select-Object -Last 1
if (-not $cmake -or [version]$cmake.Name -lt [version]'3.31') { throw 'Install "cmake;3.31.6" with sdkmanager (see the one-time setup).' }
Set-Content android\local.properties @(
  "sdk.dir=$($env:ANDROID_HOME -replace '\\', '/')",
  "cmake.dir=$($cmake.FullName -replace '\\', '/')"
)

Push-Location android
try { Invoke-Step 'Build release APK (Gradle)' { .\gradlew.bat assembleRelease "-PreactNativeArchitectures=$Architectures" --console=plain } }
finally { Pop-Location }

if (-not (Test-Path $credentials)) { throw "APK built but not signed: download credentials.json first (see the one-time setup), then run this again." }
$keystore = (Get-Content $credentials -Raw | ConvertFrom-Json).android.keystore
$expo = (Get-Content app.json -Raw | ConvertFrom-Json).expo
$apk = Join-Path $BuildDir ("apk\Zepimon-{0}-{1}.apk" -f $expo.version, $expo.android.versionCode)
New-Item -ItemType Directory -Force (Split-Path $apk) | Out-Null
$buildTools = (Get-ChildItem "$env:ANDROID_HOME\build-tools" | Sort-Object { [version]$_.Name } | Select-Object -Last 1).FullName
$env:ZEP_KS_PASS = $keystore.keystorePassword
$env:ZEP_KEY_PASS = $keystore.keyPassword
try {
  # Gradle signs release builds with the debug key; re-sign with the EAS key.
  Invoke-Step 'Sign with the EAS keystore' {
    & "$buildTools\apksigner.bat" sign --ks (Join-Path $BuildDir $keystore.keystorePath) --ks-key-alias $keystore.keyAlias `
      --ks-pass env:ZEP_KS_PASS --key-pass env:ZEP_KEY_PASS --out $apk android\app\build\outputs\apk\release\app-release.apk
  }
} finally { Remove-Item Env:ZEP_KS_PASS, Env:ZEP_KEY_PASS }
Invoke-Step 'Verify signature' { & "$buildTools\apksigner.bat" verify --print-certs $apk }
Write-Host "`nAPK ready: $apk" -ForegroundColor Green

} finally { Remove-Item $lock -ErrorAction SilentlyContinue }
