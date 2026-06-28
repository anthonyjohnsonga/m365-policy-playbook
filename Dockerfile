# syntax=docker/dockerfile:1
# ============================================================================
#  M365 Policy Playbook — containerized install (Linux / amd64)
# ----------------------------------------------------------------------------
#  Build:  docker build -t m365-policy-playbook .
#  Run:    see docker-compose.yml (publishes http://127.0.0.1:3020)
# ============================================================================
FROM mcr.microsoft.com/powershell:lts-debian-12

# Chromium powers PDF export; the fonts make the PDFs render correctly. tini is
# PID 1 so `docker stop` shuts the server down cleanly.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      ca-certificates \
      tzdata \
      tini \
 && rm -rf /var/lib/apt/lists/*

# PowerShell modules, pinned to the versions the app is known to run on.
RUN pwsh -NoProfile -Command "\
      Set-PSRepository -Name PSGallery -InstallationPolicy Trusted; \
      Install-Module Pode        -RequiredVersion 2.13.4 -Scope AllUsers -Force; \
      Install-Module ImportExcel -RequiredVersion 7.8.10 -Scope AllUsers -Force"

WORKDIR /app
# Only what the app needs at runtime (see .dockerignore for what's excluded).
COPY src/                  ./src/
COPY www/                  ./www/
COPY data/masters/         ./data/masters/
COPY Start-PlaybookApp.ps1 ./

# 0.0.0.0 so the published port is reachable from the host; CHROME_BIN points
# Find-HeadlessBrowser straight at Chromium. Override TZ in compose so the
# overdue / due-soon date math matches your locale.
ENV PLAYBOOK_PORT=3020 \
    PLAYBOOK_ADDRESS=0.0.0.0 \
    CHROME_BIN=/usr/bin/chromium \
    TZ=UTC

EXPOSE 3020

# Saved client work, generated reports, and the (editable) master playbooks.
# A fresh named volume mounted at data/masters is auto-seeded from the image.
VOLUME ["/app/data/clients", "/app/reports", "/app/data/masters"]

# Pode takes ~10s to bind — give the healthcheck a start grace period.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD pwsh -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3020/api/state -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pwsh", "-NoProfile", "-File", "src/server.ps1", "-Port", "3020"]
