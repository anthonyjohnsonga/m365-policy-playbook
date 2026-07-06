#!/bin/sh
# ============================================================================
#  M365 Policy Playbook — container entrypoint
# ----------------------------------------------------------------------------
#  A short root-only setup phase, then the server runs as the unprivileged
#  appuser (1000:1000):
#
#  1. Seed masters. Docker auto-seeds a fresh NAMED volume from the image's
#     /app/data/masters, but a BIND MOUNT gets no such copy — an empty host
#     folder mounted there hides the baked-in playbooks and the app has
#     nothing to copy for new engagements. The image keeps a pristine copy at
#     /app/seed-data/masters and this script tops up whatever is missing.
#     Existing files are never overwritten (admin "Manage master" edits
#     survive container upgrades), and files aren't required to be present as
#     a set — each master is seeded independently.
#
#  2. Own the data dirs. Volumes and bind mounts often arrive root-owned
#     (fresh bind mounts, or data written by pre-appuser versions of this
#     image); appuser must be able to write them.
#
#  Started with a custom user (compose `user:`)? The root phase is skipped and
#  the operator owns permission management.
# ============================================================================
set -e

seed_masters() {
    mkdir -p /app/data/masters
    for f in /app/seed-data/masters/*; do
        [ -f "$f" ] || continue
        dest="/app/data/masters/$(basename "$f")"
        if [ ! -e "$dest" ]; then
            echo "entrypoint: seeding master playbook $(basename "$f")"
            cp "$f" "$dest"
        fi
    done
}

if [ "$(id -u)" = "0" ]; then
    mkdir -p /app/data/clients /app/reports
    seed_masters
    chown -R appuser:appuser /app/data/clients /app/data/masters /app/reports

    # HOME is inherited from root's environment; point it at appuser's so
    # Chromium (PDF export) and pwsh have a writable profile/cache dir.
    HOME=/home/appuser
    export HOME
    if command -v setpriv >/dev/null 2>&1; then
        exec setpriv --reuid=appuser --regid=appuser --init-groups "$@"
    fi
    echo "entrypoint: WARNING - setpriv not found, running as root" >&2
    exec "$@"
fi

seed_masters
exec "$@"
