param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z][A-Za-z0-9-]{2,23}$')]
    [string] $CohortPrefix,
    [datetime] $RegisteredFrom = [datetime]::MinValue,
    [datetime] $RegisteredBefore = [datetime]::MaxValue,
    [string] $DatabaseHost = "127.0.0.1",
    [int] $DatabasePort = 3306,
    [string] $Database = "career_decision_system",
    [string] $Username = "",
    [string] $Password = "",
    [string] $MySqlPath = "",
    [string] $OutputPath = "",
    [switch] $RequireAcceptance
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Resolve-MySqlExecutable {
    param([string] $ConfiguredPath)

    $Candidates = @($ConfiguredPath)
    if (-not [string]::IsNullOrWhiteSpace($env:MYSQL_BIN_DIR)) {
        $Candidates += Join-Path $env:MYSQL_BIN_DIR "mysql.exe"
    }
    $Candidates += @(
        "mysql.exe",
        "D:\IDE\phpStudy_64\phpstudy_pro\Extensions\MySQL8.0.12\bin\mysql.exe",
        "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe",
        "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
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
    throw "mysql.exe was not found. Pass -MySqlPath or set MYSQL_BIN_DIR."
}

function Convert-ToRate {
    param([int] $Count, [int] $Total)
    if ($Total -eq 0) {
        return 0.0
    }
    return [Math]::Round(($Count * 100.0) / $Total, 1)
}

function Convert-ToMySqlDateTime {
    param([datetime] $Value, [bool] $IsMinimum)
    if ($IsMinimum -and $Value -eq [datetime]::MinValue) {
        return "1970-01-01 00:00:00"
    }
    if (-not $IsMinimum -and $Value -eq [datetime]::MaxValue) {
        return "9999-12-31 23:59:59"
    }
    return $Value.ToString("yyyy-MM-dd HH:mm:ss", [Globalization.CultureInfo]::InvariantCulture)
}

if ($CohortPrefix -match '^(smoke|web|test|demo)') {
    throw "CohortPrefix must identify real pilot accounts, not smoke, test, or demo accounts."
}
if ($Database -notmatch '^[A-Za-z0-9_]+$') {
    throw "Database must contain only letters, digits, and underscores."
}
if ($DatabasePort -lt 1 -or $DatabasePort -gt 65535) {
    throw "DatabasePort must be between 1 and 65535."
}
if ($RegisteredFrom -ge $RegisteredBefore) {
    throw "RegisteredFrom must be earlier than RegisteredBefore."
}

if ([string]::IsNullOrWhiteSpace($Username)) {
    $Username = if ([string]::IsNullOrWhiteSpace($env:DB_USERNAME)) { "root" } else { $env:DB_USERNAME }
}
if ([string]::IsNullOrWhiteSpace($Password)) {
    $Password = if ([string]::IsNullOrWhiteSpace($env:DB_PASSWORD)) { "root" } else { $env:DB_PASSWORD }
}

$ResolvedMySql = Resolve-MySqlExecutable -ConfiguredPath $MySqlPath
$FromText = Convert-ToMySqlDateTime -Value $RegisteredFrom -IsMinimum $true
$BeforeText = Convert-ToMySqlDateTime -Value $RegisteredBefore -IsMinimum $false
$SafePrefix = $CohortPrefix.Replace("'", "''")

$Sql = @"
SELECT
  u.id,
  DATE_FORMAT(u.created_at, '%Y-%m-%dT%H:%i:%s'),
  IF(up.onboarding_completed_at IS NULL, 0, 1),
  EXISTS(
    SELECT 1 FROM decision_targets dt
    WHERE dt.user_id = u.id AND dt.target_type = 'primary'
  ),
  EXISTS(
    SELECT 1
    FROM path_plans pp
    JOIN path_plan_milestones pm ON pm.plan_id = pp.id
    JOIN path_plan_tasks pt ON pt.milestone_id = pm.id
    WHERE pp.user_id = u.id AND pp.plan_type = 'action'
      AND pt.deleted = 0 AND pt.completed_at IS NOT NULL
  ),
  EXISTS(
    SELECT 1
    FROM path_plans pp
    JOIN path_plan_milestones pm ON pm.plan_id = pp.id
    JOIN path_plan_tasks pt ON pt.milestone_id = pm.id
    WHERE pp.user_id = u.id AND pp.plan_type = 'action'
      AND pt.deleted = 0 AND pt.completed_at IS NOT NULL
      AND pt.completed_at <= DATE_ADD(pp.created_at, INTERVAL 48 HOUR)
  ),
  EXISTS(
    SELECT 1
    FROM task_results tr
    JOIN path_plan_tasks pt ON pt.id = tr.task_id
    JOIN path_plan_milestones pm ON pm.id = pt.milestone_id
    JOIN path_plans pp ON pp.id = pm.plan_id
    WHERE tr.user_id = u.id AND pp.user_id = u.id AND pp.plan_type = 'action'
  ),
  EXISTS(
    SELECT 1 FROM weekly_reviews wr
    WHERE wr.user_id = u.id AND wr.status = 'submitted' AND wr.submitted_at IS NOT NULL
  ),
  (
    EXISTS(
      SELECT 1
      FROM task_change_history tch
      JOIN path_plan_tasks pt ON pt.id = tch.task_id
      JOIN path_plan_milestones pm ON pm.id = pt.milestone_id
      JOIN path_plans pp ON pp.id = pm.plan_id
      WHERE tch.user_id = u.id AND pp.user_id = u.id AND pp.plan_type = 'action'
        AND tch.created_at > (
          SELECT MIN(wr.submitted_at) FROM weekly_reviews wr
          WHERE wr.user_id = u.id AND wr.status = 'submitted' AND wr.submitted_at IS NOT NULL
        )
    )
    OR EXISTS(
      SELECT 1
      FROM task_results tr
      JOIN path_plan_tasks pt ON pt.id = tr.task_id
      JOIN path_plan_milestones pm ON pm.id = pt.milestone_id
      JOIN path_plans pp ON pp.id = pm.plan_id
      WHERE tr.user_id = u.id AND pp.user_id = u.id AND pp.plan_type = 'action'
        AND tr.created_at > (
          SELECT MIN(wr.submitted_at) FROM weekly_reviews wr
          WHERE wr.user_id = u.id AND wr.status = 'submitted' AND wr.submitted_at IS NOT NULL
        )
    )
    OR EXISTS(
      SELECT 1 FROM weekly_reviews later_review
      WHERE later_review.user_id = u.id AND later_review.status = 'submitted'
        AND later_review.submitted_at > (
          SELECT MIN(wr.submitted_at) FROM weekly_reviews wr
          WHERE wr.user_id = u.id AND wr.status = 'submitted' AND wr.submitted_at IS NOT NULL
        )
    )
  )
FROM users u
LEFT JOIN user_profiles up ON up.user_id = u.id
WHERE u.deleted = 0 AND u.status = 'active'
  AND LEFT(LOWER(u.username), CHAR_LENGTH('$SafePrefix')) = LOWER('$SafePrefix')
  AND u.created_at >= '$FromText' AND u.created_at < '$BeforeText'
ORDER BY u.created_at, u.id
"@

$Arguments = @(
    "--host=$DatabaseHost",
    "--port=$DatabasePort",
    "--user=$Username",
    "--protocol=tcp",
    "--default-character-set=utf8mb4",
    "--batch",
    "--raw",
    "--skip-column-names",
    "--execute=$Sql",
    $Database
)

$PreviousMySqlPassword = $env:MYSQL_PWD
try {
    $env:MYSQL_PWD = $Password
    $Rows = @(& $ResolvedMySql @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "mysql query failed: $($Rows -join [Environment]::NewLine)"
    }
} finally {
    $env:MYSQL_PWD = $PreviousMySqlPassword
}

$Participants = @()
$Index = 0
foreach ($Row in $Rows) {
    $Columns = ([string] $Row).Split("`t")
    if ($Columns.Count -ne 9) {
        throw "Unexpected pilot query output. Expected 9 columns, received $($Columns.Count)."
    }
    $Index++
    $TargetConfirmed = [int] $Columns[3] -eq 1
    $TaskCompleted = [int] $Columns[4] -eq 1
    $FirstTaskWithin48Hours = [int] $Columns[5] -eq 1
    $ResultRecorded = [int] $Columns[6] -eq 1
    $ReviewSubmitted = [int] $Columns[7] -eq 1
    $ContinuedAfterReview = [int] $Columns[8] -eq 1
    $Participants += [ordered] @{
        participantId = "P{0:D2}" -f $Index
        registeredAt = $Columns[1]
        onboardingCompleted = ([int] $Columns[2] -eq 1)
        targetConfirmed = $TargetConfirmed
        taskCompleted = $TaskCompleted
        firstTaskWithin48Hours = $FirstTaskWithin48Hours
        resultRecorded = $ResultRecorded
        reviewSubmitted = $ReviewSubmitted
        continuedAfterReview = $ContinuedAfterReview
        fullLoopCompleted = ($TargetConfirmed -and $TaskCompleted -and $ResultRecorded -and $ReviewSubmitted -and $ContinuedAfterReview)
    }
}

$Total = $Participants.Count
$Onboarded = @($Participants | Where-Object { $_.onboardingCompleted }).Count
$Targets = @($Participants | Where-Object { $_.targetConfirmed }).Count
$FirstTasks = @($Participants | Where-Object { $_.firstTaskWithin48Hours }).Count
$Results = @($Participants | Where-Object { $_.resultRecorded }).Count
$Reviews = @($Participants | Where-Object { $_.reviewSubmitted }).Count
$Continued = @($Participants | Where-Object { $_.continuedAfterReview }).Count
$FullLoops = @($Participants | Where-Object { $_.fullLoopCompleted }).Count
$AcceptancePassed = $Total -ge 10 -and $Total -le 15 -and $FullLoops -ge 1

$Report = [ordered] @{
    generatedAt = (Get-Date).ToString("o")
    cohortPrefix = $CohortPrefix
    registeredFrom = $FromText
    registeredBefore = $BeforeText
    containsPersonalContactData = $false
    metrics = [ordered] @{
        participants = $Total
        onboardingCompleted = $Onboarded
        onboardingRatePercent = Convert-ToRate $Onboarded $Total
        targetConfirmed = $Targets
        targetConfirmationRatePercent = Convert-ToRate $Targets $Total
        firstTaskWithin48Hours = $FirstTasks
        firstTaskRatePercent = Convert-ToRate $FirstTasks $Total
        resultRecorded = $Results
        resultRatePercent = Convert-ToRate $Results $Total
        reviewSubmitted = $Reviews
        reviewRatePercent = Convert-ToRate $Reviews $Total
        continuedAfterReview = $Continued
        nextWeekContinuationRatePercent = Convert-ToRate $Continued $Total
        fullLoopCompleted = $FullLoops
    }
    acceptance = [ordered] @{
        requiredParticipantsMinimum = 10
        requiredParticipantsMaximum = 15
        requiredFullLoopsMinimum = 1
        passed = $AcceptancePassed
    }
    participants = $Participants
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputPath = Join-Path $Root "pilot-results\$CohortPrefix-$Timestamp.json"
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.Directory]::CreateDirectory((Split-Path -Parent $OutputPath)) | Out-Null
$Report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8

Write-Host "Pilot metrics report: $OutputPath" -ForegroundColor Cyan
Write-Host "Participants: $Total (required 10-15)"
Write-Host "Target confirmed: $Targets"
Write-Host "First task within 48h: $FirstTasks"
Write-Host "Result recorded: $Results"
Write-Host "Review submitted: $Reviews"
Write-Host "Continued after review: $Continued"
Write-Host "Full loops: $FullLoops (required at least 1)"

if ($RequireAcceptance -and -not $AcceptancePassed) {
    throw "Pilot acceptance is not met. The report was generated, but real participant evidence is still incomplete."
}
if ($AcceptancePassed) {
    Write-Host "Pilot acceptance evidence passed." -ForegroundColor Green
} else {
    Write-Host "Pilot acceptance evidence is incomplete." -ForegroundColor Yellow
}
