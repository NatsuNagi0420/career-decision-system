param(
    [string] $BackendBaseUrl = "",
    [string] $AgentBaseUrl = "",
    [string] $WebBaseUrl = "",
    [string] $InternalToken = "",
    [string] $BrowserExecutablePath = "",
    [int] $TimeoutSeconds = 120,
    [switch] $SkipWebSmoke,
    [switch] $RequireRealModel
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$AgentRoot = Join-Path $Root "agent_server"
$BackendRoot = Join-Path $Root "backend"
$LogDir = Join-Path $Root "logs"
$HttpsDir = Join-Path $Root ".local-https"
$BackendKeyStore = Join-Path $HttpsDir "backend-local.p12"
$BackendKeyStoreUri = "file:" + ($BackendKeyStore -replace "\\", "/")
$AgentPython = Join-Path $AgentRoot ".venv\Scripts\python.exe"

if ([string]::IsNullOrWhiteSpace($BackendBaseUrl)) {
    $BackendBaseUrl = if ([string]::IsNullOrWhiteSpace($env:BACKEND_BASE_URL)) {
        "https://192.168.1.159:8443"
    } else {
        $env:BACKEND_BASE_URL
    }
}

if ([string]::IsNullOrWhiteSpace($AgentBaseUrl)) {
    $AgentBaseUrl = if ([string]::IsNullOrWhiteSpace($env:AGENT_SERVER_BASE_URL)) {
        "http://127.0.0.1:8001"
    } else {
        $env:AGENT_SERVER_BASE_URL
    }
}

if ([string]::IsNullOrWhiteSpace($WebBaseUrl)) {
    $WebBaseUrl = if ([string]::IsNullOrWhiteSpace($env:WEB_BASE_URL)) {
        "https://192.168.1.159:5173"
    } else {
        $env:WEB_BASE_URL
    }
}

if ([string]::IsNullOrWhiteSpace($InternalToken)) {
    $InternalToken = if (-not [string]::IsNullOrWhiteSpace($env:AGENT_INTERNAL_TOKEN)) {
        $env:AGENT_INTERNAL_TOKEN
    } elseif (-not [string]::IsNullOrWhiteSpace($env:INTERNAL_API_TOKEN)) {
        $env:INTERNAL_API_TOKEN
    } else {
        "change-me"
    }
}

function Join-Url {
    param(
        [Parameter(Mandatory = $true)]
        [string] $BaseUrl,
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    return $BaseUrl.TrimEnd("/") + "/" + $Path.TrimStart("/")
}

function Get-UrlPort {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Url
    )

    $Uri = [System.Uri]::new($Url)
    if (-not $Uri.IsDefaultPort) {
        return $Uri.Port
    }
    if ($Uri.Scheme -eq "https") {
        return 443
    }
    return 80
}

function Get-ListeningProcessId {
    param(
        [Parameter(Mandatory = $true)]
        [int] $Port
    )

    return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty OwningProcess
}

function Test-HttpOk {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Url
    )

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

function Wait-HttpOk {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Url,
        [Parameter(Mandatory = $true)]
        [int] $Seconds
    )

    $Deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $Deadline) {
        if (Test-HttpOk $Url) {
            return $true
        }
        Start-Sleep -Seconds 2
    }
    return $false
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

function Stop-StartedService {
    param([object] $StartedService)

    if ($null -eq $StartedService) {
        return
    }

    $ProcessIds = @(
        $StartedService.PortProcessId,
        $StartedService.LauncherProcess.Id
    ) | Where-Object { $null -ne $_ } | Select-Object -Unique

    foreach ($ProcessId in $ProcessIds) {
        $Process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if ($Process -and -not $Process.HasExited) {
            Stop-Process -Id $ProcessId -Force
        }
    }
}

function Start-AgentIfNeeded {
    $HealthUrl = Join-Url $AgentBaseUrl "/api/v1/health"
    if (Wait-HttpOk $HealthUrl 5) {
        Write-Host "Reusing Agent Server at $AgentBaseUrl" -ForegroundColor DarkCyan
        return $null
    }

    $Port = Get-UrlPort $AgentBaseUrl
    $ExistingPortProcess = Get-ListeningProcessId $Port
    if ($null -ne $ExistingPortProcess) {
        throw "Port $Port is already occupied but Agent health is not reachable at $HealthUrl."
    }

    if (-not (Test-Path $AgentPython)) {
        throw "Agent virtual environment not found: $AgentPython"
    }

    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Write-Host "Starting Agent Server at $AgentBaseUrl" -ForegroundColor Cyan
    $AgentEnvironment = @{
        INTERNAL_API_TOKEN = $InternalToken
        BACKEND_BASE_URL = $BackendBaseUrl
    }
    if (-not $RequireRealModel) {
        $AgentEnvironment.LLM_PROVIDER = "mock"
    }

    $Process = Start-ProcessWithEnvironment `
        -FilePath $AgentPython `
        -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", [string] $Port) `
        -WorkingDirectory $AgentRoot `
        -StandardOutputPath (Join-Path $LogDir "agent-runtime.out.log") `
        -StandardErrorPath (Join-Path $LogDir "agent-runtime.err.log") `
        -Environment $AgentEnvironment

    if (-not (Wait-HttpOk $HealthUrl $TimeoutSeconds)) {
        Stop-StartedService @{ LauncherProcess = $Process; PortProcessId = $null }
        throw "Agent Server did not become healthy at $HealthUrl. See logs\agent-runtime.err.log."
    }

    return @{
        LauncherProcess = $Process
        PortProcessId = Get-ListeningProcessId $Port
    }
}

function Start-BackendIfNeeded {
    $HealthUrl = Join-Url $BackendBaseUrl "/api/v1/health"
    $ReadyUrl = Join-Url $BackendBaseUrl "/api/v1/ready"
    if (Wait-HttpOk $HealthUrl 5) {
        Write-Host "Reusing backend at $BackendBaseUrl" -ForegroundColor DarkCyan
        return $null
    }

    $Port = Get-UrlPort $BackendBaseUrl
    $ExistingPortProcess = Get-ListeningProcessId $Port
    if ($null -ne $ExistingPortProcess) {
        throw "Port $Port is already occupied but backend health is not reachable at $HealthUrl."
    }

    if (-not (Test-Path $BackendKeyStore)) {
        throw "Local HTTPS keystore not found. Run scripts\setup-local-https.ps1 first: $BackendKeyStore"
    }

    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Write-Host "Starting backend at $BackendBaseUrl" -ForegroundColor Cyan
    $WebOrigin = ([System.Uri]::new($WebBaseUrl)).GetLeftPart([System.UriPartial]::Authority)
    $Process = Start-ProcessWithEnvironment `
        -FilePath "mvn.cmd" `
        -ArgumentList @("spring-boot:run", "-Dspring-boot.run.profiles=local-https") `
        -WorkingDirectory $BackendRoot `
        -StandardOutputPath (Join-Path $LogDir "backend-runtime.out.log") `
        -StandardErrorPath (Join-Path $LogDir "backend-runtime.err.log") `
        -Environment @{
            SERVER_PORT = $Port
            SERVER_ADDRESS = "0.0.0.0"
            SERVER_SSL_KEY_STORE = $BackendKeyStoreUri
            SERVER_SSL_KEY_STORE_PASSWORD = "changeit"
            SERVER_SSL_KEY_STORE_TYPE = "PKCS12"
            AGENT_SERVER_BASE_URL = $AgentBaseUrl
            AGENT_INTERNAL_TOKEN = $InternalToken
            INTERNAL_API_TOKEN = $InternalToken
            DATA_SERVER_ROOT = (Join-Path $BackendRoot "data_server")
            CORS_ALLOWED_ORIGINS = "https://localhost:5173,https://127.0.0.1:5173,$WebOrigin"
        }

    if (-not (Wait-HttpOk $ReadyUrl $TimeoutSeconds)) {
        Stop-StartedService @{ LauncherProcess = $Process; PortProcessId = $null }
        throw "Backend did not become ready at $ReadyUrl. See logs\backend-runtime.err.log."
    }

    return @{
        LauncherProcess = $Process
        PortProcessId = Get-ListeningProcessId $Port
    }
}

Write-Host "Runtime smoke target agent:   $AgentBaseUrl" -ForegroundColor Cyan
Write-Host "Runtime smoke target backend: $BackendBaseUrl" -ForegroundColor Cyan
Write-Host "Runtime smoke target web:     $WebBaseUrl" -ForegroundColor Cyan

if ($BackendBaseUrl -notmatch '^https://' -or $WebBaseUrl -notmatch '^https://') {
    throw "Runtime smoke requires HTTPS for backend and Web. backend=$BackendBaseUrl web=$WebBaseUrl"
}

$StartedAgent = $null
$StartedBackend = $null

try {
    $StartedAgent = Start-AgentIfNeeded
    $StartedBackend = Start-BackendIfNeeded

    $ApiSmokeArguments = @{
        BackendBaseUrl = $BackendBaseUrl
        AgentBaseUrl = $AgentBaseUrl
        TimeoutSeconds = 30
    }
    if ($RequireRealModel) {
        $ApiSmokeArguments["RequireRealModel"] = $true
    }
    & (Join-Path $PSScriptRoot "smoke-api.ps1") @ApiSmokeArguments

    if (-not $SkipWebSmoke) {
        & (Join-Path $PSScriptRoot "smoke-web.ps1") `
            -WebBaseUrl $WebBaseUrl `
            -BackendBaseUrl $BackendBaseUrl `
            -BrowserExecutablePath $BrowserExecutablePath `
            -TimeoutSeconds $TimeoutSeconds
    }

    Write-Host ""
    Write-Host "Runtime smoke passed." -ForegroundColor Green
} finally {
    Stop-StartedService $StartedBackend
    Stop-StartedService $StartedAgent
}
