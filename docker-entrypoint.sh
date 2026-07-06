#!/bin/sh
# ============================================================================
#  M365 Policy Playbook — container entrypoint
# ----------------------------------------------------------------------------
#  Docker auto-seeds a fresh NAMED volume from the image's /app/data/masters,
#  but a BIND MOUNT gets no such copy — an empty host folder mounted there
#  hides the baked-in playbooks and the app has nothing to copy for new
#  engagements. So the image keeps a pristine copy at /app/seed-data/masters
#  and this script tops up whatever is missing before the server starts.
#  Existing files are never overwritten (admin "Manage master" edits survive
#  container upgrades), and files aren't required to be present as a set —
#  each master is seeded independently.
# ============================================================================
set -e

mkdir -p /app/data/masters
for f in /app/seed-data/masters/*; do
    [ -f "$f" ] || continue
    dest="/app/data/masters/$(basename "$f")"
    if [ ! -e "$dest" ]; then
        echo "entrypoint: seeding master playbook $(basename "$f")"
        cp "$f" "$dest"
    fi
done

exec "$@"
