param(
    [ValidateSet("menu", "agent", "backend", "web", "all", "sync-ip", "status", "logs", "stop", "stop-agent", "stop-backend", "stop-web", "exit")]
    [string] $Target = "menu",
    [string] $LanIp = "",
    [int] $AgentPort = 8001,
    [int] $BackendPort = 8443,
    [int] $WebPort = 5173,
    [string] $InternalToken = "change-me"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$AgentRoot = Join-Path $Root "agent_server"
$BackendRoot = Join-Path $Root "backend"
$WebRoot = Join-Path $Root "web"
$LogDir = Join-Path $Root "logs"
$HttpsDir = Join-Path $Root ".local-https"
$AgentPython = Join-Path $AgentRoot ".venv\Scripts\python.exe"
$BackendKeyStore = Join-Path $HttpsDir "backend-local.p12"
$BackendKeyStoreUri = "file:" + ($BackendKeyStore -replace "\\", "/")
$BackendDataRoot = Join-Path $BackendRoot "data_server"
$LanIpStatePath = Join-Path $HttpsDir "active-lan-ip.txt"
$LanIpWasProvided = -not [string]::IsNullOrWhiteSpace($LanIp)

function Test-PrivateIpv4 {
    param([string] $Address)

    if ([string]::IsNullOrWhiteSpace($Address)) { return $false }
    $ParsedAddress = $null
    if (-not [System.Net.IPAddress]::TryParse($Address.Trim(), [ref] $ParsedAddress)) { return $false }
    if ($ParsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { return $false }
    return $Address.Trim() -match "^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)"
}

function Get-SavedLanIp {
    if (-not (Test-Path $LanIpStatePath)) { return "" }
    $SavedAddress = (Get-Content -LiteralPath $LanIpStatePath -Raw -ErrorAction SilentlyContinue).Trim()
    if (Test-PrivateIpv4 $SavedAddress) { return $SavedAddress }
    return ""
}

function Get-DetectedLanIps {
    $Candidates = @()
    $VirtualAdapterPattern = "Loopback|Virtual|VMware|Hyper-V|WSL|Docker|Meta|vEthernet|WireGuard|Tailscale|ZeroTier|VPN"

    try {
        $DefaultRoutes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop |
            Where-Object { $_.State -eq "Alive" -and $_.NextHop -ne "0.0.0.0" } |
            Sort-Object @{ Expression = { [int] $_.RouteMetric + [int] $_.InterfaceMetric } })
        foreach ($Route in $DefaultRoutes) {
            $Addresses = @(Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $Route.InterfaceIndex -ErrorAction SilentlyContinue |
                Where-Object { $_.AddressState -eq "Preferred" -and $_.InterfaceAlias -notmatch $VirtualAdapterPattern })
            foreach ($Address in $Addresses) {
                if (Test-PrivateIpv4 $Address.IPAddress) { $Candidates += $Address.IPAddress }
            }
        }
    } catch {
        # 下面使用活动网卡列表回退。
    }

    if ($Candidates.Count -eq 0) {
        try {
            $Candidates = @(Get-NetIPConfiguration -ErrorAction Stop |
                Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq "Up" -and $_.InterfaceAlias -notmatch $VirtualAdapterPattern } |
                ForEach-Object { $_.IPv4Address.IPAddress } |
                Where-Object { Test-PrivateIpv4 $_ })
        } catch {
            $Candidates = @()
        }
    }

    @($Candidates | Select-Object -Unique)
}

function Resolve-LanIp {
    param([string] $ConfiguredAddress)

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredAddress)) {
        if (-not (Test-PrivateIpv4 $ConfiguredAddress)) {
            throw "-LanIp 必须是私有局域网 IPv4 地址，当前值：$ConfiguredAddress"
        }
        return $ConfiguredAddress.Trim()
    }

    $DetectedAddresses = @(Get-DetectedLanIps)
    if ($DetectedAddresses.Count -gt 0) { return $DetectedAddresses[0] }

    $SavedAddress = Get-SavedLanIp
    if (-not [string]::IsNullOrWhiteSpace($SavedAddress)) {
        Write-Warning "未检测到活动局域网地址，暂时使用上次地址：$SavedAddress"
        return $SavedAddress
    }

    throw "未检测到私有局域网 IPv4 地址。请连接网络，或使用 -LanIp 手动指定。"
}

function Update-NetworkUrls {
    $script:AgentUrl = "http://127.0.0.1:$AgentPort"
    $script:BackendUrl = "https://${LanIp}:$BackendPort"
    $script:WebUrl = "https://${LanIp}:$WebPort"
}

$LanIp = Resolve-LanIp $LanIp
Update-NetworkUrls

function Show-Menu {
    Refresh-DetectedLanIp | Out-Null
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "职业决策系统 - 本地局域网 HTTPS 调试启动器" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "当前局域网 IP: $LanIp"
    $SavedAddress = Get-SavedLanIp
    if (-not [string]::IsNullOrWhiteSpace($SavedAddress) -and $SavedAddress -ne $LanIp) {
        Write-Host "上次同步 IP: $SavedAddress（检测到网络变化）" -ForegroundColor Yellow
    }
    Write-Host "后端地址: $BackendUrl"
    Write-Host "Web 地址 : $WebUrl"
    Write-Host "Agent地址: $AgentUrl"
    Write-Host ""
    Write-Host "说明：启动后的服务会在后台运行；关闭这个菜单窗口不会自动停止服务。" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. 只启动 Agent 层"
    Write-Host "2. 启动 Agent + 后端"
    Write-Host "3. 启动 Agent + 后端 + Web"
    Write-Host "4. 检测并同步局域网 IP"
    Write-Host "5. 查看运行状态"
    Write-Host "6. 查看最近日志"
    Write-Host "7. 只停止 Web"
    Write-Host "8. 只停止后端"
    Write-Host "9. 只停止 Agent"
    Write-Host "10. 停止全部服务"
    Write-Host "0. 退出启动器"
    Write-Host ""

    $Choice = Read-Host "请选择 [默认 3]"
    if ([string]::IsNullOrWhiteSpace($Choice)) { return "web" }
    switch ($Choice.Trim()) {
        "1" { return "agent" }
        "2" { return "backend" }
        "3" { return "web" }
        "4" { return "sync-ip" }
        "5" { return "status" }
        "6" { return "logs" }
        "7" { return "stop-web" }
        "8" { return "stop-backend" }
        "9" { return "stop-agent" }
        "10" { return "stop" }
        "0" { return "exit" }
        "agent" { return "agent" }
        "backend" { return "backend" }
        "web" { return "web" }
        "all" { return "web" }
        "sync-ip" { return "sync-ip" }
        "status" { return "status" }
        "logs" { return "logs" }
        "stop" { return "stop" }
        "stop-web" { return "stop-web" }
        "stop-backend" { return "stop-backend" }
        "stop-agent" { return "stop-agent" }
        default { throw "选择无效：$Choice" }
    }
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
        Start-Process -FilePath $FilePath `
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

function Wait-HttpOk {
    param([string] $Url, [int] $Seconds)
    Write-Host "正在等待服务可用：$Url"
    $Deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $Deadline) {
        if (Test-HttpOk $Url) { return }
        Start-Sleep -Seconds 2
    }
    throw "等待超时：$Url。请查看 logs 目录。"
}

function Get-PortProcessIds {
    param([int] $Port)

    $ProcessIds = @()
    $Netstat = Get-Command "netstat.exe" -ErrorAction SilentlyContinue
    if ($Netstat) {
        $PreviousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "SilentlyContinue"
        try {
            $Lines = & $Netstat.Source -ano -p tcp 2>$null
            foreach ($Line in $Lines) {
                $Text = $Line.ToString().Trim()
                if ($Text -notmatch "\sLISTENING\s") { continue }

                $Parts = $Text -split "\s+"
                if ($Parts.Count -lt 5) { continue }

                $LocalAddress = $Parts[1]
                $PidText = $Parts[$Parts.Count - 1]
                if ($LocalAddress -notmatch ":$Port$") { continue }

                $ParsedProcessId = 0
                if ([int]::TryParse($PidText, [ref] $ParsedProcessId) -and $ParsedProcessId -gt 0) {
                    $ProcessIds += $ParsedProcessId
                }
            }
        } finally {
            $ErrorActionPreference = $PreviousErrorActionPreference
        }
    }

    if ($ProcessIds.Count -eq 0) {
        $ProcessIds = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique)
    }

    @($ProcessIds | Sort-Object -Unique)
}

function Get-ProcessParentRowsFromCounters {
    $RowsByInstance = @{}
    try {
        $CounterResult = Get-Counter `
            -Counter @("\Process(*)\ID Process", "\Process(*)\Creating Process ID") `
            -ErrorAction SilentlyContinue
        foreach ($Sample in @($CounterResult.CounterSamples)) {
            if ($null -eq $Sample -or $Sample.Status -ne 0) { continue }

            $Match = [regex]::Match(
                [string] $Sample.Path,
                "(?i)\\process\((?<instance>[^)]+)\)\\(?<counter>id process|creating process id)$"
            )
            if (-not $Match.Success) { continue }

            $Instance = $Match.Groups["instance"].Value
            if (-not $RowsByInstance.ContainsKey($Instance)) {
                $RowsByInstance[$Instance] = [ordered]@{
                    ProcessId = 0
                    ParentProcessId = 0
                }
            }

            $Value = [int] $Sample.CookedValue
            if ($Match.Groups["counter"].Value -ieq "id process") {
                $RowsByInstance[$Instance].ProcessId = $Value
            } else {
                $RowsByInstance[$Instance].ParentProcessId = $Value
            }
        }
    } catch {
        return @()
    }

    @($RowsByInstance.Values |
        Where-Object { $_.ProcessId -gt 0 } |
        ForEach-Object { [PSCustomObject] $_ })
}

function Test-ServiceChildProcess {
    param(
        [int] $ProcessId,
        [int] $Port
    )

    $Process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $Process) { return $false }

    if ($Port -eq $AgentPort) { return $Process.ProcessName -in @("python", "pythonw") }
    if ($Port -eq $WebPort) { return $Process.ProcessName -in @("node", "nodejs") }
    if ($Port -eq $BackendPort) { return $Process.ProcessName -eq "java" }
    return $true
}

function Get-ChildProcessIds {
    param(
        [int[]] $ParentProcessIds,
        [int] $Port = 0
    )

    $AllProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Select-Object ProcessId, ParentProcessId)
    if ($AllProcesses.Count -eq 0) {
        # Uvicorn workers can retain an inherited socket after the reload parent exits.
        # Performance counters preserve parent PIDs when CIM is unavailable.
        $AllProcesses = @(Get-ProcessParentRowsFromCounters)
    }
    $Queue = New-Object System.Collections.Queue
    $Seen = @{}
    $Children = @()

    foreach ($ParentProcessId in $ParentProcessIds) {
        if ($ParentProcessId -gt 0) {
            $Queue.Enqueue($ParentProcessId)
            $Seen[[string] $ParentProcessId] = $true
        }
    }

    while ($Queue.Count -gt 0) {
        $CurrentProcessId = [int] $Queue.Dequeue()
        foreach ($Process in $AllProcesses | Where-Object { $_.ParentProcessId -eq $CurrentProcessId }) {
            $ProcessIdText = [string] $Process.ProcessId
            if (-not $Seen.ContainsKey($ProcessIdText)) {
                $ChildProcessId = [int] $Process.ProcessId
                $Queue.Enqueue($ChildProcessId)
                $Seen[$ProcessIdText] = $true
                if (Test-ServiceChildProcess $ChildProcessId $Port) {
                    $Children += $ChildProcessId
                }
            }
        }
    }

    @($Children | Sort-Object -Unique)
}

function Get-KnownDevProcessIds {
    param([int] $Port)

    $ProcessIds = @()
    $AllProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    foreach ($Process in $AllProcesses) {
        $CommandLine = [string] $Process.CommandLine
        if ([string]::IsNullOrWhiteSpace($CommandLine)) { continue }

        if ($Port -eq $AgentPort -and
            $CommandLine -like "*uvicorn*app.main:app*" -and
            $CommandLine -like "*--port*$AgentPort*") {
            $ProcessIds += [int] $Process.ProcessId
            continue
        }

        if ($Port -eq $WebPort -and
            $CommandLine -like "*vite*" -and
            $CommandLine -like "*--port*$WebPort*") {
            $ProcessIds += [int] $Process.ProcessId
            continue
        }

        if ($Port -eq $BackendPort -and
            $CommandLine -like "*com.careerdecision.backend.BackendApplication*") {
            $ProcessIds += [int] $Process.ProcessId
            continue
        }
    }

    @($ProcessIds | Sort-Object -Unique)
}

function Test-PortOpen {
    param([int] $Port)
    return (Get-PortProcessIds $Port).Count -gt 0
}

function Get-AgentProvider {
    try {
        $Response = Invoke-WebRequest -UseBasicParsing -Uri "$AgentUrl/api/v1/health" -TimeoutSec 3
        $Body = $Response.Content | ConvertFrom-Json
        if ($Body.code -eq 0 -and -not [string]::IsNullOrWhiteSpace([string] $Body.data.llmProvider)) {
            return [string] $Body.data.llmProvider
        }
    } catch {
        return $null
    }
    return $null
}

function Get-ServiceDefinitions {
    @(
        @{
            Name = "Agent"
            Port = $AgentPort
            HealthUrl = "$AgentUrl/api/v1/health"
            DisplayUrl = $AgentUrl
            LogOut = Join-Path $LogDir "agent-dev.out.log"
            LogErr = Join-Path $LogDir "agent-dev.err.log"
        },
        @{
            Name = "后端"
            Port = $BackendPort
            HealthUrl = "https://127.0.0.1:$BackendPort/api/v1/health"
            DisplayUrl = $BackendUrl
            LogOut = Join-Path $LogDir "backend-dev.out.log"
            LogErr = Join-Path $LogDir "backend-dev.err.log"
        },
        @{
            Name = "Web"
            Port = $WebPort
            HealthUrl = "https://127.0.0.1:$WebPort"
            DisplayUrl = $WebUrl
            LogOut = Join-Path $LogDir "web-dev.out.log"
            LogErr = Join-Path $LogDir "web-dev.err.log"
        }
    )
}

function Show-Status {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "当前运行状态" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    $SavedAddress = Get-SavedLanIp
    if (-not [string]::IsNullOrWhiteSpace($SavedAddress) -and $SavedAddress -ne $LanIp) {
        Write-Host "检测到网络变化：已同步 $SavedAddress，当前 $LanIp。请执行 .\start-dev.bat sync-ip。" -ForegroundColor Yellow
        Write-Host ""
    }

    foreach ($Service in Get-ServiceDefinitions) {
        $Port = [int] $Service.Port
        $PortProcessIds = @(Get-PortProcessIds $Port)
        $KnownProcessIds = @(Get-KnownDevProcessIds $Port)
        $ProcessIds = @(@($PortProcessIds) + @($KnownProcessIds)) | Sort-Object -Unique
        $HealthOk = Test-HttpOk ([string] $Service.HealthUrl)

        if ($ProcessIds.Count -eq 0) {
            Write-Host "[$($Service.Name)] 未运行。端口 $Port 空闲。" -ForegroundColor DarkGray
            continue
        }

        if ($HealthOk) {
            Write-Host "[$($Service.Name)] 正常运行：$($Service.DisplayUrl)" -ForegroundColor Green
        } else {
            Write-Host "[$($Service.Name)] 端口 $Port 有进程，但健康检查未通过。" -ForegroundColor Yellow
        }

        Write-Host "  PID: $($ProcessIds -join ', ')"
        if ($HealthOk -and $Service.Name -eq "Agent") {
            $Provider = Get-AgentProvider
            if (-not [string]::IsNullOrWhiteSpace($Provider)) {
                Write-Host "  模型: $Provider"
            }
        }
        Write-Host "  日志: $($Service.LogOut)"
        Write-Host "        $($Service.LogErr)"
    }

    Write-Host ""
    Write-Host "常用命令：" -ForegroundColor Cyan
    Write-Host "  .\start-dev.bat status       查看状态"
    Write-Host "  .\start-dev.bat sync-ip      检测并同步局域网 IP"
    Write-Host "  .\start-dev.bat logs         查看最近错误日志"
    Write-Host "  .\start-dev.bat stop         停止全部"
    Write-Host "  .\start-dev.bat stop-web     只停止 Web"
    Write-Host "  .\start-dev.bat stop-backend 只停止后端"
    Write-Host "  .\start-dev.bat stop-agent   只停止 Agent"
}

function Stop-ProcessTree {
    param([int] $TargetProcessId)

    if ($TargetProcessId -le 0) { return $false }

    $Taskkill = Get-Command "taskkill.exe" -ErrorAction SilentlyContinue
    if ($Taskkill) {
        $PreviousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "SilentlyContinue"
        try {
            & $Taskkill.Source /PID $TargetProcessId /T /F >$null 2>$null
            if ($LASTEXITCODE -eq 0) { return $true }
        } finally {
            $ErrorActionPreference = $PreviousErrorActionPreference
        }
    }

    $Process = Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue
    if ($Process) {
        try {
            Stop-Process -Id $TargetProcessId -Force -ErrorAction Stop
            return $true
        } catch {
            return $false
        }
    }

    return $false
}

function Stop-Port {
    param([int] $Port)

    $HadListener = $false
    for ($Attempt = 1; $Attempt -le 20; $Attempt++) {
        $ProcessIds = Get-PortProcessIds $Port
        if ($ProcessIds.Count -eq 0) {
            if ($HadListener) {
                Write-Host "端口 $Port 已释放。" -ForegroundColor DarkGray
            } else {
                Write-Host "端口 $Port 没有监听进程。" -ForegroundColor DarkGray
            }
            return
        }

        $HadListener = $true
        $BaseProcessIds = @(@($ProcessIds) + @(Get-KnownDevProcessIds $Port)) | Sort-Object -Unique
        $TargetProcessIds = @(@($BaseProcessIds) + @(Get-ChildProcessIds $BaseProcessIds $Port)) | Sort-Object -Unique
        foreach ($TargetProcessId in $TargetProcessIds) {
            if (Stop-ProcessTree $TargetProcessId) {
                Write-Host "已停止端口 $Port 的进程 PID=$TargetProcessId" -ForegroundColor Yellow
            } elseif ($Attempt -eq 1) {
                Write-Host "未能直接停止 PID=$TargetProcessId（进程可能已退出或当前权限不足），继续检查关联进程。" -ForegroundColor DarkGray
            }
        }

        Start-Sleep -Milliseconds 500
    }

    $Remaining = Get-PortProcessIds $Port
    if ($Remaining.Count -gt 0) {
        $FinalBaseProcessIds = @(@($Remaining) + @(Get-KnownDevProcessIds $Port)) | Sort-Object -Unique
        $FinalTargetProcessIds = @(@($FinalBaseProcessIds) + @(Get-ChildProcessIds $FinalBaseProcessIds $Port)) | Sort-Object -Unique
        foreach ($FinalTargetProcessId in $FinalTargetProcessIds) {
            if (Stop-ProcessTree $FinalTargetProcessId) {
                Write-Host "已停止端口 $Port 的进程 PID=$FinalTargetProcessId" -ForegroundColor Yellow
            }
        }

        Start-Sleep -Milliseconds 1000
        $Remaining = Get-PortProcessIds $Port
    }

    if ($Remaining.Count -eq 0) {
        Write-Host "端口 $Port 已释放。" -ForegroundColor DarkGray
    } else {
        Write-Host "端口 $Port 仍未释放，剩余监听 PID=$($Remaining -join ', ')。请稍后重试 stop。" -ForegroundColor Yellow
    }
}

function Stop-ServicePort {
    param(
        [string] $Name,
        [int] $Port
    )

    Write-Host ""
    Write-Host "[$Name] 正在停止端口 $Port 的进程..." -ForegroundColor Cyan
    Stop-Port $Port
}

function Stop-AllServices {
    Stop-ServicePort "Web" $WebPort
    Stop-ServicePort "后端" $BackendPort
    Stop-ServicePort "Agent" $AgentPort
}

function Ensure-LocalEnvFile {
    param(
        [string] $Path,
        [string] $ExamplePath
    )

    if (Test-Path $Path) { return }
    if (-not (Test-Path $ExamplePath)) { throw "找不到本地配置模板：$ExamplePath" }
    Copy-Item -LiteralPath $ExamplePath -Destination $Path
    Write-Host "已从模板创建本地配置：$Path" -ForegroundColor Yellow
}

function Set-EnvFileValue {
    param(
        [string] $Path,
        [string] $Name,
        [string] $Value
    )

    $Original = [System.IO.File]::ReadAllText($Path)
    $Pattern = "(?m)^[\t ]*" + [regex]::Escape($Name) + "[\t ]*=.*$"
    $Replacement = "$Name=$Value"
    if ([regex]::IsMatch($Original, $Pattern)) {
        $Updated = [regex]::Replace($Original, $Pattern, $Replacement, 1)
    } else {
        $Separator = if ($Original.EndsWith("`n") -or $Original.Length -eq 0) { "" } else { "`r`n" }
        $Updated = $Original + $Separator + $Replacement + "`r`n"
    }

    if ($Updated -ceq $Original) { return $false }

    $TemporaryPath = "$Path.tmp"
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($TemporaryPath, $Updated, $Utf8NoBom)
    Move-Item -LiteralPath $TemporaryPath -Destination $Path -Force
    return $true
}

function Refresh-DetectedLanIp {
    if ($LanIpWasProvided) { return $false }
    $DetectedAddresses = @(Get-DetectedLanIps)
    if ($DetectedAddresses.Count -eq 0) {
        Write-Warning "未重新检测到活动局域网地址，继续使用：$LanIp"
        return $false
    }

    $DetectedAddress = $DetectedAddresses[0]
    if ($DetectedAddress -eq $LanIp) { return $false }

    $PreviousAddress = $LanIp
    $script:LanIp = $DetectedAddress
    Update-NetworkUrls
    Write-Host "检测到局域网 IP 变化：$PreviousAddress -> $LanIp" -ForegroundColor Yellow
    return $true
}

function Ensure-HttpsFilesForLanIp {
    param([string] $PreviouslySyncedAddress)

    $RequiredFiles = @(
        Join-Path $HttpsDir "local-cert.pem"
        Join-Path $HttpsDir "local-key.pem"
        Join-Path $HttpsDir "backend-local.p12"
    )
    $MissingFiles = @($RequiredFiles | Where-Object { -not (Test-Path $_) })
    $NeedsRefresh = $MissingFiles.Count -gt 0 -or $PreviouslySyncedAddress -ne $LanIp
    if (-not $NeedsRefresh) { return $false }

    $SetupScript = Join-Path $PSScriptRoot "setup-local-https.ps1"
    if (-not (Test-Path $SetupScript)) { throw "找不到 HTTPS 配置脚本：$SetupScript" }

    if ($MissingFiles.Count -gt 0) {
        Write-Host "缺少本地 HTTPS 证书，正在自动生成。" -ForegroundColor Yellow
    } else {
        Write-Host "当前证书未记录局域网 IP $LanIp，正在重新生成。" -ForegroundColor Yellow
    }

    & $SetupScript -ExtraHosts @($LanIp) -IncludeLanIps | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "本地 HTTPS 证书生成失败。" }

    $StillMissing = @($RequiredFiles | Where-Object { -not (Test-Path $_) })
    if ($StillMissing.Count -gt 0) { throw "HTTPS 证书生成后仍缺少文件：$($StillMissing -join ', ')" }
    return $true
}

function Sync-LocalNetworkConfiguration {
    $PreviouslySyncedAddress = Get-SavedLanIp
    $AgentEnvPath = Join-Path $AgentRoot ".env"
    $WebEnvPath = Join-Path $WebRoot ".env"
    Ensure-LocalEnvFile $AgentEnvPath (Join-Path $AgentRoot ".env.example")
    Ensure-LocalEnvFile $WebEnvPath (Join-Path $WebRoot ".env.example")

    $AgentChanged = Set-EnvFileValue $AgentEnvPath "BACKEND_BASE_URL" $BackendUrl
    $WebChanged = Set-EnvFileValue $WebEnvPath "VITE_BACKEND_BASE_URL" $BackendUrl
    $CertificateRefreshed = Ensure-HttpsFilesForLanIp $PreviouslySyncedAddress

    New-Item -ItemType Directory -Force -Path $HttpsDir | Out-Null
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($LanIpStatePath, "$LanIp`r`n", $Utf8NoBom)

    $AddressChanged = -not [string]::IsNullOrWhiteSpace($PreviouslySyncedAddress) -and $PreviouslySyncedAddress -ne $LanIp
    $ConfigChanged = $AgentChanged -or $WebChanged
    Write-Host ""
    Write-Host "本地网络配置已同步：" -ForegroundColor Green
    Write-Host "  局域网 IP: $LanIp"
    Write-Host "  Agent BACKEND_BASE_URL: $BackendUrl"
    Write-Host "  Web VITE_BACKEND_BASE_URL: $BackendUrl"
    Write-Host "  后端 CORS: https://localhost:$WebPort, https://127.0.0.1:$WebPort, $WebUrl"
    if ($CertificateRefreshed) { Write-Host "  HTTPS 证书: 已按当前 IP 刷新" }

    [PSCustomObject]@{
        AddressChanged = $AddressChanged
        ConfigChanged = $ConfigChanged
        CertificateRefreshed = $CertificateRefreshed
        RequiresRestart = $AddressChanged -or $ConfigChanged -or $CertificateRefreshed
        PreviousAddress = $PreviouslySyncedAddress
        CurrentAddress = $LanIp
    }
}

function Test-AnyServiceRunning {
    return (Test-PortOpen $AgentPort) -or (Test-PortOpen $BackendPort) -or (Test-PortOpen $WebPort)
}

function Prepare-NetworkForStart {
    Refresh-DetectedLanIp | Out-Null
    $SyncResult = Sync-LocalNetworkConfiguration
    if ($SyncResult.RequiresRestart -and (Test-AnyServiceRunning)) {
        Write-Host "本地网络配置已变化，正在停止旧地址下的服务后重新启动。" -ForegroundColor Yellow
        Stop-AllServices
    }
}

function Show-RecentLogFile {
    param(
        [string] $Label,
        [string] $Path,
        [int] $Lines = 40
    )

    Write-Host ""
    Write-Host "--- $Label ---" -ForegroundColor Cyan
    if (-not (Test-Path $Path)) {
        Write-Host "暂无日志：$Path" -ForegroundColor DarkGray
        return
    }
    Get-Content -LiteralPath $Path -Tail $Lines -Encoding UTF8
}

function Show-AllRecentLogs {
    Show-RecentLogFile "Agent 标准错误" (Join-Path $LogDir "agent-dev.err.log") 25
    Show-RecentLogFile "后端标准错误" (Join-Path $LogDir "backend-dev.err.log") 25
    Show-RecentLogFile "Web 标准错误" (Join-Path $LogDir "web-dev.err.log") 25
}

function Show-LogMenu {
    while ($true) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "最近运行日志" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "1. Agent 输出"
        Write-Host "2. Agent 错误"
        Write-Host "3. 后端输出"
        Write-Host "4. 后端错误"
        Write-Host "5. Web 输出"
        Write-Host "6. Web 错误"
        Write-Host "7. 汇总最近错误"
        Write-Host "0. 返回主菜单"
        $Choice = (Read-Host "请选择 [默认 7]").Trim()
        if ([string]::IsNullOrWhiteSpace($Choice)) { $Choice = "7" }
        switch ($Choice) {
            "1" { Show-RecentLogFile "Agent 输出" (Join-Path $LogDir "agent-dev.out.log") }
            "2" { Show-RecentLogFile "Agent 错误" (Join-Path $LogDir "agent-dev.err.log") }
            "3" { Show-RecentLogFile "后端输出" (Join-Path $LogDir "backend-dev.out.log") }
            "4" { Show-RecentLogFile "后端错误" (Join-Path $LogDir "backend-dev.err.log") }
            "5" { Show-RecentLogFile "Web 输出" (Join-Path $LogDir "web-dev.out.log") }
            "6" { Show-RecentLogFile "Web 错误" (Join-Path $LogDir "web-dev.err.log") }
            "7" { Show-AllRecentLogs }
            "0" { return }
            default { Write-Host "无效选项：$Choice" -ForegroundColor Yellow }
        }
        if ($Choice -ne "0") { Read-Host "按 Enter 返回日志菜单" | Out-Null }
    }
}

function Start-Agent {
    $HealthUrl = "$AgentUrl/api/v1/health"
    if (Test-HttpOk $HealthUrl) {
        Write-Host "[Agent] 已在运行，直接复用：$AgentUrl" -ForegroundColor DarkCyan
        return
    }
    if (Test-PortOpen $AgentPort) { throw "端口 $AgentPort 已被占用，但 Agent 健康检查不可用。" }
    if (-not (Test-Path $AgentPython)) { throw "找不到 Agent Python 环境：$AgentPython" }

    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Write-Host "[Agent] 正在启动：$AgentUrl" -ForegroundColor Cyan
    $Process = Start-ProcessWithEnvironment -FilePath $AgentPython `
        -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", [string] $AgentPort, "--reload") `
        -WorkingDirectory $AgentRoot `
        -StandardOutputPath (Join-Path $LogDir "agent-dev.out.log") `
        -StandardErrorPath (Join-Path $LogDir "agent-dev.err.log") `
        -Environment @{
            APP_ENV = "local"
            INTERNAL_API_TOKEN = $InternalToken
            BACKEND_BASE_URL = $BackendUrl
        }
    Write-Host "[Agent] 启动进程 PID=$($Process.Id)，日志：logs\agent-dev.out.log / logs\agent-dev.err.log" -ForegroundColor DarkGray
    Wait-HttpOk $HealthUrl 60
}

function Start-Backend {
    $HealthUrl = "https://127.0.0.1:$BackendPort/api/v1/health"
    if (Test-HttpOk $HealthUrl) {
        Write-Host "[后端] 已在运行，直接复用：$BackendUrl" -ForegroundColor DarkCyan
        return
    }
    if (Test-PortOpen $BackendPort) { throw "端口 $BackendPort 已被占用，但后端健康检查不可用。" }

    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Write-Host "[后端] 正在启动：$BackendUrl" -ForegroundColor Cyan
    Write-Host "[后端] Agent 配置：AGENT_SERVER_BASE_URL=$AgentUrl"
    $Process = Start-ProcessWithEnvironment -FilePath "mvn.cmd" `
        -ArgumentList @("spring-boot:run", "-Dspring-boot.run.profiles=local-https") `
        -WorkingDirectory $BackendRoot `
        -StandardOutputPath (Join-Path $LogDir "backend-dev.out.log") `
        -StandardErrorPath (Join-Path $LogDir "backend-dev.err.log") `
        -Environment @{
            SERVER_ADDRESS = "0.0.0.0"
            SERVER_PORT = [string] $BackendPort
            SERVER_SSL_ENABLED = "true"
            SERVER_SSL_KEY_STORE = $BackendKeyStoreUri
            SERVER_SSL_KEY_STORE_PASSWORD = "changeit"
            SERVER_SSL_KEY_STORE_TYPE = "PKCS12"
            HTTPS_SERVER_PORT = [string] $BackendPort
            HTTPS_KEY_STORE = $BackendKeyStoreUri
            HTTPS_KEY_STORE_PASSWORD = "changeit"
            AGENT_SERVER_BASE_URL = $AgentUrl
            AGENT_INTERNAL_TOKEN = $InternalToken
            INTERNAL_API_TOKEN = $InternalToken
            DATA_SERVER_ROOT = $BackendDataRoot
            CORS_ALLOWED_ORIGINS = "https://localhost:$WebPort,https://127.0.0.1:$WebPort,$WebUrl"
        }
    Write-Host "[后端] 启动进程 PID=$($Process.Id)，日志：logs\backend-dev.out.log / logs\backend-dev.err.log" -ForegroundColor DarkGray
    Wait-HttpOk $HealthUrl 120
}

function Start-Web {
    $LocalWebUrl = "https://127.0.0.1:$WebPort"
    if (Test-HttpOk $LocalWebUrl) {
        Write-Host "[Web] 已在运行，直接复用：$WebUrl" -ForegroundColor DarkCyan
        return
    }
    if (Test-PortOpen $WebPort) { throw "端口 $WebPort 已被占用，但 Web 健康检查不可用。" }
    if (-not (Test-Path (Join-Path $WebRoot "node_modules"))) { throw "找不到 web\node_modules，请先在 web 目录运行 npm install。" }

    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Write-Host "[Web] 正在启动：$WebUrl" -ForegroundColor Cyan
    Write-Host "[Web] 后端地址：VITE_BACKEND_BASE_URL=$BackendUrl"
    $Process = Start-ProcessWithEnvironment -FilePath "npm.cmd" `
        -ArgumentList @("run", "dev", "--", "--host", "0.0.0.0", "--port", [string] $WebPort) `
        -WorkingDirectory $WebRoot `
        -StandardOutputPath (Join-Path $LogDir "web-dev.out.log") `
        -StandardErrorPath (Join-Path $LogDir "web-dev.err.log") `
        -Environment @{
            VITE_BACKEND_BASE_URL = $BackendUrl
            VITE_DEV_HTTPS = "true"
            VITE_HTTPS_CERT_FILE = Join-Path $HttpsDir "local-cert.pem"
            VITE_HTTPS_KEY_FILE = Join-Path $HttpsDir "local-key.pem"
        }
    Write-Host "[Web] 启动进程 PID=$($Process.Id)，日志：logs\web-dev.out.log / logs\web-dev.err.log" -ForegroundColor DarkGray
    Wait-HttpOk $LocalWebUrl 60
}

function Show-Success {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "启动完成" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "后端地址: $BackendUrl"
    Write-Host "Web 地址 : $WebUrl"
    Write-Host "Agent地址: $AgentUrl"
    Write-Host ""
    Write-Host "服务在后台运行；返回主菜单后可以继续查看状态、日志或停止服务。" -ForegroundColor Yellow
    Write-Host "关闭启动器窗口不会停止服务，也可以执行 .\start-dev.bat stop。" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Android 真机 debug 包构建命令：" -ForegroundColor Cyan
    Write-Host "cd android"
    Write-Host ".\gradlew.bat :app:assembleDebug `"-Pcareer.backendDebugBaseUrl=$BackendUrl`""
    Write-Host ""
    Write-Host "注意：Debug APK 已内置项目 CA；证书变化后需重新构建并覆盖安装 Debug APK。" -ForegroundColor Yellow
    Write-Host "日志目录：$LogDir"
}

function Start-SelectedServices {
    param([string] $SelectedTarget)

    Prepare-NetworkForStart
    Start-Agent
    if ($SelectedTarget -in @("backend", "web", "all")) { Start-Backend }
    if ($SelectedTarget -in @("web", "all")) { Start-Web }
    Show-Success
    Show-Status
}

function Sync-NetworkFromMenu {
    Refresh-DetectedLanIp | Out-Null
    $AgentWasRunning = Test-PortOpen $AgentPort
    $BackendWasRunning = Test-PortOpen $BackendPort
    $WebWasRunning = Test-PortOpen $WebPort
    $SyncResult = Sync-LocalNetworkConfiguration

    if (-not $SyncResult.RequiresRestart -or -not ($AgentWasRunning -or $BackendWasRunning -or $WebWasRunning)) {
        Show-Status
        return
    }

    Write-Host "当前已有服务运行，配置变化需要重启后才能生效。" -ForegroundColor Yellow
    $RestartChoice = Read-Host "是否按原运行层级立即重启？[Y/n]"
    if (-not [string]::IsNullOrWhiteSpace($RestartChoice) -and $RestartChoice.Trim().ToLowerInvariant() -ne "y") {
        Write-Host "已保留现有进程；下次启动服务时会使用新地址。" -ForegroundColor Yellow
        Show-Status
        return
    }

    Stop-AllServices
    if ($WebWasRunning) {
        Start-Agent
        Start-Backend
        Start-Web
        Show-Success
    } elseif ($BackendWasRunning) {
        Start-Agent
        Start-Backend
        Show-Success
    } elseif ($AgentWasRunning) {
        Start-Agent
        Show-Success
    }
    Show-Status
}

function Invoke-TargetAction {
    param(
        [string] $SelectedTarget,
        [bool] $Interactive
    )

    switch ($SelectedTarget) {
        "exit" { return }
        "status" { Show-Status; return }
        "logs" {
            if ($Interactive) { Show-LogMenu } else { Show-AllRecentLogs }
            return
        }
        "sync-ip" {
            if ($Interactive) {
                Sync-NetworkFromMenu
            } else {
                Refresh-DetectedLanIp | Out-Null
                $SyncResult = Sync-LocalNetworkConfiguration
                if ($SyncResult.RequiresRestart -and (Test-AnyServiceRunning)) {
                    Write-Warning "网络配置已更新；已有服务仍需执行 start-dev.bat stop 后重新启动。"
                }
            }
            return
        }
        "stop" { Stop-AllServices; Show-Status; return }
        "stop-web" { Stop-ServicePort "Web" $WebPort; Show-Status; return }
        "stop-backend" { Stop-ServicePort "后端" $BackendPort; Show-Status; return }
        "stop-agent" { Stop-ServicePort "Agent" $AgentPort; Show-Status; return }
        "agent" { Start-SelectedServices "agent"; return }
        "backend" { Start-SelectedServices "backend"; return }
        "web" { Start-SelectedServices "web"; return }
        "all" { Start-SelectedServices "all"; return }
        default { throw "不支持的启动目标：$SelectedTarget" }
    }
}

if ($Target -ne "menu") {
    Invoke-TargetAction $Target $false
    return
}

while ($true) {
    $SelectedTarget = Show-Menu
    if ($SelectedTarget -eq "exit") {
        Write-Host "已退出启动器，后台服务保持当前状态。" -ForegroundColor DarkGray
        break
    }

    try {
        Invoke-TargetAction $SelectedTarget $true
    } catch {
        Write-Host ""
        Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "可在主菜单选择“查看最近日志”获取更多信息。" -ForegroundColor Yellow
    }

    if ($SelectedTarget -ne "logs") {
        Write-Host ""
        Read-Host "按 Enter 返回主菜单" | Out-Null
    }
}
