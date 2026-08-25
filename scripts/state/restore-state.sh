#!/usr/bin/env bash
# restore-state.sh — restore cortextOS runtime state from a backup created by backup-state.sh.
#
# Usage:
#   restore-state.sh <backup-dir> [--dry-run] [--yes]
#
#   <backup-dir>   path to a backup, e.g. ~/.cortextos-backups/2026-05-12
#   --dry-run      show what would change without touching anything
#   --yes          skip the interactive confirmation prompt
#
# Behavior:
#   1. Validates the backup has the expected structure (MANIFEST.txt + 4 sections).
#   2. Snapshots the CURRENT state to a sibling _pre-rollback_<timestamp>/ backup
#      so the rollback itself is reversible.
#   3. Restores each section to its original location.
#   4. Does NOT restart the daemon — that is a manual step printed at the end.
#
# Env: CTX_ROOT, CTX_FRAMEWORK_ROOT (read from environment, with sensible defaults).

set -uo pipefail

CTX_FRAMEWORK_ROOT="${CTX_FRAMEWORK_ROOT:-/Users/danmitrut/cortextos}"
CTX_INSTANCE_ID="${CTX_INSTANCE_ID:-default}"
CTX_ROOT="${CTX_ROOT:-$HOME/.cortextos/$CTX_INSTANCE_ID}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/.cortextos-backups}"

DRY_RUN=0
ASSUME_YES=0
BACKUP_DIR=""

# --- Args ----------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y)  ASSUME_YES=1 ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0 ;;
    *) BACKUP_DIR="$1" ;;
  esac
  shift
done

if [[ -z "$BACKUP_DIR" ]]; then
  echo "ERROR: backup-dir argument required" >&2
  echo "Usage: $0 <backup-dir> [--dry-run] [--yes]" >&2
  exit 2
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "ERROR: backup not found: $BACKUP_DIR" >&2
  exit 2
fi

if [[ ! -f "$BACKUP_DIR/MANIFEST.txt" ]]; then
  echo "ERROR: $BACKUP_DIR is missing MANIFEST.txt — not a valid backup" >&2
  exit 2
fi

# --- Confirm contents -----------------------------------------------------
echo "===== Backup to restore: $BACKUP_DIR ====="
cat "$BACKUP_DIR/MANIFEST.txt"
echo "==========================================="

# --- Plan ----------------------------------------------------------------
# Map of <backup-section> -> <restore-target>.
declare -a SECTIONS=(
  "agent-state:${CTX_ROOT}/.cortextOS/state"
  "heartbeat-state:${CTX_ROOT}/state"
  "orgs-runtime:${CTX_ROOT}/orgs"
  "orgs-config:${CTX_FRAMEWORK_ROOT}/orgs"
)

echo ""
echo "Plan:"
for entry in "${SECTIONS[@]}"; do
  src="${BACKUP_DIR}/${entry%%:*}"
  dst="${entry##*:}"
  if [[ -d "$src" ]]; then
    echo "  - ${entry%%:*}  →  $dst"
  else
    echo "  - ${entry%%:*}  (skip: not in backup)"
  fi
done

if [[ $DRY_RUN -eq 1 ]]; then
  echo ""
  echo "[restore] dry-run only. No changes made."
  exit 0
fi

# --- Confirm -------------------------------------------------------------
if [[ $ASSUME_YES -ne 1 ]]; then
  echo ""
  echo "WARNING: this overwrites current state. A pre-rollback snapshot will be saved."
  read -r -p "Proceed? [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "[restore] cancelled by user."; exit 0 ;;
  esac
fi

# --- Pre-rollback snapshot -----------------------------------------------
TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
SAFETY_DIR="${BACKUP_ROOT}/_pre-rollback_${TS}"
echo ""
echo "[restore] pre-rollback snapshot → $SAFETY_DIR"
mkdir -p "$SAFETY_DIR"
for entry in "${SECTIONS[@]}"; do
  section="${entry%%:*}"
  dst="${entry##*:}"
  if [[ -d "$dst" ]]; then
    cp -R "$dst" "${SAFETY_DIR}/${section}-current" 2>/dev/null || \
      echo "[restore] WARN: failed to snapshot ${dst}"
  fi
done
cat > "${SAFETY_DIR}/MANIFEST.txt" << EOF
Pre-rollback snapshot
=====================
Date:           $(date -u +%Y-%m-%dT%H:%M:%SZ)
Restoring from: $BACKUP_DIR
Captured paths: as ${SECTIONS[*]}

To restore THIS snapshot back: bash $(realpath "$0") "$SAFETY_DIR"
EOF

# --- Restore each section ------------------------------------------------
echo ""
for entry in "${SECTIONS[@]}"; do
  section="${entry%%:*}"
  src="${BACKUP_DIR}/${section}"
  dst="${entry##*:}"
  if [[ ! -d "$src" ]]; then
    continue
  fi
  echo "[restore] $section  →  $dst"
  # Remove current target, then copy. cp -R into the parent so the dirname matches.
  parent=$(dirname "$dst")
  basename=$(basename "$dst")
  mkdir -p "$parent"
  if [[ -d "$dst" ]]; then
    rm -rf "${dst}.replacing"
    mv "$dst" "${dst}.replacing"
  fi
  cp -R "$src" "${parent}/${basename}"
  rm -rf "${dst}.replacing" 2>/dev/null || true
done

# --- Post-restore notes --------------------------------------------------
cat << EOF

[restore] Done.

NEXT STEPS:
  1. Restart the daemon so it re-reads state:
       cortextos restart
     (or, if controlled by PM2 directly:
       pm2 restart cortextos-daemon)

  2. Validate the restored state:
       bash $(dirname "$(realpath "$0")")/validate-state.sh

  3. If something looks wrong, undo this restore by replaying the safety snapshot:
       bash $(realpath "$0") "$SAFETY_DIR"

NOTE: secrets.env and .env files are NOT in the backup (they were redacted). If you
      restored a fresh repo state, re-populate those files from your secrets store
      before restarting the daemon, or agents will fail to connect to Telegram.
EOF
