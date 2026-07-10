param(
    [string] $BackendBaseUrl = "",
    [string] $AgentBaseUrl = "",
    [string] $WebBaseUrl = "",
    [string] $InternalToken = "",
    [string] $BrowserExecutablePath = "",
    [int] $TimeoutSeconds = 120,
    [switch] $SkipWebSmoke
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$AgentRoot = Join-Path $Root "agent_server"
$BackendRoot = Join-Path $Root "backend"
$LogDir = Join-Path $Root "logs"
$AgentPython = Join-Path $AgentRoot ".venv\Scripts\python.exe"

if ([string]::IsNullOrWhiteSpace($BackendBaseUrl)) {
    $BackendBaseUrl = if ([string]::IsNullOrWhiteSpace($env:BACKEND_BASE_URL)) {
        "http://127.0.0.1:8080"
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
        "http://127.0.0.1:5173"
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

    try {
        $Response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
        return $Response.StatusCode -eq 200
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
    $Process = Start-ProcessWithEnvironment `
        -FilePath $AgentPython `
        -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", [string] $Port) `
        -WorkingDirectory $AgentRoot `
        -StandardOutputPath (Join-Path $LogDir "agent-runtime.out.log") `
        -StandardErrorPath (Join-Path $LogDir "agent-runtime.err.log") `
        -Environment @{
            INTERNAL_API_TOKEN = $InternalToken
            BACKEND_BASE_URL = $BackendBaseUrl
            LLM_PROVIDER = if ([string]::IsNullOrWhiteSpace($env:LLM_PROVIDER)) { "mock" } else { $env:LLM_PROVIDER }
        }

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

    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Write-Host "Starting backend at $BackendBaseUrl" -ForegroundColor Cyan
    $WebOrigin = ([System.Uri]::new($WebBaseUrl)).GetLeftPart([System.UriPartial]::Authority)
    $Process = Start-ProcessWithEnvironment `
        -FilePath "mvn.cmd" `
        -ArgumentList @("spring-boot:run") `
        -WorkingDirectory $BackendRoot `
        -StandardOutputPath (Join-Path $LogDir "backend-runtime.out.log") `
        -StandardErrorPath (Join-Path $LogDir "backend-runtime.err.log") `
        -Environment @{
            SERVER_PORT = $Port
            AGENT_SERVER_BASE_URL = $AgentBaseUrl
            AGENT_INTERNAL_TOKEN = $InternalToken
            INTERNAL_API_TOKEN = $InternalToken
            DATA_SERVER_ROOT = (Join-Path $BackendRoot "data_server")
            CORS_ALLOWED_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,$WebOrigin"
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

$StartedAgent = $null
$StartedBackend = $null

try {
    $StartedAgent = Start-AgentIfNeeded
    $StartedBackend = Start-BackendIfNeeded

    & (Join-Path $PSScriptRoot "smoke-api.ps1") `
        -BackendBaseUrl $BackendBaseUrl `
        -AgentBaseUrl $AgentBaseUrl `
        -TimeoutSeconds 30

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
