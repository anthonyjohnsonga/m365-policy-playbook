#!/bin/bash
# --- M365 Policy Playbook one-click launcher (macOS) ------------------------
#  Double-click this file in Finder to start the app. It runs the PowerShell
#  launcher for you. It does NOT change the program or any machine settings.
#
#  If double-clicking does nothing, the file may have lost its "executable"
#  flag while being copied. Open Terminal in this folder and run once:
#      chmod +x Launch.command
# ---------------------------------------------------------------------------

# Move into the folder this script lives in, no matter where it was launched.
cd "$(cd "$(dirname "$0")" && pwd)" || exit 1

if ! command -v pwsh >/dev/null 2>&1; then
  echo
  echo "  ============================================================"
  echo "   PowerShell 7 is required, but it was not found."
  echo "  ============================================================"
  echo
  echo "   Install it once, then double-click this file again:"
  echo
  echo "     Option A (Homebrew):"
  echo "       brew install --cask powershell"
  echo
  echo "     Option B (download the .pkg):"
  echo "       https://aka.ms/powershell-release?tag=stable"
  echo
  read -r -p "Press Enter to close..."
  exit 1
fi

echo "Starting M365 Policy Playbook..."
echo "(Leave this window open while you use the app. Press Ctrl+C here to stop.)"
echo

# -ExecutionPolicy is Windows-only and not needed on macOS.
pwsh -NoProfile -File "./Start-PlaybookApp.ps1" "$@"

echo
echo "The app has stopped. You can close this window."
read -r -p "Press Enter to close..."
