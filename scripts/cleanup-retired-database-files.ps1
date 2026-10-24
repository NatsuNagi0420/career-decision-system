# 青穗集 · 一次性旧数据文件清理：固定工作区、完整恢复副本与独占检查通过后，才删除旧岗位文件和 checkpoint。
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$backup = Join-Path $workspace 'backups/database-consolidation-20261024'
$log = Join-Path $workspace 'logs/database-consolidation-20261024'
$result = Get-Content -LiteralPath (Join-Path $log 'retirement-result.json') -Raw | ConvertFrom-oson
if (-not $result.apply -or @($result.deleted_mysql_databases).Count -ne 5) { throw '旧库退休尚未完成，拒绝文件清理。' }
function Assert-WithinWorkspace([string] $value) {
    $resolved = [IO.Path]::GetFullPath($value)
    if (-not $resolved.StartsWith($workspace + '\', [StringComparison]::OrdinalIgnoreCase)) { throw '目标不在当前工作区中。' }
    return $resolved
}
function Same-File([string] $source, [string] $copy) {
    if (-not (Test-Path -LiteralPath $copy -PathType Leaf)) { throw '缺少恢复副本。' }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash) { throw '源文件与恢复副本不一致，拒绝删除。' }
}
$sourceBackup = Join-Path $backup 'source-files'
$dataDir = Assert-WithinWorkspace (Join-Path $workspace 'agent/data')
$oldScripts = @('scripts/export-job-catalogue.py', 'scripts/merge-job-catalogue.py')
$checkpoints = @()
foreach ($entry in $result.checkpoint_backups) {
    $source = Assert-WithinWorkspace $entry.source
    if ([IO.Path]::GetDirectoryName($source) -ne (Join-Path $workspace 'legacy/server-python/var')) { throw 'checkpoint 不在指定目录。' }
    if ((Get-FileHash -LiteralPath $entry.backup -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.backup_sha256) { throw 'checkpoint 恢复副本损坏。' }
    foreach ($file in $entry.source_files) {
        $target = Assert-WithinWorkspace $file.file
        if ($target -notin @($source, ($source + '-wal'), ($source + '-shm'))) { throw '不是获准删除的 checkpoint 文件。' }
        if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { continue }
        if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw 'checkpoint 在备份后发生变化，拒绝删除。' }
        $checkpoints += $target
    }
}
if (Test-Path -LiteralPath $dataDir) {
    $items = @(Get-ChildItem -LiteralPath $dataDir -Recurse -Force)
    if (@($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -ne 0) { throw '发现重解析点，拒绝递归清理。' }
    $files = @($items | Where-Object { -not $_.PSIsContainer })
    $copies = @(Get-ChildItem -LiteralPath (Join-Path $sourceBackup 'agent/data') -File -Recurse -Force)
    if ($files.Count -ne $copies.Count) { throw '岗位副本文件数发生变化。' }
    foreach ($file in $files) { Same-File $file.FullName (Join-Path $sourceBackup ([IO.Path]::GetRelativePath($workspace, $file.FullName))) }
}
foreach ($relative in $oldScripts) {
    $source = Assert-WithinWorkspace (Join-Path $workspace $relative)
    if (Test-Path -LiteralPath $source) { Same-File $source (Join-Path $sourceBackup $relative) }
}
# 持有仅允许删除共享的读句柄，阻止清理时有旧进程重新读写 checkpoint。
$handles = @()
$deleted = @()
try {
    foreach ($file in $checkpoints) { $handles += [IO.File]::Open($file, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Delete) }
    foreach ($file in $checkpoints) { Remove-Item -LiteralPath $file -Force; $deleted += $file }
    foreach ($relative in $oldScripts) {
        $source = Assert-WithinWorkspace (Join-Path $workspace $relative)
        if (Test-Path -LiteralPath $source) { Remove-Item -LiteralPath $source; $deleted += $source }
    }
    if (Test-Path -LiteralPath $dataDir) {
        # 已核对绝对目标为本工作区 agent/data，内容逐一与恢复副本相同。
        Remove-Item -LiteralPath $dataDir -Recurse -Force
        $deleted += $dataDir
    }
} finally {
    foreach ($handle in $handles) { $handle.Dispose() }
    @{ deleted = $deleted; canonical_database = (Join-Path $workspace 'agent/var/agent.sqlite'); backup = $backup } | ConvertTo-oson -Depth 6 | Set-Content -LiteralPath (Join-Path $log 'retired-files-deleted.json') -Encoding utf8
}
Write-Output ('已清理 {0} 个旧文件/目录；恢复副本保留在 {1}' -f $deleted.Count, $backup)



