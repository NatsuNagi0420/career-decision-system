[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('local', 'development')]
    [string]$Environment,
    [switch]$ConfirmReset,
    [string]$Database = 'career_decision_system',
    [string]$HostName = '127.0.0.1',
    [int]$Port = 3306,
    [string]$Username = $env:DB_USERNAME,
    [string]$Password = $env:DB_PASSWORD,
    [string]$MySqlPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $ConfirmReset) {
    throw 'This script removes V1 decision-project data. Re-run with -ConfirmReset after creating a backup.'
}
if ($Database -match '(?i)(prod|production|staging)') {
    throw "Refusing to reset a non-development database: $Database"
}
if ($HostName -notin @('127.0.0.1', 'localhost', '::1')) {
    throw "Refusing to reset a database outside this computer: $HostName"
}
if ([string]::IsNullOrWhiteSpace($Username)) { $Username = 'root' }
if ($null -eq $Password) { $Password = '' }

$candidates = @(
    $MySqlPath,
    $(if ($env:MYSQL_BIN_DIR) { Join-Path $env:MYSQL_BIN_DIR 'mysql.exe' }),
    'mysql.exe',
    'D:\IDE\phpStudy_64\phpstudy_pro\Extensions\MySQL8.0.12\bin\mysql.exe',
    'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe',
    'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

$mysql = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $mysql) {
    $command = Get-Command mysql.exe -ErrorAction SilentlyContinue
    if ($command) { $mysql = $command.Source }
}
if (-not $mysql) {
    throw 'mysql.exe was not found. Pass -MySqlPath or set MYSQL_BIN_DIR.'
}

$sql = @'
START TRANSACTION;

CREATE TEMPORARY TABLE reset_project_ids (id BIGINT PRIMARY KEY)
    SELECT id FROM decision_projects WHERE flow_version < 2;
CREATE TEMPORARY TABLE reset_plan_ids (id BIGINT PRIMARY KEY)
    SELECT id FROM path_plans
    WHERE decision_project_id IN (SELECT id FROM reset_project_ids);

DELETE result_row FROM task_results result_row
JOIN path_plan_tasks task_row ON task_row.id = result_row.task_id
JOIN path_plan_milestones week_row ON week_row.id = task_row.milestone_id
WHERE week_row.plan_id IN (SELECT id FROM reset_plan_ids);

DELETE history_row FROM task_change_history history_row
JOIN path_plan_tasks task_row ON task_row.id = history_row.task_id
JOIN path_plan_milestones week_row ON week_row.id = task_row.milestone_id
WHERE week_row.plan_id IN (SELECT id FROM reset_plan_ids);

DELETE FROM weekly_reviews
WHERE project_id IN (SELECT id FROM reset_project_ids)
   OR plan_id IN (SELECT id FROM reset_plan_ids);

DELETE task_row FROM path_plan_tasks task_row
JOIN path_plan_milestones week_row ON week_row.id = task_row.milestone_id
WHERE week_row.plan_id IN (SELECT id FROM reset_plan_ids);
DELETE FROM path_plan_milestones WHERE plan_id IN (SELECT id FROM reset_plan_ids);
DELETE FROM path_plans WHERE id IN (SELECT id FROM reset_plan_ids);
DELETE FROM reports WHERE decision_project_id IN (SELECT id FROM reset_project_ids);
DELETE FROM target_confidence_feedback WHERE project_id IN (SELECT id FROM reset_project_ids);

DELETE result_row FROM comparison_results result_row
JOIN comparison_criteria criterion_row ON criterion_row.id = result_row.criterion_id
WHERE criterion_row.project_id IN (SELECT id FROM reset_project_ids);
DELETE FROM comparison_criteria WHERE project_id IN (SELECT id FROM reset_project_ids);
DELETE FROM decision_targets WHERE project_id IN (SELECT id FROM reset_project_ids);
DELETE FROM decision_evidence WHERE project_id IN (SELECT id FROM reset_project_ids);
DELETE FROM decision_project_job_samples WHERE project_id IN (SELECT id FROM reset_project_ids);
DELETE FROM decision_candidates WHERE project_id IN (SELECT id FROM reset_project_ids);
DELETE FROM decision_projects WHERE id IN (SELECT id FROM reset_project_ids);

DROP TEMPORARY TABLE reset_plan_ids;
DROP TEMPORARY TABLE reset_project_ids;
COMMIT;

SELECT COUNT(*) AS remaining_v1_decision_projects
FROM decision_projects
WHERE flow_version < 2;
'@

$target = "$Username@$HostName`:$Port/$Database"
if (-not $PSCmdlet.ShouldProcess($target, 'Remove V1 decision-project data and its derived plans/reviews/reports')) {
    return
}

$previousPassword = $env:MYSQL_PWD
try {
    $env:MYSQL_PWD = $Password
    $output = $sql | & $mysql --host=$HostName --port=$Port --user=$Username --database=$Database --batch --raw 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "mysql command failed: $($output -join [Environment]::NewLine)"
    }
    $output
} finally {
    $env:MYSQL_PWD = $previousPassword
}
