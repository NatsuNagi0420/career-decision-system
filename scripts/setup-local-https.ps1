param(
    [string] $MkcertPath = "",
    [string] $OutputDirectory = "",
    [string[]] $Hosts = @(
        "localhost",
        "127.0.0.1",
        "::1",
        "10.0.2.2",
        "career.local.test",
        "api.career.local.test",
        "web.career.local.test"
    ),
    [string[]] $ExtraHosts = @(),
    [switch] $IncludeLanIps,
    [switch] $SkipInstallRootCA
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $Root ".local-https"
}

function Resolve-MkcertPath {
    param([string] $ConfiguredPath)

    $Candidates = @(
        $ConfiguredPath,
        "mkcert.exe"
    )

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $Candidates += Get-ChildItem `
            -Path (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages") `
            -Recurse `
            -Filter "mkcert*.exe" `
            -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty FullName
    }

    foreach ($Candidate in $Candidates) {
        if ([string]::IsNullOrWhiteSpace($Candidate)) {
            continue
        }

        $Command = Get-Command $Candidate -ErrorAction SilentlyContinue
        if ($Command) {
            return $Command.Source
        }

        if (Test-Path $Candidate) {
            return (Resolve-Path $Candidate).Path
        }
    }

    throw "mkcert was not found. Install it with: winget install --id FiloSottile.mkcert --exact"
}

function Get-LanIpHosts {
    $PrivateIpv4Pattern = "^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)"

    try {
        return @(
            Get-NetIPConfiguration |
                Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq "Up" } |
                ForEach-Object { $_.IPv4Address.IPAddress } |
                Where-Object { $_ -match $PrivateIpv4Pattern } |
                Sort-Object -Unique
        )
    } catch {
        Write-Warning "Unable to detect LAN IP addresses automatically. Pass them with -ExtraHosts instead."
        return @()
    }
}

if ($IncludeLanIps) {
    $DetectedLanIps = Get-LanIpHosts
    if ($DetectedLanIps.Count -eq 0) {
        Write-Warning "No private LAN IP address was detected."
    }
    $Hosts += $DetectedLanIps
}

if ($ExtraHosts.Count -gt 0) {
    $Hosts += $ExtraHosts
}

$Hosts = @(
    $Hosts |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_.Trim() } |
        Sort-Object -Unique
)

if ($Hosts.Count -eq 0) {
    throw "At least one HTTPS host is required."
}

$ResolvedMkcert = Resolve-MkcertPath $MkcertPath
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

if (-not $SkipInstallRootCA) {
    & $ResolvedMkcert -install
}

$CertPath = Join-Path $OutputDirectory "local-cert.pem"
$KeyPath = Join-Path $OutputDirectory "local-key.pem"
$BackendP12Path = Join-Path $OutputDirectory "backend-local.p12"
$AndroidDebugCaDirectory = Join-Path $Root "android\app\src\debug\res\raw"
$AndroidDebugCaPath = Join-Path $AndroidDebugCaDirectory "local_debug_ca.pem"

& $ResolvedMkcert -cert-file $CertPath -key-file $KeyPath @Hosts
& $ResolvedMkcert -pkcs12 -p12-file $BackendP12Path @Hosts

$CaRoot = & $ResolvedMkcert -CAROOT
$RootCaPath = Join-Path $CaRoot "rootCA.pem"
if (Test-Path $RootCaPath) {
    $ExportedRootCaPath = Join-Path $OutputDirectory "mkcert-rootCA.pem"
    Copy-Item -LiteralPath $RootCaPath -Destination $ExportedRootCaPath -Force
    New-Item -ItemType Directory -Force -Path $AndroidDebugCaDirectory | Out-Null
    Copy-Item -LiteralPath $RootCaPath -Destination $AndroidDebugCaPath -Force
}

Write-Host ""
Write-Host "Local HTTPS certificates are ready." -ForegroundColor Green
Write-Host "mkcert:      $ResolvedMkcert"
Write-Host "cert:        $CertPath"
Write-Host "key:         $KeyPath"
Write-Host "backend p12: $BackendP12Path"
Write-Host "Android CA: $AndroidDebugCaPath"
Write-Host "hosts:       $($Hosts -join ', ')"
Write-Host "p12 pass:    changeit"
