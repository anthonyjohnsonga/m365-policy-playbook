# ============================================================================
#  DataAccess.ps1  -  Playbook load / normalize / save (Excel round-trip)
#  M365 Policy Playbook App
# ============================================================================
#  Both playbooks share an identical tracking-column layout on their main
#  sheet:   J = Status | K = Date | L = Tech | M = Notes,  data starts row 3.
#  That lets one Save routine serve both books.
# ----------------------------------------------------------------------------

Import-Module ImportExcel -ErrorAction Stop

# --- Playbook definitions ----------------------------------------------------
function Get-PlaybookConfig {
    [ordered]@{
        Tier1 = [ordered]@{
            Key          = 'Tier1'
            DisplayName  = 'Inforcer Tier 1 - Foundation Baseline (Deployment)'
            ShortName    = 'Tier 1'
            MasterFile   = 'Inforcer_Tier1_Playbook_v2.xlsx'
            Sheet        = "$([char]0x2705) Checklist"   # "checkmark Checklist"
            StatusOptions= @('Not Started','Planned','Completed','Accepted Deviation','Unaccepted Deviation')
            Verb         = 'Deploy'
            VerbPast     = 'Deployed'
            # Engagement field -> sheet header. Save-Engagement resolves these to
            # columns by header name (same headers Import-Playbook reads), so a
            # column reorder can't misdirect the write. 'Planned Date' is appended
            # if the sheet doesn't have it yet.
            TrackingColumns = [ordered]@{
                Status        = 'Status'
                DateCompleted = 'Date Completed'
                Tech          = 'Tech'
                Notes         = 'Notes / Pre-Deploy Checks'
                PlannedDate   = 'Planned Date'
            }
        }
        Tier0 = [ordered]@{
            Key          = 'Tier0'
            DisplayName  = 'Inforcer Tier 0 - Baseline 0 (Verification)'
            ShortName    = 'Tier 0'
            MasterFile   = 'Inforcer_Tier0_Playbook_v2.xlsx'
            Sheet        = "$([char]0x2705) Baseline"
            StatusOptions= @('Not Started','Planned','Completed','Accepted Deviation','Unaccepted Deviation')
            Verb         = 'Verify'
            VerbPast     = 'Verified'
            TrackingColumns = [ordered]@{
                Status        = 'Status'
                DateCompleted = 'Verified Date'
                Tech          = 'Tech'
                Notes         = 'Drift / Change Notes'
                PlannedDate   = 'Planned Date'
            }
        }
    }
}

function Get-MastersPath { Join-Path $PSScriptRoot '..\data\masters' }
function Get-ClientsPath { Join-Path $PSScriptRoot '..\data\clients' }

# --- Impact normalization ----------------------------------------------------
function ConvertTo-ImpactClass {
    param([string]$Impact)
    switch -Regex (($Impact ?? '').ToUpper()) {
        'HIGH'   { 'high';   break }
        'MEDIUM' { 'medium'; break }
        'LOW|NONE'{ 'low';   break }
        default  { 'none' }
    }
}

# --- Date normalization ------------------------------------------------------
#  Excel may hand a date back as a real DateTime / locale string (e.g.
#  "6/12/2026 12:00:00 AM"). Coerce everything to ISO 'yyyy-MM-dd' at import so
#  the client's date inputs AND its overdue/due-soon badges (which do a plain
#  new Date('yyyy-MM-dd')) agree with the server's own due-date math. A value we
#  can't parse is passed through untouched rather than blanked.
function ConvertTo-IsoDate {
    param([string]$Value)
    if (-not $Value) { return '' }
    $d = [datetime]::MinValue
    if ([datetime]::TryParse($Value, [ref]$d)) { return $d.ToString('yyyy-MM-dd') }
    return $Value
}

# --- Detect which playbook a workbook is -------------------------------------
function Get-PlaybookKeyForFile {
    param([string]$Path)
    $sheets = (Get-ExcelSheetInfo -Path $Path).Name
    if ($sheets -contains "$([char]0x2705) Checklist") { return 'Tier1' }
    if ($sheets -contains "$([char]0x2705) Baseline")  { return 'Tier0' }
    # fall back to _meta sheet
    if ($sheets -contains '_meta') {
        $m = Import-Excel -Path $Path -WorksheetName '_meta'
        $pb = ($m | Where-Object Key -eq 'Playbook').Value
        if ($pb) { return [string]$pb }
    }
    throw "Unrecognized playbook file: $Path"
}

# --- Load + normalize a playbook (master OR client copy) ---------------------
function Import-Playbook {
    param(
        [Parameter(Mandatory)][string]$Path,
        [string]$PlaybookKey
    )
    if (-not $PlaybookKey) { $PlaybookKey = Get-PlaybookKeyForFile -Path $Path }
    $cfg = (Get-PlaybookConfig)[$PlaybookKey]
    $rows = Import-Excel -Path $Path -WorksheetName $cfg.Sheet -StartRow 2

    $policies = New-Object System.Collections.Generic.List[object]
    $i = 0
    # Import-Excel returns one object per sheet row in the used range (blank rows
    # included), starting at the row after the header. Track the real sheet row so
    # Save-Engagement can write each policy back to the exact row it came from,
    # even if the sheet has interior blank / spacer rows.
    $sheetRow = 2          # header is row 2; first data row is 3
    foreach ($r in $rows) {
        $sheetRow++
        # skip blank rows
        if (-not $r.'Policy Name') { continue }
        $i++

        if ($PlaybookKey -eq 'Tier1') {
            $p = [ordered]@{
                Id                 = $i
                SheetRow           = $sheetRow
                Section            = [string]$r.'Section'
                PolicyName         = [string]$r.'Policy Name'
                Impact             = [string]$r.'Inforcer Impact'
                ImpactClass        = ConvertTo-ImpactClass $r.'Inforcer Impact'
                WhatItDoes         = [string]$r.'What It Does'
                WhatUsersExperience= [string]$r.'What Users Will Experience'
                PortalPath         = [string]$r.'Portal Path'
                Status             = [string]($r.'Status');
                PlannedDate        = ConvertTo-IsoDate ([string]$r.'Planned Date')
                DateCompleted      = ConvertTo-IsoDate ([string]$r.'Date Completed')
                Tech               = [string]$r.'Tech'
                Notes              = [string]$r.'Notes / Pre-Deploy Checks'
                AutoRemediable     = [string]$r.'Auto-Remediable'
                License            = [string]$r.'License'
                CurrentSettings    = ''
            }
        }
        else {
            $section = (@($r.'Product', $r.'Category') | Where-Object { $_ }) -join ' - '
            $p = [ordered]@{
                Id                 = $i
                SheetRow           = $sheetRow
                Section            = [string]$section
                PolicyName         = [string]$r.'Policy Name'
                Impact             = [string]$r.'Impact'
                ImpactClass        = ConvertTo-ImpactClass $r.'Impact'
                WhatItDoes         = [string]$r.'What It Does'
                WhatUsersExperience= [string]$r.'Notes / Verification Tips'
                PortalPath         = [string]$r.'Portal Path'
                Status             = [string]$r.'Status'
                PlannedDate        = ConvertTo-IsoDate ([string]$r.'Planned Date')
                DateCompleted      = ConvertTo-IsoDate ([string]$r.'Verified Date')
                Tech               = [string]$r.'Tech'
                Notes              = [string]$r.'Drift / Change Notes'
                AutoRemediable     = ''
                License            = ''
                CurrentSettings    = [string]$r.'Current Settings (Baseline 0)'
            }
        }
        # default (or normalize any old/unknown status) to the first option
        if ($p.Status -notin $cfg.StatusOptions) { $p.Status = $cfg.StatusOptions[0] }
        $policies.Add([pscustomobject]$p)
    }
    return ,$policies.ToArray()
}

# --- Project schedule (overall + 3 phase windows) ----------------------------
function New-ProjectPlan {
    [ordered]@{
        Start  = ''
        End    = ''
        Phases = @{
            '1' = @{ Start=''; End='' }
            '2' = @{ Start=''; End='' }
            '3' = @{ Start=''; End='' }
        }
    }
}

# Spread the 3 phases across the project window, weighted by policy counts.
function Invoke-AutoPhaseDistribution {
    param([Parameter(Mandatory)]$Engagement)
    $p = $Engagement.Project
    if (-not $p.Start -or -not $p.End) { return }
    try { $s = [datetime]$p.Start; $e = [datetime]$p.End } catch { return }
    $span = ($e - $s).TotalDays
    if ($span -le 0) { return }

    $low = @($Engagement.Policies | Where-Object ImpactClass -eq 'low').Count
    $hi  = @($Engagement.Policies | Where-Object { $_.ImpactClass -in 'medium','high' }).Count
    $w1  = [math]::Max($low,1)
    $w2  = [math]::Max($hi,1)
    $w3  = [math]::Max([math]::Ceiling(($w1 + $w2) * 0.12), 1)
    $wt  = $w1 + $w2 + $w3

    $d1 = [math]::Round($span * $w1 / $wt)
    $d2 = [math]::Round($span * $w2 / $wt)
    $p1s = $s;             $p1e = $s.AddDays($d1)
    $p2s = $p1e;           $p2e = $p2s.AddDays($d2)
    $p3s = $p2e;           $p3e = $e
    $fmt = { param($d) $d.ToString('yyyy-MM-dd') }
    $p.Phases['1'] = @{ Start = (& $fmt $p1s); End = (& $fmt $p1e) }
    $p.Phases['2'] = @{ Start = (& $fmt $p2s); End = (& $fmt $p2e) }
    $p.Phases['3'] = @{ Start = (& $fmt $p3s); End = (& $fmt $p3e) }
}

# --- Build an in-memory engagement -------------------------------------------
function New-Engagement {
    param(
        [Parameter(Mandatory)][string]$ClientName,
        [Parameter(Mandatory)][ValidateSet('Tier1','Tier0')][string]$PlaybookKey
    )
    $cfg    = (Get-PlaybookConfig)[$PlaybookKey]
    $master = Join-Path (Get-MastersPath) $cfg.MasterFile
    [ordered]@{
        ClientName   = $ClientName
        Playbook     = $PlaybookKey
        Policies     = Import-Playbook -Path $master -PlaybookKey $PlaybookKey
        SourceFile   = $null
        LoadedAt     = (Get-Date)
        Project      = New-ProjectPlan
        Devices      = @()
        DeviceTarget = 'Intune'
    }
}

# --- Device enrollment tracking ----------------------------------------------
$script:DeviceStates   = @('Not enrolled','Hybrid','Intune')
$script:DeviceStatuses = @('Not Started','In Progress','Done','Blocked')

function Import-Devices {
    param([Parameter(Mandatory)][string]$Path)
    $sheets = (Get-ExcelSheetInfo -Path $Path).Name
    if ($sheets -notcontains 'Devices') { return ,@() }
    $rows = Import-Excel -Path $Path -WorksheetName 'Devices'
    $list = New-Object System.Collections.Generic.List[object]
    $i = 0
    foreach ($r in $rows) {
        if (-not $r.'Device Name') { continue }
        $i++
        $cur = [string]$r.'Current Enrollment'; if ($cur -notin $script:DeviceStates)   { $cur = 'Not enrolled' }
        $st  = [string]$r.'Status';             if ($st  -notin $script:DeviceStatuses) { $st  = 'Not Started' }
        $list.Add([pscustomobject]@{
            Id=$i; Name=[string]$r.'Device Name'; OS=[string]$r.'OS'; User=[string]$r.'User'
            Current=$cur; Status=$st; Notes=[string]$r.'Notes'
        })
    }
    return ,$list.ToArray()
}

function Get-DeviceSummary {
    param([Parameter(Mandatory)]$Engagement)
    $devs   = @($Engagement.Devices)
    $target = $Engagement.DeviceTarget
    $total  = $devs.Count
    $atTgt  = @($devs | Where-Object { $_.Current -eq $target }).Count
    [pscustomobject]@{
        total       = $total
        intune      = @($devs | Where-Object { $_.Current -eq 'Intune' }).Count
        hybrid      = @($devs | Where-Object { $_.Current -eq 'Hybrid' }).Count
        notEnrolled = @($devs | Where-Object { $_.Current -eq 'Not enrolled' }).Count
        target      = $target
        atTarget    = $atTgt
        pct         = if ($total) { [math]::Round(100*$atTgt/$total) } else { 0 }
    }
}

function Open-Engagement {
    param([Parameter(Mandatory)][string]$Path)
    $key = Get-PlaybookKeyForFile -Path $Path
    $client = 'Client'
    $proj = New-ProjectPlan
    $sheets = (Get-ExcelSheetInfo -Path $Path).Name
    if ($sheets -contains '_meta') {
        $m = Import-Excel -Path $Path -WorksheetName '_meta'
        $mh = @{}
        foreach ($row in $m) { if ($row.Key) { $mh[[string]$row.Key] = [string]$row.Value } }
        if ($mh['ClientName']) { $client = $mh['ClientName'] }
        $proj.Start = $mh['ProjectStart']; $proj.End = $mh['ProjectEnd']
        $proj.Phases['1'] = @{ Start = $mh['P1Start']; End = $mh['P1End'] }
        $proj.Phases['2'] = @{ Start = $mh['P2Start']; End = $mh['P2End'] }
        $proj.Phases['3'] = @{ Start = $mh['P3Start']; End = $mh['P3End'] }
    }
    else {
        # infer from filename:  {Client}_{Tier}_{date}.xlsx
        $client = ([IO.Path]::GetFileNameWithoutExtension($Path) -split '_')[0]
    }
    $devTarget = 'Intune'
    if ($sheets -contains '_meta') {
        $tt = ($m | Where-Object Key -eq 'DeviceTarget').Value
        if ($tt -in 'Intune','Hybrid') { $devTarget = [string]$tt }
    }
    [ordered]@{
        ClientName   = $client
        Playbook     = $key
        Policies     = Import-Playbook -Path $Path -PlaybookKey $key
        SourceFile   = $Path
        LoadedAt     = (Get-Date)
        Project      = $proj
        Devices      = Import-Devices -Path $Path
        DeviceTarget = $devTarget
    }
}

# --- Keep timestamped backups of a client file before it is overwritten ------
#  Best-effort: a backup hiccup must never block a save. Throttled so frequent
#  autosaves don't spawn a copy every time, and pruned to the newest N. Backups
#  live in a '_backups' subfolder, which is not listed as an openable client file.
function Backup-ClientFile {
    param([Parameter(Mandatory)][string]$Path)
    $throttleMinutes = 10
    $keep            = 15
    try {
        if (-not (Test-Path $Path)) { return }
        $bakDir = Join-Path (Split-Path $Path -Parent) '_backups'
        if (-not (Test-Path $bakDir)) { New-Item -ItemType Directory -Path $bakDir -Force | Out-Null }
        $base    = [IO.Path]::GetFileNameWithoutExtension($Path)
        $pattern = '^' + [regex]::Escape($base) + '_\d{8}_\d{6}\.xlsx$'
        $existing = @(Get-ChildItem $bakDir -Filter '*.xlsx' -File -ErrorAction SilentlyContinue |
                     Where-Object { $_.Name -match $pattern } | Sort-Object LastWriteTime -Descending)
        # throttle: skip if this file was already backed up very recently
        if ($existing.Count -and ((Get-Date) - $existing[0].LastWriteTime).TotalMinutes -lt $throttleMinutes) { return }
        $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
        Copy-Item -Path $Path -Destination (Join-Path $bakDir "${base}_$stamp.xlsx") -Force
        # prune: keep only the newest $keep backups for this file
        Get-ChildItem $bakDir -Filter '*.xlsx' -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match $pattern } |
            Sort-Object LastWriteTime -Descending | Select-Object -Skip $keep |
            Remove-Item -Force -ErrorAction SilentlyContinue
    } catch { }   # best-effort; never let a backup error block the save
}

# --- Save engagement back to an Excel working file ---------------------------
function Save-Engagement {
    param([Parameter(Mandatory)]$Engagement)

    $cfg = (Get-PlaybookConfig)[$Engagement.Playbook]

    # Determine target client file
    $target = $Engagement.SourceFile
    if (-not $target) {
        $safe = ($Engagement.ClientName -replace '[^\w\-]', '_')
        $stamp= Get-Date -Format 'yyyyMMdd'
        $file = "{0}_{1}_{2}.xlsx" -f $safe, $cfg.ShortName.Replace(' ',''), $stamp
        $clientsDir = Get-ClientsPath
        if (-not (Test-Path $clientsDir)) { New-Item -ItemType Directory -Path $clientsDir -Force | Out-Null }
        $target = Join-Path $clientsDir $file
        # start from a fresh copy of the master so all formatting is preserved
        $master = Join-Path (Get-MastersPath) $cfg.MasterFile
        Copy-Item -Path $master -Destination $target -Force
    }
    elseif (Test-Path $target) {
        # An existing file is about to be overwritten — snapshot it first.
        Backup-ClientFile -Path $target
    }

    $pkg = Open-ExcelPackage -Path $target
    try {
        $ws = $pkg.Workbook.Worksheets[$cfg.Sheet]

        # Resolve each tracking field to a column by header name (header row = 2),
        # so the write stays correct even if the sheet's column order changes.
        # Headers absent from the sheet (e.g. the added 'Planned Date') are
        # appended as new columns.
        $headerRow = 2
        $lastCol   = $ws.Dimension.End.Column
        $colByHdr  = @{}
        for ($c = 1; $c -le $lastCol; $c++) {
            $h = [string]$ws.Cells[$headerRow,$c].Value
            if ($h) { $colByHdr[$h.Trim().ToLower()] = $c }
        }
        $trackCol = [ordered]@{}
        foreach ($field in $cfg.TrackingColumns.Keys) {
            $hdr = [string]$cfg.TrackingColumns[$field]
            $key = $hdr.Trim().ToLower()
            if (-not $colByHdr.ContainsKey($key)) {
                $lastCol++
                $ws.Cells[$headerRow,$lastCol].Value = $hdr
                $colByHdr[$key] = $lastCol
            }
            $trackCol[$field] = $colByHdr[$key]
        }

        # Write each policy back to the exact sheet row it was imported from
        # (SheetRow), so interior blank / spacer rows can't shift the tracking
        # columns out of alignment. Fall back to a running counter from row 3 for
        # any policy lacking a SheetRow.
        $row = 3
        foreach ($p in $Engagement.Policies) {
            # NOTE: use a dedicated row variable here — do NOT reuse $target, which
            # holds the destination file path and must survive this loop intact.
            $rowNum = if ($p.PSObject.Properties['SheetRow'] -and $p.SheetRow) { [int]$p.SheetRow } else { $row }
            $ws.Cells[$rowNum, $trackCol['Status']].Value        = $p.Status
            $ws.Cells[$rowNum, $trackCol['DateCompleted']].Value = $p.DateCompleted
            $ws.Cells[$rowNum, $trackCol['Tech']].Value          = $p.Tech
            $ws.Cells[$rowNum, $trackCol['Notes']].Value         = $p.Notes
            $ws.Cells[$rowNum, $trackCol['PlannedDate']].Value   = $p.PlannedDate
            $row = $rowNum + 1
        }
        # write / refresh _meta sheet (client info + project schedule)
        $meta = $pkg.Workbook.Worksheets['_meta']
        if (-not $meta) { $meta = $pkg.Workbook.Worksheets.Add('_meta') }
        $proj = $Engagement.Project
        $pairs = @(
            @('ClientName',   $Engagement.ClientName),
            @('Playbook',     $Engagement.Playbook),
            @('SavedAt',      (Get-Date).ToString('s')),
            @('ProjectStart', $proj.Start),
            @('ProjectEnd',   $proj.End),
            @('P1Start',      $proj.Phases['1'].Start), @('P1End', $proj.Phases['1'].End),
            @('P2Start',      $proj.Phases['2'].Start), @('P2End', $proj.Phases['2'].End),
            @('P3Start',      $proj.Phases['3'].Start), @('P3End', $proj.Phases['3'].End),
            @('DeviceTarget', $Engagement.DeviceTarget)
        )
        $meta.Cells[1,1].Value = 'Key'; $meta.Cells[1,2].Value = 'Value'
        $r = 2
        foreach ($pair in $pairs) { $meta.Cells[$r,1].Value = $pair[0]; $meta.Cells[$r,2].Value = $pair[1]; $r++ }
        $meta.Hidden = [OfficeOpenXml.eWorkSheetHidden]::Hidden

        # write / refresh Devices sheet
        if ($pkg.Workbook.Worksheets['Devices']) { $pkg.Workbook.Worksheets.Delete('Devices') }
        $dws = $pkg.Workbook.Worksheets.Add('Devices')
        $hdr = @('#','Device Name','OS','User','Current Enrollment','Status','Notes')
        for ($c=0; $c -lt $hdr.Count; $c++) { $dws.Cells[1, ($c+1)].Value = $hdr[$c] }
        $dr = 2
        foreach ($dev in @($Engagement.Devices)) {
            $dws.Cells[$dr,1].Value = $dev.Id
            $dws.Cells[$dr,2].Value = $dev.Name
            $dws.Cells[$dr,3].Value = $dev.OS
            $dws.Cells[$dr,4].Value = $dev.User
            $dws.Cells[$dr,5].Value = $dev.Current
            $dws.Cells[$dr,6].Value = $dev.Status
            $dws.Cells[$dr,7].Value = $dev.Notes
            $dr++
        }
        $dws.Cells[$dws.Dimension.Address].AutoFitColumns()

        Close-ExcelPackage $pkg
    }
    catch { Close-ExcelPackage $pkg -NoSave; throw }

    $Engagement.SourceFile = $target
    return $target
}

# --- Which statuses count as "complete" (progress %) -------------------------
function Get-DoneStatusSet {
    param([Parameter(Mandatory)][string]$PlaybookKey)
    @('Completed','Accepted Deviation')
}

# --- Schedule health for one policy (uses its explicit Planned Date) ----------
#  ''        -> done, or no planned date, or planned comfortably in the future
#  'soon'    -> not done, planned within the next 7 days
#  'overdue' -> not done, planned date already passed
function Get-PolicyDueState {
    param([Parameter(Mandatory)]$Policy, [Parameter(Mandatory)][string[]]$DoneSet)
    if ($DoneSet -contains $Policy.Status) { return '' }
    $pd = [datetime]::MinValue
    if ($Policy.PlannedDate -and [datetime]::TryParse([string]$Policy.PlannedDate, [ref]$pd)) {
        $days = ($pd.Date - (Get-Date).Date).TotalDays
        if ($days -lt 0) { return 'overdue' }
        if ($days -le 7) { return 'soon' }
    }
    return ''
}

# --- Progress summary --------------------------------------------------------
function Get-EngagementSummary {
    param([Parameter(Mandatory)]$Engagement)
    $cfg      = (Get-PlaybookConfig)[$Engagement.Playbook]
    $doneSet  = Get-DoneStatusSet $Engagement.Playbook
    $all      = $Engagement.Policies
    $total    = $all.Count
    $done     = ($all | Where-Object { $doneSet -contains $_.Status }).Count
    $sections = foreach ($g in ($all | Group-Object Section | Sort-Object Name)) {
        $sd = ($g.Group | Where-Object { $doneSet -contains $_.Status }).Count
        [pscustomobject]@{
            Section = $g.Name; Total = $g.Count; Done = $sd
            Pct = if ($g.Count) { [math]::Round(100*$sd/$g.Count) } else { 0 }
        }
    }
    $overdue = 0; $dueSoon = 0
    foreach ($p in $all) {
        switch (Get-PolicyDueState -Policy $p -DoneSet $doneSet) {
            'overdue' { $overdue++ }
            'soon'    { $dueSoon++ }
        }
    }
    [pscustomobject]@{
        Total=$total; Done=$done
        Pct = if ($total) { [math]::Round(100*$done/$total) } else { 0 }
        High   = ($all | Where-Object ImpactClass -eq 'high').Count
        Medium = ($all | Where-Object ImpactClass -eq 'medium').Count
        Low    = ($all | Where-Object ImpactClass -eq 'low').Count
        Overdue = $overdue; DueSoon = $dueSoon
        Sections = $sections
    }
}
