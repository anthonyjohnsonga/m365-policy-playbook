# M365 Policy Playbook

A PowerShell web app for walking clients through their Microsoft 365 policy
baselines during a meeting: explain each policy in plain English, show **who it
impacts**, track status live, and produce shareable status reports.

Built on **PowerShell 7 + [Pode]** (web server) and **[ImportExcel]** (Excel
round-trip). Opens in your browser at `http://127.0.0.1:8080`.

## What it does

- **Two playbooks**, selectable per engagement:
  - **Inforcer Tier 1** – Foundation Baseline (deployment checklist, 122 policies)
  - **Inforcer Tier 0** – Baseline 0 (verification, ~48 policies)
- **Meeting view** – policies grouped by section, colour-coded by user impact
  (HIGH / MEDIUM / LOW). Each card shows *What it does* and a highlighted
  *What users will experience* box so clients understand the change.
- **Impact filter** – jump straight to HIGH / MEDIUM policies to pre-brief users.
- **Live tracking** – Status / Date / Tech / Notes per policy, auto-saved in
  memory; an overall and per-section progress ring updates as you go.
- **Save to Excel** – writes a per-client working file to `data\clients\`. Re-open
  it later to pick up exactly where you left off.
- **Reports** – one click to **View** (HTML), **Download Excel**, or
  **Download PDF**: status summary, per-section progress, a user-impact briefing,
  and a suggested phased rollout timeline.

## Requirements

- Windows, **PowerShell 7+**
- Modules `Pode` and `ImportExcel` (the launcher offers to install them)
- Microsoft Edge or Chrome (used to generate PDFs)

## Run

**Easiest:** double-click **`Launch.cmd`**.

**Or from PowerShell 7:**
```powershell
.\Start-PlaybookApp.ps1            # starts server + opens browser
.\Start-PlaybookApp.ps1 -Port 9090 -NoBrowser
```

Press `Ctrl+C` in the console to stop.

> **Setting this up on a new computer?** See **[SETUP.md](SETUP.md)** for a
> detailed, step-by-step install & user guide (no PowerShell knowledge required).

## How a session goes

1. **New engagement** – enter the client name, pick a playbook, click *Create*.
2. Walk the sections with the client. Use the **impact filter** to cover the
   HIGH/MEDIUM "users will notice this" items first.
3. Set **Status / Date / Tech / Notes** on each policy as you agree on it.
4. **Save to Excel** at any point (and at the end).
5. **Reports → Download PDF / Excel** to send the client a status update.
6. Next meeting: **Resume saved work**, pick the client's file, continue.

## Project layout

```
Start-PlaybookApp.ps1     Launcher (dependency check + browser)
src\
  server.ps1              Pode routes (pages + JSON API)
  DataAccess.ps1          Load / normalize playbooks, Excel save/load, summary
  Reports.ps1             HTML report, Excel export, PDF export (Edge headless)
  PlaybookCore.psm1       Bundles the above for Pode's runspaces
www\                      Front-end (index.html, css\, js\)
data\
  masters\                Read-only master playbooks (source of truth)
  clients\                Per-client saved working files (.xlsx)
reports\                  Generated report files (Excel / PDF)
```

The two master workbooks in `data\masters\` are the source of truth and are
never modified — a fresh copy is made for each client on first save.

[Pode]: https://badgerati.github.io/Pode/
[ImportExcel]: https://github.com/dfinke/ImportExcel
