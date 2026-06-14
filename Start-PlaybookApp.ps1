<#
.SYNOPSIS
    Launches the M365 Policy Playbook web app (PowerShell + Pode).
.EXAMPLE
    .\Start-PlaybookApp.ps1
    .\Start-PlaybookApp.ps1 -Port 9090 -NoBrowser
#>
[CmdletBinding()]
param(
    [int]$Port = 8080,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

Write-Host "M365 Policy Playbook" -ForegroundColor Cyan
Write-Host "--------------------"

# --- dependency check ---
foreach ($m in 'Pode','ImportExcel') {
    if (-not (Get-Module -ListAvailable -Name $m)) {
        Write-Host "Required module '$m' is not installed." -ForegroundColor Yellow
        $ans = Read-Host "Install '$m' now from the PowerShell Gallery? (Y/N)"
        if ($ans -match '^(y|yes)$') {
            Install-Module $m -Scope CurrentUser -Force -AllowClobber
        } else {
            throw "Cannot start without '$m'. Run:  Install-Module $m -Scope CurrentUser"
        }
    }
}

$url = "http://127.0.0.1:$Port"
Write-Host "Starting server at $url" -ForegroundColor Green
Write-Host "Press Ctrl+C in this window to stop." -ForegroundColor DarkGray

# The browser is opened by Pode itself (via -Browse below). Pode fires this
# only after the endpoint is actually bound, so it fixes the "opened too early"
# race without spawning a separate PowerShell process or opening a raw socket
# (the latter looks like a reverse shell to Defender for Endpoint).

& (Join-Path $here 'src\server.ps1') -Port $Port -Browse:(-not $NoBrowser)
