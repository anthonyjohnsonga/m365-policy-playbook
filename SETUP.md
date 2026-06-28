# M365 Policy Playbook — Setup & User Guide

This guide walks you through getting the **M365 Policy Playbook** running on a
computer from scratch, using it in a client meeting, and fixing common problems.

It assumes **no prior knowledge** of PowerShell. Follow the steps in order.

---

## 1. What this program is

A small web app that runs **on your own computer** and opens in your web browser.
You use it to walk a client through their Microsoft 365 policy baseline, explain
what each policy does and who it affects, track progress, and produce status
reports (HTML / Excel / PDF).

- Nothing is installed on the client's tenant. Nothing is sent to the internet.
- It runs locally at `http://127.0.0.1:8080` — only your machine can see it.
- Your work is saved as ordinary **Excel files** you can move, email, or back up.

---

## 2. What you need (prerequisites)

| Requirement | Why | Notes |
|---|---|---|
| **Windows 10 or 11** | Host OS | macOS also works — see **section 13**. This guide is otherwise Windows-focused. |
| **PowerShell 7 or newer** | Runs the app | This is **NOT** the blue "Windows PowerShell 5.1" that ships with Windows. See step 3. |
| **Internet (first run only)** | Installs 2 helper modules | After the first run it works offline. An offline option is in step 8. |
| **Microsoft Edge or Google Chrome** | Generates PDF reports | Edge is built into Windows, so this is normally already covered. |
| **The program folder** | The app itself | The `Microsoft Web App` folder, copied to the machine. |

> **How do I know if I have PowerShell 7?**
> Click Start, type `pwsh`, and press Enter. If a window opens that says
> `PowerShell 7.x.x`, you're set — skip to step 4. If nothing called `pwsh`
> is found, do step 3.

---

## 3. Install PowerShell 7 (only if you don't have it)

Pick **one** method.

**Option A — winget (fastest, Windows 10/11):**
1. Click Start, type `cmd`, open **Command Prompt**.
2. Paste this and press Enter:
   ```
   winget install --id Microsoft.PowerShell -e
   ```
3. Wait for it to finish.

**Option B — Microsoft Store:**
1. Open the **Microsoft Store**.
2. Search **PowerShell** (the one published by Microsoft).
3. Click **Get / Install**.

**Option C — Manual installer:**
1. Go to <https://aka.ms/powershell-release?tag=stable>.
2. Download the `...-win-x64.msi` file and run it (Next → Next → Finish).

When done, confirm it works: Start → type `pwsh` → Enter. You should see a
PowerShell 7 prompt.

---

## 4. Copy the program folder onto the computer

Copy the whole **`Microsoft Web App`** folder to the new machine. Good places:

- `C:\Tools\Microsoft Web App`
- `C:\Users\<you>\Documents\Microsoft Web App`
- Your **Desktop**

You can transfer it by USB drive, OneDrive/SharePoint, or a network share —
anything that moves a folder. Copying the folder also brings:

- `data\masters\` — the two master playbooks (Tier 1 and Tier 0).
- `data\clients\` — any saved client engagements (so in-progress work travels too).

> **Getting it from GitHub instead?** A `git clone` or ZIP download will **not**
> include the `data\clients\` or `reports\` folders (they're intentionally kept
> out of source control). That's fine — the app **creates them automatically**
> the first time you run it. The master playbooks in `data\masters\` *are*
> included, so a fresh download is ready to use. (To carry existing client work
> across, copy the `.xlsx` files from the old machine's `data\clients\` — see
> section 10.)

> Keep the folder structure intact. Don't move `Start-PlaybookApp.ps1` out of
> the folder — it expects the `src`, `www`, and `data` folders next to it.

---

## 5. Open PowerShell 7 *in the folder*

> Only needed for the **manual** start method (Option B in step 7). If you plan
> to double-click `Launch.cmd` (Option A), you can skip steps 5 and 6.

1. Open **File Explorer** and navigate **into** the `Microsoft Web App` folder
   (you should see `Start-PlaybookApp.ps1`, `README.md`, `src`, `www`, `data`).
2. Click in the **address bar** at the top, type `pwsh`, and press **Enter**.
   A PowerShell 7 window opens already pointed at the folder.

   *(Alternative: open `pwsh` from Start, then type `cd ` followed by the folder
   path, e.g. `cd "C:\Tools\Microsoft Web App"`, and press Enter.)*

---

## 6. First-time security steps (one time per machine)

> **Using the double-click `Launch.cmd` (Option A in step 7)? You can skip this
> entire step** — the launcher handles script permission for you. Step 6 is only
> needed for the manual PowerShell method (Option B).

Fresh Windows installs block downloaded scripts by default. Run these **two**
commands once, in the PowerShell 7 window from step 5.

**6a. Allow local scripts to run (current user only — safe):**
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```
If it asks to confirm, type `Y` and Enter.

**6b. Unblock the copied files** (clears the "this came from another computer"
flag):
```powershell
Get-ChildItem -Recurse | Unblock-File
```
This produces no output when it succeeds — that's normal.

> You only need to do step 6 **once** on each computer. You do not repeat it
> every time you launch the app.

---

## 7. Start the app

There are two ways to run it. **Option A** is the easiest, especially for
non-technical users. Both end up at the same app — pick one.

> Both options still require **PowerShell 7 (step 3)** and the **program folder
> (step 4)**. A `.cmd` file cannot install PowerShell for you.

### Option A — Double-click `Launch.cmd` (recommended, simplest)

1. Open the `Microsoft Web App` folder in File Explorer.
2. Double-click **`Launch.cmd`**.
3. A black window opens. The **first time only**, it may say a helper module
   isn't installed and ask `Install 'Pode' ... (Y/N)` — type **Y** and Enter
   (it may ask again for **ImportExcel**; type **Y** again). Needs internet,
   ~1 minute. If it asks to trust the gallery / NuGet provider, accept.
4. After a few seconds your **browser opens to the app** automatically.
5. **Leave the black window open** while you work — it is the server.
   To stop: press **Ctrl + C** in that window, or just close it.

`Launch.cmd` runs the app with script-permission handled **for that launch
only** — it does not change any machine settings, so you can **skip step 6**
when using this method.

> **First-time warnings on a new PC:**
> - "PowerShell 7 is required" → do **step 3**, then double-click again.
> - Windows **SmartScreen** ("Windows protected your PC") on a file copied from
>   another computer → click **More info → Run anyway** (one time).

### Option B — Run from PowerShell (manual)

Make sure you've done **step 6** once on this machine, then in the PowerShell 7
window from step 5, run:

```powershell
.\Start-PlaybookApp.ps1
```

What happens:

1. It checks for the two helper modules (**Pode** and **ImportExcel**).
2. The **first time only**, it asks to install them — type **Y** and Enter for
   each. (Needs internet; ~1 minute. Accept any gallery / NuGet prompts.)
3. You'll see `Starting server at http://127.0.0.1:8080`.
4. Once the server is ready your **default browser opens** to the app
   automatically (it waits for the server, so it won't open to a blank page).

**Leave the PowerShell window open** while you use the app — that window *is* the
server. To **stop**: press **Ctrl + C** in it (or close the window).

### Either way — if the browser doesn't open

Open any browser and go to: **http://127.0.0.1:8080**

### Optional launch settings

These flags work with **both** options (for Option A, run `Launch.cmd` from a
Command Prompt to pass them, e.g. `Launch.cmd -Port 9090`):

```powershell
.\Start-PlaybookApp.ps1 -Port 9090     # use a different port (if 8080 is busy)
.\Start-PlaybookApp.ps1 -NoBrowser     # start the server but don't auto-open a browser
```

---

## 8. No-internet machines (optional)

If the computer that will *run* the app has no internet, pre-download the two
modules on a computer that *does*, then copy them over.

**On an online PC (PowerShell 7):**
```powershell
Save-Module Pode, ImportExcel -Path "$HOME\Downloads\playbook-modules"
```

**Then:** copy that `playbook-modules` folder to the offline PC and install
into the user's module path:
```powershell
$dest = "$HOME\Documents\PowerShell\Modules"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item "<path-to>\playbook-modules\*" $dest -Recurse -Force
```
Now `.\Start-PlaybookApp.ps1` will find the modules and skip the install prompt.

---

## 9. Using the app (quick tour)

1. **Start an engagement**
   - *New engagement*: type the **client name**, pick a **playbook**
     (Tier 1 = deployment, Tier 0 = verification), click **Create**.
   - *Resume saved work*: pick a previously saved client file and click **Open**.
2. **Work through the policies** in the **Checklist** view. Each card shows what
   the policy does and **what users will experience**, color-coded by impact
   (red = High, amber = Medium, green = Low). Set **Status / Date / Tech / Notes**
   as you go — the progress ring updates live.
3. **Filters & search** (left sidebar) — jump to a section, or filter by impact
   (great for briefing clients on the High-impact "users will notice this" items).
4. **Bulk actions** (top-right of Checklist) — set many policies at once, e.g.
   filter to **Low** impact, scope **all matching filter**, status **Done**,
   **Apply** (the silent Phase-1 push in one click).
5. **Timeline** view — see the recommended phased rollout (Silent → Communicate →
   Validate) with progress; click any policy to jump back to its card.
6. **Save to Excel** — writes/updates this client's working file in
   `data\clients\`. Do this regularly and at the end of a meeting.
7. **Reports** menu (top-right) — **View** (web page), **Download Excel**, or
   **Download PDF** to send the client a status update.

---

## 10. Where your files live

Inside the program folder:

| Folder | What's in it |
|---|---|
| `data\masters\` | The master playbooks. **Read-only source** — never edited by the app. |
| `data\clients\` | Saved per-client working files (`.xlsx`). Your real work. |
| `data\clients\_backups\` | Automatic timestamped backups of each client file, kept before it's overwritten — open one in Excel if you ever need to recover a previous version. |
| `reports\` | Generated report files (Excel / PDF) ready to send. |

**Backups / moving work between PCs:** copy the files in `data\clients\`. To
resume on another machine, drop the `.xlsx` into that machine's `data\clients\`
folder and use **Resume saved work**. (Any saved file can also just be opened in
Excel directly.)

---

## 11. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `...cannot be loaded because running scripts is disabled` | You skipped step 6a. Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| `Start-PlaybookApp.ps1 is not recognized` | You're not in the folder. `cd` into the `Microsoft Web App` folder first, and include the `.\` prefix. |
| Stuck on `Install 'Pode'...` / install fails | No internet, or gallery blocked. Use the offline method in step 8. If it asks to install the **NuGet provider** or trust **PSGallery**, answer **Y**. |
| Browser didn't open | Manually go to **http://127.0.0.1:8080**. |
| `address already in use` / port 8080 busy | Another app uses 8080. Start with a different port: `.\Start-PlaybookApp.ps1 -Port 9090`, then browse to `http://127.0.0.1:9090`. |
| Page won't load / "can't connect" | The PowerShell window was closed (that's the server). Re-run `.\Start-PlaybookApp.ps1` and keep the window open. |
| **PDF** download fails (Excel/HTML are fine) | No Edge or Chrome found. Install Microsoft Edge (or Chrome). Excel and HTML reports still work without it. |
| Wrong PowerShell | If commands error oddly, make sure the window title says **PowerShell 7**, not "Windows PowerShell". Launch with `pwsh`, not `powershell`. |
| `Launch.cmd` says "PowerShell 7 is required" | PowerShell 7 isn't installed. Do **step 3**, then double-click `Launch.cmd` again. |
| `Launch.cmd` window flashes and closes | It can't find `Start-PlaybookApp.ps1` — `Launch.cmd` was moved out of the folder. Keep it in the `Microsoft Web App` folder next to the other files. |
| SmartScreen: "Windows protected your PC" | Normal for files copied from another machine. Click **More info → Run anyway** (one time). |
| It opens to a start screen after a restart | Normal — the app holds one active engagement in memory. Use **Resume saved work** to reopen a client file. |

---

## 12. Everyday use, after setup is done

Once a machine is set up (PowerShell 7 installed, folder copied), the daily
routine is simply:

**Easy way:**
1. Double-click **`Launch.cmd`** in the `Microsoft Web App` folder.
2. Work in the browser; **Save to Excel** as you go.
3. Press **Ctrl + C** in the black window (or close it) when finished.

**Manual way:**
1. Open the `Microsoft Web App` folder, type `pwsh` in the address bar, Enter.
2. Run `.\Start-PlaybookApp.ps1`.
3. Work in the browser; **Save to Excel** as you go.
4. Press **Ctrl + C** in the PowerShell window when finished.

---

## 13. Running on macOS

The app runs on a Mac too. The steps mirror Windows; only a few specifics differ.

1. **Install PowerShell 7** (once):
   - Homebrew: `brew install --cask powershell`
   - Or download the `.pkg` from <https://aka.ms/powershell-release?tag=stable>.
   - Confirm: open **Terminal** and run `pwsh -v`.
2. **Copy the program folder** onto the Mac (same as section 4).
3. **Start the app** — two ways:
   - **Double-click `Launch.command`** in Finder. The first time, macOS may block
     it ("cannot be opened because it is from an unidentified developer") —
     right-click it → **Open** → **Open**. If double-clicking does nothing, the
     executable flag was lost while copying: open Terminal in the folder and run
     `chmod +x Launch.command`, then try again.
   - **Or from Terminal:** `cd` into the folder and run `./Start-PlaybookApp.ps1`
     (or `pwsh Start-PlaybookApp.ps1`).
4. The first run installs the **Pode** and **ImportExcel** modules (answer **Y**;
   needs internet, ~1 minute). The offline method in section 8 works on macOS too.
5. Your browser opens to **http://127.0.0.1:8080**. If it doesn't, open it
   manually.
6. **PDF reports** need **Microsoft Edge** or **Google Chrome** installed in
   `/Applications` (Excel and HTML reports work without them).

Everything else — saving to Excel, reports, backups, per-client folders — works
the same as on Windows. There is **no `Set-ExecutionPolicy` step** on macOS; that
setting is Windows-only.

---

## 14. Running with Docker (Linux server / homelab)

A third way to run the app — as a Linux container — handy for a home server,
NAS, or VM. The image bundles PowerShell, the helper modules, and Chromium (so
**PDF reports work**), and serves the app on **port 3020**.

> **Heads-up:** like the desktop versions, the app has **no login** and holds
> **one active engagement** at a time. Keep it on `localhost` / VPN (the default
> below) and treat it as a single-operator tool, not a shared team app.

### Prerequisites
- A Linux host with **Docker** and **Docker Compose**.
- The image is **private**, so you need a **GitHub Personal Access Token** with
  the `read:packages` scope (GitHub → Settings → Developer settings → Personal
  access tokens → *Tokens (classic)* → Generate, tick **read:packages**).

### 1. Log in to the registry (one time)
```bash
docker login ghcr.io -u <your-github-username>
# paste the Personal Access Token when it asks for a password
```

### 2a. Run with Docker Compose (recommended)
Grab `docker-compose.yml` from the repo root, then in that folder:
```bash
docker compose pull
docker compose up -d
```

### 2b. …or a single `docker run` (no compose file needed)
```bash
docker run -d --name m365-policy-playbook \
  -p 127.0.0.1:3020:3020 \
  -e TZ=America/New_York \
  -v m365_clients:/app/data/clients \
  -v m365_reports:/app/reports \
  -v m365_masters:/app/data/masters \
  --restart unless-stopped \
  ghcr.io/anthonyjohnsonga/m365-policy-playbook:latest
```

### 3. Open it
Browse to **http://localhost:3020** *on the server* (it's published to the host
loopback only). To reach it from another machine use an **SSH tunnel** or a
**VPN** — don't expose 3020 to the network, since there's no authentication.

### Your data (named volumes)
Saved work lives in three Docker volumes, so it survives restarts and updates:

| Volume | Holds |
|---|---|
| `m365_clients` | per-client working files (`.xlsx`) |
| `m365_reports` | generated Excel / PDF reports |
| `m365_masters` | the master playbooks (kept editable so the in-app *Manage master* edits persist) |

To **back up**, archive a volume, e.g.:
```bash
docker run --rm -v m365_clients:/data -v "$PWD":/backup alpine \
  tar czf /backup/clients-backup.tgz -C /data .
```
(Prefer files you can see directly on the host? Swap the named volumes for bind
mounts to host folders in `docker-compose.yml`.)

### Common commands
```bash
docker compose logs -f                          # watch the server log
docker compose pull && docker compose up -d     # update to the latest image
docker compose down                             # stop (data/volumes are kept)
```

### Notes & gotchas
- **Port already in use?** Change the host side of the mapping (e.g.
  `127.0.0.1:3025:3020`); the app still listens on 3020 inside the container.
- **Timezone:** set `TZ` (above) to your zone so the overdue / due-soon dates
  match your locale instead of UTC.
- **Master updates:** because `m365_masters` is persisted, a newer image's
  updated baseline masters won't overwrite an existing masters volume — edit
  masters via the app, or reset just that volume to pick up image updates.
- **Build it yourself** instead of pulling: from a clone of the repo run
  `docker compose up -d --build` (the compose file includes a `build:` line).

---

*The Windows `Launch.cmd`, the macOS `Launch.command`, and this Docker image are
three independent ways to run the same app — pick whichever fits the machine.*
