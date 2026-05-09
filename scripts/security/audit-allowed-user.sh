#!/usr/bin/env bash
# audit-allowed-user.sh — verify every agent with BOT_TOKEN has a valid ALLOWED_USER
#
# Every Telegram-enabled agent MUST have ALLOWED_USER set to the numeric Telegram
# user id of its operator. Without it, anyone who finds the bot can DM it and
# trigger actions.
#
# Exit codes:
#   0 — all agents pass
#   1 — at least one agent has BOT_TOKEN without a valid ALLOWED_USER
#
# Usage:
#   bash scripts/security/audit-allowed-user.sh           # human-readable
#   bash scripts/security/audit-allowed-user.sh --json    # machine-readable

set -euo pipefail

FRAMEWORK_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
JSON_OUT=0
[[ "${1:-}" == "--json" ]] && JSON_OUT=1

ISSUES=()
CHECKED=0

# Walk every agent directory under orgs/*/agents/*
shopt -s nullglob
for agent_env in "$FRAMEWORK_ROOT"/orgs/*/agents/*/.env; do
  CHECKED=$((CHECKED + 1))
  agent_dir="$(dirname "$agent_env")"
  agent_name="$(basename "$agent_dir")"
  org_name="$(basename "$(dirname "$(dirname "$agent_dir")")")"

  bot_token=$(grep -E '^BOT_TOKEN=' "$agent_env" 2>/dev/null | head -1 | cut -d= -f2- || true)
  allowed_user=$(grep -E '^ALLOWED_USER=' "$agent_env" 2>/dev/null | head -1 | cut -d= -f2- || true)

  # Trim quotes and whitespace
  bot_token="$(echo -n "$bot_token" | tr -d '"' | tr -d "'" | xargs || true)"
  allowed_user="$(echo -n "$allowed_user" | tr -d '"' | tr -d "'" | xargs || true)"

  if [[ -z "$bot_token" ]]; then
    continue   # No telegram bot configured — nothing to gate
  fi

  if [[ -z "$allowed_user" ]]; then
    ISSUES+=("$org_name/$agent_name: BOT_TOKEN set but ALLOWED_USER MISSING (anyone can DM the bot)")
    continue
  fi

  if ! [[ "$allowed_user" =~ ^[0-9]+$ ]]; then
    ISSUES+=("$org_name/$agent_name: ALLOWED_USER='$allowed_user' is not numeric (must be the user's Telegram numeric id, not a username)")
    continue
  fi
done
shopt -u nullglob

if [[ "$JSON_OUT" == "1" ]]; then
  printf '{"checked": %d, "issues": [' "$CHECKED"
  for i in "${!ISSUES[@]}"; do
    [[ "$i" -gt 0 ]] && printf ','
    # JSON-escape the issue string (basic: backslash and double-quote)
    esc=$(printf '%s' "${ISSUES[$i]}" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf '"%s"' "$esc"
  done
  printf ']}\n'
else
  echo "ALLOWED_USER audit — $CHECKED agent(s) inspected"
  if [[ "${#ISSUES[@]}" -eq 0 ]]; then
    echo "OK — every Telegram-enabled agent has a valid ALLOWED_USER."
  else
    echo "FAIL — ${#ISSUES[@]} issue(s):"
    for issue in "${ISSUES[@]}"; do
      echo "  - $issue"
    done
  fi
fi

[[ "${#ISSUES[@]}" -eq 0 ]] && exit 0 || exit 1
