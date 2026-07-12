param(
    [string] $AdbPath = "",
    [string] $DeviceSerial = "",
    [string] $ApkPath = "",
    [string] $PackageName = "com.careerdecision.mobile",
    [string] $ActivityName = ".MainActivity",
    [string] $AvdName = "",
    [int] $DeviceWaitSeconds = 20,
    [int] $EmulatorBootWaitSeconds = 180,
    [int] $LaunchWaitSeconds = 8,
    [int] $LogcatLines = 300,
    [string] $Username = "",
    [string] $Password = "",
    [string] $BackendBaseUrl = "https://192.168.1.159:8443",
    [switch] $RequireAuthenticatedFlow,
    [switch] $StartEmulator,
    [switch] $SkipUiFlow
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$AndroidRoot = Join-Path $Root "android"

if ([string]::IsNullOrWhiteSpace($ApkPath)) {
    $ApkPath = Join-Path $AndroidRoot "app\build\outputs\apk\debug\app-debug.apk"
}

function Resolve-AdbPath {
    param([string] $ConfiguredPath)

    $Candidates = @(
        $ConfiguredPath,
        $env:ADB_PATH,
        "adb.exe"
    )

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $Candidates += Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
    }
    if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_HOME)) {
        $Candidates += Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
    }
    if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_SDK_ROOT)) {
        $Candidates += Join-Path $env:ANDROID_SDK_ROOT "platform-tools\adb.exe"
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

    throw "adb was not found. Install Android SDK Platform Tools or pass -AdbPath."
}

function Resolve-EmulatorPath {
    param([switch] $AllowMissing)

    $Candidates = @(
        $env:ANDROID_EMULATOR_PATH,
        "emulator.exe"
    )

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $Candidates += Join-Path $env:LOCALAPPDATA "Android\Sdk\emulator\emulator.exe"
    }
    if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_HOME)) {
        $Candidates += Join-Path $env:ANDROID_HOME "emulator\emulator.exe"
    }
    if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_SDK_ROOT)) {
        $Candidates += Join-Path $env:ANDROID_SDK_ROOT "emulator\emulator.exe"
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

    if ($AllowMissing) {
        return ""
    }

    throw "Android emulator was not found. Install Android Emulator from Android Studio SDK Manager or start a USB device manually."
}

function Get-AvailableAvds {
    param([string] $EmulatorPath)

    if ([string]::IsNullOrWhiteSpace($EmulatorPath) -or -not (Test-Path $EmulatorPath)) {
        return @()
    }

    $Output = & $EmulatorPath -list-avds 2>&1
    if ($LASTEXITCODE -ne 0) {
        return @()
    }

    return @($Output | Where-Object { -not [string]::IsNullOrWhiteSpace([string] $_) })
}

function Get-AndroidTargetHint {
    $HintLines = @("adb path: $ResolvedAdb")
    $EmulatorPath = Resolve-EmulatorPath -AllowMissing
    if ([string]::IsNullOrWhiteSpace($EmulatorPath)) {
        $HintLines += "emulator.exe was not found. Install Android Emulator in Android Studio SDK Manager, or connect a USB-debuggable device."
        return $HintLines -join [Environment]::NewLine
    }

    $HintLines += "emulator path: $EmulatorPath"
    $Avds = @(Get-AvailableAvds -EmulatorPath $EmulatorPath)
    if ($Avds.Count -eq 0) {
        $HintLines += "no Android Virtual Devices were found. Create one in Android Studio Device Manager, then rerun this script."
    } else {
        $HintLines += "available AVDs: $($Avds -join ', ')"
        $HintLines += "start one manually, or rerun with -StartEmulator optionally plus -AvdName '$($Avds[0])'."
    }

    return $HintLines -join [Environment]::NewLine
}

function Invoke-Adb {
    param(
        [Parameter(Mandatory = $true)]
        [string[]] $Arguments,
        [switch] $AllowFailure
    )

    $FullArguments = @()
    if (-not [string]::IsNullOrWhiteSpace($DeviceSerial)) {
        $FullArguments += @("-s", $DeviceSerial)
    }
    $FullArguments += $Arguments

    $Output = & $ResolvedAdb @FullArguments 2>&1
    $ExitCode = $LASTEXITCODE
    if ($ExitCode -ne 0 -and -not $AllowFailure) {
        throw "adb $($FullArguments -join ' ') failed with exit code $ExitCode. $($Output -join [Environment]::NewLine)"
    }
    return @{
        ExitCode = $ExitCode
        Output = @($Output)
    }
}

function Get-AdbDeviceRows {
    $Result = & $ResolvedAdb devices 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "adb devices failed. $($Result -join [Environment]::NewLine)"
    }

    $Rows = @()
    foreach ($Line in @($Result)) {
        if ($Line -match "^(\S+)\s+(\S+)$") {
            $Rows += [pscustomobject] @{
                Serial = $Matches[1]
                State = $Matches[2]
            }
        }
    }

    return $Rows
}

function Format-AdbDeviceRows {
    param([object[]] $Rows)

    if ($Rows.Count -eq 0) {
        return "no rows returned by adb devices"
    }

    return (($Rows | ForEach-Object { "$($_.Serial):$($_.State)" }) -join ", ")
}

function Get-ConnectedDeviceSerial {
    param(
        [int] $WaitSeconds = $DeviceWaitSeconds,
        [switch] $AllowMissing
    )

    $Deadline = (Get-Date).AddSeconds($WaitSeconds)
    $Rows = @()
    do {
        $Rows = @(Get-AdbDeviceRows)
        $Devices = @($Rows | Where-Object { $_.State -eq "device" } | Select-Object -ExpandProperty Serial)

        if ($Devices.Count -gt 0) {
            if ([string]::IsNullOrWhiteSpace($DeviceSerial)) {
                return $Devices[0]
            }

            if ($Devices -contains $DeviceSerial) {
                return $DeviceSerial
            }
        }

        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $Deadline)

    $Devices = @($Rows | Where-Object { $_.State -eq "device" } | Select-Object -ExpandProperty Serial)
    if ($Devices.Count -eq 0) {
        $KnownStates = Format-AdbDeviceRows $Rows
        if ($AllowMissing) {
            return $null
        }
        throw "No Android device or emulator is ready after $WaitSeconds seconds. Start an emulator in Android Studio or connect a USB-debuggable device, approve the USB debugging prompt, then rerun this script. adb devices: $KnownStates$([Environment]::NewLine)$(Get-AndroidTargetHint)"
    }

    $KnownStates = Format-AdbDeviceRows $Rows
    if ($AllowMissing) {
        return $null
    }
    throw "Requested device '$DeviceSerial' is not ready after $WaitSeconds seconds. adb devices: $KnownStates$([Environment]::NewLine)$(Get-AndroidTargetHint)"
}

function Start-EmulatorIfRequested {
    if (-not $StartEmulator) {
        return $null
    }

    $EmulatorPath = Resolve-EmulatorPath
    $Avds = @(Get-AvailableAvds -EmulatorPath $EmulatorPath)
    if ($Avds.Count -eq 0) {
        throw "Cannot start an emulator because no Android Virtual Devices were found. Create one in Android Studio Device Manager, then rerun this script."
    }

    $SelectedAvd = $AvdName
    if ([string]::IsNullOrWhiteSpace($SelectedAvd)) {
        $SelectedAvd = [string] $Avds[0]
    } elseif ($Avds -notcontains $SelectedAvd) {
        throw "Requested AVD '$SelectedAvd' was not found. Available AVDs: $($Avds -join ', ')"
    }

    Write-Host "Starting Android emulator AVD: $SelectedAvd" -ForegroundColor Cyan
    return Start-Process `
        -FilePath $EmulatorPath `
        -ArgumentList @("-avd", $SelectedAvd, "-no-snapshot-save") `
        -WindowStyle Hidden `
        -PassThru
}

function Wait-DeviceBootCompleted {
    param([int] $Seconds)

    $Deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $Deadline) {
        $Result = Invoke-Adb @("shell", "getprop", "sys.boot_completed") -AllowFailure
        $BootCompleted = ($Result.Output -join "").Trim()
        if ($BootCompleted -eq "1") {
            return
        }
        Start-Sleep -Seconds 2
    }

    throw "Android device '$DeviceSerial' did not finish booting within $Seconds seconds."
}

function Stop-StartedEmulator {
    if ($null -eq $StartedEmulator) {
        return
    }

    Invoke-Adb @("emu", "kill") -AllowFailure | Out-Null
    Start-Sleep -Seconds 2
    $Process = Get-Process -Id $StartedEmulator.Id -ErrorAction SilentlyContinue
    if ($Process -and -not $Process.HasExited) {
        Stop-Process -Id $StartedEmulator.Id -Force
    }
}

function Assert-OutputContains {
    param(
        [Parameter(Mandatory = $true)]
        [object[]] $Output,
        [Parameter(Mandatory = $true)]
        [string] $Pattern,
        [Parameter(Mandatory = $true)]
        [string] $Message
    )

    $Text = $Output -join [Environment]::NewLine
    if ($Text -notmatch $Pattern) {
        throw $Message + [Environment]::NewLine + $Text
    }
}

function Get-UiDump {
    $DumpPath = "/sdcard/career-decision-smoke-window.xml"
    Invoke-Adb @("shell", "uiautomator", "dump", $DumpPath) | Out-Null

    $Dump = Invoke-Adb @("shell", "cat", $DumpPath)
    $Text = $Dump.Output -join [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($Text)) {
        throw "Android UI smoke could not read the window hierarchy dump."
    }
    return $Text
}

function Assert-UiText {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Dump,
        [Parameter(Mandatory = $true)]
        [string[]] $ExpectedTexts,
        [Parameter(Mandatory = $true)]
        [string] $Context
    )

    foreach ($ExpectedText in $ExpectedTexts) {
        if (-not $Dump.Contains($ExpectedText)) {
            throw ("Android UI smoke did not find '{0}' while checking {1}." -f $ExpectedText, $Context)
        }
    }
}

function New-UiText {
    param(
        [Parameter(Mandatory = $true)]
        [int[]] $CodePoints
    )

    return -join ($CodePoints | ForEach-Object { [char] $_ })
}

function Get-UiTextCenter {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Dump,
        [Parameter(Mandatory = $true)]
        [string] $Text
    )

    [xml] $Hierarchy = $Dump
    $Node = Find-UiNodeByText -Node $Hierarchy.DocumentElement -Text $Text
    if ($null -eq $Node) {
        throw "Android UI smoke could not find tappable text '$Text'."
    }

    $Bounds = $Node.Attributes["bounds"].Value
    $Match = [regex]::Match($Bounds, "^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$")
    if (-not $Match.Success) {
        throw "Android UI smoke could not parse bounds for text '$Text'."
    }

    $Left = [int] $Match.Groups[1].Value
    $Top = [int] $Match.Groups[2].Value
    $Right = [int] $Match.Groups[3].Value
    $Bottom = [int] $Match.Groups[4].Value
    return @{
        X = [int] (($Left + $Right) / 2)
        Y = [int] (($Top + $Bottom) / 2)
    }
}

function Find-UiNodeByText {
    param(
        [Parameter(Mandatory = $true)]
        [System.Xml.XmlNode] $Node,
        [Parameter(Mandatory = $true)]
        [string] $Text
    )

    if ($Node.Attributes -and $Node.Attributes["text"] -and $Node.Attributes["text"].Value -eq $Text) {
        return $Node
    }

    foreach ($Child in $Node.ChildNodes) {
        $Match = Find-UiNodeByText -Node $Child -Text $Text
        if ($null -ne $Match) {
            return $Match
        }
    }

    return $null
}

function Tap-UiText {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Text
    )

    $Dump = Get-UiDump
    $Center = Get-UiTextCenter -Dump $Dump -Text $Text
    Invoke-Adb @("shell", "input", "tap", [string] $Center.X, [string] $Center.Y) | Out-Null
    Start-Sleep -Milliseconds 700
}

function Wait-UiText {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Text,
        [int] $Seconds = 20
    )

    $Deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $Deadline) {
        $Dump = Get-UiDump
        if ($Dump.Contains($Text)) {
            return $Dump
        }
        Start-Sleep -Seconds 1
    }
    throw "Android UI smoke timed out waiting for '$Text'."
}

function Input-UiField {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Label,
        [Parameter(Mandatory = $true)]
        [string] $Value
    )

    Tap-UiText $Label
    Invoke-Adb @("shell", "input", "text", $Value) | Out-Null
    Invoke-Adb @("shell", "input", "keyevent", "4") | Out-Null
    Start-Sleep -Milliseconds 300
}

function Join-BackendUrl {
    param([string] $Path)
    return $BackendBaseUrl.TrimEnd("/") + "/" + $Path.TrimStart("/")
}

function Invoke-BackendJson {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Method,
        [Parameter(Mandatory = $true)]
        [string] $Path,
        [object] $Body = $null,
        [hashtable] $Headers = @{}
    )

    $Arguments = @{
        UseBasicParsing = $true
        Method = $Method
        Uri = Join-BackendUrl $Path
        Headers = $Headers
        TimeoutSec = 10
    }
    if ($null -ne $Body) {
        $Arguments.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 20))
        $Arguments.ContentType = "application/json; charset=utf-8"
    }
    $Response = Invoke-WebRequest @Arguments
    $Response.RawContentStream.Position = 0
    $Reader = [System.IO.StreamReader]::new($Response.RawContentStream, [System.Text.Encoding]::UTF8)
    return $Reader.ReadToEnd() | ConvertFrom-Json
}

function Start-BackendSyncVerification {
    if ($BackendBaseUrl -notmatch '^https://') {
        throw "Authenticated Android smoke requires an HTTPS backend. Actual value: $BackendBaseUrl"
    }
    $Login = Invoke-BackendJson -Method "POST" -Path "/api/v1/auth/login" -Body @{
        username = $Username
        password = $Password
    }
    if ($Login.code -ne 0 -or [string]::IsNullOrWhiteSpace([string] $Login.data.token)) {
        throw "Backend login failed before Android cross-device verification."
    }
    $Headers = @{ Authorization = "Bearer $($Login.data.token)" }
    $Today = Invoke-BackendJson -Method "GET" -Path "/api/v1/action-plans/current/today" -Headers $Headers
    if ($Today.code -ne 0 -or [long] $Today.data.planId -le 0) {
        throw "Authenticated Android smoke requires a current action plan in the shared backend."
    }
    return @{
        Headers = $Headers
        PlanId = [long] $Today.data.planId
    }
}

function Wait-BackendTaskResult {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable] $Verification,
        [Parameter(Mandatory = $true)]
        [string] $ResultMarker,
        [int] $Seconds = 45
    )

    $Deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $Deadline) {
        $Plan = Invoke-BackendJson -Method "GET" -Path "/api/v1/action-plans/$($Verification.PlanId)" -Headers $Verification.Headers
        if ($Plan.code -eq 0) {
            $Tasks = @($Plan.data.weeks | ForEach-Object { $_.tasks } | ForEach-Object { $_ })
            foreach ($Task in $Tasks) {
                $MatchingResults = @($Task.results | Where-Object { [string] $_.description -eq $ResultMarker })
                if ([string] $Task.status -eq "completed" -and $MatchingResults.Count -gt 0) {
                    Write-Host "Android task and result are visible in the shared backend." -ForegroundColor Green
                    return
                }
            }
        }
        Start-Sleep -Seconds 2
    }
    throw "Android UI completed, but the shared backend did not receive the completed task and result marker within $Seconds seconds."
}

function Assert-AndroidUiFlow {
    Write-Host 'Android smoke UI flow: checking action client screens' -ForegroundColor Cyan

    $ProductText = New-UiText @(0x804C, 0x9014)
    $UsernameText = New-UiText @(0x7528, 0x6237, 0x540D)
    $PasswordText = New-UiText @(0x5BC6, 0x7801)
    $LoginText = New-UiText @(0x767B, 0x5F55)
    $TodayText = New-UiText @(0x4ECA, 0x65E5)
    $GoalText = New-UiText @(0x76EE, 0x6807)
    $MentorText = 'AI ' + (New-UiText @(0x5BFC, 0x5E08))
    $ProfileText = New-UiText @(0x6211, 0x7684)
    $CompleteText = New-UiText @(0x5B8C, 0x6210)
    $CompleteTaskText = New-UiText @(0x5B8C, 0x6210, 0x4EFB, 0x52A1)
    $ResultText = New-UiText @(0x6210, 0x679C, 0x8BF4, 0x660E, 0xFF08, 0x53EF, 0x9009, 0xFF09)
    $ConfirmText = New-UiText @(0x786E, 0x8BA4)

    $Dump = Get-UiDump
    $InitialTexts = @($ProductText, $UsernameText, $PasswordText, $LoginText)
    Assert-UiText -Dump $Dump -ExpectedTexts $InitialTexts -Context 'initial login screen'

    $HasCredentials = -not [string]::IsNullOrWhiteSpace($Username) -and -not [string]::IsNullOrWhiteSpace($Password)
    if (-not $HasCredentials) {
        if ($RequireAuthenticatedFlow) {
            throw "Authenticated Android smoke requires -Username and -Password."
        }
        Write-Host "Android login screen passed. Supply -Username, -Password, and -RequireAuthenticatedFlow for HTTPS task sync." -ForegroundColor Yellow
        return
    }

    Input-UiField -Label $UsernameText -Value $Username
    Input-UiField -Label $PasswordText -Value $Password
    Tap-UiText $LoginText
    $Dump = Wait-UiText -Text $TodayText -Seconds 30
    Assert-UiText -Dump $Dump -ExpectedTexts @($TodayText, $GoalText, $MentorText, $ProfileText) -Context 'authenticated navigation'

    Tap-UiText $ProfileText
    $Dump = Wait-UiText -Text $ProfileText
    Assert-UiText -Dump $Dump -ExpectedTexts @($Username, 'HTTPS') -Context 'profile and HTTPS synchronization status'

    Tap-UiText $TodayText
    $Dump = Wait-UiText -Text $TodayText
    if (-not $Dump.Contains($CompleteText)) {
        if ($RequireAuthenticatedFlow) {
            throw "Authenticated Android smoke needs at least one actionable task in the current plan."
        }
        Write-Host "Authenticated navigation passed, but no actionable task was available." -ForegroundColor Yellow
        return
    }

    $BackendVerification = $null
    $ResultMarker = "Android_smoke_result_" + [guid]::NewGuid().ToString("N").Substring(0, 10)
    if ($RequireAuthenticatedFlow) {
        $BackendVerification = Start-BackendSyncVerification
    }

    Tap-UiText $CompleteText
    Wait-UiText -Text $CompleteTaskText | Out-Null
    Input-UiField -Label $ResultText -Value $ResultMarker
    Tap-UiText $ConfirmText
    Start-Sleep -Seconds 3
    $Dump = Get-UiDump
    Assert-UiText -Dump $Dump -ExpectedTexts @($TodayText, $GoalText, $MentorText, $ProfileText) -Context 'task result sync'
    if ($null -ne $BackendVerification) {
        Wait-BackendTaskResult -Verification $BackendVerification -ResultMarker $ResultMarker
    }
}

$ResolvedAdb = Resolve-AdbPath $AdbPath
if (-not (Test-Path $ApkPath)) {
    Push-Location $AndroidRoot
    try {
        .\gradlew.bat :app:assembleDebug
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path $ApkPath)) {
    throw "Debug APK not found: $ApkPath"
}

$StartedEmulator = $null
try {
    $DeviceSerial = Get-ConnectedDeviceSerial -WaitSeconds $(if ($StartEmulator) { 2 } else { $DeviceWaitSeconds }) -AllowMissing
    if ([string]::IsNullOrWhiteSpace($DeviceSerial)) {
        if ($StartEmulator) {
            $StartedEmulator = Start-EmulatorIfRequested
            $DeviceSerial = Get-ConnectedDeviceSerial -WaitSeconds $EmulatorBootWaitSeconds
        } else {
            throw "No Android device or emulator is ready after $DeviceWaitSeconds seconds. Start an emulator in Android Studio or connect a USB-debuggable device, approve the USB debugging prompt, then rerun this script. adb devices: $(Format-AdbDeviceRows @(Get-AdbDeviceRows))$([Environment]::NewLine)$(Get-AndroidTargetHint)"
        }
    }

    Write-Host "Android smoke adb:     $ResolvedAdb" -ForegroundColor Cyan
    Write-Host "Android smoke device:  $DeviceSerial" -ForegroundColor Cyan
    Write-Host "Android smoke apk:     $ApkPath" -ForegroundColor Cyan
    Write-Host "Android smoke package: $PackageName" -ForegroundColor Cyan

    Invoke-Adb @("wait-for-device") | Out-Null
    Wait-DeviceBootCompleted -Seconds $EmulatorBootWaitSeconds

    $Install = Invoke-Adb @("install", "-r", $ApkPath)
    Assert-OutputContains $Install.Output "(Success|Performing Streamed Install)" "APK install did not report success."

    Invoke-Adb @("logcat", "-c") -AllowFailure | Out-Null
    Invoke-Adb @("shell", "am", "force-stop", $PackageName) -AllowFailure | Out-Null

    $Launch = Invoke-Adb @("shell", "am", "start", "-W", "-n", "$PackageName/$ActivityName")
    Assert-OutputContains $Launch.Output "Status:\s+ok|Complete" "Activity launch did not complete successfully."

    Start-Sleep -Seconds $LaunchWaitSeconds

    $Focused = Invoke-Adb @("shell", "dumpsys", "window", "windows")
    Assert-OutputContains $Focused.Output $PackageName "Launched app is not visible in window manager output."

    $Crashes = Invoke-Adb @("logcat", "-d", "-t", [string] $LogcatLines, "*:E") -AllowFailure
    $CrashText = $Crashes.Output -join [Environment]::NewLine
    if ($CrashText -match "FATAL EXCEPTION" -or $CrashText -match "AndroidRuntime") {
        throw "Android smoke detected a runtime crash after launch." + [Environment]::NewLine + $CrashText
    }

    if (-not $SkipUiFlow) {
        Assert-AndroidUiFlow
    }

    Write-Host ""
    Write-Host "Android device smoke passed." -ForegroundColor Green
} finally {
    Stop-StartedEmulator
}
