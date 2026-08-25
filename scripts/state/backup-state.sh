#!/usr/bin/env bash
# backup-state.sh — daily snapshot of cortextOS runtime state.
#
# What's backed up:
#   1. Agent cron+onboarding state ($CTX_ROOT/.cortextOS/state/) — crons.json, .onboarded, message queues
#   2. Agent heartbeat state       ($CTX_ROOT/state/)            — heartbeat.json per agent + watchdog
#   3. Org runtime state           ($CTX_ROOT/orgs/<org>/)       — tasks DB, approvals, events, ChromaDB
#   4. Repo agent configs          ($CTX_FRAMEWORK_ROOT/orgs/)   — agent bootstrap files, MEMORY.md, memory/, goals.json
#                                                                  .env and secrets.env are REDACTED (values stripped)
#                                                                  .git, node_modules, .playwright-mcp are skipped
#
# Output: ${BACKUP_ROOT:-$HOME/.cortextos-backups}/YYYY-MM-DD/
# Retention: prune backups older than ${RETENTION_DAYS:-30} days
#
# Usage: backup-state.sh
#   Env:  CTX_ROOT, CTX_FRAMEWORK_ROOT, CTX_INSTANCE_ID (read from environment)
#         BACKUP_ROOT, RETENTION_DAYS (optional overrides)
#
# Designed to be safe to run while the daemon is live: state files are JSON
# so a partial copy might catch a half-written file, but daily granularity
# tolerates rare inconsistency. For stricter guarantees, add a daemon pause
# hook before invoking.

set -euo pipefail

# --- Config ---------------------------------------------------------------
CTX_FRAMEWORK_ROOT="${CTX_FRAMEWORK_ROOT:-/Users/danmitrut/cortextos}"
CTX_INSTANCE_ID="${CTX_INSTANCE_ID:-default}"
CTX_ROOT="${CTX_ROOT:-$HOME/.cortextos/$CTX_INSTANCE_ID}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/.cortextos-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

TODAY=$(date -u +%Y-%m-%d)
BACKUP_DIR="${BACKUP_ROOT}/${TODAY}"
TMP_DIR="${BACKUP_ROOT}/.tmp-${TODAY}-$$"

mkdir -p "${BACKUP_ROOT}"

# --- Pre-flight -----------------------------------------------------------
if [[ ! -d "${CTX_ROOT}" ]]; then
  echo "[backup] ERROR: CTX_ROOT not found: ${CTX_ROOT}" >&2
  exit 1
fi
if [[ ! -d "${CTX_FRAMEWORK_ROOT}" ]]; then
  echo "[backup] ERROR: CTX_FRAMEWORK_ROOT not found: ${CTX_FRAMEWORK_ROOT}" >&2
  exit 1
fi

echo "[backup] target:   ${BACKUP_DIR}"
echo "[backup] CTX_ROOT: ${CTX_ROOT}"
echo "[backup] FW_ROOT:  ${CTX_FRAMEWORK_ROOT}"

# Build into a temp dir, atomic rename at end so partial backups don't
# masquerade as complete ones.
mkdir -p "${TMP_DIR}"
trap 'rm -rf "${TMP_DIR}"' ERR

# --- 1. Agent cron + onboarding state ------------------------------------
if [[ -d "${CTX_ROOT}/.cortextOS/state" ]]; then
  echo "[backup] [1/4] cron + onboarding state"
  cp -R "${CTX_ROOT}/.cortextOS/state" "${TMP_DIR}/agent-state"
fi

# --- 2. Heartbeat state ---------------------------------------------------
if [[ -d "${CTX_ROOT}/state" ]]; then
  echo "[backup] [2/4] heartbeat state"
  cp -R "${CTX_ROOT}/state" "${TMP_DIR}/heartbeat-state"
fi

# --- 3. Org runtime state -------------------------------------------------
if [[ -d "${CTX_ROOT}/orgs" ]]; then
  echo "[backup] [3/4] org runtime (incl. ChromaDB)"
  cp -R "${CTX_ROOT}/orgs" "${TMP_DIR}/orgs-runtime"
fi

# --- 4. Repo agent configs (with env redaction) ---------------------------
if [[ -d "${CTX_FRAMEWORK_ROOT}/orgs" ]]; then
  echo "[backup] [4/4] repo agent configs"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a \
      --exclude='.git/' \
      --exclude='node_modules/' \
      --exclude='.playwright-mcp/' \
      --exclude='.env' \
      --exclude='.env.*' \
      --exclude='secrets.env' \
      "${CTX_FRAMEWORK_ROOT}/orgs/" "${TMP_DIR}/orgs-config/"
  else
    # Fallback: cp -R then prune (less efficient).
    cp -R "${CTX_FRAMEWORK_ROOT}/orgs" "${TMP_DIR}/orgs-config"
    find "${TMP_DIR}/orgs-config" \
      \( -name '.git' -o -name 'node_modules' -o -name '.playwright-mcp' \) \
      -type d -prune -exec rm -rf {} + 2>/dev/null || true
    find "${TMP_DIR}/orgs-config" \
      \( -name '.env' -o -name '.env.*' -o -name 'secrets.env' \) \
      -type f -delete 2>/dev/null || true
  fi

  # Now write redacted env companions so the schema (which keys exist) is preserved.
  # CHAT_ID / ALLOWED_USER / ACTIVITY_CHAT_ID are kept verbatim (no secrets).
  # Everything else gets <KEY>=REDACTED.
  while IFS= read -r envfile; do
    [[ -f "${envfile}" ]] || continue
    # Compute relative path so we mirror the structure under orgs-config/.
    rel="${envfile#${CTX_FRAMEWORK_ROOT}/orgs/}"
    out="${TMP_DIR}/orgs-config/${rel}.redacted"
    mkdir -p "$(dirname "${out}")"
    awk -F= 'BEGIN{OFS="="}
      /^[[:space:]]*$/ { print; next }
      /^[[:space:]]*#/ { print; next }
      {
        key=$1
        if (key=="CHAT_ID" || key=="ALLOWED_USER" || key=="ACTIVITY_CHAT_ID") { print; next }
        if (NF<2) { print; next }
        print key, "REDACTED"
      }' "${envfile}" > "${out}"
  done < <(find "${CTX_FRAMEWORK_ROOT}/orgs" -type f \( -name '.env' -o -name '.env.*' -o -name 'secrets.env' \) 2>/dev/null)
fi

# --- Manifest -------------------------------------------------------------
# Compute sizes relative to the staging dir so paths in the manifest are clean.
SIZES=$(cd "${TMP_DIR}" && du -sh ./* 2>/dev/null | sed 's|^|  |;s|\./||')
TOTAL=$(du -sh "${TMP_DIR}" 2>/dev/null | awk '{print $1}')
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

cat > "${TMP_DIR}/MANIFEST.txt" << MANIFEST
cortextOS State Backup
======================
Date:        $(date -u +%Y-%m-%dT%H:%M:%SZ)
Hostname:    $(hostname)
Instance:    ${CTX_INSTANCE_ID}
CTX_ROOT:    ${CTX_ROOT}
FW_ROOT:     ${CTX_FRAMEWORK_ROOT}
Total size:  ${TOTAL}

Contents:
${SIZES}

What's inside:
  agent-state/      crons.json, .onboarded flags, message queues per agent
  heartbeat-state/  heartbeat.json per agent + watchdog, last-telegram dedupe markers
  orgs-runtime/     tasks DB, approvals, events history, knowledge-base/chromadb
  orgs-config/      agent bootstrap files (IDENTITY.md etc.), MEMORY.md, memory/, goals.json
                    .env and secrets.env are NOT included — see *.redacted companions for schema

Restore:
  bash ${SCRIPT_DIR}/restore-state.sh "${BACKUP_DIR}"
MANIFEST

# --- Atomic rename --------------------------------------------------------
# If today's backup already exists, replace it (idempotent within a day).
if [[ -d "${BACKUP_DIR}" ]]; then
  rm -rf "${BACKUP_DIR}.old" 2>/dev/null || true
  mv "${BACKUP_DIR}" "${BACKUP_DIR}.old"
fi
mv "${TMP_DIR}" "${BACKUP_DIR}"
rm -rf "${BACKUP_DIR}.old" 2>/dev/null || true
trap - ERR

# --- Prune ---------------------------------------------------------------
echo "[backup] pruning entries older than ${RETENTION_DAYS} days"
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} + 2>/dev/null || true

echo "[backup] done — ${BACKUP_DIR} (${TOTAL})"
