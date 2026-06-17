# ============================================================================
#  Reports.ps1  -  Client status report (HTML), Excel export, PDF export
#  M365 Policy Playbook App
# ============================================================================

function HtmlEnc { param([string]$s) [System.Net.WebUtility]::HtmlEncode([string]$s) }

# --- Phased rollout timeline (driven by the playbook's own recommended order)-
function Get-RolloutPhases {
    param([Parameter(Mandatory)]$Engagement)
    $pol = $Engagement.Policies
    if ($Engagement.Playbook -eq 'Tier1') {
        @(
            [pscustomobject]@{ Name='Phase 1 - Silent / safe first';   Desc='Low / no user impact and auto-remediable. Deploy quietly right after onboarding the tenant to Inforcer.'; Items=@($pol | Where-Object { $_.ImpactClass -eq 'low' }) }
            [pscustomobject]@{ Name='Phase 2 - Communicate, then push'; Desc='Medium and high impact. Batch and communicate to the client/users BEFORE deployment (MFA, legacy auth block, local admin removal, SharePoint sharing, Teams meeting policy).'; Items=@($pol | Where-Object { $_.ImpactClass -in 'medium','high' }) }
            [pscustomobject]@{ Name='Phase 3 - Validate'; Desc='After deployment, confirm every policy reports compliant (green) in Inforcer and cross-check the checklist.'; Items=@() }
        )
    } else {
        @(
            [pscustomobject]@{ Name='Phase 1 - Document low-impact baselines'; Desc='Verify backend / admin-level settings first.'; Items=@($pol | Where-Object { $_.ImpactClass -eq 'low' }) }
            [pscustomobject]@{ Name='Phase 2 - Review user-facing baselines'; Desc='Medium / high impact settings to walk through with the client.'; Items=@($pol | Where-Object { $_.ImpactClass -in 'medium','high' }) }
            [pscustomobject]@{ Name='Phase 3 - Track drift'; Desc='Re-verify on a schedule and record any drift from Baseline 0.'; Items=@() }
        )
    }
}

# --- Structured timeline (phases + per-phase status), for UI and reports -----
function Get-Timeline {
    param([Parameter(Mandatory)]$Engagement)
    $done   = Get-DoneStatusSet $Engagement.Playbook
    $phases = Get-RolloutPhases $Engagement
    $proj   = $Engagement.Project
    $i = 0
    $out = foreach ($ph in $phases) {
        $i++
        $pw = $proj.Phases["$i"]
        $items = foreach ($p in $ph.Items) {
            $eff = if ($p.PlannedDate) { $p.PlannedDate } elseif ($pw) { $pw.Start } else { '' }
            [pscustomobject]@{
                id=$p.Id; name=$p.PolicyName; section=$p.Section
                impact=$p.Impact; impactClass=$p.ImpactClass
                status=$p.Status; done=($done -contains $p.Status)
                plannedDate=$p.PlannedDate; effectivePlanned=$eff
                dueState=(Get-PolicyDueState -Policy $p -DoneSet $done)
            }
        }
        $items = @($items)
        $t = $items.Count
        $d = @($items | Where-Object { $_.done }).Count
        [pscustomobject]@{
            index=$i; name=$ph.Name; desc=$ph.Desc; total=$t; done=$d
            pct   = if ($t) { [math]::Round(100*$d/$t) } else { 0 }
            start = $pw.Start; end = $pw.End
            items = $items
        }
    }
    [pscustomobject]@{
        project = @{ start = $proj.Start; end = $proj.End }
        phases  = @($out)
        devices = (Get-DeviceSummary $Engagement)
    }
}

# --- HTML status report ------------------------------------------------------
function Build-ReportHtml {
    param([Parameter(Mandatory)]$Engagement)

    $cfg = (Get-PlaybookConfig)[$Engagement.Playbook]
    $sum = Get-EngagementSummary $Engagement
    $now = Get-Date -Format 'dd MMM yyyy, HH:mm'

    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.Append(@"
<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>$(HtmlEnc $Engagement.ClientName) - $(HtmlEnc $cfg.ShortName) Status</title>
<style>
 :root{--ink:#1f2937;--muted:#6b7280;--line:#e5e7eb;--brand:#E2711D;--brandlt:#FBEEE1;
       --high:#c0392b;--med:#b9770e;--low:#1e7d4f;--bg:#fff}
 *{box-sizing:border-box} body{font-family:Segoe UI,Arial,sans-serif;color:var(--ink);margin:0;background:#f3f4f6}
 .page{max-width:1000px;margin:0 auto;padding:32px;background:var(--bg)}
 h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:28px 0 10px;color:var(--brand);border-bottom:2px solid var(--brandlt);padding-bottom:4px}
 .sub{color:var(--muted);font-size:13px;margin-bottom:18px}
 .cards{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}
 .card{flex:1;min-width:120px;border:1px solid var(--line);border-radius:10px;padding:14px;text-align:center;background:#fff}
 .card .n{font-size:26px;font-weight:700} .card .l{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
 table{width:100%;border-collapse:collapse;font-size:13px} th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line);vertical-align:top}
 th{background:var(--brandlt);color:var(--brand);font-size:11px;text-transform:uppercase;letter-spacing:.03em}
 .bar{height:9px;background:#eef2f7;border-radius:5px;overflow:hidden;min-width:90px}
 .bar>span{display:block;height:100%;background:var(--brand)}
 .badge{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;color:#fff;letter-spacing:.03em}
 .high{background:var(--high)} .medium{background:var(--med)} .low{background:var(--low)} .none{background:#9ca3af}
 .st{font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;border:1px solid var(--line);display:inline-block}
 .users{background:#fff7ed;border-left:3px solid var(--med);padding:6px 9px;border-radius:4px;font-size:12px;margin-top:4px}
 .phase{border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin:10px 0}
 .phase .pd{color:var(--muted);font-size:12px;margin:2px 0 8px}
 .foot{margin-top:30px;color:var(--muted);font-size:11px;border-top:1px solid var(--line);padding-top:10px}
 @media print{body{background:#fff}.page{box-shadow:none;max-width:none}}
</style></head><body><div class="page">
 <h1>$(HtmlEnc $Engagement.ClientName)</h1>
 <div class="sub">$(HtmlEnc $cfg.DisplayName) &nbsp;|&nbsp; Status report generated $now &nbsp;|&nbsp; M365 Policy Playbook</div>
 <div class="cards">
   <div class="card"><div class="n">$($sum.Total)</div><div class="l">Policies</div></div>
   <div class="card"><div class="n">$($sum.Done)</div><div class="l">$($cfg.VerbPast)</div></div>
   <div class="card"><div class="n">$($sum.Pct)%</div><div class="l">Complete</div></div>
   <div class="card"><div class="n" style="color:var(--high)">$($sum.High)</div><div class="l">High Impact</div></div>
   <div class="card"><div class="n" style="color:var(--med)">$($sum.Medium)</div><div class="l">Medium Impact</div></div>
 </div>
"@)

    # Progress by section
    [void]$sb.Append('<h2>Progress by Section</h2><table><tr><th>Section</th><th>Done</th><th>Total</th><th style="width:160px">Progress</th></tr>')
    foreach ($s in $sum.Sections) {
        [void]$sb.Append("<tr><td>$(HtmlEnc $s.Section)</td><td>$($s.Done)</td><td>$($s.Total)</td><td><div class='bar'><span style='width:$($s.Pct)%'></span></div> $($s.Pct)%</td></tr>")
    }
    [void]$sb.Append('</table>')

    # Impact briefing - HIGH + MEDIUM, what users will experience
    $brief = $Engagement.Policies | Where-Object { $_.ImpactClass -in 'high','medium' }
    [void]$sb.Append('<h2>User Impact Briefing</h2><div class="sub">Changes users are likely to notice. Communicate these before deployment.</div>')
    foreach ($g in ($brief | Group-Object { $_.ImpactClass } | Sort-Object @{e={ @{high=0;medium=1}[$_.Name] }})) {
        foreach ($p in $g.Group) {
            [void]$sb.Append("<div style='margin:10px 0;padding-bottom:8px;border-bottom:1px solid var(--line)'>")
            [void]$sb.Append("<span class='badge $($p.ImpactClass)'>$(HtmlEnc $p.Impact)</span> <b>$(HtmlEnc $p.PolicyName)</b> <span class='st'>$(HtmlEnc $p.Status)</span>")
            if ($p.WhatUsersExperience) { [void]$sb.Append("<div class='users'><b>Users will experience:</b> $(HtmlEnc $p.WhatUsersExperience)</div>") }
            [void]$sb.Append('</div>')
        }
    }

    # Device enrollment progress (snapshot against the enrollment goal)
    $dev = Get-DeviceSummary $Engagement
    if ($dev.total) {
        [void]$sb.Append("<h2>Device Enrollment</h2>")
        [void]$sb.Append("<div class='sub'>Goal: enroll devices to <b>$(HtmlEnc $dev.target)</b>.</div>")
        [void]$sb.Append("<div class='cards'>")
        [void]$sb.Append("<div class='card'><div class='n'>$($dev.total)</div><div class='l'>Devices</div></div>")
        [void]$sb.Append("<div class='card'><div class='n'>$($dev.atTarget)</div><div class='l'>At Goal ($(HtmlEnc $dev.target))</div></div>")
        [void]$sb.Append("<div class='card'><div class='n'>$($dev.pct)%</div><div class='l'>Enrolled</div></div>")
        [void]$sb.Append("<div class='card'><div class='n' style='color:var(--high)'>$($dev.notEnrolled)</div><div class='l'>Not Enrolled</div></div>")
        [void]$sb.Append("</div>")
        [void]$sb.Append("<div class='bar' style='margin-top:6px'><span style='width:$($dev.pct)%'></span></div>")
    }

    # Rollout schedule / timeline
    $proj = $Engagement.Project
    $hasDates = $proj -and $proj.Start -and $proj.End
    $heading = if ($hasDates) { "Rollout Schedule" } else { "Suggested Rollout Timeline" }
    [void]$sb.Append("<h2>$heading</h2>")
    if ($hasDates) {
        [void]$sb.Append("<div class='sub'>Project window: <b>$(HtmlEnc $proj.Start)</b> to <b>$(HtmlEnc $proj.End)</b></div>")
    }
    $tl = Get-Timeline $Engagement
    foreach ($ph in $tl.phases) {
        $win = if ($ph.start -and $ph.end) { " &nbsp;<span style='color:var(--muted);font-size:12px'>($(HtmlEnc $ph.start) &rarr; $(HtmlEnc $ph.end))</span>" } else { '' }
        [void]$sb.Append("<div class='phase'><b>$(HtmlEnc $ph.name)</b>$win<div class='pd'>$(HtmlEnc $ph.desc)</div>")
        if ($ph.total) { [void]$sb.Append("<div style='font-size:12px;color:var(--muted)'>$($ph.done)/$($ph.total) complete</div>") }
        [void]$sb.Append('</div>')
    }

    [void]$sb.Append("<div class='foot'>M365 Policy Playbook &middot; TAM Engagement &middot; $(HtmlEnc $cfg.DisplayName)</div></div></body></html>")
    $sb.ToString()
}

# --- Excel export (multi-sheet summary, separate from working file) ----------
function Export-ReportExcel {
    param([Parameter(Mandatory)]$Engagement,[Parameter(Mandatory)][string]$OutPath)
    $cfg = (Get-PlaybookConfig)[$Engagement.Playbook]
    $sum = Get-EngagementSummary $Engagement
    if (Test-Path $OutPath) { Remove-Item $OutPath -Force }

    # Summary
    $dev = Get-DeviceSummary $Engagement
    $summaryRows = [System.Collections.Generic.List[object]]::new()
    @(
        [pscustomobject]@{ Metric='Client';        Value=$Engagement.ClientName }
        [pscustomobject]@{ Metric='Playbook';      Value=$cfg.DisplayName }
        [pscustomobject]@{ Metric='Generated';     Value=(Get-Date -f 'yyyy-MM-dd HH:mm') }
        [pscustomobject]@{ Metric='Total policies';Value=$sum.Total }
        [pscustomobject]@{ Metric="$($cfg.VerbPast)";Value=$sum.Done }
        [pscustomobject]@{ Metric='% Complete';    Value="$($sum.Pct)%" }
        [pscustomobject]@{ Metric='High impact';   Value=$sum.High }
        [pscustomobject]@{ Metric='Medium impact'; Value=$sum.Medium }
        [pscustomobject]@{ Metric='Low/None impact';Value=$sum.Low }
    ) | ForEach-Object { $summaryRows.Add($_) }
    if ($dev.total) {
        @(
            [pscustomobject]@{ Metric='Device goal';          Value=$dev.target }
            [pscustomobject]@{ Metric='Total devices';        Value=$dev.total }
            [pscustomobject]@{ Metric="At goal ($($dev.target))"; Value=$dev.atTarget }
            [pscustomobject]@{ Metric='Devices % enrolled';   Value="$($dev.pct)%" }
            [pscustomobject]@{ Metric='Not enrolled';         Value=$dev.notEnrolled }
        ) | ForEach-Object { $summaryRows.Add($_) }
    }
    $summaryRows | Export-Excel -Path $OutPath -WorksheetName 'Summary' -AutoSize -TitleBold -Title "$($Engagement.ClientName) - Status Summary"

    $sum.Sections | Select-Object Section,Done,Total,@{n='% Done';e={$_.Pct}} |
        Export-Excel -Path $OutPath -WorksheetName 'By Section' -AutoSize -TableStyle Medium2

    $Engagement.Policies | Where-Object { $_.ImpactClass -in 'high','medium' } |
        Select-Object @{n='Impact';e={$_.Impact}}, Section, PolicyName,
                      @{n='What Users Will Experience';e={$_.WhatUsersExperience}}, Status |
        Export-Excel -Path $OutPath -WorksheetName 'Impact Briefing' -AutoSize -TableStyle Medium2

    $Engagement.Policies |
        Select-Object Id,Section,PolicyName,Impact,Status,
                      @{n='Planned Date';e={$_.PlannedDate}},
                      @{n='Completed Date';e={$_.DateCompleted}},Tech,
                      @{n='What It Does';e={$_.WhatItDoes}},
                      @{n='Portal Path';e={$_.PortalPath}},Notes |
        Export-Excel -Path $OutPath -WorksheetName 'Full Status' -AutoSize -TableStyle Light1 -FreezeTopRow

    if ($dev.total) {
        @($Engagement.Devices) |
            Select-Object Name,OS,User,
                          @{n='Current';e={$_.Current}},
                          @{n='At Goal';e={ if ($_.Current -eq $dev.target) { 'Yes' } else { '' } }},
                          Status,Notes |
            Export-Excel -Path $OutPath -WorksheetName 'Devices' -AutoSize -TableStyle Medium2 -FreezeTopRow
    }
    $OutPath
}

# --- Keep the reports folder from growing without bound ----------------------
#  Generated reports are throwaway snapshots the user downloads; the server copy
#  only needs to stay small. Prune to the newest $Keep .xlsx/.pdf files.
#  Best-effort: a cleanup hiccup must never fail a download.
function Limit-ReportFiles {
    param([Parameter(Mandatory)][string]$Dir, [int]$Keep = 40)
    try {
        if (-not (Test-Path $Dir)) { return }
        Get-ChildItem $Dir -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Extension -in '.xlsx', '.pdf' } |
            Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep |
            Remove-Item -Force -ErrorAction SilentlyContinue
    } catch { }
}

# --- PDF export (via Edge / Chrome headless) ---------------------------------
function Find-HeadlessBrowser {
    if ($IsMacOS) {
        # macOS keeps the executable inside the .app bundle.
        $cands = @(
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
        )
    }
    else {
        $cands = @(
            "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
            "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
            "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
        )
    }
    foreach ($c in $cands) { if (Test-Path $c) { return $c } }
    $null
}

function Export-ReportPdf {
    param([Parameter(Mandatory)]$Engagement,[Parameter(Mandatory)][string]$OutPath)
    $browser = Find-HeadlessBrowser
    if (-not $browser) { throw 'No Edge/Chrome found for PDF generation.' }
    $html = Build-ReportHtml $Engagement
    $tmp  = Join-Path ([IO.Path]::GetTempPath()) ("playbook_{0}.html" -f ([guid]::NewGuid().ToString('N')))
    Set-Content -Path $tmp -Value $html -Encoding UTF8
    if (Test-Path $OutPath) { Remove-Item $OutPath -Force }

    # Build a file:// URL that is valid on both platforms. A Windows path
    # (C:\...) needs a slash before the drive letter (file:///C:/...); a macOS
    # path already begins with '/'. Hand-building "file:///$path" added an extra
    # slash to macOS absolute paths, so normalize to exactly one leading slash.
    $norm = ($tmp -replace '\\','/') -replace ' ','%20'
    if ($norm -notmatch '^/') { $norm = '/' + $norm }
    $fileUri = 'file://' + $norm

    # Invoke with the call operator and a clean argument list. PowerShell passes
    # each element as its own argument per-platform, so paths containing spaces
    # (e.g. the "Microsoft Web App" folder) work without the manual quoting that
    # gets passed through literally — and breaks the path — on macOS. --headless
    # means no window appears, so -WindowStyle Hidden (Windows-only, unsupported
    # on macOS) is no longer needed.
    & $browser '--headless' '--disable-gpu' '--no-pdf-header-footer' "--print-to-pdf=$OutPath" $fileUri 2>$null | Out-Null
    $exit = $LASTEXITCODE

    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path $OutPath)) { throw "PDF was not produced (browser exit $exit)." }
    $OutPath
}
