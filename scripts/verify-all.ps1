param(
    [switch] $IncludeApiSmoke,
    [switch] $IncludeWebSmoke,
    [switch] $IncludeRuntimeSmoke,
    [switch] $IncludeRealModelSmoke,
    [switch] $IncludeAndroidDeviceSmoke,
    [switch] $StartAndroidEmulator,
    [string] $AndroidAdbPath = "",
    [string] $AndroidDeviceSerial = "",
    [string] $AndroidAvdName = "",
    [string] $AndroidSmokeUsername = "",
    [string] $AndroidSmokePassword = "",
    [switch] $RequireAndroidAuthenticatedFlow,
    [int] $AndroidDeviceWaitSeconds = 20,
    [int] $AndroidEmulatorBootWaitSeconds = 180
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$AgentPython = Join-Path $Root "agent_server\.venv\Scripts\python.exe"

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,
        [Parameter(Mandatory = $true)]
        [scriptblock] $Command
    )

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    & $Command
}

function Assert-CommandSucceeded {
    param(
        [Parameter(Mandatory = $true)]
        [int] $ExitCode,
        [Parameter(Mandatory = $true)]
        [string] $Name
    )

    if ($ExitCode -gt 1) {
        throw "$Name scan failed with exit code $ExitCode."
    }
}

function Assert-OnlyAllowedMatches {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,
        [AllowEmptyCollection()]
        [string[]] $Matches,
        [AllowEmptyCollection()]
        [string[]] $AllowedPatterns
    )

    foreach ($Match in $Matches) {
        $Allowed = $false
        foreach ($Pattern in $AllowedPatterns) {
            if ($Match -match $Pattern) {
                $Allowed = $true
                break
            }
        }
        if (-not $Allowed) {
            throw "$Name found an unexpected match: $Match"
        }
    }
}

function Assert-PowerShellScriptSyntax {
    $Scripts = @(rg --files scripts -g "*.ps1")
    Assert-CommandSucceeded $LASTEXITCODE "PowerShell script discovery"

    foreach ($Script in $Scripts) {
        $ResolvedScript = (Resolve-Path $Script).Path
        $ParseErrors = $null
        $Tokens = $null
        [System.Management.Automation.Language.Parser]::ParseFile($ResolvedScript, [ref] $Tokens, [ref] $ParseErrors) | Out-Null
        if ($ParseErrors.Count -gt 0) {
            $Details = $ParseErrors | ForEach-Object {
                "Line $($_.Extent.StartLineNumber), Col $($_.Extent.StartColumnNumber): $($_.Message)"
            }
            throw "PowerShell syntax failed for $Script.$([Environment]::NewLine)$($Details -join [Environment]::NewLine)"
        }
    }
}

function Assert-TextEncodingClean {
    $Patterns = "\x{FFFD}|\x{951B}|\x{9286}|\x{9427}|\x{5B80}|\x{52EB}|\x{7EEF}\x{8364}|\x{7459}\x{52EB}|\x{9471}\x{5C64}|\x{9474}\x{6C2D}\x{6E70}"
    $ScanPaths = @(
        "README.md",
        "docs",
        "SQL脚本",
        "web/src",
        "web/scripts",
        "android/app/src/main/java",
        "android/app/src/test/java",
        "backend/src",
        "agent_server/app",
        "scripts"
    ) | Where-Object { Test-Path (Join-Path $Root $_) }
    $Arguments = @(
        "-n",
        "--pcre2",
        $Patterns
    )
    $Arguments += $ScanPaths
    $Arguments += @(
        "-S",
        "-g",
        "!**/build/**",
        "-g",
        "!**/dist/**",
        "-g",
        "!**/target/**",
        "-g",
        "!**/.venv/**",
        "-g",
        "!**/node_modules/**",
        "-g",
        "!SQL脚本/career_db.sql",
        "-g",
        "!SQL脚本/career_decision_system.sql",
        "-g",
        "!scripts/verify-all.ps1"
    )
    $Matches = @(& rg @Arguments)
    Assert-CommandSucceeded $LASTEXITCODE "text encoding"

    if ($Matches.Count -gt 0) {
        throw "Potential mojibake or replacement characters found.$([Environment]::NewLine)$($Matches -join [Environment]::NewLine)"
    }
}

function Assert-AndroidReleaseManifest {
    Push-Location (Join-Path $Root "android")
    try {
        .\gradlew.bat :app:processReleaseMainManifest
        $ManifestPath = Join-Path $Root "android\app\build\intermediates\merged_manifest\release\processReleaseMainManifest\AndroidManifest.xml"
        if (-not (Test-Path $ManifestPath)) {
            $ManifestPath = Join-Path $Root "android\app\build\intermediates\merged_manifests\release\processReleaseManifest\AndroidManifest.xml"
        }
        if (-not (Test-Path $ManifestPath)) {
            throw "Merged release AndroidManifest.xml was not produced."
        }

        [xml] $Manifest = Get-Content -Path $ManifestPath -Encoding UTF8 -Raw
        $UsesCleartextTraffic = $Manifest.manifest.application.GetAttribute(
            "usesCleartextTraffic",
            "http://schemas.android.com/apk/res/android"
        )
        if ($UsesCleartextTraffic -ne "false") {
            throw "Release Android manifest must set android:usesCleartextTraffic to false. Actual value: $UsesCleartextTraffic"
        }
    } finally {
        Pop-Location
    }
}

function Assert-AndroidDebugManifest {
    Push-Location (Join-Path $Root "android")
    try {
        .\gradlew.bat :app:processDebugMainManifest
        $ManifestPath = Join-Path $Root "android\app\build\intermediates\merged_manifest\debug\processDebugMainManifest\AndroidManifest.xml"
        if (-not (Test-Path $ManifestPath)) {
            $ManifestPath = Join-Path $Root "android\app\build\intermediates\merged_manifests\debug\processDebugManifest\AndroidManifest.xml"
        }
        if (-not (Test-Path $ManifestPath)) {
            throw "Merged debug AndroidManifest.xml was not produced."
        }

        [xml] $Manifest = Get-Content -Path $ManifestPath -Encoding UTF8 -Raw
        $UsesCleartextTraffic = $Manifest.manifest.application.GetAttribute(
            "usesCleartextTraffic",
            "http://schemas.android.com/apk/res/android"
        )
        if ($UsesCleartextTraffic -ne "false") {
            throw "Debug Android manifest must set android:usesCleartextTraffic to false. Actual value: $UsesCleartextTraffic"
        }
    } finally {
        Pop-Location
    }
}

function Assert-AgentStartupModelConfig {
    $StartScript = Get-Content -Path (Join-Path $Root "scripts\start-dev.ps1") -Raw
    if ($StartScript -match 'LLM_PROVIDER\s*=.*"mock"') {
        throw "start-dev.ps1 must not override agent_server/.env with LLM_PROVIDER=mock."
    }
}

function Assert-AndroidReleaseBackendConfig {
    $RequestConfigPath = Join-Path $Root "android\app\src\main\java\com\careerdecision\mobile\network\RequestConfig.kt"
    $RequestConfigContent = Get-Content -Path $RequestConfigPath -Raw
    $ReleaseDefaultMatch = [regex]::Match($RequestConfigContent, 'RELEASE_BACKEND_BASE_URL\s*=\s*"([^"]+)"')
    if (-not $ReleaseDefaultMatch.Success) {
        throw "RequestConfig.kt does not define RELEASE_BACKEND_BASE_URL."
    }

    $ReleaseDefaultUrl = $ReleaseDefaultMatch.Groups[1].Value
    Assert-AndroidProductionBackendUrl -Name "Release Android default BACKEND_BASE_URL" -Url $ReleaseDefaultUrl

    $BuildConfigPath = Join-Path $Root "android\app\build\generated\source\buildConfig\release\com\careerdecision\mobile\BuildConfig.java"
    if (-not (Test-Path $BuildConfigPath)) {
        throw "Release BuildConfig.java was not produced."
    }

    $BuildConfigContent = Get-Content -Path $BuildConfigPath -Raw
    $Match = [regex]::Match($BuildConfigContent, 'BACKEND_BASE_URL_OVERRIDE\s*=\s*"([^"]*)"')
    if (-not $Match.Success) {
        throw "Release BuildConfig.java does not define BACKEND_BASE_URL_OVERRIDE."
    }

    $OverrideUrl = $Match.Groups[1].Value
    if (-not [string]::IsNullOrWhiteSpace($OverrideUrl)) {
        Assert-AndroidProductionBackendUrl -Name "Release Android BACKEND_BASE_URL override" -Url $OverrideUrl
    }
}

function Assert-AndroidProductionBackendUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,
        [Parameter(Mandatory = $true)]
        [string] $Url
    )

    if ($Url -notmatch '^https://') {
        throw "$Name must use https://. Actual value: $Url"
    }
    if ($Url -match 'localhost|127\.0\.0\.1|10\.0\.2\.2|0\.0\.0\.0') {
        throw "$Name must not point to a local or emulator host. Actual value: $Url"
    }
}

function Assert-WebProductionBackendConfig {
    $RequestConfigPath = Join-Path $Root "web\src\utils\request.ts"
    $RequestConfigContent = Get-Content -Path $RequestConfigPath -Raw
    $ProductionDefaultMatch = [regex]::Match($RequestConfigContent, "PROD_BACKEND_BASE_URL\s*=\s*'([^']+)'")
    if (-not $ProductionDefaultMatch.Success) {
        throw "request.ts does not define PROD_BACKEND_BASE_URL."
    }

    Assert-WebProductionBackendUrl -Name "Web production default BACKEND_BASE_URL" -Url $ProductionDefaultMatch.Groups[1].Value

    if (-not [string]::IsNullOrWhiteSpace($env:VITE_BACKEND_BASE_URL)) {
        Assert-WebProductionBackendUrl -Name "VITE_BACKEND_BASE_URL" -Url $env:VITE_BACKEND_BASE_URL.Trim()
    }

    $SmokeWebScript = Join-Path $Root "scripts\smoke-web.ps1"
    $SmokeWebContent = Get-Content -Path $SmokeWebScript -Raw
    if ($SmokeWebContent -notmatch 'VITE_BACKEND_BASE_URL\s*=\s*\$BackendBaseUrl') {
        throw "smoke-web.ps1 must pass BackendBaseUrl into VITE_BACKEND_BASE_URL when starting or running Web smoke."
    }
}

function Assert-WebProductionBackendUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,
        [Parameter(Mandatory = $true)]
        [string] $Url
    )

    if ($Url -notmatch '^https://') {
        throw "$Name must use https://. Actual value: $Url"
    }
    if ($Url -match 'localhost|127\.0\.0\.1|10\.0\.2\.2|0\.0\.0\.0') {
        throw "$Name must not point to a local or emulator host. Actual value: $Url"
    }
}

if (-not (Test-Path $AgentPython)) {
    throw "Agent virtual environment not found: $AgentPython"
}

if (-not $IncludeAndroidDeviceSmoke) {
    $AndroidOptionsRequested = $StartAndroidEmulator `
        -or -not [string]::IsNullOrWhiteSpace($AndroidAdbPath) `
        -or -not [string]::IsNullOrWhiteSpace($AndroidDeviceSerial) `
        -or -not [string]::IsNullOrWhiteSpace($AndroidAvdName) `
        -or -not [string]::IsNullOrWhiteSpace($AndroidSmokeUsername) `
        -or -not [string]::IsNullOrWhiteSpace($AndroidSmokePassword) `
        -or $RequireAndroidAuthenticatedFlow `
        -or $AndroidDeviceWaitSeconds -ne 20 `
        -or $AndroidEmulatorBootWaitSeconds -ne 180
    if ($AndroidOptionsRequested) {
        throw "Android smoke options require -IncludeAndroidDeviceSmoke."
    }
}

Set-Location $Root

Invoke-Step "PowerShell script syntax" {
    Assert-PowerShellScriptSyntax
}

Invoke-Step "Text encoding scan" {
    Assert-TextEncodingClean
}

Invoke-Step "Backend tests" {
    Push-Location (Join-Path $Root "backend")
    try {
        mvn test
    } finally {
        Pop-Location
    }
}

Invoke-Step "Agent tests" {
    Push-Location (Join-Path $Root "agent_server")
    try {
        & $AgentPython -m pytest
        & $AgentPython -m ruff check .
    } finally {
        Pop-Location
    }
}

Invoke-Step "Web checks" {
    Assert-WebProductionBackendConfig
    Push-Location (Join-Path $Root "web")
    try {
        npm run check
    } finally {
        Pop-Location
    }
}

Invoke-Step "Web end-to-end flow (1440px and 360px)" {
    Push-Location (Join-Path $Root "web")
    try {
        npm run test:e2e
    } finally {
        Pop-Location
    }
}

Invoke-Step "Android checks" {
    Push-Location (Join-Path $Root "android")
    try {
        .\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease
    } finally {
        Pop-Location
    }
}

Invoke-Step "Android cleartext and release URL policy" {
    Assert-AndroidDebugManifest
    Assert-AndroidReleaseManifest
    Assert-AndroidReleaseBackendConfig
}

Invoke-Step "Client communication scans" {
    Assert-AgentStartupModelConfig
    $AxiosMatches = @(rg -n "axios" web/src)
    Assert-CommandSucceeded $LASTEXITCODE "axios"
    Assert-OnlyAllowedMatches "axios" $AxiosMatches @(
        "web[\\/]+src[\\/]+utils[\\/]+request\.ts:",
        "web[\\/]+src[\\/]+utils[\\/]+__tests__[\\/]+request\.spec\.ts:"
    )

    $WebRequestImportMatches = @(rg -n 'from [''"](@/utils/request|.*utils/request)[''"]' web/src -g "*.ts" -g "*.vue")
    Assert-CommandSucceeded $LASTEXITCODE "web request import"
    Assert-OnlyAllowedMatches "web request import" $WebRequestImportMatches @(
        "web[\\/]+src[\\/]+api[\\/]+[^:]+\.ts:",
        "web[\\/]+src[\\/]+utils[\\/]+__tests__[\\/]+request\.spec\.ts:"
    )

    $WebTransportMatches = @(rg -n "fetch\(|XMLHttpRequest|EventSource|WebSocket|navigator\.sendBeacon" web/src -g "*.ts" -g "*.js" -g "*.vue")
    Assert-CommandSucceeded $LASTEXITCODE "web direct transport"
    Assert-OnlyAllowedMatches "web direct transport" $WebTransportMatches @()

    $AndroidTransportMatches = @(rg -n "OkHttpClient\.Builder|Retrofit\.Builder|HttpURLConnection|java\.net\.URL|URL\(|ktor\.client|HttpClient\(" android/app/src/main/java -g "*.kt")
    Assert-CommandSucceeded $LASTEXITCODE "android direct transport"
    Assert-OnlyAllowedMatches "android direct transport" $AndroidTransportMatches @(
        "android[\\/]+app[\\/]+src[\\/]+main[\\/]+java[\\/]+com[\\/]+careerdecision[\\/]+mobile[\\/]+network[\\/]+CareerApi\.kt:"
    )

    $AndroidLoggingMatches = @(rg -n "HttpLoggingInterceptor\.Level\.(BASIC|HEADERS|BODY)" android/app/src/main/java -g "*.kt")
    Assert-CommandSucceeded $LASTEXITCODE "android HTTP logging"
    Assert-OnlyAllowedMatches "android HTTP logging" $AndroidLoggingMatches @(
        "android[\\/]+app[\\/]+src[\\/]+main[\\/]+java[\\/]+com[\\/]+careerdecision[\\/]+mobile[\\/]+network[\\/]+RequestConfig\.kt:"
    )

    $UrlMatches = @(rg -n "http://|https://|10\.0\.2\.2|127\.0\.0\.1|localhost|data-server|data_server|/images" web/src android/app/src -g "*.kt" -g "*.ts" -g "*.js" -g "*.vue")
    Assert-CommandSucceeded $LASTEXITCODE "client URL"
    Assert-OnlyAllowedMatches "client URL" $UrlMatches @(
        "web[\\/]+src[\\/]+utils[\\/]+request\.ts:",
        "web[\\/]+src[\\/]+[^:]*__tests__[\\/]+[^:]+:",
        "web[\\/]+src[\\/]+pages[\\/]+[^:]+\.vue:\d+:.*placeholder=""https://""",
        "web[\\/]+src[\\/]+components[\\/]+NavigationMagneticCursor\.vue:\d+:.*www\.w3\.org/2000/svg",
        "android[\\/]+app[\\/]+src[\\/]+main[\\/]+java[\\/]+com[\\/]+careerdecision[\\/]+mobile[\\/]+network[\\/]+RequestConfig\.kt:\d+:\s*private const val DEBUG_BACKEND_BASE_URL",
        "android[\\/]+app[\\/]+src[\\/]+main[\\/]+java[\\/]+com[\\/]+careerdecision[\\/]+mobile[\\/]+network[\\/]+RequestConfig\.kt:\d+:\s*private const val RELEASE_BACKEND_BASE_URL",
        "android[\\/]+app[\\/]+src[\\/]+main[\\/]+java[\\/]+com[\\/]+careerdecision[\\/]+mobile[\\/]+network[\\/]+RequestConfig\.kt:\d+:\s*private const val DEBUG_WEB_BASE_URL",
        "android[\\/]+app[\\/]+src[\\/]+main[\\/]+java[\\/]+com[\\/]+careerdecision[\\/]+mobile[\\/]+network[\\/]+RequestConfig\.kt:\d+:\s*private const val RELEASE_WEB_BASE_URL",
        "android[\\/]+app[\\/]+src[\\/]+main[\\/]+java[\\/]+com[\\/]+careerdecision[\\/]+mobile[\\/]+ui[\\/]+screens[\\/]+GoalScreen\.kt:\d+:\s*value\.startsWith\(""https://""",
        "android[\\/]+app[\\/]+src[\\/]+test[\\/]+[^:]+:"
    )
}

if ($IncludeRealModelSmoke) {
    Invoke-Step "Real-model runtime smoke" {
        & (Join-Path $Root "scripts\smoke-runtime.ps1") -RequireRealModel
    }
} elseif ($IncludeRuntimeSmoke) {
    Invoke-Step "Runtime smoke" {
        & (Join-Path $Root "scripts\smoke-runtime.ps1")
    }
} elseif ($IncludeApiSmoke) {
    Invoke-Step "API smoke" {
        & (Join-Path $Root "scripts\smoke-api.ps1")
    }

    if ($IncludeWebSmoke) {
        Invoke-Step "Web smoke" {
            & (Join-Path $Root "scripts\smoke-web.ps1")
        }
    }
} elseif ($IncludeWebSmoke) {
    Invoke-Step "Web smoke" {
        & (Join-Path $Root "scripts\smoke-web.ps1")
    }
}

if ($IncludeAndroidDeviceSmoke) {
    Invoke-Step "Android device smoke" {
        $AndroidSmokeArgs = @(
            "-DeviceWaitSeconds",
            [string] $AndroidDeviceWaitSeconds,
            "-EmulatorBootWaitSeconds",
            [string] $AndroidEmulatorBootWaitSeconds
        )
        if ($StartAndroidEmulator) {
            $AndroidSmokeArgs += "-StartEmulator"
        }
        if (-not [string]::IsNullOrWhiteSpace($AndroidAdbPath)) {
            $AndroidSmokeArgs += @("-AdbPath", $AndroidAdbPath)
        }
        if (-not [string]::IsNullOrWhiteSpace($AndroidDeviceSerial)) {
            $AndroidSmokeArgs += @("-DeviceSerial", $AndroidDeviceSerial)
        }
        if (-not [string]::IsNullOrWhiteSpace($AndroidAvdName)) {
            $AndroidSmokeArgs += @("-AvdName", $AndroidAvdName)
        }
        if (-not [string]::IsNullOrWhiteSpace($AndroidSmokeUsername)) {
            $AndroidSmokeArgs += @("-Username", $AndroidSmokeUsername)
        }
        if (-not [string]::IsNullOrWhiteSpace($AndroidSmokePassword)) {
            $AndroidSmokeArgs += @("-Password", $AndroidSmokePassword)
        }
        if ($RequireAndroidAuthenticatedFlow) {
            $AndroidSmokeArgs += "-RequireAuthenticatedFlow"
        }
        & (Join-Path $Root "scripts\smoke-android.ps1") @AndroidSmokeArgs
    }
}

Write-Host ""
Write-Host "All verification gates passed." -ForegroundColor Green
