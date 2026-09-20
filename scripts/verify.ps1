# One command that tells the truth about the current tree.
#
# v1 had four verification scripts pointing at four layers that no longer exist.
# This runs every gate the v2 rewrite actually has, in the order that fails fastest.
#
#   powershell -File scripts/verify.ps1            # everything
#   powershell -File scripts/verify.ps1 -Quick     # skip the DB-backed suite (~7 min)

[CmdletBinding()]
param(
    [switch]$Quick
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root 'server'
$web = Join-Path $root 'web'
$py = Join-Path $server '.venv\Scripts\python.exe'

$results = [System.Collections.Generic.List[object]]::new()

function Invoke-Step {
    param([string]$Name, [string]$Workdir, [scriptblock]$Body)

    Write-Host ''
    Write-Host "── $Name" -ForegroundColor Cyan
    Push-Location $Workdir
    try {
        & $Body
        $code = $LASTEXITCODE
        if ($null -eq $code) { $code = 0 }
        $results.Add([pscustomobject]@{ Step = $Name; Passed = ($code -eq 0) })
        if ($code -ne 0) { Write-Host "   FAILED (exit $code)" -ForegroundColor Red }
    }
    finally {
        Pop-Location
    }
}

if (-not (Test-Path $py)) {
    throw "server venv missing. Run: cd server; uv sync --extra dev"
}
if (-not (Test-Path (Join-Path $web 'node_modules'))) {
    throw "web dependencies missing. Run: cd web; npm ci"
}

Invoke-Step 'ruff (server lint)' $server { & $py -m ruff check app tests scripts migrations }
Invoke-Step 'capability + contract integrity' $server { & $py scripts\validate.py }
Invoke-Step 'alembic drift check' $server { & $py -m alembic check }

if ($Quick) {
    Write-Host ''
    Write-Host '── skipping pytest (pass without -Quick to run the DB-backed suite)' -ForegroundColor Yellow
}
else {
    Invoke-Step 'pytest (needs MySQL career_v2_test)' $server { & $py -m pytest -q }
}

Invoke-Step 'tsc --noEmit' $web { & npx tsc --noEmit }
Invoke-Step 'vitest' $web { & npx vitest run }
Invoke-Step 'vite build' $web { & npm run build }

Write-Host ''
Write-Host '════════ summary ════════' -ForegroundColor Cyan
$results | ForEach-Object {
    $colour = if ($_.Passed) { 'Green' } else { 'Red' }
    Write-Host ("  {0}  {1}" -f $(if ($_.Passed) { 'PASS' } else { 'FAIL' }), $_.Step) -ForegroundColor $colour
}

if (-not ($results | Where-Object { -not $_.Passed })) {
    Write-Host ''
    Write-Host 'all gates passed' -ForegroundColor Green
    exit 0
}

exit 1
