@echo off
setlocal
cd /d "%~dp0"
title M365 Policy Playbook

rem --- M365 Policy Playbook one-click launcher ---------------------------------
rem  Double-click this file to start the app. It simply runs the PowerShell
rem  launcher for you (with script permission handled for this launch only).
rem  It does NOT change the program or any machine settings.
rem ----------------------------------------------------------------------------

where pwsh >nul 2>nul
if errorlevel 1 (
  echo.
  echo   ============================================================
  echo    PowerShell 7 is required, but it was not found.
  echo   ============================================================
  echo.
  echo    Install it once, then double-click this file again:
  echo.
  echo      Option A ^(in Command Prompt^):
  echo        winget install --id Microsoft.PowerShell -e
  echo.
  echo      Option B ^(download^):
  echo        https://aka.ms/powershell-release?tag=stable
  echo.
  pause
  exit /b 1
)

echo Starting M365 Policy Playbook...
echo (Leave this window open while you use the app. Press Ctrl+C here to stop.)
echo.

pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-PlaybookApp.ps1" %*

echo.
echo The app has stopped. You can close this window.
pause
