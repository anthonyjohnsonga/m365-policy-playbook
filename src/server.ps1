#requires -Version 7
# ============================================================================
#  server.ps1  -  Pode web server for the M365 Policy Playbook App
# ============================================================================
#  Paths are passed to Pode's runspaces via environment variables (Pode does
#  not support $using: in the main server scriptblock).
# ----------------------------------------------------------------------------
param([int]$Port = 8080, [switch]$Browse)

Import-Module Pode -ErrorAction Stop

$env:PLAYBOOK_ROOT = Split-Path $PSScriptRoot -Parent
$env:PLAYBOOK_PORT = "$Port"

# -Browse opens the default browser in-process once the endpoint is bound.
Start-PodeServer -Browse:$Browse {

    $root    = $env:PLAYBOOK_ROOT
    $src     = Join-Path $root 'src'
    $www     = Join-Path $root 'www'

    # These runtime folders are git-ignored, so they're absent on a fresh
    # clone/download. Create them up front so the first save / report works.
    foreach ($d in @((Join-Path $root 'data\clients'), (Join-Path $root 'reports'))) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }

    Add-PodeEndpoint -Address 127.0.0.1 -Port ([int]$env:PLAYBOOK_PORT) -Protocol Http
    Import-PodeModule -Path (Join-Path $src 'PlaybookCore.psm1')
    New-PodeLoggingMethod -Terminal | Enable-PodeErrorLogging

    Set-PodeState -Name 'eng' -Value $null | Out-Null

    Add-PodeStaticRoute -Path '/static' -Source $www

    # ---- SPA shell ----
    Add-PodeRoute -Method Get -Path '/' -ScriptBlock {
        Write-PodeFileResponse -Path (Join-Path $env:PLAYBOOK_ROOT 'www\index.html')
    }

    # ---- config: playbooks for New Engagement form ----
    Add-PodeRoute -Method Get -Path '/api/config' -ScriptBlock {
        $cfg = Get-PlaybookConfig
        $list = foreach ($k in $cfg.Keys) {
            [pscustomobject]@{ key=$k; name=$cfg[$k].DisplayName; short=$cfg[$k].ShortName }
        }
        Write-PodeJsonResponse -Value @{ playbooks = @($list) }
    }

    # ---- saved client files ----
    Add-PodeRoute -Method Get -Path '/api/clients' -ScriptBlock {
        $dir = Join-Path $env:PLAYBOOK_ROOT 'data\clients'
        $files = @()
        if (Test-Path $dir) {
            $files = Get-ChildItem $dir -Filter *.xlsx -File |
                     Sort-Object LastWriteTime -Descending |
                     ForEach-Object { @{ name=$_.Name; modified=$_.LastWriteTime.ToString('yyyy-MM-dd HH:mm') } }
        }
        Write-PodeJsonResponse -Value @{ files = @($files) }
    }

    # ---- current state ----
    Add-PodeRoute -Method Get -Path '/api/state' -ScriptBlock {
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Write-PodeJsonResponse -Value @{ active=$false }; return }
        $cfg = (Get-PlaybookConfig)[$eng.Playbook]
        $srcFile = if ($eng.SourceFile) { Split-Path $eng.SourceFile -Leaf } else { $null }
        Write-PodeJsonResponse -Value @{
            active        = $true
            client        = $eng.ClientName
            playbook      = $eng.Playbook
            playbookName  = $cfg.DisplayName
            verb          = $cfg.Verb
            verbPast      = $cfg.VerbPast
            statusOptions = @($cfg.StatusOptions)
            doneStatuses  = @(Get-DoneStatusSet $eng.Playbook)
            sourceFile    = $srcFile
            dirty         = [bool]$eng['Dirty']
            project       = $eng.Project
            summary       = (Get-EngagementSummary $eng)
        }
    }

    # ---- new engagement ----
    Add-PodeRoute -Method Post -Path '/api/engagement/new' -ScriptBlock {
        $d = $WebEvent.Data
        if (-not $d.clientName -or -not $d.playbook) {
            Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='clientName and playbook required' }; return
        }
        try {
            $eng = New-Engagement -ClientName $d.clientName -PlaybookKey $d.playbook
            Set-PodeState -Name 'eng' -Value $eng | Out-Null
            Write-PodeJsonResponse -Value @{ ok=$true }
        } catch { Set-PodeResponseStatus -Code 500 -NoErrorPage; Write-PodeJsonResponse -Value @{ error="$($_.Exception.Message)" } }
    }

    # ---- open saved engagement ----
    Add-PodeRoute -Method Post -Path '/api/engagement/open' -ScriptBlock {
        $d = $WebEvent.Data
        $dir  = Join-Path $env:PLAYBOOK_ROOT 'data\clients'
        $path = Join-Path $dir ([IO.Path]::GetFileName([string]$d.file))
        if (-not (Test-Path $path)) { Set-PodeResponseStatus -Code 404 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='file not found' }; return }
        try {
            $eng = Open-Engagement -Path $path
            Set-PodeState -Name 'eng' -Value $eng | Out-Null
            Write-PodeJsonResponse -Value @{ ok=$true }
        } catch { Set-PodeResponseStatus -Code 500 -NoErrorPage; Write-PodeJsonResponse -Value @{ error="$($_.Exception.Message)" } }
    }

    # ---- close engagement ----
    Add-PodeRoute -Method Post -Path '/api/engagement/close' -ScriptBlock {
        Set-PodeState -Name 'eng' -Value $null | Out-Null
        Write-PodeJsonResponse -Value @{ ok=$true }
    }

    # ---- policies ----
    Add-PodeRoute -Method Get -Path '/api/policies' -ScriptBlock {
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        Write-PodeJsonResponse -Value @{ policies = @($eng.Policies) }
    }

    # ---- update one policy field ----
    Add-PodeRoute -Method Post -Path '/api/policy' -ScriptBlock {
        $d = $WebEvent.Data
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        $pol = $eng.Policies | Where-Object { $_.Id -eq [int]$d.id } | Select-Object -First 1
        if ($pol) {
            switch ([string]$d.field) {
                'Status'        { $pol.Status        = [string]$d.value }
                'PlannedDate'   { $pol.PlannedDate   = [string]$d.value }
                'DateCompleted' { $pol.DateCompleted = [string]$d.value }
                'Tech'          { $pol.Tech          = [string]$d.value }
                'Notes'         { $pol.Notes         = [string]$d.value }
            }
            $eng['Dirty'] = $true
            Set-PodeState -Name 'eng' -Value $eng | Out-Null
        }
        Write-PodeJsonResponse -Value @{ ok=$true; summary=(Get-EngagementSummary $eng) }
    }

    # ---- bulk update many policies ----
    Add-PodeRoute -Method Post -Path '/api/policy/bulk' -ScriptBlock {
        $d = $WebEvent.Data
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        $field = [string]$d.field
        $value = [string]$d.value
        $ids = [System.Collections.Generic.HashSet[int]]::new()
        foreach ($i in @($d.ids)) { [void]$ids.Add([int]$i) }
        $count = 0
        foreach ($pol in $eng.Policies) {
            if (-not $ids.Contains([int]$pol.Id)) { continue }
            switch ($field) {
                'Status'        { $pol.Status        = $value }
                'PlannedDate'   { $pol.PlannedDate   = $value }
                'DateCompleted' { $pol.DateCompleted = $value }
                'Tech'          { $pol.Tech          = $value }
                'Notes'         { $pol.Notes         = $value }
            }
            $count++
        }
        # Only flag unsaved work if at least one policy actually matched.
        if ($count) {
            $eng['Dirty'] = $true
            Set-PodeState -Name 'eng' -Value $eng | Out-Null
        }
        Write-PodeJsonResponse -Value @{ ok=$true; count=$count; summary=(Get-EngagementSummary $eng) }
    }

    # ---- rollout timeline (project window + phase schedule) ----
    Add-PodeRoute -Method Get -Path '/api/timeline' -ScriptBlock {
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        Write-PodeJsonResponse -Value (Get-Timeline $eng)
    }

    # ---- set project / phase schedule ----
    Add-PodeRoute -Method Post -Path '/api/project' -ScriptBlock {
        $d = $WebEvent.Data
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        $p = $eng.Project
        $before = ($p | ConvertTo-Json -Compress -Depth 5)
        if ($null -ne $d.projectStart) { $p.Start = [string]$d.projectStart }
        if ($null -ne $d.projectEnd)   { $p.End   = [string]$d.projectEnd }
        if ($d.phase) {
            $k = [string]$d.phase
            if ($p.Phases[$k]) {
                if ($null -ne $d.phaseStart) { $p.Phases[$k].Start = [string]$d.phaseStart }
                if ($null -ne $d.phaseEnd)   { $p.Phases[$k].End   = [string]$d.phaseEnd }
            }
        }
        $phasesEmpty = -not ($p.Phases['1'].Start -or $p.Phases['2'].Start -or $p.Phases['3'].Start)
        if (($d.auto -or $phasesEmpty) -and $p.Start -and $p.End) { Invoke-AutoPhaseDistribution $eng }
        # Only flag unsaved work if the schedule actually changed.
        $changed = ($p | ConvertTo-Json -Compress -Depth 5) -ne $before
        if ($changed) {
            $eng['Dirty'] = $true
            Set-PodeState -Name 'eng' -Value $eng | Out-Null
        }
        Write-PodeJsonResponse -Value @{ ok=$true; changed=$changed; project=$eng.Project }
    }

    # ---- devices: list ----
    Add-PodeRoute -Method Get -Path '/api/devices' -ScriptBlock {
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        Write-PodeJsonResponse -Value @{ target=$eng.DeviceTarget; devices=@($eng.Devices); summary=(Get-DeviceSummary $eng) }
    }

    # ---- devices: add one or many ----
    Add-PodeRoute -Method Post -Path '/api/devices/add' -ScriptBlock {
        $d = $WebEvent.Data
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        $list = New-Object System.Collections.Generic.List[object]
        foreach ($x in @($eng.Devices)) { $list.Add($x) }
        $next = 1
        if ($list.Count) { $next = (($list | ForEach-Object { [int]$_.Id } | Measure-Object -Maximum).Maximum) + 1 }
        $added = 0
        foreach ($item in @($d.devices)) {
            $name = ([string]$item.name).Trim()
            if (-not $name) { continue }
            $cur = [string]$item.current; if ($cur -notin 'Not enrolled','Hybrid','Intune')        { $cur = 'Not enrolled' }
            $st  = [string]$item.status;  if ($st  -notin 'Not Started','In Progress','Done','Blocked') { $st  = 'Not Started' }
            $list.Add([pscustomobject]@{ Id=$next; Name=$name; OS=[string]$item.os; User=[string]$item.user; Current=$cur; Status=$st; Notes=[string]$item.notes })
            $next++; $added++
        }
        $eng.Devices = $list.ToArray()
        $eng['Dirty'] = $true
        Set-PodeState -Name 'eng' -Value $eng | Out-Null
        Write-PodeJsonResponse -Value @{ ok=$true; added=$added; devices=@($eng.Devices); summary=(Get-DeviceSummary $eng) }
    }

    # ---- devices: update one field ----
    Add-PodeRoute -Method Post -Path '/api/devices/update' -ScriptBlock {
        $d = $WebEvent.Data
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        $dev = @($eng.Devices) | Where-Object { [int]$_.Id -eq [int]$d.id } | Select-Object -First 1
        if ($dev) {
            switch ([string]$d.field) {
                'Name'    { $dev.Name    = [string]$d.value }
                'OS'      { $dev.OS      = [string]$d.value }
                'User'    { $dev.User    = [string]$d.value }
                'Current' { $dev.Current = [string]$d.value }
                'Status'  { $dev.Status  = [string]$d.value }
                'Notes'   { $dev.Notes   = [string]$d.value }
            }
            $eng['Dirty'] = $true
            Set-PodeState -Name 'eng' -Value $eng | Out-Null
        }
        Write-PodeJsonResponse -Value @{ ok=$true; summary=(Get-DeviceSummary $eng) }
    }

    # ---- devices: delete ----
    Add-PodeRoute -Method Post -Path '/api/devices/delete' -ScriptBlock {
        $d = $WebEvent.Data
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        $eng.Devices = @(@($eng.Devices) | Where-Object { [int]$_.Id -ne [int]$d.id })
        $eng['Dirty'] = $true
        Set-PodeState -Name 'eng' -Value $eng | Out-Null
        Write-PodeJsonResponse -Value @{ ok=$true; devices=@($eng.Devices); summary=(Get-DeviceSummary $eng) }
    }

    # ---- devices: set client-wide target ----
    Add-PodeRoute -Method Post -Path '/api/devices/target' -ScriptBlock {
        $d = $WebEvent.Data
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        if ([string]$d.target -in 'Intune','Hybrid') { $eng.DeviceTarget = [string]$d.target }
        $eng['Dirty'] = $true
        Set-PodeState -Name 'eng' -Value $eng | Out-Null
        Write-PodeJsonResponse -Value @{ ok=$true; target=$eng.DeviceTarget; summary=(Get-DeviceSummary $eng) }
    }

    # ---- save to Excel ----
    Add-PodeRoute -Method Post -Path '/api/save' -ScriptBlock {
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        try {
            $path = Save-Engagement $eng
            $eng['Dirty'] = $false
            Set-PodeState -Name 'eng' -Value $eng | Out-Null
            Write-PodeJsonResponse -Value @{ ok=$true; file=(Split-Path $path -Leaf) }
        } catch {
            $msg = "$($_.Exception.Message)"
            if ($msg -match 'being used by another process|cannot access the file|denied') {
                # File is open/locked (typically the .xlsx is open in Excel). Tell the
                # user plainly; the engagement stays dirty so autosave retries shortly.
                # -NoErrorPage so our JSON body is returned instead of Pode's HTML page.
                Set-PodeResponseStatus -Code 409 -NoErrorPage
                Write-PodeJsonResponse -Value @{ error='This client file is open in Excel. Close it and your work will save automatically.' }
            } else {
                Set-PodeResponseStatus -Code 500 -NoErrorPage
                Write-PodeJsonResponse -Value @{ error=$msg }
            }
        }
    }

    # ---- report: view HTML ----
    Add-PodeRoute -Method Get -Path '/api/report/view' -ScriptBlock {
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeTextResponse -Value 'No active engagement.'; return }
        Write-PodeHtmlResponse -Value (Build-ReportHtml $eng)
    }

    # ---- report: download Excel ----
    Add-PodeRoute -Method Get -Path '/api/report/excel' -ScriptBlock {
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        $safe = ($eng.ClientName -replace '[^\w\-]','_')
        $name = "{0}_{1}_Status_{2}.xlsx" -f $safe,$eng.Playbook,(Get-Date -f 'yyyyMMdd')
        $out  = Join-Path (Join-Path $env:PLAYBOOK_ROOT 'reports') $name
        try {
            Export-ReportExcel $eng $out | Out-Null
            Limit-ReportFiles -Dir (Split-Path $out -Parent)
            Set-PodeHeader -Name 'Content-Disposition' -Value "attachment; filename=`"$name`""
            Write-PodeFileResponse -Path $out -ContentType 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        } catch { Set-PodeResponseStatus -Code 500 -NoErrorPage; Write-PodeJsonResponse -Value @{ error="$($_.Exception.Message)" } }
    }

    # ---- report: download PDF ----
    Add-PodeRoute -Method Get -Path '/api/report/pdf' -ScriptBlock {
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        $safe = ($eng.ClientName -replace '[^\w\-]','_')
        $name = "{0}_{1}_Status_{2}.pdf" -f $safe,$eng.Playbook,(Get-Date -f 'yyyyMMdd')
        $out  = Join-Path (Join-Path $env:PLAYBOOK_ROOT 'reports') $name
        try {
            Export-ReportPdf $eng $out | Out-Null
            Limit-ReportFiles -Dir (Split-Path $out -Parent)
            Set-PodeHeader -Name 'Content-Disposition' -Value "attachment; filename=`"$name`""
            Write-PodeFileResponse -Path $out -ContentType 'application/pdf'
        } catch { Set-PodeResponseStatus -Code 500 -NoErrorPage; Write-PodeJsonResponse -Value @{ error="$($_.Exception.Message)" } }
    }
}
