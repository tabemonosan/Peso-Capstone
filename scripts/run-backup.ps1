param([string]$NodePath = 'node')
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
$logDirectory = Join-Path $projectDirectory '.backups'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
& $NodePath (Join-Path $projectDirectory 'server/scripts/backup.js') create *> (Join-Path $logDirectory 'last-backup.log')
exit $LASTEXITCODE
