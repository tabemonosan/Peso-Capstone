param([string]$Time = '02:00')
$ErrorActionPreference = 'Stop'
$taskName = 'PESO Daily Encrypted Backup'
$runner = Join-Path $PSScriptRoot 'run-backup.ps1'
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'The PESO backup task already exists. Inspect it in Task Scheduler before changing its schedule.' }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`" -NodePath `"$nodePath`"" -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Select-Object TaskName, State
