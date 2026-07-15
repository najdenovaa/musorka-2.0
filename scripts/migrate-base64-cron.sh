#!/usr/bin/env bash
# Cron wrapper for migrate-base64-to-s3.ts.
# Runs every 5 minutes via /etc/cron.d/musorka-base64-migrate.
# - flock 9: previous tick still running -> skip silently.
# - skip if bp-backend is not healthy (e.g. during deploy).
# - copy fresh TS migrator into the container, run, log.
# Once iOS/Android clients are rebuilt with assertAllAreHttps and the
# server-side gate is added, this cron can be disabled by removing
# /etc/cron.d/musorka-base64-migrate.

set -euo pipefail

LOCK_FILE="/tmp/musorka-base64-migrate.lock"
SCRIPT_HOST="/var/M2.0/scripts/migrate-base64-to-s3.ts"
SCRIPT_CONT="/app/scripts/m.ts"
CONTAINER="bp-backend"
LOG="/var/log/musorka-base64-migrate.log"

mkdir -p "$(dirname "$LOG")"
exec 9>"$LOCK_FILE"
if ! /usr/bin/flock -n 9; then
  printf '[%s] skip: previous tick still running\n' "$(date -u +%FT%TZ)" >>"$LOG"
  exit 0
fi

{
  TS=$(date -u +%FT%TZ)

  if ! [[ -r "$SCRIPT_HOST" ]]; then
    printf '[%s] ERROR: migration source missing: %s\n' "$TS" "$SCRIPT_HOST"
    exit 2
  fi

  STATUS=$(/usr/bin/docker inspect "$CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || echo "missing")
  if [[ "$STATUS" != "healthy" ]]; then
    printf '[%s] skip: %s status=%s\n' "$TS" "$CONTAINER" "$STATUS"
    exit 0
  fi

  /usr/bin/docker exec "$CONTAINER" mkdir -p /app/scripts
  /usr/bin/docker cp "$SCRIPT_HOST" "${CONTAINER}:${SCRIPT_CONT}"

  printf '[%s] start\n' "$TS"
  /usr/bin/docker exec -w /app "$CONTAINER" bun "$SCRIPT_CONT"
  printf '[%s] end\n' "$(date -u +%FT%TZ)"
} >>"$LOG" 2>&1
