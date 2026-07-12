param(
    [string] $WebBaseUrl = "",
    [string] $BackendBaseUrl = "",
    [string] $BrowserExecutablePath = "",
    [int] $TimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$WebRoot = Join-Path $Root "web"
$LogDir = Join-Path $Root "logs"
$WebOut = Join-Path $LogDir "web.out.log"
$WebErr = Join-Path $LogDir "web.err.log"

if ([string]::IsNullOrWhiteSpace($WebBaseUrl)) {
    $WebBaseUrl = if ([string]::IsNullOrWhiteSpace($env:WEB_BASE_URL)) {
        "https://192.168.1.159:5173"
    } else {
        $env:WEB_BASE_URL
    }
}

if ([string]::IsNullOrWhiteSpace($BackendBaseUrl)) {
    $BackendBaseUrl = if ([string]::IsNullOrWhiteSpace($env:BACKEND_BASE_URL)) {
        "https://192.168.1.159:8443"
    } else {
        $env:BACKEND_BASE_URL
    }
}

function Find-BrowserExecutable {
    $Candidates = @(
        $env:BROWSER_EXECUTABLE_PATH,
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    )

    foreach ($Candidate in $Candidates) {
        if (-not [string]::IsNullOrWhiteSpace($Candidate) -and (Test-Path $Candidate)) {
            return $Candidate
        }
    }

    throw "No Chrome or Edge executable found. Set BROWSER_EXECUTABLE_PATH and rerun the web smoke."
}

function Test-HttpOk {
    param([string] $Url)

    $Curl = Get-Command "curl.exe" -ErrorAction SilentlyContinue
    if ($Curl) {
        $PreviousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "SilentlyContinue"
        try {
            $StatusCode = & $Curl.Source --silent --insecure --output NUL --write-out "%{http_code}" --connect-timeout 2 --max-time 3 $Url 2>$null
        } catch {
            return $false
        } finally {
            $ErrorActionPreference = $PreviousErrorActionPreference
        }
        if ($LASTEXITCODE -eq 0) {
            $StatusText = ($StatusCode | Select-Object -Last 1).ToString().Trim()
            $ParsedStatus = 0
            if ([int]::TryParse($StatusText, [ref] $ParsedStatus)) {
                return $ParsedStatus -ge 200 -and $ParsedStatus -lt 300
            }
        }
        return $false
    }

    try {
        $Response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
        return $Response.StatusCode -ge 200 -and $Response.StatusCode -lt 300
    } catch {
        return $false
    }
}

function Start-ProcessWithEnvironment {
    param(
        [Parameter(Mandatory = $true)]
        [string] $FilePath,
        [Parameter(Mandatory = $true)]
        [string[]] $ArgumentList,
        [Parameter(Mandatory = $true)]
        [string] $WorkingDirectory,
        [Parameter(Mandatory = $true)]
        [string] $StandardOutputPath,
        [Parameter(Mandatory = $true)]
        [string] $StandardErrorPath,
        [Parameter(Mandatory = $true)]
        [hashtable] $Environment
    )

    $Original = @{}
    foreach ($Key in $Environment.Keys) {
        $Original[$Key] = [Environment]::GetEnvironmentVariable($Key, "Process")
        [Environment]::SetEnvironmentVariable($Key, [string] $Environment[$Key], "Process")
    }

    try {
        return Start-Process -FilePath $FilePath `
            -ArgumentList $ArgumentList `
            -WorkingDirectory $WorkingDirectory `
            -RedirectStandardOutput $StandardOutputPath `
            -RedirectStandardError $StandardErrorPath `
            -WindowStyle Hidden `
            -PassThru
    } finally {
        foreach ($Key in $Environment.Keys) {
            [Environment]::SetEnvironmentVariable($Key, $Original[$Key], "Process")
        }
    }
}

function Start-WebServerIfNeeded {
    if (Test-HttpOk $WebBaseUrl) {
        Write-Host "Reusing Web dev server at $WebBaseUrl. Ensure it was started with VITE_BACKEND_BASE_URL=$BackendBaseUrl." -ForegroundColor DarkCyan
        return $null
    }

    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $WebUri = [System.Uri]::new($WebBaseUrl)
    $WebPort = if ($WebUri.IsDefaultPort) { 443 } else { $WebUri.Port }
    $Process = Start-ProcessWithEnvironment `
        -FilePath "npm.cmd" `
        -ArgumentList @("run", "dev", "--", "--host", "0.0.0.0", "--port", [string] $WebPort) `
        -WorkingDirectory $WebRoot `
        -StandardOutputPath $WebOut `
        -StandardErrorPath $WebErr `
        -Environment @{
            VITE_BACKEND_BASE_URL = $BackendBaseUrl
            BACKEND_BASE_URL = $BackendBaseUrl
            VITE_DEV_HTTPS = "true"
        }

    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $Deadline) {
        if (Test-HttpOk $WebBaseUrl) {
            $PortProcessId = (Get-NetTCPConnection -LocalPort $WebPort -State Listen -ErrorAction SilentlyContinue |
                    Select-Object -First 1 -ExpandProperty OwningProcess)
            return @{
                LauncherProcess = $Process
                PortProcessId = $PortProcessId
            }
        }
        Start-Sleep -Seconds 2
    }

    if (-not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force
    }
    throw "Web dev server did not become ready at $WebBaseUrl."
}

$Browser = if ([string]::IsNullOrWhiteSpace($BrowserExecutablePath)) {
    Find-BrowserExecutable
} else {
    $BrowserExecutablePath
}

if (-not (Test-Path $Browser)) {
    throw "Browser executable not found: $Browser"
}

if ($WebBaseUrl -notmatch '^https://' -or $BackendBaseUrl -notmatch '^https://') {
    throw "Web and backend smoke targets must both use HTTPS. web=$WebBaseUrl backend=$BackendBaseUrl"
}

if (-not (Test-HttpOk "$BackendBaseUrl/api/v1/health")) {
    throw "Backend is not reachable at $BackendBaseUrl. Start backend before running web smoke."
}

Write-Host "Web smoke target web:     $WebBaseUrl" -ForegroundColor Cyan
Write-Host "Web smoke target backend: $BackendBaseUrl" -ForegroundColor Cyan
Write-Host "Web smoke browser:        $Browser" -ForegroundColor Cyan

$StartedProcess = Start-WebServerIfNeeded
try {
    Push-Location $WebRoot
    try {
        $env:WEB_BASE_URL = $WebBaseUrl
        $env:BACKEND_BASE_URL = $BackendBaseUrl
        $env:VITE_BACKEND_BASE_URL = $BackendBaseUrl
        $env:BROWSER_EXECUTABLE_PATH = $Browser
        $env:SMOKE_TIMEOUT_SECONDS = [string] $TimeoutSeconds
        node .\scripts\smoke-web.mjs
        if ($LASTEXITCODE -ne 0) {
            throw "Web smoke node runner failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
} finally {
    if ($null -ne $StartedProcess) {
        $ProcessIds = @(
            $StartedProcess.PortProcessId,
            $StartedProcess.LauncherProcess.Id
        ) | Where-Object { $null -ne $_ } | Select-Object -Unique

        foreach ($ProcessId in $ProcessIds) {
            $Process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
            if ($Process -and -not $Process.HasExited) {
                Stop-Process -Id $ProcessId -Force
            }
        }
    }
}
