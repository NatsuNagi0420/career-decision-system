[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('local', 'development')]
    [string]$Environment,
    [Parameter(Mandatory = $true)]
    [ValidateSet('DELETE CHAT SESSIONS')]
    [string]$ConfirmationPhrase,
    [switch]$ConfirmPurge,
    [long]$UserId,
    [long]$SessionId,
    [string]$Database = 'career_decision_system',
    [string]$HostName = '127.0.0.1',
    [int]$Port = 3306,
    [string]$Username = $env:DB_USERNAME,
    [string]$Password = $env:DB_PASSWORD,
    [string]$MySqlPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $ConfirmPurge) {
    throw 'This script permanently removes chat sessions. Re-run with -ConfirmPurge -ConfirmationPhrase "DELETE CHAT SESSIONS".'
}
if ($Database -match '(?i)(prod|production|staging)') {
    throw "Refusing to purge a non-development database: $Database"
}
if ($HostName -notin @('127.0.0.1', 'localhost', '::1')) {
    throw "Refusing to purge a database outside this computer: $HostName"
}
if ($SessionId -and $SessionId -le 0) { throw 'SessionId must be positive.' }
if ($UserId -and $UserId -le 0) { throw 'UserId must be positive.' }
if ($Database -notmatch '^[A-Za-z0-9_]+$') { throw 'Database must contain only letters, digits, and underscores.' }
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

$filters = @("status = 'archived'")
if ($PSBoundParameters.ContainsKey('UserId')) { $filters += "user_id = $UserId" }
if ($PSBoundParameters.ContainsKey('SessionId')) { $filters += "id = $SessionId" }
$where = 'WHERE ' + ($filters -join ' AND ')
$target = $filters -join ' AND '

$sql = @'
START TRANSACTION;

CREATE TEMPORARY TABLE purge_chat_session_ids (
    id BIGINT PRIMARY KEY
) ENGINE=InnoDB;

INSERT INTO purge_chat_session_ids (id)
SELECT id
FROM chat_sessions
__WHERE__;

CREATE TEMPORARY TABLE purge_chat_agent_run_ids (
    id BIGINT PRIMARY KEY
) ENGINE=InnoDB;

INSERT IGNORE INTO purge_chat_agent_run_ids (id)
SELECT DISTINCT message.agent_run_id
FROM chat_messages message
JOIN purge_chat_session_ids session_row ON session_row.id = message.session_id
WHERE message.agent_run_id IS NOT NULL;

-- A model run can finish after the user deletes the session, before an
-- assistant message links agent_run_id. The persisted user message request_id
-- still lets the maintenance command scrub that orphan audit row.
INSERT IGNORE INTO purge_chat_agent_run_ids (id)
SELECT DISTINCT run_row.id
FROM agent_runs run_row
JOIN chat_messages message ON message.request_id = run_row.request_id
JOIN purge_chat_session_ids session_row ON session_row.id = message.session_id
WHERE run_row.agent_type = 'chat'
  AND run_row.user_id = message.user_id
  AND message.request_id IS NOT NULL;

SELECT
    (SELECT COUNT(*) FROM purge_chat_session_ids) AS sessions_before,
    (SELECT COUNT(*) FROM chat_messages message JOIN purge_chat_session_ids session_row ON session_row.id = message.session_id) AS messages_before,
    (SELECT COUNT(*) FROM purge_chat_agent_run_ids) AS chat_audits_to_scrub;

DELETE FROM chat_sessions
WHERE id IN (SELECT id FROM purge_chat_session_ids);

UPDATE agent_runs run_row
SET input_json = '{"deleted":true,"reason":"chat_session_deleted"}',
    output_json = '{"deleted":true,"reason":"chat_session_deleted"}',
    error_message = NULL,
    user_id = NULL
WHERE run_row.id IN (SELECT id FROM purge_chat_agent_run_ids)
  AND run_row.agent_type = 'chat'
  AND NOT EXISTS (
      SELECT 1 FROM chat_messages remaining_message
      WHERE remaining_message.agent_run_id = run_row.id
         OR remaining_message.request_id = run_row.request_id
  )
  AND NOT EXISTS (SELECT 1 FROM reports report_row WHERE report_row.agent_run_id = run_row.id)
  AND NOT EXISTS (SELECT 1 FROM resume_analyses resume_row WHERE resume_row.agent_run_id = run_row.id)
  AND NOT EXISTS (SELECT 1 FROM path_plans plan_row WHERE plan_row.agent_run_id = run_row.id);

SELECT
    (SELECT COUNT(*) FROM chat_sessions WHERE id IN (SELECT id FROM purge_chat_session_ids)) AS sessions_after,
    (SELECT COUNT(*) FROM chat_messages message JOIN purge_chat_session_ids session_row ON session_row.id = message.session_id) AS messages_after;

DROP TEMPORARY TABLE purge_chat_agent_run_ids;
DROP TEMPORARY TABLE purge_chat_session_ids;
COMMIT;
'@

$sql = $sql.Replace('__WHERE__', $where)

if (-not $PSCmdlet.ShouldProcess(("{0}@{1}:{2}/{3} ({4})" -f $Username, $HostName, $Port, $Database, $target), 'Permanently purge chat sessions and messages')) {
    return
}

Write-Host "Only content-free audit metadata is retained; other domain data is untouched." -ForegroundColor Yellow

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
