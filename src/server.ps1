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
# Bind address: 127.0.0.1 for the desktop launchers (loopback only). A container
# sets PLAYBOOK_ADDRESS=0.0.0.0 so the published port is reachable from the host
# (Docker forwards to the container's eth0, not its loopback).
if (-not $env:PLAYBOOK_ADDRESS) { $env:PLAYBOOK_ADDRESS = '127.0.0.1' }

# -Browse opens the default browser in-process once the endpoint is bound.
Start-PodeServer -Browse:$Browse {

    $root    = $env:PLAYBOOK_ROOT
    $src     = Join-Path $root 'src'
    $www     = Join-Path $root 'www'

    # These runtime folders are git-ignored, so they're absent on a fresh
    # clone/download. Create them up front so the first save / report works.
    foreach ($d in @((Join-Path $root 'data' 'clients'), (Join-Path $root 'reports'))) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }

    Add-PodeEndpoint -Address $env:PLAYBOOK_ADDRESS -Port ([int]$env:PLAYBOOK_PORT) -Protocol Http
    Import-PodeModule -Path (Join-Path $src 'PlaybookCore.psm1')
    New-PodeLoggingMethod -Terminal | Enable-PodeErrorLogging

    Set-PodeState -Name 'eng' -Value $null | Out-Null

    Add-PodeStaticRoute -Path '/static' -Source $www

    # ---- SPA shell ----
    Add-PodeRoute -Method Get -Path '/' -ScriptBlock {
        Write-PodeFileResponse -Path (Join-Path $env:PLAYBOOK_ROOT 'www' 'index.html')
    }

    # ---- favicon: browsers request /favicon.ico at the root by default ----
    Add-PodeRoute -Method Get -Path '/favicon.ico' -ScriptBlock {
        Write-PodeFileResponse -Path (Join-Path $env:PLAYBOOK_ROOT 'www' 'favicon.ico') -ContentType 'image/x-icon'
    }

    # ---- config: playbooks for New Engagement form ----
    Add-PodeRoute -Method Get -Path '/api/config' -ScriptBlock {
        $cfg = Get-PlaybookConfig
        $list = foreach ($k in $cfg.Keys) {
            [pscustomobject]@{ key=$k; name=$cfg[$k].DisplayName; short=$cfg[$k].ShortName }
        }
        Write-PodeJsonResponse -Value @{ playbooks = @($list) }
    }

    # ---- settings: read-only app folder locations ----
    Add-PodeRoute -Method Get -Path '/api/settings' -ScriptBlock {
        $root       = $env:PLAYBOOK_ROOT
        $clientsDir = Join-Path $root 'data' 'clients'
        $mastersDir = Join-Path $root 'data' 'masters'
        $reportsDir = Join-Path $root 'reports'

        # Client files now live one level down in per-client subfolders, each
        # with its own _backups folder. Walk data\clients recursively and split
        # working files from backups so both counts stay accurate.
        $clientCount = 0; $backupCount = 0
        if (Test-Path $clientsDir) {
            foreach ($f in (Get-ChildItem $clientsDir -Filter *.xlsx -File -Recurse -ErrorAction SilentlyContinue)) {
                if ($f.FullName -match '[\\/]_backups[\\/]') { $backupCount++ } else { $clientCount++ }
            }
        }
        $masterCount = if (Test-Path $mastersDir) { @(Get-ChildItem $mastersDir -Filter *.xlsx -File -ErrorAction SilentlyContinue).Count } else { 0 }
        $reportCount = if (Test-Path $reportsDir) { @(Get-ChildItem $reportsDir -File -ErrorAction SilentlyContinue).Count } else { 0 }

        # Each entry: where the app keeps a class of files, plus a live count so
        # the panel doubles as an at-a-glance health check. Display-only for now.
        $folders = @(
            [pscustomobject]@{ label='Client working files'; path=$clientsDir; exists=(Test-Path $clientsDir); count=$clientCount }
            [pscustomobject]@{ label='Master playbooks';     path=$mastersDir; exists=(Test-Path $mastersDir); count=$masterCount }
            [pscustomobject]@{ label='Backups (per-client)'; path=$clientsDir; exists=(Test-Path $clientsDir); count=$backupCount; note="in each client's _backups folder" }
            [pscustomobject]@{ label='Reports';              path=$reportsDir; exists=(Test-Path $reportsDir); count=$reportCount }
        )
        Write-PodeJsonResponse -Value @{ root=$root; port=[int]$env:PLAYBOOK_PORT; folders=@($folders) }
    }

    # ---- saved client files ----
    Add-PodeRoute -Method Get -Path '/api/clients' -ScriptBlock {
        $dir = Join-Path $env:PLAYBOOK_ROOT 'data' 'clients'
        $files = @()
        if (Test-Path $dir) {
            # New layout: one subfolder per client (its files + a _backups
            # folder). Legacy layout: flat .xlsx directly in data\clients. List
            # both so older test files stay openable. 'rel' is the path relative
            # to the clients dir, used to open the file; 'client' drives the
            # grouped dropdown.
            $entries = New-Object System.Collections.Generic.List[object]
            foreach ($f in (Get-ChildItem $dir -Filter *.xlsx -File -ErrorAction SilentlyContinue)) {
                $entries.Add([pscustomobject]@{ name=$f.Name; rel=$f.Name; client=''; modified=$f.LastWriteTime.ToString('yyyy-MM-dd HH:mm'); ts=$f.LastWriteTime })
            }
            foreach ($sub in (Get-ChildItem $dir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '_backups' })) {
                foreach ($f in (Get-ChildItem $sub.FullName -Filter *.xlsx -File -ErrorAction SilentlyContinue)) {
                    $entries.Add([pscustomobject]@{ name=$f.Name; rel=("{0}/{1}" -f $sub.Name, $f.Name); client=$sub.Name; modified=$f.LastWriteTime.ToString('yyyy-MM-dd HH:mm'); ts=$f.LastWriteTime })
                }
            }
            $files = $entries | Sort-Object ts -Descending |
                     ForEach-Object { @{ name=$_.name; rel=$_.rel; client=$_.client; modified=$_.modified } }
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
        $dir  = Join-Path $env:PLAYBOOK_ROOT 'data' 'clients'
        # Accept either a flat "<file>.xlsx" or a "<client>/<file>.xlsx" path.
        # Sanitize each segment (drop any directory parts, reject . / ..) so the
        # resolved path can't escape the clients folder.
        $parts = @((([string]$d.file) -replace '\\','/') -split '/' |
                   Where-Object { $_ -and $_ -ne '.' -and $_ -ne '..' } |
                   ForEach-Object { [IO.Path]::GetFileName($_) })
        if ($parts.Count -lt 1 -or $parts.Count -gt 2) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='bad file path' }; return }
        $path = Join-Path $dir ($parts -join [IO.Path]::DirectorySeparatorChar)
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

    # ---- import a saved working file (upload from another install) ----
    #  multipart/form-data with a 'clientName' text field and one 'file' upload
    #  per request — the UI loops over multi-selected files and aggregates the
    #  results. The upload is staged to a temp path (always cleaned up) and
    #  validated/placed by Import-ClientFile. If the import replaced the file
    #  behind the currently open engagement, that engagement is closed so its
    #  in-memory copy can't autosave the replaced data back over the import.
    Add-PodeRoute -Method Post -Path '/api/import' -ScriptBlock {
        $client  = ([string]$WebEvent.Data['clientName']).Trim()
        $origRaw = $WebEvent.Data['file']
        if (-not $client) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='clientName required' }; return }
        # Multiple uploads under one 'file' key arrive as an array of names —
        # say so, instead of the misleading 'no file uploaded' that the
        # ContainsKey check below would produce for the joined string.
        if ($origRaw -is [System.Collections.ICollection] -and $origRaw.Count -gt 1) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='one file per request - send each file as its own upload' }; return }
        $orig = [string]$origRaw
        if (-not $orig -or -not $WebEvent.Files.ContainsKey($orig)) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no file uploaded' }; return }
        if ([IO.Path]::GetExtension($orig).ToLower() -ne '.xlsx') { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='only .xlsx working files can be imported' }; return }
        $tmp = Join-Path ([IO.Path]::GetTempPath()) ("playbook_import_{0}.xlsx" -f ([guid]::NewGuid().ToString('N')))
        try {
            $WebEvent.Files[$orig].Save($tmp)
            $res = Import-ClientFile -Path $tmp -ClientName $client -OriginalName $orig

            $closedActive = $false
            $eng = Get-PodeState -Name 'eng'
            if ($eng -and $eng.SourceFile) {
                $engLeaf = Split-Path $eng.SourceFile -Leaf
                $engDir  = Split-Path (Split-Path $eng.SourceFile -Parent) -Leaf
                if ($engDir -eq (ConvertTo-SafeClientName $client) -and
                    ($engLeaf -eq $res.File -or $engLeaf -in @($res.Replaced))) {
                    Set-PodeState -Name 'eng' -Value $null | Out-Null
                    $closedActive = $true
                }
            }
            Write-PodeJsonResponse -Value @{
                ok=$true; client=$res.Client; playbook=$res.PlaybookName; file=$res.File
                policies=$res.Policies; replaced=@($res.Replaced); closedActive=$closedActive
            }
        }
        catch {
            # ArgumentException = the uploaded file is at fault (400); anything
            # else is a server-side failure and must not masquerade as one.
            $code = if ($_.Exception -is [System.ArgumentException]) { 400 } else { 500 }
            Set-PodeResponseStatus -Code $code -NoErrorPage
            Write-PodeJsonResponse -Value @{ error="$($_.Exception.Message)" }
        }
        finally { Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue }
    }

    # ---- policies ----
    Add-PodeRoute -Method Get -Path '/api/policies' -ScriptBlock {
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        # Merge read-only config guidance (by Policy Name) into a shallow copy of
        # each policy so the engagement state stays lean and is never mutated.
        $guide = Get-PolicyGuidanceMap
        $out = foreach ($p in $eng.Policies) {
            $c = $p.PSObject.Copy()
            $c | Add-Member -NotePropertyName Guidance -NotePropertyValue $guide[[string]$p.PolicyName] -Force
            $c
        }
        Write-PodeJsonResponse -Value @{ policies = @($out) } -Depth 12
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

    # ---- companion tier: read-only view of the client's OTHER tier ----
    Add-PodeRoute -Method Get -Path '/api/companion' -ScriptBlock {
        $eng = Get-PodeState -Name 'eng'
        if (-not $eng) { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error='no engagement' }; return }
        $otherKey = Get-OtherPlaybookKey $eng.Playbook
        if (-not $otherKey) { Write-PodeJsonResponse -Value @{ available=$false; reason='This playbook has no companion tier.' }; return }
        $cfg  = (Get-PlaybookConfig)[$otherKey]
        $path = Find-CompanionFile -Engagement $eng
        if (-not $path) {
            Write-PodeJsonResponse -Value @{ available=$false; tier=$otherKey; shortName=$cfg.ShortName; displayName=$cfg.DisplayName; reason=("No saved {0} file for this client yet." -f $cfg.ShortName) }
            return
        }
        try {
            # Load read-only — never stored in Pode state, so the active
            # engagement is untouched.
            $other = Open-Engagement -Path $path
            $pols  = foreach ($p in $other.Policies) {
                [pscustomobject]@{ Section=$p.Section; PolicyName=$p.PolicyName; Impact=$p.Impact; ImpactClass=$p.ImpactClass; Status=$p.Status; DateCompleted=$p.DateCompleted }
            }
            Write-PodeJsonResponse -Value @{
                available    = $true
                tier         = $otherKey
                shortName    = $cfg.ShortName
                displayName  = $cfg.DisplayName
                verbPast     = $cfg.VerbPast
                file         = (Split-Path $path -Leaf)
                summary      = (Get-EngagementSummary $other)
                doneStatuses = @(Get-DoneStatusSet $otherKey)
                policies     = @($pols)
            }
        } catch { Set-PodeResponseStatus -Code 500 -NoErrorPage; Write-PodeJsonResponse -Value @{ error="$($_.Exception.Message)" } }
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

    # ---- admin: master meta (sections, impacts, existing names) ----
    Add-PodeRoute -Method Get -Path '/api/master/meta' -ScriptBlock {
        $tier = [string]$WebEvent.Query['tier']; if (-not $tier) { $tier = 'Tier1' }
        try { Write-PodeJsonResponse -Value (Get-MasterInfo -PlaybookKey $tier) }
        catch { Set-PodeResponseStatus -Code 400 -NoErrorPage; Write-PodeJsonResponse -Value @{ error="$($_.Exception.Message)" } }
    }

    # ---- admin: add a policy to the master ----
    Add-PodeRoute -Method Post -Path '/api/master/policy' -ScriptBlock {
        $d = $WebEvent.Data
        $tier = [string]$d.tier; if (-not $tier) { $tier = 'Tier1' }
        $policy = @{
            Section             = [string]$d.section
            PolicyName          = [string]$d.policyName
            Impact              = [string]$d.impact
            WhatItDoes          = [string]$d.whatItDoes
            WhatUsersExperience = [string]$d.whatUsersExperience
            PortalPath          = [string]$d.portalPath
            AutoRemediable      = [string]$d.autoRemediable
            License             = [string]$d.license
        }
        try {
            $res = Add-MasterPolicy -Policy $policy -PlaybookKey $tier
            Write-PodeJsonResponse -Value @{ ok=$true; policyName=$res.policyName; section=$res.section }
        } catch {
            Set-PodeResponseStatus -Code 400 -NoErrorPage
            Write-PodeJsonResponse -Value @{ error="$($_.Exception.Message)" }
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
        $safe = ConvertTo-SafeClientName $eng.ClientName
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
        $safe = ConvertTo-SafeClientName $eng.ClientName
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
