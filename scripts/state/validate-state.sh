#!/usr/bin/env bash
# validate-state.sh — schema check for cortextOS runtime state.
#
# Catches the corruption modes that cause silent breakage:
#   - crons.json invalid → daemon stops scheduling
#   - heartbeat.json invalid → dashboard shows agent dead
#   - tasks/*.json invalid → bus list-tasks throws
#   - goals.json missing fields → morning/evening review breaks
#   - enabled agent missing .onboarded flag → first-boot loop on restart
#
# Usage: validate-state.sh
#   Exit 0 = all clean.
#   Exit 1 = at least one validation error (printed to stderr).
#   Exit 2 = environment misconfigured (paths missing).
#
# Env: CTX_ROOT, CTX_FRAMEWORK_ROOT (read from environment, with sensible defaults).

set -uo pipefail

CTX_FRAMEWORK_ROOT="${CTX_FRAMEWORK_ROOT:-/Users/danmitrut/cortextos}"
CTX_INSTANCE_ID="${CTX_INSTANCE_ID:-default}"
CTX_ROOT="${CTX_ROOT:-$HOME/.cortextos/$CTX_INSTANCE_ID}"

ERRORS=0
CHECKED=0

if ! command -v jq >/dev/null 2>&1; then
  echo "[validate] FATAL: jq is required" >&2
  exit 2
fi
if [[ ! -d "${CTX_ROOT}" ]]; then
  echo "[validate] FATAL: CTX_ROOT not found: ${CTX_ROOT}" >&2
  exit 2
fi

err() {
  echo "[validate] ERROR: $*" >&2
  ERRORS=$((ERRORS + 1))
}

ok() {
  CHECKED=$((CHECKED + 1))
}

# --- 1. crons.json per agent ---------------------------------------------
echo "[validate] crons.json"
while IFS= read -r f; do
  [[ -f "$f" ]] || continue
  agent=$(basename "$(dirname "$f")")
  if ! jq -e . "$f" >/dev/null 2>&1; then
    err "${agent}: crons.json is not valid JSON ($f)"
    continue
  fi
  # Each cron entry must have name, prompt, schedule, enabled.
  bad=$(jq -r '.crons[] | select((.name == null) or (.prompt == null) or (.schedule == null) or (.enabled == null)) | .name // "<unnamed>"' "$f" 2>/dev/null)
  if [[ -n "$bad" ]]; then
    err "${agent}: cron entries missing required fields (name/prompt/schedule/enabled): ${bad}"
  else
    ok
  fi
done < <(find "${CTX_ROOT}/.cortextOS/state" -name 'crons.json' 2>/dev/null)

# --- 2. heartbeat.json per agent -----------------------------------------
echo "[validate] heartbeat.json"
while IFS= read -r f; do
  [[ -f "$f" ]] || continue
  agent=$(basename "$(dirname "$f")")
  if ! jq -e . "$f" >/dev/null 2>&1; then
    err "${agent}: heartbeat.json is not valid JSON ($f)"
    continue
  fi
  # Must carry: agent, status, last_heartbeat (cortextOS heartbeat schema).
  if ! jq -e '.agent and .status and .last_heartbeat' "$f" >/dev/null 2>&1; then
    err "${agent}: heartbeat.json missing agent/status/last_heartbeat (${f})"
  else
    ok
  fi
done < <(find "${CTX_ROOT}/state" -name 'heartbeat.json' 2>/dev/null)

# --- 3. goals.json (org + per agent) -------------------------------------
echo "[validate] goals.json"
while IFS= read -r f; do
  [[ -f "$f" ]] || continue
  rel="${f#${CTX_FRAMEWORK_ROOT}/}"
  if ! jq -e . "$f" >/dev/null 2>&1; then
    err "${rel}: not valid JSON"
    continue
  fi
  # Required: goals (array), updated_at. Org goals also require north_star.
  if ! jq -e '.goals | type == "array"' "$f" >/dev/null 2>&1; then
    err "${rel}: .goals must be an array"
    continue
  fi
  if ! jq -e '.updated_at' "$f" >/dev/null 2>&1; then
    err "${rel}: missing .updated_at"
    continue
  fi
  # Org-level goals.json (path ends in orgs/<org>/goals.json) must have north_star.
  if [[ "$f" =~ /orgs/[^/]+/goals\.json$ ]]; then
    if ! jq -e '.north_star' "$f" >/dev/null 2>&1; then
      err "${rel}: org goals missing .north_star"
      continue
    fi
  fi
  ok
done < <(find "${CTX_FRAMEWORK_ROOT}/orgs" -name 'goals.json' 2>/dev/null)

# --- 4. tasks/*.json -----------------------------------------------------
echo "[validate] tasks"
while IFS= read -r f; do
  [[ -f "$f" ]] || continue
  base=$(basename "$f")
  # Task records must include id, title, status, created_at.
  if ! jq -e . "$f" >/dev/null 2>&1; then
    err "tasks/${base}: not valid JSON"
    continue
  fi
  missing=$(jq -r 'def need(k): if .[k] == null then k else empty end; [need("id"), need("title"), need("status"), need("created_at")] | join(",")' "$f" 2>/dev/null)
  if [[ -n "$missing" ]]; then
    err "tasks/${base}: missing required fields: ${missing}"
  else
    # Status must be one of the valid enum values.
    status=$(jq -r '.status' "$f")
    case "$status" in
      pending|in_progress|completed|blocked|cancelled) ok ;;
      *) err "tasks/${base}: invalid status '${status}'" ;;
    esac
  fi
done < <(find "${CTX_ROOT}/orgs" -path '*/tasks/*.json' -not -path '*/audit/*' 2>/dev/null)

# --- 5. .onboarded flag for enabled agents -------------------------------
echo "[validate] .onboarded flags"
ENABLED_FILE="${CTX_ROOT}/config/enabled-agents.json"
if [[ -f "$ENABLED_FILE" ]]; then
  if ! jq -e . "$ENABLED_FILE" >/dev/null 2>&1; then
    err "enabled-agents.json is not valid JSON"
  else
    # Schema: { "<agent_name>": { "enabled": bool, ... }, ... }
    while IFS= read -r agent; do
      [[ -n "$agent" ]] || continue
      flag="${CTX_ROOT}/state/${agent}/.onboarded"
      if [[ ! -f "$flag" ]]; then
        err "agent '${agent}' enabled but missing .onboarded flag (${flag})"
      else
        ok
      fi
    done < <(jq -r 'to_entries | map(select(.value.enabled == true)) | .[].key' "$ENABLED_FILE" 2>/dev/null)
  fi
else
  echo "[validate] note: enabled-agents.json not found, skipping onboarded check"
fi

# --- Summary -------------------------------------------------------------
echo ""
if [[ $ERRORS -eq 0 ]]; then
  echo "[validate] OK — ${CHECKED} files clean"
  exit 0
else
  echo "[validate] FAIL — ${ERRORS} error(s) across ${CHECKED} clean files" >&2
  exit 1
fi
