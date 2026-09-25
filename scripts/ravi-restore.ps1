param([switch]$VerifyOnly)

$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$backupRoot = Join-Path (Split-Path -Parent $workspaceRoot) 'RAVI_PREVIOUS_WEBSITE'
$backupMarker = Join-Path $backupRoot 'RAVI_PREVIOUS_WEBSITE'

if (-not (Test-Path $backupMarker)) {
    throw "RAVI restore point is missing its marker: $backupMarker"
}
if (-not (Test-Path (Join-Path $backupRoot 'src\App.jsx')) -or -not (Test-Path (Join-Path $backupRoot 'backend\main.py'))) {
    throw "RAVI restore point is incomplete: $backupRoot"
}
if ($VerifyOnly) {
    Write-Host "RAVI restore point verified at $backupRoot. No files were restored."
    exit 0
}

$robocopyArgs = @(
    $backupRoot,
    $workspaceRoot,
    '/MIR',
    '/XD', 'node_modules', '.venv', '.pytest_cache', '__pycache__', 'scripts',
    '/XF', 'package.json', 'RAVI_PREVIOUS_WEBSITE'
)
& robocopy @robocopyArgs
$copyExitCode = $LASTEXITCODE
if ($copyExitCode -ge 8) {
    throw "RAVI restore failed with robocopy exit code $copyExitCode. The backup remains at $backupRoot."
}

Write-Host "Previous website restored from $backupRoot. The backup remains available."
