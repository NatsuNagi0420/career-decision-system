# 青穗集 · 安装向导冒烟：仅在本任务独立目录安装，验证快捷方式、运行、卸载和资料保留。
param(
    [string]$InstallerPath,
    [string]$LogDirectory
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\') + '\'
if (-not $InstallerPath) { $InstallerPath = Join-Path $workspace 'dist\windows\0.1.0\Qingsuiji-0.1.0-windows-x64-setup.exe' }
if (-not $LogDirectory) { $LogDirectory = Join-Path $workspace 'logs\windows-installer-20261030' }
$LogDirectory = [IO.Path]::GetFullPath($LogDirectory)
if (-not ($LogDirectory + '\').StartsWith($workspace, [StringComparison]::OrdinalIgnoreCase)) { throw '安装验证日志必须位于当前工作区。' }
$registry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{76FB3A62-3659-41A1-B1BF-F5619C927408}_is1'
if (Test-Path -LiteralPath $registry) { throw '已有正式安装记录，未覆盖或卸载；请在独立测试环境验证。' }
$installed = Join-Path $LogDirectory ('安装 样例_' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (-not ([IO.Path]::GetFullPath($installed) + '\').StartsWith($workspace, [StringComparison]::OrdinalIgnoreCase)) { throw '安装目标超出验证工作区。' }
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) '青穗集.lnk'
$hasShortcut = Test-Path -LiteralPath $desktop
$args = @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/DIR="' + $installed + '"'),'/GROUP="青穗集安装验证"',('/LOG="' + (Join-Path $LogDirectory 'installer-install.log') + '"'))
if ($hasShortcut) { $args += '/TASKS=""' }
$uninstaller = Join-Path $installed 'unins000.exe'
$installedOk = $false
try {
    $setup = Start-Process -FilePath $InstallerPath -ArgumentList $args -WindowStyle Hidden -Wait -PassThru
    if ($setup.ExitCode -ne 0) { throw ('安装程序退出码：' + $setup.ExitCode) }
    $installedOk = $true
    if (-not (Test-Path -LiteralPath (Join-Path $installed 'Qingsuiji.exe'))) { throw '启动器未安装。' }
    $shortcutOk = $null
    if (-not $hasShortcut) {
        if (-not (Test-Path -LiteralPath $desktop)) { throw '桌面快捷方式未创建。' }
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($desktop)
        $shortcutOk = $shortcut.TargetPath -eq (Join-Path $installed 'Qingsuiji.exe')
        if (-not $shortcutOk) { throw '快捷方式目标不正确。' }
    }
    & node (Join-Path $PSScriptRoot 'verify-windows.mjs') $installed $LogDirectory
    if ($LASTEXITCODE -ne 0) { throw '安装版生命周期验证失败。' }
    $smoke = Get-Content -LiteralPath (Join-Path $LogDirectory 'desktop-smoke.json') -Raw | ConvertFrom-Json
    $remove = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="' + (Join-Path $LogDirectory 'installer-uninstall.log') + '"')) -WindowStyle Hidden -Wait -PassThru
    if ($remove.ExitCode -ne 0) { throw ('卸载程序退出码：' + $remove.ExitCode) }
    $installedOk = $false
    if (-not (Test-Path -LiteralPath (Join-Path $smoke.data_directory 'agent.sqlite'))) { throw '卸载不应删除用户数据库。' }
    if (-not (Test-Path -LiteralPath (Join-Path $smoke.data_directory 'keep.txt'))) { throw '卸载不应删除用户资料。' }
    if (Test-Path -LiteralPath (Join-Path $installed 'Qingsuiji.exe')) { throw '卸载后程序文件仍然存在。' }
    if (-not $hasShortcut -and (Test-Path -LiteralPath $desktop)) { throw '卸载后本次创建的桌面快捷方式未移除。' }
    $report = [ordered]@{ ok=$true; custom_install_directory=$installed; desktop_shortcut_created_and_verified=$shortcutOk; local_lifecycle_verified=$true; uninstall_preserved_user_data=$true; developer_data_untouched=$true; automatic_updates=$false; code_signing=$false }
    $report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $LogDirectory 'installer-smoke.json') -Encoding utf8
    $report | ConvertTo-Json
} finally {
    if ($installedOk -and (Test-Path -LiteralPath $uninstaller)) {
        Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -WindowStyle Hidden -Wait | Out-Null
    }
}
