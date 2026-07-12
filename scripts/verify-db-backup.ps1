param(
    [string] $DatabaseHost = "127.0.0.1",
    [int] $DatabasePort = 3306,
    [string] $Database = "career_decision_system",
    [string] $Username = "",
    [string] $Password = "",
    [string] $MySqlPath = "",
    [string] $MySqlDumpPath = "",
    [string] $BackupPath = "",
    [switch] $DeleteBackupAfterVerification,
    [switch] $KeepRestoreDatabase
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Resolve-MySqlTool {
    param(
        [string] $ConfiguredPath,
        [string] $ExecutableName
    )

    $Candidates = @($ConfiguredPath)
    if (-not [string]::IsNullOrWhiteSpace($env:MYSQL_BIN_DIR)) {
        $Candidates += Join-Path $env:MYSQL_BIN_DIR $ExecutableName
    }
    $Candidates += @(
        $ExecutableName,
        "D:\IDE\phpStudy_64\phpstudy_pro\Extensions\MySQL8.0.12\bin\$ExecutableName",
        "C:\Program Files\MySQL\MySQL Server 8.4\bin\$ExecutableName",
        "C:\Program Files\MySQL\MySQL Server 8.0\bin\$ExecutableName"
    )

    foreach ($Candidate in $Candidates) {
        if ([string]::IsNullOrWhiteSpace($Candidate)) {
            continue
        }
        $Command = Get-Command $Candidate -ErrorAction SilentlyContinue
        if ($Command) {
            return $Command.Source
        }
        if (Test-Path -LiteralPath $Candidate) {
            return (Resolve-Path -LiteralPath $Candidate).Path
        }
    }

    throw "$ExecutableName was not found. Pass its full path or set MYSQL_BIN_DIR."
}

function Invoke-MySqlRows {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Sql,
        [string] $TargetDatabase = ""
    )

    $Arguments = @(
        "--host=$DatabaseHost",
        "--port=$DatabasePort",
        "--user=$Username",
        "--protocol=tcp",
        "--default-character-set=utf8mb4",
        "--batch",
        "--raw",
        "--skip-column-names",
        "--execute=$Sql"
    )
    if (-not [string]::IsNullOrWhiteSpace($TargetDatabase)) {
        $Arguments += $TargetDatabase
    }

    $Output = & $ResolvedMySql @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "mysql command failed: $($Output -join [Environment]::NewLine)"
    }
    return @($Output | ForEach-Object { [string] $_ })
}

function Start-RedirectedTool {
    param(
        [Parameter(Mandatory = $true)]
        [string] $FilePath,
        [Parameter(Mandatory = $true)]
        [string[]] $Arguments,
        [string] $StandardInputPath = "",
        [string] $StandardOutputPath = ""
    )

    $ErrorPath = Join-Path ([System.IO.Path]::GetTempPath()) ("career-db-tool-" + [guid]::NewGuid().ToString("N") + ".err")
    $OutputPath = $StandardOutputPath
    $RemoveOutput = $false
    if ([string]::IsNullOrWhiteSpace($OutputPath)) {
        $OutputPath = Join-Path ([System.IO.Path]::GetTempPath()) ("career-db-tool-" + [guid]::NewGuid().ToString("N") + ".out")
        $RemoveOutput = $true
    }

    try {
        $StartArguments = @{
            FilePath = $FilePath
            ArgumentList = $Arguments
            NoNewWindow = $true
            PassThru = $true
            Wait = $true
            RedirectStandardOutput = $OutputPath
            RedirectStandardError = $ErrorPath
        }
        if (-not [string]::IsNullOrWhiteSpace($StandardInputPath)) {
            $StartArguments["RedirectStandardInput"] = $StandardInputPath
        }
        $Process = Start-Process @StartArguments
        if ($Process.ExitCode -ne 0) {
            $ErrorText = if (Test-Path -LiteralPath $ErrorPath) {
                Get-Content -Raw -LiteralPath $ErrorPath
            } else {
                "No error output was produced."
            }
            throw "Database tool exited with code $($Process.ExitCode): $ErrorText"
        }
    } finally {
        Remove-Item -LiteralPath $ErrorPath -Force -ErrorAction SilentlyContinue
        if ($RemoveOutput) {
            Remove-Item -LiteralPath $OutputPath -Force -ErrorAction SilentlyContinue
        }
    }
}

function Get-BaseTableNames {
    param([string] $SchemaName)
    $Sql = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '$SchemaName' AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
    return @(Invoke-MySqlRows -Sql $Sql)
}

function Get-SchemaObjectInventory {
    param([string] $SchemaName)
    $Sql = @"
SELECT CONCAT('TABLE:', TABLE_TYPE, ':', TABLE_NAME)
FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '$SchemaName'
UNION ALL
SELECT CONCAT('TRIGGER:', TRIGGER_NAME)
FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = '$SchemaName'
UNION ALL
SELECT CONCAT('ROUTINE:', ROUTINE_TYPE, ':', ROUTINE_NAME)
FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = '$SchemaName'
UNION ALL
SELECT CONCAT('EVENT:', EVENT_NAME)
FROM INFORMATION_SCHEMA.EVENTS WHERE EVENT_SCHEMA = '$SchemaName'
ORDER BY 1
"@
    return @(Invoke-MySqlRows -Sql $Sql)
}

function Get-ExactTableCount {
    param(
        [string] $SchemaName,
        [string] $TableName
    )
    $SafeTableName = $TableName.Replace('`', '``')
    $Rows = @(Invoke-MySqlRows -Sql "SELECT COUNT(*) FROM ``$SchemaName``.``$SafeTableName``")
    if ($Rows.Count -ne 1) {
        throw "Could not read an exact row count for $SchemaName.$TableName."
    }
    return [long] ([string] $Rows[0])
}

if ($Database -notmatch '^[A-Za-z0-9_]+$') {
    throw "Database must contain only letters, digits, and underscores."
}
if ($DatabasePort -lt 1 -or $DatabasePort -gt 65535) {
    throw "DatabasePort must be between 1 and 65535."
}

if ([string]::IsNullOrWhiteSpace($Username)) {
    $Username = if ([string]::IsNullOrWhiteSpace($env:DB_USERNAME)) { "root" } else { $env:DB_USERNAME }
}
if ([string]::IsNullOrWhiteSpace($Password)) {
    $Password = if ([string]::IsNullOrWhiteSpace($env:DB_PASSWORD)) { "root" } else { $env:DB_PASSWORD }
}

$ResolvedMySql = Resolve-MySqlTool -ConfiguredPath $MySqlPath -ExecutableName "mysql.exe"
$ResolvedMySqlDump = Resolve-MySqlTool -ConfiguredPath $MySqlDumpPath -ExecutableName "mysqldump.exe"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$RestoreDatabaseBase = $Database.Substring(0, [Math]::Min($Database.Length, 34))
$RestoreDatabase = ($RestoreDatabaseBase + "_restore_" + (Get-Date -Format "yyyyMMddHHmmss") + "_" + [guid]::NewGuid().ToString("N").Substring(0, 6))
$RequiredRestorePrefix = $RestoreDatabaseBase + "_restore_"

if ($RestoreDatabase -eq $Database -or -not $RestoreDatabase.StartsWith($RequiredRestorePrefix, [StringComparison]::Ordinal)) {
    throw "Refusing to use an unsafe restore database name: $RestoreDatabase"
}

if ([string]::IsNullOrWhiteSpace($BackupPath)) {
    $BackupPath = Join-Path $Root "backups\$Database-$Timestamp.sql"
}
$BackupPath = [System.IO.Path]::GetFullPath($BackupPath)
$BackupDirectory = Split-Path -Parent $BackupPath
[System.IO.Directory]::CreateDirectory($BackupDirectory) | Out-Null

$PreviousMySqlPassword = $env:MYSQL_PWD
$RestoreCreated = $false
$VerificationPassed = $false

try {
    $env:MYSQL_PWD = $Password
    $SourceExists = @(Invoke-MySqlRows -Sql "SELECT COUNT(*) FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '$Database'")
    if ($SourceExists.Count -ne 1 -or [int] ([string] $SourceExists[0]) -ne 1) {
        throw "Source database does not exist: $Database"
    }

    Write-Host "Creating full MySQL backup: $BackupPath" -ForegroundColor Cyan
    $DumpArguments = @(
        "--host=$DatabaseHost",
        "--port=$DatabasePort",
        "--user=$Username",
        "--protocol=tcp",
        "--single-transaction",
        "--quick",
        "--routines",
        "--triggers",
        "--events",
        "--hex-blob",
        "--default-character-set=utf8mb4",
        "--set-gtid-purged=OFF",
        "--no-tablespaces",
        $Database
    )
    Start-RedirectedTool -FilePath $ResolvedMySqlDump -Arguments $DumpArguments -StandardOutputPath $BackupPath
    $BackupFile = Get-Item -LiteralPath $BackupPath
    if ($BackupFile.Length -le 0) {
        throw "mysqldump created an empty backup file."
    }

    Write-Host "Restoring backup into temporary database: $RestoreDatabase" -ForegroundColor Cyan
    Invoke-MySqlRows -Sql "CREATE DATABASE ``$RestoreDatabase`` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci" | Out-Null
    $RestoreCreated = $true
    $RestoreArguments = @(
        "--host=$DatabaseHost",
        "--port=$DatabasePort",
        "--user=$Username",
        "--protocol=tcp",
        "--default-character-set=utf8mb4",
        $RestoreDatabase
    )
    Start-RedirectedTool -FilePath $ResolvedMySql -Arguments $RestoreArguments -StandardInputPath $BackupPath

    $SourceTables = @(Get-BaseTableNames -SchemaName $Database)
    $RestoreTables = @(Get-BaseTableNames -SchemaName $RestoreDatabase)
    if (($SourceTables -join "`n") -ne ($RestoreTables -join "`n")) {
        $Missing = @($SourceTables | Where-Object { $RestoreTables -notcontains $_ })
        $Unexpected = @($RestoreTables | Where-Object { $SourceTables -notcontains $_ })
        throw "Restored table set differs. Missing=[$($Missing -join ', ')] Unexpected=[$($Unexpected -join ', ')]"
    }

    $SourceObjects = @(Get-SchemaObjectInventory -SchemaName $Database)
    $RestoreObjects = @(Get-SchemaObjectInventory -SchemaName $RestoreDatabase)
    if (($SourceObjects -join "`n") -ne ($RestoreObjects -join "`n")) {
        throw "Restored schema object inventory differs from the source database."
    }

    [long] $TotalRows = 0
    foreach ($TableName in $SourceTables) {
        $SourceCount = Get-ExactTableCount -SchemaName $Database -TableName $TableName
        $RestoreCount = Get-ExactTableCount -SchemaName $RestoreDatabase -TableName $TableName
        if ($SourceCount -ne $RestoreCount) {
            throw "Row count differs for $TableName. source=$SourceCount restored=$RestoreCount"
        }
        $TotalRows += $SourceCount
    }

    $VerificationPassed = $true
    Write-Host "Backup restore rehearsal passed." -ForegroundColor Green
    Write-Host "Tables verified: $($SourceTables.Count)" -ForegroundColor Green
    Write-Host "Schema objects:  $($SourceObjects.Count)" -ForegroundColor Green
    Write-Host "Rows verified:   $TotalRows" -ForegroundColor Green
    Write-Host "Backup bytes:    $($BackupFile.Length)" -ForegroundColor Green
    Write-Host "Backup file:     $BackupPath" -ForegroundColor Green
} finally {
    try {
        if ($RestoreCreated -and -not $KeepRestoreDatabase) {
            if ($RestoreDatabase -eq $Database -or -not $RestoreDatabase.StartsWith($RequiredRestorePrefix, [StringComparison]::Ordinal)) {
                throw "Refusing to drop an unsafe database name: $RestoreDatabase"
            }
            Invoke-MySqlRows -Sql "DROP DATABASE IF EXISTS ``$RestoreDatabase``" | Out-Null
            Write-Host "Removed temporary restore database: $RestoreDatabase" -ForegroundColor DarkGray
        }
        if ($VerificationPassed -and $DeleteBackupAfterVerification) {
            Remove-Item -LiteralPath $BackupPath -Force
            Write-Host "Removed verified backup file: $BackupPath" -ForegroundColor DarkGray
        }
    } finally {
        $env:MYSQL_PWD = $PreviousMySqlPassword
    }
}
