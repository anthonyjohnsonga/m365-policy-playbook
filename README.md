<div align="center">

# 🛡️ M365 Policy Playbook

**Walk clients through their Microsoft 365 policy baselines — live, in the meeting.**

Explain each policy in plain English, show **who it impacts**, track status as you go,
and hand over a polished status report — all from a local web app.

![PowerShell 7+](https://img.shields.io/badge/PowerShell-7%2B-5391FE?logo=powershell&logoColor=white)
![Server: Pode](https://img.shields.io/badge/server-Pode-1f6feb)
![Excel: ImportExcel](https://img.shields.io/badge/Excel-ImportExcel-217346)
![Platforms: Windows | macOS | Docker](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Docker-0078D4)
![Runs locally](https://img.shields.io/badge/runs-on%20your%20machine-444)

</div>

---

## ✨ Highlights

- 🗂️ **Two playbooks** per engagement — Inforcer **Tier 1** (deployment) and **Tier 0** (verification).
- 🎨 **Impact-coded meeting view** — policies grouped by section and colour-coded **HIGH / MEDIUM / LOW**, each card showing *what it does* and a *what users will experience* box.
- 🔎 **Impact filter & search** — jump straight to the "users will notice this" items to pre-brief clients.
- 📊 **Live tracking** — Status / Date / Tech / Notes per policy, with overall and per-section progress rings that update as you go.
- 💾 **Saves to Excel** — a per-client working file you can re-open later, email, or back up.
- 📄 **One-click reports** — **View** (HTML), **Download Excel**, or **Download PDF**: status summary, per-section progress, a user-impact briefing, and a phased rollout timeline.
- 🖥️ **Three ways to run** — Windows, macOS, or Docker.
- 🔒 **Stays on your machine** — nothing is installed on the client tenant and nothing leaves your computer.

> Built on **PowerShell 7 + [Pode]** (web server) and **[ImportExcel]** (Excel round-trip).

---

## 📦 The playbooks

| Playbook | Purpose | Size |
|---|---|---|
| **Inforcer Tier 1** | Foundation Baseline — deployment checklist | 122 policies |
| **Inforcer Tier 0** | Baseline 0 — verification | ~48 policies |

The master workbooks in `data/masters/` are the **source of truth** and are never modified — a fresh copy is made for each client on first save.

---

## 🚀 Quick start

> First time on a machine? The step-by-step **[SETUP.md](SETUP.md)** assumes zero PowerShell knowledge.

### 🪟 Windows &nbsp;·&nbsp; 🍎 macOS &nbsp;— desktop

| Platform | Easiest | From PowerShell 7 |
|---|---|---|
| **Windows** | double-click **`Launch.cmd`** | `./Start-PlaybookApp.ps1` |
| **macOS** | double-click **`Launch.command`** ¹ | `./Start-PlaybookApp.ps1` |

```powershell
./Start-PlaybookApp.ps1                       # starts the server + opens the browser
./Start-PlaybookApp.ps1 -Port 9090 -NoBrowser # custom port, no auto-open
```

The browser opens **automatically once the server is ready** (Pode handles this, so it never
opens to a blank page) at **`http://127.0.0.1:8080`**. Press `Ctrl+C` in the console to stop.

<sub>¹ First macOS launch: right-click `Launch.command` → **Open**, or `chmod +x Launch.command` if you downloaded the ZIP.</sub>

### 🐳 Docker &nbsp;— Linux server / homelab

A containerized install that bundles PowerShell, the modules, and Chromium (so **PDF reports work**),
served on **port 3020**. The image is **private** on GHCR, so log in once with a GitHub token that
has the `read:packages` scope:

```bash
docker login ghcr.io -u <your-github-username>   # paste a Personal Access Token as the password
docker compose up -d                             # then browse to http://localhost:3020
```

<details>
<summary><strong>📄 docker-compose.yml</strong></summary>

```yaml
services:
  playbook:
    image: ghcr.io/anthonyjohnsonga/m365-policy-playbook:latest
    build: .                       # optional — build locally instead of pulling
    container_name: m365-policy-playbook
    restart: unless-stopped
    ports:
      - "127.0.0.1:3020:3020"      # host loopback only (use a VPN / SSH tunnel for remote)
    environment:
      TZ: America/New_York         # your timezone, so overdue / due-soon dates are correct
    volumes:
      - clients:/app/data/clients  # saved client working files
      - reports:/app/reports       # generated Excel / PDF reports
      - masters:/app/data/masters  # editable master playbooks (seeded from the image)

volumes:
  clients:
  reports:
  masters:
```

```bash
docker compose pull && docker compose up -d   # update to the latest image
docker compose logs -f                         # watch the server log
docker compose down                            # stop (your data/volumes are kept)
```
</details>

> ⚠️ The app has **no login** and holds **one active engagement** at a time — keep it on
> `localhost` / VPN and treat it as a single-operator tool. Full guide: **[SETUP.md §14](SETUP.md)**.

---

## 🧭 How a session goes

1. **New engagement** — enter the client name, pick a playbook, click *Create*.
2. **Walk the sections** with the client; use the **impact filter** to cover the HIGH/MEDIUM "users will notice this" items first.
3. **Set Status / Date / Tech / Notes** on each policy as you agree on it.
4. **Save to Excel** at any point (and at the end).
5. **Reports → Download PDF / Excel** to send the client a status update.
6. Next meeting: **Resume saved work**, pick the client's file, continue.

---

## 🛠️ Requirements

- **Windows or macOS** with **PowerShell 7+** &nbsp;(or **Docker** on Linux).
- Modules **`Pode`** and **`ImportExcel`** — the desktop launcher offers to install them; the Docker image already includes them.
- **Microsoft Edge, Chrome, or Chromium** for PDF reports — built into Windows/macOS, and bundled in the Docker image.

---

## 📂 Project layout

<details>
<summary>Show the folder tree</summary>

```
Launch.cmd                One-click launcher for Windows (checks for PowerShell 7)
Launch.command            One-click launcher for macOS
Start-PlaybookApp.ps1     Dependency check, then starts the server
Dockerfile                Container image (PowerShell + Chromium + modules)
docker-compose.yml        Container run config (port 3020, named volumes)
src/
  server.ps1              Pode routes (pages + JSON API); opens browser when ready
  DataAccess.ps1          Load / normalize playbooks, Excel save/load, summary
  Reports.ps1             HTML report, Excel export, PDF export (headless browser)
  PlaybookCore.psm1       Bundles the above for Pode's runspaces
www/                      Front-end — index.html, css/, and ES-module js/
data/
  masters/                Read-only master playbooks (source of truth)
  clients/                Per-client saved working files (.xlsx)
  guidance/               Optional per-policy "how to configure" reference (JSON)
reports/                  Generated report files (Excel / PDF)
```
</details>

---

## 🗃️ Data & version control

- **`data/clients/`** (client working files) and **`reports/`** (generated output) are excluded via `.gitignore` and **never committed** — only the app code and the read-only master playbooks are tracked.
- **Self-initializing:** a fresh `git clone` or ZIP won't contain those folders — the app **creates them on first run**. Just clone/extract and run. (In Docker, this data lives in the named volumes.)

---

<div align="center">
<sub>Windows · macOS · Docker — three independent ways to run the same app.</sub>
</div>

[Pode]: https://badgerati.github.io/Pode/
[ImportExcel]: https://github.com/dfinke/ImportExcel
