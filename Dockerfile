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

# The server runs as this unprivileged user (the entrypoint drops to it after a
# root-only setup phase). Fixed at 1000:1000 — the default first user on most
# Linux hosts — so bind-mounted data folders usually end up owned by the person
# running the host. -m gives it a writable $HOME (Chromium and pwsh caches).
RUN groupadd -g 1000 appuser && useradd -m -u 1000 -g appuser appuser

WORKDIR /app
# Only what the app needs at runtime (see .dockerignore for what's excluded).
# The masters are copied twice: data/masters is the live location (auto-seeds
# fresh NAMED volumes), seed-data/masters is a pristine reference the
# entrypoint copies from when a BIND MOUNT leaves the live folder empty —
# Docker never seeds bind mounts itself.
COPY src/                  ./src/
COPY www/                  ./www/
COPY data/masters/         ./data/masters/
COPY data/masters/         ./seed-data/masters/
COPY data/guidance/        ./data/guidance/
COPY Start-PlaybookApp.ps1 ./
COPY docker-entrypoint.sh  /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Pre-create the writable dirs and hand them to appuser — a fresh NAMED volume
# copies this ownership when Docker auto-seeds it on first use.
RUN mkdir -p /app/data/clients /app/reports \
 && chown -R appuser:appuser /app/data /app/reports

# 0.0.0.0 so the published port is reachable from the host; CHROME_BIN points
# Find-HeadlessBrowser straight at Chromium. Override TZ in compose so the
# overdue / due-soon date math matches your locale.
ENV PLAYBOOK_PORT=3020 \
    PLAYBOOK_ADDRESS=0.0.0.0 \
    CHROME_BIN=/usr/bin/chromium \
    TZ=UTC

EXPOSE 3020

# Saved client work, generated reports, and the (editable) master playbooks.
# Named volumes auto-seed from the image; bind mounts are seeded by the
# entrypoint (see docker-entrypoint.sh).
VOLUME ["/app/data/clients", "/app/reports", "/app/data/masters"]

# Pode takes ~10s to bind — give the healthcheck a start grace period.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD pwsh -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3020/api/state -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }"

# Deliberately no USER directive: the container starts as root so the
# entrypoint can seed masters and chown the mounted data dirs, then it drops to
# appuser (setpriv) before exec-ing the server.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["pwsh", "-NoProfile", "-File", "src/server.ps1", "-Port", "3020"]
