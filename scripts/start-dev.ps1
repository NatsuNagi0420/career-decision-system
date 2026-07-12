param(
    [ValidateSet("menu", "agent", "backend", "web", "all", "status", "stop", "stop-agent", "stop-backend", "stop-web", "exit")]
    [string] $Target = "menu",
    [string] $LanIp = "192.168.1.159",
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

$AgentUrl = "http://127.0.0.1:$AgentPort"
$BackendUrl = "https://${LanIp}:$BackendPort"
$WebUrl = "https://${LanIp}:$WebPort"

function Show-Menu {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "职业决策系统 - 本地局域网 HTTPS 调试启动器" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "当前固定局域网 IP: $LanIp"
    Write-Host "后端地址: $BackendUrl"
    Write-Host "Web 地址 : $WebUrl"
    Write-Host "Agent地址: $AgentUrl"
    Write-Host ""
    Write-Host "说明：启动后的服务会在后台运行；关闭这个菜单窗口不会自动停止服务。" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. 只启动 Agent 层"
    Write-Host "2. 启动 Agent + 后端"
    Write-Host "3. 启动 Agent + 后端 + Web"
    Write-Host "4. 查看运行状态"
    Write-Host "5. 停止全部服务"
    Write-Host "6. 只停止 Web"
    Write-Host "7. 只停止后端"
    Write-Host "8. 只停止 Agent"
    Write-Host "9. 退出"
    Write-Host ""

    $Choice = Read-Host "请选择 [默认 3]"
    if ([string]::IsNullOrWhiteSpace($Choice)) { return "web" }
    switch ($Choice.Trim()) {
        "1" { return "agent" }
        "2" { return "backend" }
        "3" { return "web" }
        "4" { return "status" }
        "5" { return "stop" }
        "6" { return "stop-web" }
        "7" { return "stop-backend" }
        "8" { return "stop-agent" }
        "9" { return "exit" }
        "agent" { return "agent" }
        "backend" { return "backend" }
        "web" { return "web" }
        "all" { return "web" }
        "status" { return "status" }
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

function Get-ChildProcessIds {
    param([int[]] $ParentProcessIds)

    $AllProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
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
                $Children += [int] $Process.ProcessId
                $Queue.Enqueue([int] $Process.ProcessId)
                $Seen[$ProcessIdText] = $true
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
        Stop-Process -Id $TargetProcessId -Force -ErrorAction SilentlyContinue
        return $true
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
        $TargetProcessIds = @(@($BaseProcessIds) + @(Get-ChildProcessIds $BaseProcessIds)) | Sort-Object -Unique
        foreach ($TargetProcessId in $TargetProcessIds) {
            if (Stop-ProcessTree $TargetProcessId) {
                Write-Host "已停止端口 $Port 的进程 PID=$TargetProcessId" -ForegroundColor Yellow
            } elseif ($Attempt -eq 1) {
                Write-Host "端口 $Port 的监听 PID=$TargetProcessId 已不存在，继续检查子进程。" -ForegroundColor DarkGray
            }
        }

        Start-Sleep -Milliseconds 500
    }

    $Remaining = Get-PortProcessIds $Port
    if ($Remaining.Count -gt 0) {
        $FinalBaseProcessIds = @(@($Remaining) + @(Get-KnownDevProcessIds $Port)) | Sort-Object -Unique
        $FinalTargetProcessIds = @(@($FinalBaseProcessIds) + @(Get-ChildProcessIds $FinalBaseProcessIds)) | Sort-Object -Unique
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

function Assert-HttpsFiles {
    $Missing = @(
        Join-Path $HttpsDir "local-cert.pem"
        Join-Path $HttpsDir "local-key.pem"
        Join-Path $HttpsDir "backend-local.p12"
    ) | Where-Object { -not (Test-Path $_) }

    if ($Missing.Count -gt 0) {
        Write-Host "缺少本地 HTTPS 证书。请先运行：" -ForegroundColor Yellow
        Write-Host "powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-https.ps1 -ExtraHosts $LanIp"
        throw "缺少证书文件：$($Missing -join ', ')"
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
    Write-Host "重要：关闭这个启动菜单窗口不会停止服务，服务会继续在后台运行。" -ForegroundColor Yellow
    Write-Host "停止方式：重新运行 .\start-dev.bat，选择停止选项；或直接执行 .\start-dev.bat stop。" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Android 真机 debug 包构建命令：" -ForegroundColor Cyan
    Write-Host "cd android"
    Write-Host ".\gradlew.bat :app:assembleDebug `"-Pcareer.backendDebugBaseUrl=$BackendUrl`""
    Write-Host ""
    Write-Host "注意：真机 HTTPS 调试需要把 .local-https\mkcert-rootCA.pem 安装到手机证书中。" -ForegroundColor Yellow
    Write-Host "日志目录：$LogDir"
}

if ($Target -eq "menu") { $Target = Show-Menu }
if ($Target -eq "exit") { return }

if ($Target -eq "status") {
    Show-Status
    return
}

if ($Target -eq "stop") {
    Stop-AllServices
    Show-Status
    return
}

if ($Target -eq "stop-web") {
    Stop-ServicePort "Web" $WebPort
    Show-Status
    return
}

if ($Target -eq "stop-backend") {
    Stop-ServicePort "后端" $BackendPort
    Show-Status
    return
}

if ($Target -eq "stop-agent") {
    Stop-ServicePort "Agent" $AgentPort
    Show-Status
    return
}

Assert-HttpsFiles
Start-Agent
if ($Target -in @("backend", "web", "all")) { Start-Backend }
if ($Target -in @("web", "all")) { Start-Web }
Show-Success
Show-Status
